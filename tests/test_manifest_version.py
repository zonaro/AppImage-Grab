import json
from pathlib import Path
import tempfile
import unittest

from scripts.manifest_version import stamp_manifest, versions_for


class ManifestVersionTests(unittest.TestCase):
    def test_uses_commit_timezone_and_minute(self):
        self.assertEqual(versions_for("2026-11-11T03:52:36-03:00"),
                         ("26.315.352", "26.315.0352"))
        self.assertEqual(versions_for("2026-01-01T00:01:00+00:00"),
                         ("26.1.1", "26.001.0001"))

    def test_leap_year_day_366(self):
        self.assertEqual(versions_for("2028-12-31T23:59:59+02:00"),
                         ("28.366.2359", "28.366.2359"))

    def test_timezone_is_required(self):
        with self.assertRaises(ValueError):
            versions_for("2026-11-11T03:52:36")

    def test_built_manifest_preserves_other_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory, "source.json")
            built = Path(directory, "built.json")
            source.write_text(json.dumps({"manifest_version": 3, "name": "Grab", "version": "0.0.1"}))
            stamp_manifest(source, built, "2026-11-11T03:52:36-03:00")
            manifest = json.loads(built.read_text())
            self.assertEqual(manifest["version"], "26.315.352")
            self.assertEqual(manifest["version_name"], "26.315.0352")
            self.assertEqual(manifest["name"], "Grab")
            self.assertEqual(manifest["manifest_version"], 3)


if __name__ == "__main__":
    unittest.main()
