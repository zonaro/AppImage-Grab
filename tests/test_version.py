import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from bridge import host


class VersionTests(unittest.TestCase):
    def test_get_version_reads_installed_marker_without_gear_lever(self):
        revision = "a" * 40
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "bridge").mkdir()
            (root / "version.json").write_text(json.dumps({
                "commit": revision, "branch": "main"
            }))
            with patch.object(host, "__file__", str(root / "bridge" / "host.py")):
                data = host.handle({"action": "getVersion"},
                                   adapter_factory=lambda: (_ for _ in ()).throw(
                                       RuntimeError("Gear Lever must not be constructed")))
            self.assertEqual(data, {"ok": True, "commit": revision, "branch": "main"})

    def test_invalid_version_is_unknown(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "bridge").mkdir()
            (root / "version.json").write_text('{"commit": "not-a-sha"}')
            with patch.object(host, "__file__", str(root / "bridge" / "host.py")):
                self.assertIsNone(host.installed_commit())


if __name__ == "__main__":
    unittest.main()
