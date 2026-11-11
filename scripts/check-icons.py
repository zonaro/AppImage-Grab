#!/usr/bin/env python3
"""Fail the extension build if any packaged PNG icon is corrupt or mis-sized."""
import struct
import sys
import zlib
from pathlib import Path

SIGNATURE = b"\x89PNG\r\n\x1a\n"
REQUIRED = (16, 32, 48)


def check_png(path: Path, expected_size: int) -> None:
    data = path.read_bytes()
    if not data.startswith(SIGNATURE):
        raise ValueError("invalid PNG signature")
    offset = len(SIGNATURE)
    idat = bytearray()
    header = None
    palette = False
    ended = False
    while offset < len(data):
        if len(data) - offset < 12:
            raise ValueError("truncated PNG chunk")
        length = struct.unpack_from(">I", data, offset)[0]
        end = offset + length + 12
        if end > len(data):
            raise ValueError("PNG chunk exceeds file length")
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        saved_crc = struct.unpack_from(">I", data, offset + 8 + length)[0]
        if zlib.crc32(kind + payload) != saved_crc:
            raise ValueError(f"CRC mismatch in {kind!r}")
        if kind == b"IHDR":
            if header is not None or length != 13 or offset != 8:
                raise ValueError("invalid IHDR")
            width, height, depth, color, compression, filter_method, interlace = struct.unpack(">IIBBBBB", payload)
            if (width, height) != (expected_size, expected_size):
                raise ValueError(f"expected {expected_size}x{expected_size}, got {width}x{height}")
            if depth != 8 or color not in (2, 3, 6) or (compression, filter_method, interlace) != (0, 0, 0):
                raise ValueError("unsupported PNG encoding")
            header = (width, height, color)
        elif kind == b"PLTE":
            palette = True
        elif kind == b"IDAT":
            idat.extend(payload)
        elif kind == b"IEND":
            if length or end != len(data):
                raise ValueError("invalid PNG end or trailing bytes")
            ended = True
            break
        offset = end
    if not ended or not header or not idat or (header[2] == 3 and not palette):
        raise ValueError("PNG missing required chunks")
    channels = {2: 3, 3: 1, 6: 4}[header[2]]
    expected_bytes = header[1] * (1 + header[0] * channels)
    try:
        raster = zlib.decompress(bytes(idat))
    except zlib.error as exc:
        raise ValueError(f"invalid image stream: {exc}") from exc
    if len(raster) != expected_bytes:
        raise ValueError("incomplete or oversized image stream")
    stride = 1 + header[0] * channels
    if any(raster[row * stride] > 4 for row in range(header[1])):
        raise ValueError("invalid PNG row filter")


def main() -> int:
    folders = [Path(arg) for arg in sys.argv[1:]] or [Path("extension/common/icons")]
    errors = 0
    for folder in folders:
        for size in REQUIRED:
            file = folder / f"icon-{size}.png"
            try:
                check_png(file, size)
                print(f"OK {file}")
            except (OSError, ValueError) as exc:
                print(f"INVALID {file}: {exc}", file=sys.stderr)
                errors += 1
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
