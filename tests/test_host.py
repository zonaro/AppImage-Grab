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

    def test_http_rejected(self):
        with tempfile.TemporaryDirectory() as dirname:
            target = Path(dirname) / "example.AppImage"
            target.write_bytes(b"\x7fELF" + b"\0" * 4 + b"AI\x02" + b"\0" * 32)
            with self.assertRaises(ValueError):
                host.handle({"action": "integrate", "filename": str(target), "url": "http://example.com/a.AppImage"})


if __name__ == "__main__":
    unittest.main()
