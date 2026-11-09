#!/usr/bin/env python3
"""Build Firefox XPI and (when possible) Chromium CRX using an installed browser.

The CRX signing key is machine-local and must NEVER be committed or copied
inside the extension itself. A locally packed CRX has a distinct extension ID
from the legacy unpacked manifest.key; the installer registers both IDs.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import zipfile

PACKERS = [
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
    "microsoft-edge", "microsoft-edge-stable", "microsoft-edge-beta",
    "brave-browser", "brave-browser-stable", "vivaldi", "vivaldi-stable",
    "thorium", "thorium-browser", "opera",
]


def extension_id(public_key_der: bytes) -> str:
    """Chrome extension ID = SHA256(SPKI DER) first 128 bits, mapped a..p."""
    digest = hashlib.sha256(public_key_der).digest()[:16]
    return "".join(chr(97 + nibble) for byte in digest for nibble in (byte >> 4, byte & 15))


def manifest_key_id(manifest: dict) -> str | None:
    encoded = manifest.get("key")
    if not encoded:
        return None
    try:
        return extension_id(base64.b64decode(encoded, validate=True))
    except (ValueError, TypeError):
        return None


def pem_id(pem: Path) -> str:
    result = subprocess.run(
        ["openssl", "pkey", "-in", str(pem), "-pubout", "-outform", "DER"],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=15,
    )
    return extension_id(result.stdout)


def build_xpi(directory: Path, output: Path) -> Path:
    """XPI is a ZIP with manifest.json at archive root, unsigned until AMO signs."""
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(directory.rglob("*")):
            if path.is_file() and not path.is_symlink():
                archive.write(path, path.relative_to(directory).as_posix())
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None or "manifest.json" not in archive.namelist():
            raise RuntimeError("Invalid XPI archive")
    return output


def find_packer(custom: str | None = None) -> str | None:
    if custom:
        return shutil.which(custom) if "/" not in custom else (custom if os.path.isfile(custom) else None)
    for name in PACKERS:
        found = shutil.which(name)
        if found:
            return found
    return None


def build_crx(directory: Path, output: Path, private_key: Path, browser: str) -> str:
    """Invoke the browser's CRX3 packer. Never fake a .crx by renaming ZIP."""
    if not shutil.which("openssl"):
        raise RuntimeError("openssl is required to verify the CRX signing key")
    private_key.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    private_key.parent.chmod(0o700)
    with tempfile.TemporaryDirectory(prefix="gear-lever-grab-pack-") as temporary:
        temporary = Path(temporary)
        stage = temporary / "extension"
        shutil.copytree(directory, stage)
        manifest_path = stage / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        # The source manifest has a public key to preserve the existing
        # unpacked ID. A newly generated CRX must not claim that legacy key.
        manifest.pop("key", None)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        command = [browser, "--no-first-run", "--no-default-browser-check",
                   "--no-message-box", "--user-data-dir=" + str(temporary / "profile"),
                   "--pack-extension=" + str(stage)]
        if private_key.is_file():
            command.append("--pack-extension-key=" + str(private_key))
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=35, check=False)
        except (subprocess.TimeoutExpired, OSError) as exc:
            raise RuntimeError("Browser could not pack CRX: " + str(exc)) from exc
        produced = stage.with_suffix(".crx")
        new_private_key = stage.with_suffix(".pem")
        if result.returncode != 0 or not produced.is_file():
            detail = (result.stderr or result.stdout or "unknown error").strip()[-300:]
            raise RuntimeError("Browser did not create CRX: " + detail)
        with produced.open("rb") as f:
            header = f.read(12)
        if len(header) != 12 or header[:4] != b"Cr24" or struct.unpack("<I", header[4:8])[0] != 3:
            raise RuntimeError("Packer did not produce a CRX3 archive")
        key = private_key if private_key.is_file() else new_private_key
        if not key.is_file():
            raise RuntimeError("Missing CRX private key (cannot keep stable extension ID)")
        identifier = pem_id(key)
        if not private_key.is_file():
            # Keep signing identity for re-packages on this machine.
            shutil.copyfile(new_private_key, private_key)
            private_key.chmod(0o600)
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(produced, output)
        output.chmod(0o644)
        return identifier


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True, help="Project or installed source directory")
    parser.add_argument("--key-dir", type=Path, help="Private key directory (never put inside dist/)")
    parser.add_argument("--browser", help="Browser binary used for --pack-extension")
    parser.add_argument("--skip-crx", action="store_true")
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    dest = root / "dist" / "packages"
    firefox = root / "dist" / "firefox"
    chromium = root / "dist" / "chromium"
    if not (firefox / "manifest.json").is_file() or not (chromium / "manifest.json").is_file():
        parser.error("Build unpacked extension directories first with scripts/build-extensions.sh")
    xpi = build_xpi(firefox, dest / "gear-lever-grab.xpi")
    print("Firefox XPI (unsigned):", xpi)
    id_file = dest / "chromium-id.txt"
    if args.skip_crx:
        return 0
    packer = find_packer(args.browser)
    if not packer:
        print("CRX unavailable: no Chromium-based packer detected; unpacked fallback stays available.")
        if id_file.exists():
            id_file.unlink()
        return 0
    key_dir = args.key_dir or root / "keys"
    key = key_dir / "chromium.pem"
    try:
        extension_id_value = build_crx(chromium, dest / "gear-lever-grab.crx", key, packer)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print("CRX packaging unavailable:", exc)
        print("Use the unpacked Chromium extension until a signed CRX can be built.")
        id_file.unlink(missing_ok=True)
        (dest / "gear-lever-grab.crx").unlink(missing_ok=True)
        return 0
    id_file.write_text(extension_id_value + "\n", encoding="ascii")
    print("Chromium CRX:", dest / "gear-lever-grab.crx")
    print("CRX extension ID:", extension_id_value)
    print("CRX signing key (keep private and backed up):", key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
