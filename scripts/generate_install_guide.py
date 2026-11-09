#!/usr/bin/env python3
"""Generate a standalone, local manual extension-installation guide.

The guide never installs extensions, modifies browser profiles or starts remote
code. Browser-internal pages may reject links from file://; a copy fallback is
always visible.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import os
import sys

try:
    from .register_hosts import BROWSERS
except ImportError:
    from register_hosts import BROWSERS

SCHEMES = {
    "Google Chrome": "chrome://extensions/",
    "Chromium": "chrome://extensions/",
    "Brave": "brave://extensions/",
    "Vivaldi": "vivaldi://extensions/",
    "Microsoft Edge": "edge://extensions/",
    "Opera": "opera://extensions/",
    "Thorium": "chrome://extensions/",
}
FIREFOX_SCHEME = "about:debugging#/runtime/this-firefox"
TEMPLATE = Path(__file__).with_name("install-guide-template.html")


def detected_browsers():
    """Only mark browsers detected through an executable; no profile tampering."""
    found = []
    for name, binaries, _native_path, family in BROWSERS:
        if any(shutil.which(binary) for binary in binaries):
            found.append({"name": name,
                          "family": family,
                          "url": SCHEMES.get(name, FIREFOX_SCHEME)})
    return found


def generate_guide(output: Path, chromium: Path, firefox_manifest: Path, commit: str,
                   browsers=None) -> Path:
    """Create a single self-contained HTML file with safe JSON data embedding."""
    if len(commit) != 40 or any(ch not in "0123456789abcdefABCDEF" for ch in commit):
        raise ValueError("Invalid Git commit SHA")
    chromium = chromium.expanduser().resolve(strict=True)
    firefox_manifest = firefox_manifest.expanduser().resolve(strict=True)
    if not (chromium / "manifest.json").is_file() or firefox_manifest.name != "manifest.json":
        raise ValueError("The unpacked extension directories are missing")
    data = {
        "commit": commit.lower(),
        "chromiumPath": str(chromium),
        "firefoxPath": str(firefox_manifest),
        "browsers": detected_browsers() if browsers is None else browsers,
    }
    # Prevent breaking out of the data script tag with filenames including
    # special characters, even when the home folder contains HTML-like text.
    serial = json.dumps(data, ensure_ascii=True).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    template = TEMPLATE.read_text(encoding="utf-8")
    if template.count("__GLG_INSTALLATION_DATA__") != 1:
        raise ValueError("Missing or duplicate template placeholder")
    output = output.expanduser().absolute()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".html.tmp")
    temporary.write_text(template.replace("__GLG_INSTALLATION_DATA__", serial), encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(output)
    return output


def open_guide(page: Path) -> bool:
    """Open HTML in the default browser when graphical; never open all browsers."""
    if os.environ.get("GLG_OPEN_BROWSER", "1") == "0":
        return False
    if not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
        return False
    opener = shutil.which("xdg-open")
    if not opener:
        return False
    try:
        subprocess.Popen([opener, page.as_uri()], stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)
        return True
    except OSError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--chromium", type=Path, required=True)
    parser.add_argument("--firefox-manifest", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--open", action="store_true", help="Open the local guide")
    parser.add_argument("--open-only", action="store_true", help="Open an existing guide without rebuilding")
    args = parser.parse_args()
    if args.open_only:
        page = args.output.expanduser().absolute()
        if not page.is_file():
            parser.error("The installation guide is missing")
    else:
        try:
            page = generate_guide(args.output, args.chromium, args.firefox_manifest, args.commit)
        except (OSError, ValueError) as exc:
            parser.error(str(exc))
    print("Manual installation guide:", page)
    if args.open or args.open_only:
        if open_guide(page):
            print("Opened the installation guide in your default browser.")
        else:
            print("Could not automatically open the guide. Open this local HTML file manually:")
            print(" ", page.as_uri())
    return 0


if __name__ == "__main__":
    sys.exit(main())
