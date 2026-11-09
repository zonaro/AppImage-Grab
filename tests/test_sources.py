import unittest
from bridge.sources import (
    detect_source, filename_pattern, architecture, verify_source, release_assets,
)


class SourceTests(unittest.TestCase):
    def test_github_release_version_and_arch(self):
        source = detect_source("https://github.com/example/tool/releases/download/v2.3.1/tool-2.3.1-x86_64.AppImage")
        self.assertEqual(source.manager, "GithubUpdater")
        self.assertEqual(source.config["repo"], "example/tool")
        self.assertEqual(source.config["repo_filename"], "tool-*-x86_64.AppImage")
        self.assertEqual(source.config["allow_prereleases"], "false")
        self.assertEqual(source.asset_name, "tool-2.3.1-x86_64.AppImage")
        self.assertEqual(architecture(source.asset_name), "x86_64")

    def test_github_latest_without_version(self):
        source = detect_source("https://github.com/example/tool/releases/latest/download/Tool.AppImage")
        self.assertEqual(source.config["repo_filename"], "Tool.AppImage")

    def test_github_latest_with_version_in_asset(self):
        source = detect_source("https://github.com/example/tool/releases/latest/download/Tool-v12.0.5-arm64.AppImage")
        self.assertEqual(source.pattern, "Tool-*-arm64.AppImage")

    def test_codeberg_version_and_arch(self):
        source = detect_source("https://codeberg.org/example/tool/releases/download/v1.2.0/tool-1.2.0-aarch64.AppImage")
        self.assertEqual(source.manager, "CodebergUpdater")
        self.assertEqual(source.pattern, "tool-*-aarch64.AppImage")

    def test_gitlab_nested_project(self):
        source = detect_source("https://gitlab.com/group/subgroup/app/-/releases/v1.0/downloads/App-1.0-amd64.AppImage")
        self.assertEqual(source.manager, "GitlabUpdater")
        self.assertEqual(source.config["repo_url"], "https://gitlab.com/group/subgroup/app")
        self.assertEqual(source.pattern, "App-*-amd64.AppImage")

    def test_tag_prefix_preserves_full_asset_version(self):
        self.assertEqual(filename_pattern("app-v1.2.3-x86_64.AppImage", "v1.2"),
                         "app-*-x86_64.AppImage")

    def test_multiple_numbers_choose_release_version_only(self):
        self.assertEqual(filename_pattern("App-2.3.1-ubuntu22.04-x86_64.AppImage", "v2.3.1"),
                         "App-*-ubuntu22.04-x86_64.AppImage")

    def test_ambiguous_without_release_version_keeps_exact(self):
        self.assertEqual(filename_pattern("App-2.3.1-linux-22.04-x86_64.AppImage", None),
                         "App-2.3.1-linux-22.04-x86_64.AppImage")

    def test_arch_variants_do_not_collide(self):
        for file, arch in (
            ("tool-1.2-amd64.AppImage", "x86_64"),
            ("tool-v1.2-x86_64.AppImage", "x86_64"),
            ("tool-1.2-x64.AppImage", "x86_64"),
            ("tool-1.2-i686.AppImage", "x86"),
            ("tool-1.2-x86.AppImage", "x86"),
            ("tool-1.2-arm64.AppImage", "arm64"),
            ("tool-1.2-aarch64.AppImage", "arm64"),
            ("tool-1.2-armv7l.AppImage", "arm"),
            ("tool-1.2-riscv64.AppImage", "riscv64"),
        ):
            with self.subTest(filename=file):
                self.assertEqual(architecture(file), arch)
                self.assertIn("-" + ("*" if "1.2" in file else ""), filename_pattern(file, "v1.2"))

    def test_one_matching_asset_registers_source(self):
        source = detect_source("https://github.com/a/b/releases/download/v1.2/app-1.2-x86_64.AppImage")
        names = ["app-1.2-x86_64.AppImage", "app-1.2-arm64.AppImage", "app-lite-1.2-x86_64.AppImage"]
        verified = verify_source(source, elf_arch="x86_64", asset_fetcher=lambda _: names)
        self.assertIsNotNone(verified)
        self.assertEqual(verified.pattern, "app-[0-9]*-x86_64.AppImage")

    def test_other_arch_rejected_even_when_asset_matches(self):
        source = detect_source("https://github.com/a/b/releases/download/v1.2/app-1.2-arm64.AppImage")
        names = ["app-1.2-arm64.AppImage"]
        self.assertIsNone(verify_source(source, elf_arch="x86_64", asset_fetcher=lambda _: names))

    def test_ambiguous_wildcard_must_not_be_registered(self):
        source = detect_source("https://github.com/a/b/releases/download/v1.2/app-1.2.AppImage")
        names = ["app-1.2.AppImage", "app-1.2-debug.AppImage", "app-1.2-aarch64.AppImage"]
        # Pattern app-*.AppImage matches all three.
        self.assertIsNone(verify_source(source, asset_fetcher=lambda _: names))

    def test_failed_asset_lookup_refuses_unverified_wildcard(self):
        source = detect_source("https://github.com/a/b/releases/download/v1.2/app-1.2-x86_64.AppImage")
        self.assertIsNone(verify_source(source, asset_fetcher=lambda _: None))

    def test_exact_name_not_wildcarded(self):
        source = detect_source("https://github.com/a/b/releases/latest/download/app-x86_64.AppImage")
        self.assertEqual(source.pattern, "app-x86_64.AppImage")
        self.assertEqual(verify_source(source, elf_arch="x86_64"), source)

    def test_plain_repository_not_assumed(self):
        self.assertIsNone(detect_source("https://github.com/example/tool/releases"))

    def test_unrelated_host_not_assumed(self):
        self.assertIsNone(detect_source("https://other.example.com/tool.AppImage"))

    def test_direct_release_referrer(self):
        source = detect_source("https://cdn.example.com/download.bin",
                               referrer="https://github.com/example/app/releases/latest/download/App.AppImage")
        self.assertEqual(source.manager, "GithubUpdater")

    def test_invalid_ports_and_protocol(self):
        self.assertIsNone(detect_source("http://github.com/example/tool/releases/download/v1/app.AppImage"))
        self.assertIsNone(detect_source("https://github.com:456/example/tool/releases/download/v1/app.AppImage"))

    def test_encoded_path_not_allowed(self):
        self.assertIsNone(detect_source("https://github.com/a/b/releases/download/v1/foo%2Fbar.AppImage"))


if __name__ == "__main__":
    unittest.main()
