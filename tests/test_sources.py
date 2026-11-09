import unittest
from bridge.sources import detect_source, filename_pattern


class SourceTests(unittest.TestCase):
    def test_github_release(self):
        result = detect_source("https://github.com/example/tool/releases/download/v2.3.1/tool-2.3.1-x86_64.AppImage")
        self.assertEqual(result.manager, "GithubUpdater")
        self.assertEqual(result.config["repo"], "example/tool")
        self.assertEqual(result.config["repo_filename"], "tool-*-x86_64.AppImage")
        self.assertEqual(result.config["allow_prereleases"], "false")

    def test_github_latest(self):
        source = detect_source("https://github.com/example/tool/releases/latest/download/Tool.AppImage")
        self.assertEqual(source.config["repo_filename"], "Tool.AppImage")

    def test_codeberg(self):
        source = detect_source("https://codeberg.org/example/tool/releases/download/v1.2.0/tool.AppImage")
        self.assertEqual(source.manager, "CodebergUpdater")

    def test_gitlab_nested(self):
        source = detect_source("https://gitlab.com/group/subgroup/app/-/releases/v1.0/downloads/App-1.0.AppImage")
        self.assertEqual(source.manager, "GitlabUpdater")
        self.assertEqual(source.config["repo_url"], "https://gitlab.com/group/subgroup/app")

    def test_plain_repository_not_assumed(self):
        self.assertIsNone(detect_source("https://github.com/example/tool/releases"))

    def test_unrelated_host_not_assumed(self):
        self.assertIsNone(detect_source("https://other.example.com/tool.AppImage"))

    def test_direct_release_referrer(self):
        source = detect_source("https://cdn.example.com/download.bin",
                               referrer="https://github.com/example/app/releases/latest/download/App.AppImage")
        self.assertEqual(source.manager, "GithubUpdater")

    def test_no_http(self):
        self.assertIsNone(detect_source("http://github.com/example/tool/releases/download/v1/app.AppImage"))

    def test_invalid_port(self):
        self.assertIsNone(detect_source("https://github.com:456/example/tool/releases/download/v1/app.AppImage"))


if __name__ == "__main__":
    unittest.main()
