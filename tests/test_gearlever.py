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
            result = gear.integrate(Path(dirname) / "Downloads" / "tool.AppImage", source)
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

    def test_invalid_schema(self):
        with patch.dict(os.environ, {"GEAR_LEVER_GRAB_COMMAND": "/fake"}):
            adapter = GearLever(runner=lambda *args, **kwargs: Result("not-json"))
        with self.assertRaises(GearLeverError):
            adapter.installed()


if __name__ == "__main__":
    unittest.main()
