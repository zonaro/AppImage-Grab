import json
import unittest
from unittest.mock import patch

from bridge.link_resolver import resolve_link
from bridge import host


class FakeResponse:
    def __init__(self, result, host='api.github.com'):
        self.result = json.dumps(result).encode()
        self.host = host

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def geturl(self):
        return "https://" + self.host + "/test"

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

    def test_gitlab_repository_resolves_asset_links(self):
        body = {"assets": {"links": [
            {"name": "Widget", "direct_asset_url":
                "https://gitlab.com/group/widget/-/releases/v1.2/downloads/widget-1.2-x86_64.AppImage"},
            {"name": "Untrusted", "direct_asset_url": "https://evil.example/other.AppImage"}
        ]}}
        with patch("bridge.link_resolver.urlopen", return_value=FakeResponse(body, "gitlab.com")):
            assets = resolve_link("https://gitlab.com/group/widget/-/releases")
        self.assertEqual(len(assets), 1)
        self.assertEqual(assets[0]["architecture"], "x86_64")
        self.assertEqual(assets[0]["source"], "https://gitlab.com/group/widget")

    def test_codeberg_repository_resolves_assets_with_canonical_urls(self):
        body = {"tag_name": "v1.2", "assets": [
            {"name": "widget-1.2-aarch64.AppImage",
             "browser_download_url": "https://codeberg.org/attachments/example"},
            {"name": "widget-1.2-x86_64.AppImage",
             "browser_download_url": "https://codeberg.org/attachments/another"},
            {"name": "notes.txt", "browser_download_url": "https://codeberg.org/a/b"}
        ]}
        with patch("bridge.link_resolver.urlopen", return_value=FakeResponse(body, "codeberg.org")):
            assets = resolve_link("https://codeberg.org/demo/widget/releases")
        self.assertEqual(len(assets), 2)
        self.assertEqual({x["architecture"] for x in assets}, {"x86_64", "arm64"})
        self.assertEqual(assets[0]["url"],
            "https://codeberg.org/demo/widget/releases/download/v1.2/widget-1.2-aarch64.AppImage")

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
