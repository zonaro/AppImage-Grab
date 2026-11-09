import base64
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from scripts.package_extensions import build_xpi, extension_id, manifest_key_id


class PackageTests(unittest.TestCase):
    def test_crx_key_matches_legacy_unpackaged_id(self):
        root = Path(__file__).resolve().parents[1]
        manifest = json.loads((root / "extension/chromium/manifest.json").read_text())
        old = (root / "extension/chromium/id.txt").read_text().strip()
        self.assertEqual(manifest_key_id(manifest), old)
        self.assertEqual(len(old), 32)

    def test_firefox_xpi_has_manifest_at_root(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as tmp:
            # Use the source tree as a stand-in for the assembled unpacked directory.
            common = root / "extension/common"
            firefox = root / "extension/firefox"
            stage = Path(tmp) / "stage"
            stage.mkdir()
            for path in common.iterdir():
                if path.is_file():
                    (stage / path.name).write_bytes(path.read_bytes())
            (stage / "manifest.json").write_bytes((firefox / "manifest.json").read_bytes())
            result = build_xpi(stage, Path(tmp) / "out/gear-lever-grab.xpi")
            with zipfile.ZipFile(result) as z:
                self.assertIn("manifest.json", z.namelist())
                self.assertIn("popup.html", z.namelist())
                self.assertIn("manager.html", z.namelist())
                self.assertIn("background.js", z.namelist())
                self.assertFalse(any(path.endswith(".pem") for path in z.namelist()))
                self.assertEqual(z.testzip(), None)

    def test_id_algorithm_is_stable(self):
        pub = b"known-public-key"
        self.assertEqual(extension_id(pub), extension_id(pub))
        self.assertTrue(set(extension_id(pub)) <= set("abcdefghijklmnop"))


if __name__ == "__main__":
    unittest.main()
