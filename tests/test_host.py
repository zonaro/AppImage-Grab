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

    def integrate(self, file, source):
        self.calls.append((file, source))
        return IntegrationResult(str(file), source.manager if source else None,
                                 source.origin if source else None,
                                 "integrated_with_source" if source else "integrated_without_source")


class HostTests(unittest.TestCase):
    def test_binary_protocol(self):
        buffer = io.BytesIO()
        host.send_message(buffer, {"hello": "olá"})
        buffer.seek(0)
        self.assertEqual(host.read_message(buffer), {"hello": "olá"})

    def test_message_too_large(self):
        with self.assertRaises(ValueError):
            host.read_message(io.BytesIO(struct.pack("@I", host.MAX_BYTES + 1)))

    def test_fake_file_rejected(self):
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "invalid.AppImage"
            target.write_bytes(b"hello world invalid file")
            with self.assertRaises(ValueError):
                host.validate_file(str(target))

    def test_good_download_and_deduplication(self):
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "example.AppImage"
            target.write_bytes(b"\x7fELF" + b"\0" * 4 + b"AI\x02" + b"\0" * 32)
            request = {
                "action": "integrate", "filename": str(target),
                "url": "https://github.com/example/tool/releases/download/v1.2/example.AppImage"
            }
            FakeGearLever.calls = []
            with patch.object(host, "STATE_DIR", Path(dirname) / "state"):
                first = host.handle(request, FakeGearLever)
                repeated = host.handle(request, FakeGearLever)
            self.assertEqual(first["status"], "integrated_with_source")
            self.assertEqual(repeated["status"], "already_processed")
            self.assertEqual(len(FakeGearLever.calls), 1)

    def test_wildcard_source_is_verified(self):
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "myapp-1.2-x86_64.AppImage"
            header = bytearray(60)
            header[0:4] = b"\x7fELF"
            header[5] = 1
            header[8:11] = b"AI\x02"
            header[18:20] = (62).to_bytes(2, "little")
            target.write_bytes(header)
            self.assertEqual(host.elf_architecture(target), "x86_64")
            request = {"action": "integrate", "filename": str(target),
                       "url": "https://github.com/a/b/releases/download/v1.2/myapp-1.2-arm64.AppImage"}
            FakeGearLever.calls = []
            with patch.object(host, "STATE_DIR", Path(dirname) / "state"):
                result = host.handle(request, FakeGearLever)
            self.assertEqual(result["status"], "integrated_without_source")
            self.assertIsNone(FakeGearLever.calls[0][1])

    def test_http_rejected(self):
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "example.AppImage"
            target.write_bytes(b"\x7fELF" + b"\0" * 4 + b"AI\x02" + b"\0" * 32)
            with self.assertRaises(ValueError):
                host.handle({"action": "integrate", "filename": str(target), "url": "http://example.com/a.AppImage"})

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
