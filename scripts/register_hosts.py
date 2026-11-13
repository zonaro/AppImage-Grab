#!/usr/bin/env python3
"""Register Native Messaging host for user-installed browsers (no sudo)."""
import argparse
import json
from pathlib import Path
import shutil
import re

NAME = "br.com.redclaw.appimage_grab"
BROWSERS = [
    ("Google Chrome", ("google-chrome", "google-chrome-stable"), ".config/google-chrome/NativeMessagingHosts", "chromium"),
    ("Chromium", ("chromium", "chromium-browser"), ".config/chromium/NativeMessagingHosts", "chromium"),
    ("Brave", ("brave-browser", "brave-browser-stable"), ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts", "chromium"),
    ("Vivaldi", ("vivaldi", "vivaldi-stable"), ".config/vivaldi/NativeMessagingHosts", "chromium"),
    ("Microsoft Edge", ("microsoft-edge", "microsoft-edge-stable", "microsoft-edge-beta", "microsoft-edge-dev"), ".config/microsoft-edge/NativeMessagingHosts", "chromium"),
    ("Opera", ("opera",), ".config/opera/NativeMessagingHosts", "chromium"),
    ("Thorium", ("thorium", "thorium-browser"), ".config/thorium/NativeMessagingHosts", "chromium"),
    ("Firefox", ("firefox", "firefox-developer-edition"), ".mozilla/native-messaging-hosts", "firefox"),
    ("Floorp", ("floorp",), ".floorp/native-messaging-hosts", "firefox"),
    ("Waterfox", ("waterfox",), ".waterfox/native-messaging-hosts", "firefox"),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host-path", required=True)
    parser.add_argument("--extension-id", required=True)
    parser.add_argument("--remove", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-p]{32}", args.extension_id):
        parser.error("Invalid unpacked extension ID")
    home = Path.home()
    registered = set()
    for label, executables, location, family in BROWSERS:
        destination = home / location / f"{NAME}.json"
        if destination in registered:
            continue
        if not any(shutil.which(binary) for binary in executables) and not destination.parent.parent.exists():
            continue
        registered.add(destination)
        if args.remove:
            if destination.is_file():
                try:
                    current = json.loads(destination.read_text())
                    if current.get("path") == args.host_path:
                        destination.unlink()
                        print(f"Host removido: {label}")
                except (OSError, ValueError):
                    print(f"Host preservado (manifesto diferente): {label}")
            continue
        manifest = {
            "name": NAME, "description": "Integra downloads AppImage com Gear Lever ou Shelly",
            "path": args.host_path, "type": "stdio",
        }
        if family == "firefox":
            manifest["allowed_extensions"] = ["appimage-grab@redclaw.com.br"]
        else:
            manifest["allowed_origins"] = [f"chrome-extension://{args.extension_id}/"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(manifest, indent=2) + "\n")
        destination.chmod(0o600)
        print(f"Host registrado: {label} ({destination})")
    if not registered and not args.remove:
        print("Nenhum navegador detectado; execute novamente após instalar um navegador.")


if __name__ == "__main__":
    main()
