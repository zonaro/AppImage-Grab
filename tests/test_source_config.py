"""Regression tests against Gear Lever's real config-file naming convention."""
import configparser
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from bridge.source_config import GearLeverSourceReader, config_path


class SourceConfigTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.app_path = str(self.home / "AppImages" / "Example-2.0-x86_64.AppImage")
        (self.home / "AppImages").mkdir()
        Path(self.app_path).write_bytes(b"sample")

    def _write_config(self, dest: Path, manager="GithubUpdater", **options):
        section = "app." + hashlib.md5(self.app_path.encode()).hexdigest() + ".update_manager"
        cfg = configparser.ConfigParser(interpolation=None)
        cfg[section] = {"manager": manager, **options}
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("w", encoding="utf-8") as file:
            cfg.write(file)

    def test_native_config_prefills_exact_existing_values_without_modifying(self):
        directory = self.home / "settings"
        cfgfile = directory / "gearlever.conf"
        self._write_config(cfgfile, repo="author/project",
                           repo_filename="Example-*-x86_64.AppImage",
                           allow_prereleases="yes")
        original = cfgfile.read_bytes()
        with patch.dict(os.environ, {"XDG_CONFIG_HOME": str(directory)}):
            reader = GearLeverSourceReader(["gearlever"])
            details = reader.for_app({"path": self.app_path, "manager": "GithubUpdater",
                                      "embedded_source": False})
        self.assertEqual(details["source_status"], "loaded")
        self.assertEqual(details["source_options"]["repo"], "author/project")
        self.assertEqual(details["source_options"]["repo_filename"], "Example-*-x86_64.AppImage")
        self.assertEqual(details["source_options"]["allow_prereleases"], "yes")
        self.assertEqual(cfgfile.read_bytes(), original)

    def test_flatpak_config_path_is_not_host_config(self):
        cfg = self.home / ".var/app/it.mijorus.gearlever/config/gearlever.conf"
        self._write_config(cfg, "GitlabUpdater",
                           repo_url="https://gitlab.com/author/tool",
                           repo_filename="Tool-*.AppImage")
        with patch("bridge.source_config.Path.home", return_value=self.home):
            reader = GearLeverSourceReader(["flatpak", "run", "it.mijorus.gearlever"])
            result = reader.for_app({"path": self.app_path, "manager": "GitlabUpdater"})
            self.assertEqual(config_path(["flatpak","run","it.mijorus.gearlever"]),cfg)
        self.assertEqual(result["source_options"]["repo_url"],
                         "https://gitlab.com/author/tool")

    def test_does_not_guess_if_config_missing_or_wrong_manager(self):
        with patch.dict(os.environ, {"XDG_CONFIG_HOME": str(self.home)}):
            reader = GearLeverSourceReader(["gearlever"])
        self.assertEqual(reader.for_app({"path": self.app_path, "manager": "GithubUpdater"})["source_status"],
                         "unavailable")
        self._write_config(self.home/"gearlever.conf", manager="GitlabUpdater",
                           repo_url="https://gitlab.com/a/b")
        with patch.dict(os.environ, {"XDG_CONFIG_HOME": str(self.home)}):
            reader = GearLeverSourceReader(["gearlever"])
        self.assertEqual(reader.for_app({"path": self.app_path, "manager": "GithubUpdater"})["source_status"],
                         "mismatch")

    def test_embedded_does_not_fabricate_custom_options(self):
        reader = GearLeverSourceReader([])
        self.assertEqual(reader.for_app({"path": self.app_path, "manager": "GithubUpdater",
                                         "embedded_source": True}),
                         {"source_status": "embedded", "source_options": None})
        self.assertEqual(reader.for_app({"path": self.app_path, "manager": None}),
                         {"source_status": "none", "source_options": None})

    def test_unknown_command_returns_unavailable_not_wrong_profile(self):
        reader = GearLeverSourceReader(["/usr/bin/unknown-helper"])
        self.assertEqual(reader.for_app({"path": self.app_path, "manager": "ForgejoUpdater"})["source_status"],
                         "unavailable")

    def test_symlink_is_not_followed(self):
        real = self.home/"actual.conf"
        self._write_config(real, manager="GithubUpdater", repo="a/b")
        link = self.home/"gearlever.conf"
        link.symlink_to(real)
        with patch.dict(os.environ, {"XDG_CONFIG_HOME": str(self.home)}):
            result = GearLeverSourceReader(["gearlever"]).for_app(
                {"path": self.app_path, "manager": "GithubUpdater"})
        self.assertEqual(result["source_status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
