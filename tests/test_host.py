import io
import os
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

from bridge import host
from bridge.gearlever import IntegrationResult


class FakeGearLever:
    calls = []

    def integrate(self, file):
        self.calls.append(file)
        return IntegrationResult(str(file), None, None, "integrated_by_gearlever")


class HostTests(unittest.TestCase):
    def test_binary_protocol(self):
        buffer = io.BytesIO()
        host.send_message(buffer, {"hello": "olá"})
        buffer.seek(0)
        self.assertEqual(host.read_message(buffer), {"hello": "olá"})

    def test_message_too_large(self):
        with self.assertRaises(ValueError):
            host.read_message(io.BytesIO(struct.pack("@I", host.MAX_BYTES + 1)))

    def test_non_appimage_payload_is_delegated_without_magic_check(self):
        # Gear Lever alone determines whether this file's format is supported.
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "Beeper-4.3.308-x86_64 (1).AppImage"
            target.write_bytes(b"NOT AN ELF MAGIC HEADER")
            request = {"action": "integrate", "filename": str(target),
                       "url": "https://example.com/Beeper.AppImage"}
            FakeGearLever.calls = []
            with patch.object(host, "STATE_DIR", Path(dirname) / "state"):
                result = host.handle(request, FakeGearLever)
            self.assertEqual(result["status"], "integrated_by_gearlever")
            self.assertEqual(FakeGearLever.calls, [target])
            self.assertIsNone(result["sourcePattern"])
            self.assertIsNone(result["architecture"])

    def test_download_deduplication_does_not_reintegrate(self):
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "example.AppImage"
            target.write_bytes(b"arbitrary bytes delegated to Gear Lever")
            request = {
                "action": "integrate", "filename": str(target),
                "url": "https://github.com/example/tool/releases/download/v1.2/example.AppImage"
            }
            FakeGearLever.calls = []
            with patch.object(host, "STATE_DIR", Path(dirname) / "state"):
                first = host.handle(request, FakeGearLever)
                repeated = host.handle(request, FakeGearLever)
            self.assertEqual(first["status"], "integrated_by_gearlever")
            self.assertEqual(repeated["status"], "already_processed")
            self.assertEqual(len(FakeGearLever.calls), 1)

    def test_untrusted_http_source_is_not_used_to_classify_file(self):
        # Origin is metadata for deduplication, not an AppImage validity gate.
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "example.AppImage"
            target.write_bytes(b"opaque application data")
            FakeGearLever.calls = []
            with patch.object(host, "STATE_DIR", Path(dirname) / "state"):
                result = host.handle({"action": "integrate", "filename": str(target),
                                      "url": "http://example.com/example.AppImage"}, FakeGearLever)
            self.assertEqual(result["status"], "integrated_by_gearlever")
            self.assertEqual(FakeGearLever.calls, [target])

    def test_native_host_rejects_unsafe_path_only(self):
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "test.AppImage"
            target.write_bytes(b"opaque bytes")
            with self.assertRaises(ValueError):
                host.validate_file("relative.AppImage")
            with self.assertRaises(ValueError):
                host.validate_file(str(target) + "\\x00")
            with self.assertRaises(ValueError):
                host.validate_file(str(target.with_suffix(".txt")))
            symlink = Path(dirname) / "symlink.AppImage"
            symlink.symlink_to(target)
            with self.assertRaises(ValueError):
                host.validate_file(str(symlink))

    def test_local_host_log_is_read_only_and_redacted(self):
        with tempfile.TemporaryDirectory() as dirname:
            state = Path(dirname)
            state.joinpath("host.log").write_text(
                "2026-11-12 12:30:01,001 WARNING Request failed: "
                "Gear Lever retornou 1: /home/secret/Downloads/app.AppImage "
                "https://example.com/?token=hidden password=abcdef\n"
                "2026-11-12 12:31:01,002 INFO Unrelated information\n"
                "2026-11-12 12:32:02,003 ERROR Unhandled host error\n",
                encoding="utf-8")
            with patch.object(host, "STATE_DIR", state):
                reply = host.handle({"action": "getHostLog"})
            self.assertTrue(reply["ok"])
            self.assertEqual(len(reply["entries"]), 2)
            details = str(reply["entries"])
            self.assertIn("app.AppImage", details)
            self.assertNotIn("/home/secret", details)
            self.assertNotIn("example.com", details)
            self.assertNotIn("abcdef", details)
            self.assertEqual(reply["entries"][0]["level"], "WARNING")

    def test_missing_host_log_is_empty_without_gearlever(self):
        with tempfile.TemporaryDirectory() as dirname:
            with patch.object(host, "STATE_DIR", Path(dirname)):
                self.assertEqual(host.handle({"action":"getHostLog"}), {"ok":True,"entries":[]})

    def test_mutation_requires_confirmation(self):
        with self.assertRaises(ValueError):
            host.handle({"action": "removeApp", "path": "/tmp/app.AppImage"})
        with self.assertRaises(ValueError):
            host.handle({"action": "setSource", "path": "/tmp/app.AppImage",
                         "manager": "GithubUpdater", "options": {}})


if __name__ == "__main__":
    unittest.main()
