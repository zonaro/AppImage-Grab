import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from scripts.generate_install_guide import (
    generate_guide, detected_browsers, open_guide, open_browser_extensions, main
)


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
            self.assertNotIn('id="open-browser-page"', page)
            self.assertIn('O instalador tenta abrir esta página diretamente', page)
            self.assertNotIn("__AIG_INSTALLATION_DATA__", page)
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

    def test_opens_edge_internal_page_using_edge_executable_not_xdg_open(self):
        binaries = {
            "microsoft-edge": "/usr/bin/microsoft-edge",
            "firefox": "/usr/bin/firefox",
            "xdg-settings": "/usr/bin/xdg-settings",
            "xdg-open": "/usr/bin/xdg-open",
        }
        with patch("scripts.generate_install_guide.shutil.which", side_effect=binaries.get):
            with patch("scripts.generate_install_guide.subprocess.run",
                       return_value=SimpleNamespace(returncode=0, stdout="microsoft-edge.desktop\\n")) as query:
                with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                    with patch.dict("scripts.generate_install_guide.os.environ",
                                    {"AIG_OPEN_BROWSER": "1", "DISPLAY": ":0"}):
                        selected = open_browser_extensions()
        self.assertEqual(selected, "Microsoft Edge")
        self.assertEqual(query.call_args.args[0],
                         ["xdg-settings", "get", "default-web-browser"])
        self.assertEqual(popen.call_args.args[0],
                         ["/usr/bin/microsoft-edge", "--new-tab", "edge://extensions/"])
        self.assertEqual(popen.call_count, 1)

    def test_edge_update_prepopulates_best_effort_search(self):
        binaries = {
            "microsoft-edge": "/usr/bin/microsoft-edge",
            "xdg-settings": "/usr/bin/xdg-settings",
        }
        with patch("scripts.generate_install_guide.shutil.which", side_effect=binaries.get):
            with patch("scripts.generate_install_guide.subprocess.run",
                       return_value=SimpleNamespace(returncode=0, stdout="microsoft-edge.desktop")):
                with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                    with patch.dict("scripts.generate_install_guide.os.environ",
                                    {"AIG_OPEN_BROWSER": "1", "DISPLAY": ":0"}):
                        selected = open_browser_extensions(updating=True)
        self.assertEqual(selected, "Microsoft Edge")
        popen.assert_called_once()
        self.assertEqual(popen.call_args.args[0],
                         ["/usr/bin/microsoft-edge", "--new-tab",
                          "edge://extensions/?q=AppImage%20Grab"])

    def test_other_chromium_browsers_get_query_only_during_update(self):
        cases = [
            ("Google Chrome", "google-chrome", "chrome://extensions/"),
            ("Chromium", "chromium", "chrome://extensions/"),
            ("Brave", "brave-browser", "brave://extensions/"),
            ("Vivaldi", "vivaldi", "vivaldi://extensions/"),
            ("Opera", "opera", "opera://extensions/"),
            ("Thorium", "thorium", "chrome://extensions/"),
        ]
        for name, binary, base in cases:
            with self.subTest(browser=name):
                with patch("scripts.generate_install_guide.shutil.which",
                           side_effect=lambda executable: "/usr/bin/" + binary
                           if executable == binary else None):
                    with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                        with patch.dict("scripts.generate_install_guide.os.environ",
                                        {"AIG_OPEN_BROWSER": "1", "DISPLAY": ":0"}):
                            selected = open_browser_extensions(updating=True)
                self.assertEqual(selected, name)
                self.assertEqual(popen.call_args.args[0],
                                 ["/usr/bin/" + binary, "--new-tab",
                                  base + "?q=AppImage%20Grab"])

    def test_opens_firefox_debugging_using_firefox_executable(self):
        binaries = {
            "firefox": "/usr/bin/firefox",
            "chromium": "/usr/bin/chromium",
            "xdg-settings": "/usr/bin/xdg-settings",
        }
        with patch("scripts.generate_install_guide.shutil.which", side_effect=binaries.get):
            with patch("scripts.generate_install_guide.subprocess.run",
                       return_value=SimpleNamespace(returncode=0, stdout="org.mozilla.firefox.desktop")):
                with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                    with patch.dict("scripts.generate_install_guide.os.environ",
                                    {"AIG_OPEN_BROWSER": "1", "WAYLAND_DISPLAY": "wayland-0"}):
                        selected = open_browser_extensions()
        self.assertEqual(selected, "Firefox")
        self.assertEqual(popen.call_args.args[0],
                         ["/usr/bin/firefox", "-new-tab", "about:debugging#/runtime/this-firefox"])
        self.assertEqual(popen.call_count, 1)

    def test_firefox_update_uses_existing_debugging_page_without_query(self):
        binaries = {"firefox": "/usr/bin/firefox", "xdg-settings": "/usr/bin/xdg-settings"}
        with patch("scripts.generate_install_guide.shutil.which", side_effect=binaries.get):
            with patch("scripts.generate_install_guide.subprocess.run",
                       return_value=SimpleNamespace(returncode=0, stdout="org.mozilla.firefox.desktop")):
                with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                    with patch.dict("scripts.generate_install_guide.os.environ",
                                    {"AIG_OPEN_BROWSER": "1", "DISPLAY": ":0"}):
                        self.assertEqual(open_browser_extensions(updating=True), "Firefox")
        popen.assert_called_once()
        self.assertEqual(popen.call_args.args[0],
                         ["/usr/bin/firefox", "-new-tab", "about:debugging#/runtime/this-firefox"])

    def test_prefers_exact_default_edge_beta_channel(self):
        binaries = {
            "microsoft-edge": "/usr/bin/microsoft-edge",
            "microsoft-edge-beta": "/usr/bin/microsoft-edge-beta",
            "xdg-settings": "/usr/bin/xdg-settings",
        }
        with patch("scripts.generate_install_guide.shutil.which", side_effect=binaries.get):
            with patch("scripts.generate_install_guide.subprocess.run",
                       return_value=SimpleNamespace(returncode=0, stdout="microsoft-edge-beta.desktop")):
                with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                    with patch.dict("scripts.generate_install_guide.os.environ",
                                    {"AIG_OPEN_BROWSER": "1", "DISPLAY": ":0"}):
                        selected = open_browser_extensions()
        self.assertEqual(selected, "Microsoft Edge")
        self.assertEqual(popen.call_args.args[0][0], "/usr/bin/microsoft-edge-beta")

    def test_unknown_default_uses_one_installed_browser(self):
        binaries = {"chromium": "/usr/bin/chromium",
                    "firefox": "/usr/bin/firefox"}
        with patch("scripts.generate_install_guide.shutil.which", side_effect=binaries.get):
            with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                with patch.dict("scripts.generate_install_guide.os.environ",
                                {"AIG_OPEN_BROWSER": "1", "DISPLAY": ":0"}):
                    selected = open_browser_extensions()
        self.assertEqual(selected, "Chromium")
        popen.assert_called_once()
        self.assertEqual(popen.call_args.args[0],
                         ["/usr/bin/chromium", "--new-tab", "chrome://extensions/"])

    def test_extensions_page_opt_out_and_headless(self):
        browsers = [{"name": "Microsoft Edge", "family": "chromium",
                     "url": "edge://extensions/"}]
        for environment in (
            {"AIG_OPEN_BROWSER": "0", "DISPLAY": ":0"},
            {"AIG_OPEN_BROWSER": "1", "DISPLAY": "", "WAYLAND_DISPLAY": ""},
        ):
            with patch.dict("scripts.generate_install_guide.os.environ", environment):
                with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                    self.assertIsNone(open_browser_extensions(browsers))
                    popen.assert_not_called()

    def test_unavailable_browser_executable_is_not_launched(self):
        browser = [{"name": "Microsoft Edge", "family": "chromium",
                    "url": "edge://extensions/"}]
        with patch("scripts.generate_install_guide.shutil.which", return_value=None):
            with patch.dict("scripts.generate_install_guide.os.environ",
                            {"AIG_OPEN_BROWSER": "1", "DISPLAY": ":0"}):
                with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                    self.assertIsNone(open_browser_extensions(browser))
                    popen.assert_not_called()

    def test_open_only_can_open_guide_and_internal_page(self):
        with tempfile.TemporaryDirectory() as folder:
            guide = Path(folder) / "guide.html"
            guide.write_text("guide")
            argv = ["generate_install_guide.py", "--output", str(guide),
                    "--chromium", str(guide), "--firefox-manifest", str(guide),
                    "--commit", "a" * 40, "--open-only", "--open-extensions",
                    "--updating"]
            with patch("scripts.generate_install_guide.sys.argv", argv):
                with patch("scripts.generate_install_guide.open_guide", return_value=True) as html:
                    with patch("scripts.generate_install_guide.open_browser_extensions",
                               return_value="Microsoft Edge") as internal:
                        self.assertEqual(main(), 0)
            html.assert_called_once_with(guide)
            internal.assert_called_once_with(updating=True)

    def test_first_install_opens_guide_and_unfiltered_extensions_page(self):
        with tempfile.TemporaryDirectory() as folder:
            guide = Path(folder) / "guide.html"
            guide.write_text("guide")
            argv = ["generate_install_guide.py", "--output", str(guide),
                    "--chromium", str(guide), "--firefox-manifest", str(guide),
                    "--commit", "b" * 40, "--open-only", "--open-extensions"]
            with patch("scripts.generate_install_guide.sys.argv", argv):
                with patch("scripts.generate_install_guide.open_guide",
                           return_value=True) as html:
                    with patch("scripts.generate_install_guide.open_browser_extensions",
                               return_value="Microsoft Edge") as internal:
                        self.assertEqual(main(), 0)
            html.assert_called_once_with(guide)
            internal.assert_called_once_with(updating=False)

    def test_installer_uses_previous_version_to_enable_update_search(self):
        script = Path(__file__).resolve().parents[1] / "install.sh"
        contents = script.read_text(encoding="utf-8")
        self.assertIn('if [[ -n "$PREVIOUS_COMMIT" ]]; then', contents)
        self.assertIn('OPEN_OPTIONS+=(--updating)', contents)
        self.assertIn('OPEN_OPTIONS=(--open-only --open-extensions)', contents)
        self.assertIn('"${OPEN_OPTIONS[@]}"', contents)
        self.assertLess(contents.index('PREVIOUS_COMMIT='), contents.index('mv -f "$DEST/version.json.pending"'))

    def test_opt_out_does_not_open_browser(self):
        with patch.dict("scripts.generate_install_guide.os.environ", {"AIG_OPEN_BROWSER": "0",
                                                                       "DISPLAY": ":0"}):
            with patch("scripts.generate_install_guide.subprocess.Popen") as popen:
                self.assertFalse(open_guide(Path("/tmp/example.html")))
                popen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
