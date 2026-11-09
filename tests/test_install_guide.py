import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.generate_install_guide import generate_guide, detected_browsers, open_guide


class InstallGuideTests(unittest.TestCase):
    def test_creates_standalone_guide_with_real_paths_and_browser_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            chrome = root / "a folder" / "chromium"
            chrome.mkdir(parents=True)
            (chrome / "manifest.json").write_text("{}")
            firefox = root / "a folder" / "firefox"
            firefox.mkdir()
            (firefox / "manifest.json").write_text("{}")
            dest = root / "guide.html"
            browser = [{"name": "Microsoft Edge", "family": "chromium", "url": "edge://extensions/"}]
            output = generate_guide(dest, chrome, firefox / "manifest.json", "a" * 40, browsers=browser)
            page = output.read_text()
            data_string = page.split('<script type="application/json" id="guide-data">', 1)[1].split('</script>', 1)[0]
            data = json.loads(data_string)
            self.assertEqual(data["chromiumPath"], str(chrome.resolve()))
            self.assertEqual(data["firefoxPath"], str((firefox / "manifest.json").resolve()))
            self.assertEqual(data["commit"], "a" * 40)
            self.assertEqual(data["browsers"][0]["url"], "edge://extensions/")
            self.assertIn('id="copy-path"', page)
            self.assertIn('id="copy-url"', page)
            self.assertIn('id="open-browser-page"', page)
            self.assertNotIn("__GLG_INSTALLATION_DATA__", page)
            self.assertNotIn(".crx", page.lower())
            self.assertNotIn(".xpi", page.lower())

    def test_escaping_prevents_html_injection(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / "</script><svg>"
            folder.mkdir(parents=True)
            chrome = folder / "chromium"
            firefox = folder / "firefox"
            chrome.mkdir()
            firefox.mkdir()
            (chrome / "manifest.json").write_text("{}")
            (firefox / "manifest.json").write_text("{}")
            result = generate_guide(root / "guide.html", chrome, firefox / "manifest.json",
                                    "b" * 40, browsers=[])
            page = result.read_text()
            self.assertNotIn('</script><svg>', page)
            self.assertIn("\\u003c", page)

    def test_browser_detection_does_not_guess(self):
        def which(name):
            return "/usr/bin/microsoft-edge" if name == "microsoft-edge" else None
        with patch("scripts.generate_install_guide.shutil.which", side_effect=which):
            result = detected_browsers()
        self.assertEqual([x["name"] for x in result], ["Microsoft Edge"])

    def test_opt_out_does_not_open_browser(self):
        with patch.dict("scripts.generate_install_guide.os.environ", {"GLG_OPEN_BROWSER": "0",
                                                                       "DISPLAY": ":0"}):
            with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                self.assertFalse(open_guide(Path("/tmp/example.html")))
                popen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
