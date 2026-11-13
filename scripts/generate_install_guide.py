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
from urllib.parse import quote

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

# Linux's default browser is reported as a desktop-entry ID. Map that ID to
# a supported, installed executable instead of routing an internal URL through
# xdg-open (file:// pages cannot navigate to chrome:// or edge:// addresses).
DESKTOP_ALIASES = {
    "Google Chrome": ("com.google.chrome.desktop",),
    "Chromium": ("org.chromium.chromium.desktop",),
    "Brave": ("com.brave.browser.desktop",),
    "Vivaldi": ("com.vivaldi.vivaldi.desktop",),
    "Microsoft Edge": ("com.microsoft.edge.desktop",),
    "Opera": ("com.opera.opera.desktop",),
    "Thorium": ("org.thorium.thorium.desktop",),
    "Firefox": ("org.mozilla.firefox.desktop",),
    "Floorp": ("org.mozilla.floorp.desktop",),
    "Waterfox": ("net.waterfox.waterfox.desktop",),
}


def graphical_launch_allowed():
    return (os.environ.get("AIG_OPEN_BROWSER", "1") != "0" and
            bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")))


def default_browser_desktop_id():
    """Look up the actual default browser; neither query launches a browser."""
    for command in (
        ["xdg-settings", "get", "default-web-browser"],
        ["xdg-mime", "query", "default", "x-scheme-handler/https"],
    ):
        if not shutil.which(command[0]):
            continue
        try:
            result = subprocess.run(command, capture_output=True, text=True,
                                    check=False, timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if result.returncode == 0 and result.stdout.strip().endswith(".desktop"):
            return result.stdout.strip().lower()
    return ""


def open_browser_extensions(browsers=None, *, updating=False):
    """Open a browser-internal extensions page using that browser's CLI.

    Never use xdg-open for internal schemes or silently activate the extension.
    Prefer the user's default browser; when unknown, choose one installed
    supported browser rather than opening multiple browser windows.
    For an update, request a Chromium-family search for the extension. The
    internal ?q= search parameter is best-effort: a browser can ignore it.
    Returns the browser name if the launch was requested, otherwise None.
    """
    if not graphical_launch_allowed():
        return None
    found = detected_browsers() if browsers is None else browsers
    if not found:
        return None
    default_id = default_browser_desktop_id()
    selected = None
    for browser in found:
        name = browser["name"]
        spec = next(((n, exes, family) for n, exes, _, family in BROWSERS
                     if n == name), None)
        if not spec:
            continue
        _, binaries, _ = spec
        ids = {f"{binary}.desktop" for binary in binaries}
        ids.update(DESKTOP_ALIASES.get(name, ()))
        if default_id in ids:
            selected = browser
            break
    if selected is None:
        selected = found[0]

    entry = next(((exes, family) for name, exes, _, family in BROWSERS
                  if name == selected["name"]), None)
    if not entry:
        return None
    binaries, family = entry
    # Honor a default beta/dev channel if its executable is present.
    preferred = default_id.removesuffix(".desktop")
    candidates = list(binaries)
    if preferred in candidates:
        candidates.remove(preferred)
        candidates.insert(0, preferred)
    executable = next((shutil.which(candidate) for candidate in candidates
                       if shutil.which(candidate)), None)
    if not executable:
        return None

    address = SCHEMES.get(selected["name"], FIREFOX_SCHEME)
    if updating and family == "chromium":
        # The query is a convenience hint only: each browser controls its own
        # internal extensions page and may ignore unsupported search parameters.
        address += "?q=" + quote("AppImage Grab", safe="")
    option = "-new-tab" if family == "firefox" else "--new-tab"
    try:
        subprocess.Popen([executable, option, address], stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)
        return selected["name"]
    except OSError:
        return None


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
    if template.count("__AIG_INSTALLATION_DATA__") != 1:
        raise ValueError("Missing or duplicate template placeholder")
    output = output.expanduser().absolute()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".html.tmp")
    temporary.write_text(template.replace("__AIG_INSTALLATION_DATA__", serial), encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(output)
    return output


def open_guide(page: Path) -> bool:
    """Open HTML in the default browser when graphical; never open all browsers."""
    if not graphical_launch_allowed():
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
    parser.add_argument("--open-extensions", action="store_true",
                        help="Launch the extensions page directly using the detected browser executable")
    parser.add_argument("--updating", action="store_true",
                        help="On update, request an extensions-page search in Chromium browsers")
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
    if args.open_extensions:
        browser = open_browser_extensions(updating=args.updating)
        if browser:
            print(f"Requested the extensions page directly in {browser}."
                  + (" (update search attempted where supported)." if args.updating else ""))
        else:
            print("Could not launch an extensions page automatically.")
            print("Open your browser's extensions/settings address from the guide manually.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
