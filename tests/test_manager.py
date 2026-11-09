import os
from pathlib import Path
import tempfile
import unittest

from bridge.manager import AppManager


class FakeGear:
    def __init__(self, path, source=None):
        self.path = str(path)
        self.calls = []
        self.source = source

    def installed(self):
        return [{"name": "Test", "path": self.path,
                 "manager": self.source, "embedded_source": False,
                 "running": False, "current_version": "1.2.3"}]

    def run(self, *args, **kwargs):
        self.calls.append(args)
        if args[:2] == ("--list-updates", "--json"):
            return '{"schema_version":1,"updates":[{"name":"Test","path":"'+self.path+'","manager":"GithubUpdater"}]}'
        return ""


class AppManagerTests(unittest.TestCase):
    def test_lists_installed_and_updates(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "tool.AppImage"
            path.write_bytes(b"test")
            manager = AppManager(FakeGear(path))
            self.assertEqual(manager.list_installed()[0]["name"], "Test")
            self.assertEqual(manager.updates()[0]["manager"], "GithubUpdater")

    def test_updates_only_known_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "tool.AppImage"
            path.write_bytes(b"test")
            fake = FakeGear(path)
            manager = AppManager(fake)
            with self.assertRaises(ValueError):
                manager.remove("/etc/passwd")
            with self.assertRaises(ValueError):
                manager.update(str(path) + "--force")
            self.assertFalse(fake.calls)
            self.assertEqual(manager.update(str(path))["status"], "updated")
            self.assertIn(("--update", str(path), "--yes"), fake.calls)

    def test_remove_uses_trash_not_permanent_delete(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "tool.AppImage"
            path.write_bytes(b"test")
            fake = FakeGear(path)
            result = AppManager(fake).remove(str(path))
            self.assertEqual(result["status"], "removed")
            self.assertEqual(fake.calls, [("--remove", str(path), "--yes")])

    def test_set_source_validates_manager_and_pattern(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "tool.AppImage"
            path.write_bytes(b"test")
            fake = FakeGear(path)
            manager = AppManager(fake)
            data = {"repo": "author/project", "repo_filename": "tool-*-aarch64.AppImage",
                    "allow_prereleases": "false"}
            self.assertEqual(manager.set_source(str(path), "GithubUpdater", data)["status"], "source_saved")
            self.assertIn("repo_filename=tool-*-aarch64.AppImage", fake.calls[0])
            with self.assertRaises(ValueError):
                manager.set_source(str(path), "UnknownUpdater", data)
            with self.assertRaises(ValueError):
                manager.set_source(str(path), "GithubUpdater", {**data, "repo_filename": "*"})
            with self.assertRaises(ValueError):
                manager.set_source(str(path), "GithubUpdater", {**data, "repo": "evil/../project"})

    def test_unset_source(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "tool.AppImage"
            path.write_bytes(b"test")
            fake = FakeGear(path, "GithubUpdater")
            self.assertEqual(AppManager(fake).unset_source(str(path))["status"], "source_unset")
            self.assertIn("--unset", fake.calls[0])


if __name__ == "__main__":
    unittest.main()
