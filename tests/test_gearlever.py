import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from bridge.gearlever import GearLever, GearLeverError
from bridge.sources import UpdateSource


class Result:
    def __init__(self, stdout="", returncode=0):
        self.stdout, self.stderr, self.returncode = stdout, "", returncode


class AdapterTests(unittest.TestCase):
    def test_integration_sets_source(self):
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "AppImages" / "tool.AppImage"
            target.parent.mkdir()
            target.write_bytes(b"dummy")
            downloaded = Path(dirname) / "Downloads" / "tool.AppImage"
            downloaded.parent.mkdir()
            downloaded.write_bytes(b"dummy")
            sequence = iter([
                Result(json.dumps({"schema_version": 1, "installed": []})),
                Result(str(target) + " was integrated successfully\n"),
                Result(json.dumps({"schema_version": 1, "installed": [
                    {"path": str(target), "manager": None, "embedded_source": False}]})),
                Result(),
            ])
            calls = []

            def run(argv, **kwargs):
                calls.append(argv)
                return next(sequence)

            with patch.dict(os.environ, {"GEAR_LEVER_GRAB_COMMAND": "/fake/gearlever"}):
                gear = GearLever(runner=run)
            source = UpdateSource("GithubUpdater", {
                "repo": "a/b", "repo_filename": "tool.AppImage",
                "allow_prereleases": "false"
            }, "https://github.com/a/b")
            result = gear.integrate(downloaded, source)
            self.assertEqual(result.status, "integrated_with_source")
            self.assertEqual(calls[1][1], "--integrate")
            self.assertEqual(calls[3][1:4], ["--set-update-source", str(target), "--manager"])

    def test_existing_source_not_overwritten(self):
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "tool.AppImage"
            target.write_bytes(b"dummy")
            responses = iter([
                Result('{"schema_version":1,"installed":[]}'),
                Result(f"{target} was integrated successfully\n"),
                Result(json.dumps({"schema_version":1,"installed":[
                    {"path":str(target),"manager":"GithubUpdater","embedded_source":True}]})),
            ])
            with patch.dict(os.environ, {"GEAR_LEVER_GRAB_COMMAND": "/fake"}):
                adapter = GearLever(runner=lambda *args, **kwargs: next(responses))
            result = adapter.integrate(target, None)
            self.assertEqual(result.status, "embedded_source_preserved")

    def test_cli_confirmed_path_when_list_is_not_refreshed(self):
        with tempfile.TemporaryDirectory() as dirname:
            downloaded = Path(dirname) / "Downloads" / "mechvibes-3.5.6-x86_64.AppImage"
            target = Path(dirname) / "AppImages" / "mechvibes.appimage"
            downloaded.parent.mkdir()
            target.parent.mkdir()
            downloaded.write_bytes(b"correct copied payload")
            target.write_bytes(downloaded.read_bytes())
            calls = []
            responses = iter([
                Result('{"schema_version":1,"installed":[]}'),
                Result(str(target) + " was integrated successfully\n"),
                Result('{"schema_version":1,"installed":[]}'),
            ])

            def runner(argv, **kwargs):
                calls.append(argv)
                return next(responses)

            with patch.dict(os.environ, {"GEAR_LEVER_GRAB_COMMAND": "/fake"}):
                adapter = GearLever(runner=runner)
            source = UpdateSource("GithubUpdater", {
                "repo": "publisher/mechvibes", "repo_filename": "mechvibes-*-x86_64.AppImage",
                "allow_prereleases": "false"
            }, "https://github.com/publisher/mechvibes")
            result = adapter.integrate(downloaded, source)
            self.assertEqual(result.status, "integrated_unlisted")
            self.assertEqual(result.installed_path, str(target))
            self.assertEqual(len(calls), 3, "must not configure update source for an unlisted app")

    def test_multi_entry_refresh_matches_contents_not_arbitrary_new_app(self):
        with tempfile.TemporaryDirectory() as dirname:
            downloaded = Path(dirname) / "original.AppImage"
            target = Path(dirname) / "renamed.appimage"
            other = Path(dirname) / "other.appimage"
            downloaded.write_bytes(b"expected")
            target.write_bytes(b"expected")
            other.write_bytes(b"unrelated")
            responses = iter([
                Result('{"schema_version":1,"installed":[]}'),
                Result("Integration completed\n"),
                Result(json.dumps({"schema_version":1,"installed":[
                    {"path":str(other),"manager":None,"embedded_source":False},
                    {"path":str(target),"manager":None,"embedded_source":False}]})),
            ])
            with patch.dict(os.environ, {"GEAR_LEVER_GRAB_COMMAND": "/fake"}):
                adapter = GearLever(runner=lambda *args, **kwargs: next(responses))
            result = adapter.integrate(downloaded, None)
            self.assertEqual(result.installed_path, str(target))
            self.assertEqual(result.status, "integrated_without_source")

    def test_unrelated_single_new_entry_must_not_be_assigned(self):
        with tempfile.TemporaryDirectory() as dirname:
            downloaded = Path(dirname) / "original.AppImage"
            unrelated = Path(dirname) / "unrelated.appimage"
            downloaded.write_bytes(b"expected")
            unrelated.write_bytes(b"unrelated")
            responses = iter([
                Result('{"schema_version":1,"installed":[]}'),
                Result("Integration completed\n"),
                Result(json.dumps({"schema_version":1,"installed":[
                    {"path":str(unrelated),"manager":None}]})),
            ])
            with patch.dict(os.environ, {"GEAR_LEVER_GRAB_COMMAND": "/fake"}):
                adapter = GearLever(runner=lambda *args, **kwargs: next(responses))
            with self.assertRaisesRegex(GearLeverError, "não pôde ser verificada"):
                adapter.integrate(downloaded, None)

    def test_cli_success_after_gear_lever_moves_original(self):
        with tempfile.TemporaryDirectory() as dirname:
            downloaded = Path(dirname) / "Downloads" / "app.AppImage"
            target = Path(dirname) / "AppImages" / "renamed.appimage"
            downloaded.parent.mkdir()
            target.parent.mkdir()
            downloaded.write_bytes(b"correct payload")
            responses = iter([
                Result('{"schema_version":1,"installed":[]}'),
                Result(str(target) + " was integrated successfully\n"),
                Result(json.dumps({"schema_version":1,"installed":[
                    {"path":str(target),"manager":None,"embedded_source":False}]})),
            ])
            def runner(argv, **kwargs):
                if argv[1] == "--integrate":
                    target.write_bytes(downloaded.read_bytes())
                    downloaded.unlink()
                return next(responses)

            with patch.dict(os.environ, {"GEAR_LEVER_GRAB_COMMAND": "/fake"}):
                adapter = GearLever(runner=runner)
            result = adapter.integrate(downloaded, None)
            self.assertEqual(result.installed_path, str(target))
            self.assertEqual(result.status, "integrated_without_source")
            self.assertFalse(downloaded.exists())

    def test_already_integrated_is_not_reinstalled_or_reconfigured(self):
        with tempfile.TemporaryDirectory() as dirname:
            downloaded = Path(dirname) / "Downloads" / "app.AppImage"
            installed = Path(dirname) / "AppImages" / "app.appimage"
            downloaded.parent.mkdir()
            installed.parent.mkdir()
            downloaded.write_bytes(b"same bytes")
            installed.write_bytes(downloaded.read_bytes())
            registry = json.dumps({"schema_version":1,"installed":[
                {"path":str(installed),"manager":"GithubUpdater","embedded_source":False}]})
            calls = []
            responses = iter([Result(registry), Result("This AppImage is already integrated\n"),
                              Result(registry)])

            def runner(argv, **kwargs):
                calls.append(argv)
                return next(responses)

            with patch.dict(os.environ, {"GEAR_LEVER_GRAB_COMMAND": "/fake"}):
                adapter = GearLever(runner=runner)
            result = adapter.integrate(downloaded, None)
            self.assertEqual(result.status, "already_processed")
            self.assertEqual(result.installed_path, str(installed))
            self.assertEqual(result.manager, "GithubUpdater")
            self.assertEqual(len(calls), 3)

    def test_invalid_schema(self):
        with patch.dict(os.environ, {"GEAR_LEVER_GRAB_COMMAND": "/fake"}):
            adapter = GearLever(runner=lambda *args, **kwargs: Result("not-json"))
        with self.assertRaises(GearLeverError):
            adapter.installed()


if __name__ == "__main__":
    unittest.main()
