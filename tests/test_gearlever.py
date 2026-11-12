import os
from pathlib import Path
import unittest
from unittest.mock import patch

from bridge.gearlever import GearLever, GearLeverError


class Result:
    def __init__(self, stdout="", returncode=0, stderr=""):
        self.stdout, self.stderr, self.returncode = stdout, stderr, returncode


class AdapterTests(unittest.TestCase):
    def adapter(self, callback):
        with patch.dict(os.environ, {"GEAR_LEVER_GRAB_COMMAND": "/fake/gearlever"}):
            return GearLever(runner=callback)

    def test_delegates_directly_to_cli_without_file_inspection(self):
        downloaded = Path("/home/user/Downloads/Beeper-4.3.308-x86_64 (1).AppImage")
        installed = "/home/user/AppImages/beeper.appimage"
        calls = []

        def run(argv, **kwargs):
            calls.append(argv)
            return Result(installed + " was integrated successfully\n")

        adapter = self.adapter(run)
        result = adapter.integrate(downloaded)
        self.assertEqual(result.status, "integrated_by_gearlever")
        self.assertEqual(result.installed_path, installed)
        self.assertEqual(result.manager, None)
        self.assertEqual(calls, [["/fake/gearlever", "--integrate", str(downloaded), "-y"]],
                         "no --list-installed, --set-update-source or magic check")

    def test_gear_lever_decides_unsupported_file(self):
        downloaded = Path("/fake/invalid.AppImage")
        adapter = self.adapter(lambda argv, **kwargs: Result(
            "This file is not supported by Gear Lever", returncode=1))
        with self.assertRaisesRegex(GearLeverError, "Gear Lever retornou 1:"):
            adapter.integrate(downloaded)

    def test_gear_lever_zero_exit_without_path_does_not_fail(self):
        adapter = self.adapter(lambda argv, **kwargs: Result("Operation completed\n"))
        result = adapter.integrate(Path("/fake/renamed.AppImage"))
        self.assertEqual(result.status, "integrated_by_gearlever")
        self.assertIsNone(result.installed_path)

    def test_already_integrated_is_gear_lever_decision(self):
        calls = []

        def run(argv, **kwargs):
            calls.append(argv)
            return Result("This AppImage is already integrated\n")

        adapter = self.adapter(run)
        result = adapter.integrate(Path("/fake/existing.AppImage"))
        self.assertEqual(result.status, "already_processed")
        self.assertIsNone(result.installed_path)
        self.assertEqual(len(calls), 1, "no automatic source overwrite")

    def test_installed_json_cli_still_supported_for_manual_manager(self):
        adapter = self.adapter(lambda argv, **kwargs: Result("not-json"))
        with self.assertRaises(GearLeverError):
            adapter.installed()


if __name__ == "__main__":
    unittest.main()
