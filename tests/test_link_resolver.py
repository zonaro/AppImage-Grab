import json
import unittest
from unittest.mock import patch

from bridge.link_resolver import resolve_link
from bridge import host


class FakeResponse:
    def __init__(self, result):
        self.result = json.dumps(result).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def geturl(self):
        return "https://api.github.com/repos/demo/widget/releases/latest"

    def read(self, maximum):
        return self.result


class LinkResolverTests(unittest.TestCase):
    def test_direct_github_gitlab_codeberg_asset(self):
        for url in (
            "https://github.com/demo/widget/releases/download/v1.2/widget-1.2-x86_64.AppImage",
            "https://gitlab.com/group/project/-/releases/v1.0/downloads/widget-1.0-arm64.AppImage",
            "https://codeberg.org/demo/widget/releases/download/v1.2/widget-1.2-x86_64.AppImage"
        ):
            with self.subTest(url=url):
                choices = resolve_link(url)
                self.assertEqual(len(choices), 1)
                self.assertEqual(choices[0]["url"], url)
                self.assertIn("architecture", choices[0])

    def test_github_latest_shows_all_architectures(self):
        body = {"assets": [
            {"name": "widget-1.2-x86_64.AppImage", "browser_download_url":
                "https://github.com/demo/widget/releases/download/v1.2/widget-1.2-x86_64.AppImage"},
            {"name": "widget-1.2-aarch64.AppImage", "browser_download_url":
                "https://github.com/demo/widget/releases/download/v1.2/widget-1.2-aarch64.AppImage"},
            {"name": "widget-1.2.tar.gz", "browser_download_url":
                "https://github.com/demo/widget/releases/download/v1.2/widget-1.2.tar.gz"},
            {"name": "evil.AppImage", "browser_download_url":
                "https://example.com/evil.AppImage"}]}
        with patch("bridge.link_resolver.urlopen", return_value=FakeResponse(body)):
            choices = resolve_link("https://github.com/demo/widget/releases/latest")
        self.assertEqual(len(choices), 2)
        self.assertEqual({x["architecture"] for x in choices}, {"x86_64", "arm64"})

    def test_refuses_generic_hosts_and_non_https(self):
        for url in ("http://github.com/demo/widget/releases/latest",
                    "https://evil.example/virus.AppImage",
                    "https://github.com/demo/widget/tree/main",
                    "https://github.com:444/demo/widget/releases/latest",
                    "https://github.com/demo/widget/releases/latest#fragment",
                    "https://username:pass@github.com/demo/widget/releases/latest"):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    resolve_link(url)

    def test_native_request_exposes_choices_without_gearlever_instantiation(self):
        url = "https://github.com/demo/widget/releases/download/v1.2/widget-1.2-x86_64.AppImage"
        response = host.handle({"action":"resolveLink", "url":url}, adapter_factory=lambda:None)
        self.assertTrue(response["ok"])
        self.assertEqual(response["choices"][0]["url"], url)
