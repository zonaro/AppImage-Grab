#!/usr/bin/env python3
"""Open only the user's preferred installed browser extensions page, if interactive."""
import os
import shutil
import subprocess
import sys

from register_hosts import BROWSERS

CHROME_SCHEMES = {
    "Google Chrome": "chrome://extensions/",
    "Chromium": "chrome://extensions/",
    "Brave": "brave://extensions/",
    "Vivaldi": "vivaldi://extensions/",
    "Microsoft Edge": "edge://extensions/",
    "Opera": "opera://extensions/",
    "Thorium": "chrome://extensions/",
}
FIREFOX_PAGE = "about:debugging#/runtime/this-firefox"


def installed():
    items = []
    for label, binaries, _manifest_path, family in BROWSERS:
        binary = next((shutil.which(name) for name in binaries if shutil.which(name)), None)
        if not binary:
            continue
        page = CHROME_SCHEMES.get(label, FIREFOX_PAGE)
        items.append((label, binary, page))
    return items


def preferred_browser(items):
    default = ""
    if shutil.which("xdg-settings"):
        try:
            res = subprocess.run(["xdg-settings", "get", "default-web-browser"],
                                 capture_output=True, text=True, timeout=4, check=False)
            default = res.stdout.strip().lower()
        except (subprocess.TimeoutExpired, OSError):
            pass
    for label, binary, page in items:
        candidates = (label.lower().replace(" ", "-"), os.path.basename(binary).lower())
        if default and any(candidate in default for candidate in candidates):
            return label, binary, page
    return items[0] if items else None


def main():
    items = installed()
    if not items:
        print("No browser binary detected; extension installation instructions remain in README.")
        return 0
    print("\nDetected browsers and extension pages:")
    for label, _, page in items:
        print(f"  {label}: {page}")
    if os.environ.get("GLG_OPEN_BROWSER", "1") == "0":
        return 0
    if not sys.stdout.isatty() or not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
        print("No interactive graphical terminal; browser page was not opened.")
        return 0
    choice = preferred_browser(items)
    if choice:
        label, binary, page = choice
        try:
            subprocess.Popen([binary, page], stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
            print(f"Opened {label} extensions page. Approve installation manually.")
        except OSError as exc:
            print(f"Could not open {label}: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
