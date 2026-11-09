import configparser
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from bridge.manager import AppManager


class FakeGear:
    def __init__(self, path, source=None, available=True, running=False, embedded=False):
        self.path = str(path)
        self.calls = []
        self.source = source
        self.available = available
        self.running = running
        self.embedded = embedded
        self.command = ["gearlever"]

    def installed(self):
        return [{"name": "Test", "path": self.path, "manager": self.source,
                 "embedded_source": self.embedded, "running": self.running,
                 "current_version": "1.2.3"}]

    def run(self, *args, **kwargs):
        self.calls.append(args)
        if args[:2] == ("--list-updates", "--json"):
            updates = self.installed() if self.available else []
            return json.dumps({"schema_version": 1, "updates": updates})
        return ""


class AppManagerTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.base = Path(self.tempdir.name)
        self.path = self.base / "tool.AppImage"
        self.path.write_bytes(b"test")
        self.env = patch.dict(os.environ, {"XDG_CONFIG_HOME": str(self.base)})
        self.env.start()
        self.addCleanup(self.env.stop)

    def write_config(self, manager="GithubUpdater", **fields):
        section = "app." + hashlib.md5(str(self.path).encode()).hexdigest() + ".update_manager"
        parser = configparser.ConfigParser(interpolation=None)
        parser[section] = {"manager": manager, **fields}
        with (self.base / "gearlever.conf").open("w") as file:
            parser.write(file)

    def test_lists_installed_and_existing_source_options(self):
        self.write_config(repo="author/project", repo_filename="tool-*.AppImage",
                          allow_prereleases="false")
        manager = AppManager(FakeGear(self.path, source="GithubUpdater"))
        app = manager.list_installed()[0]
        self.assertEqual(app["name"], "Test")
        self.assertEqual(app["source_status"], "loaded")
        self.assertEqual(app["source_options"]["repo"], "author/project")

    def test_lists_actual_updates_from_backend(self):
        manager = AppManager(FakeGear(self.path, source="GithubUpdater", available=False))
        self.assertEqual(manager.updates(), [], "manager alone is not a new version")
        self.assertEqual(AppManager(FakeGear(self.path, available=True)).updates()[0]["path"],
                         str(self.path))

    def test_only_updates_when_gear_lever_confirms_new_version(self):
        fake = FakeGear(self.path, source="GithubUpdater", available=False)
        manager = AppManager(fake)
        with self.assertRaisesRegex(ValueError, "não confirma atualização"):
            manager.update(str(self.path))
        self.assertNotIn(("--update", str(self.path), "--yes"), fake.calls)
        fake.available = True
        self.assertEqual(manager.update(str(self.path))["status"], "updated")
        self.assertIn(("--list-updates", "--json"), fake.calls)
        self.assertIn(("--update", str(self.path), "--yes"), fake.calls)

    def test_updates_only_known_paths(self):
        fake = FakeGear(self.path)
        manager = AppManager(fake)
        with self.assertRaises(ValueError):
            manager.remove("/etc/passwd")
        with self.assertRaises(ValueError):
            manager.update(str(self.path) + "--force")
        self.assertFalse(fake.calls)

    def test_running_app_cannot_be_updated(self):
        fake = FakeGear(self.path, running=True)
        with self.assertRaises(ValueError):
            AppManager(fake).update(str(self.path))
        self.assertEqual(fake.calls, [])

    def test_remove_uses_trash_not_permanent_delete(self):
        fake = FakeGear(self.path)
        result = AppManager(fake).remove(str(self.path))
        self.assertEqual(result["status"], "removed")
        self.assertEqual(fake.calls, [("--remove", str(self.path), "--yes")])

    def test_set_source_validates_manager_and_pattern(self):
        fake = FakeGear(self.path)
        manager = AppManager(fake)
        data = {"repo": "author/project", "repo_filename": "tool-*-aarch64.AppImage",
                "allow_prereleases": "false"}
        self.assertEqual(manager.set_source(str(self.path), "GithubUpdater", data)["status"], "source_saved")
        self.assertIn("repo_filename=tool-*-aarch64.AppImage", fake.calls[0])
        with self.assertRaises(ValueError):
            manager.set_source(str(self.path), "UnknownUpdater", data)
        with self.assertRaises(ValueError):
            manager.set_source(str(self.path), "GithubUpdater", {**data, "repo_filename": "*"})
        with self.assertRaises(ValueError):
            manager.set_source(str(self.path), "GithubUpdater", {**data, "repo": "evil/../project"})

    def test_cannot_overwrite_unreadable_existing_config(self):
        fake = FakeGear(self.path, source="GithubUpdater")
        manager = AppManager(fake)
        data = {"repo": "a/b", "repo_filename": "tool.AppImage",
                "allow_prereleases": "false"}
        with self.assertRaisesRegex(ValueError, "bloqueada"):
            manager.set_source(str(self.path), "GithubUpdater", data)
        with self.assertRaisesRegex(ValueError, "bloqueada"):
            manager.unset_source(str(self.path))
        self.assertEqual(fake.calls, [])

    def test_existing_config_is_preserved_and_can_be_unset_explicitly(self):
        self.write_config(repo="author/repo", repo_filename="tool-*.AppImage",
                          allow_prereleases="true")
        fake = FakeGear(self.path, source="GithubUpdater")
        result = AppManager(fake).unset_source(str(self.path))
        self.assertEqual(result["status"], "source_unset")
        self.assertIn("--unset", fake.calls[0])


if __name__ == "__main__":
    unittest.main()
