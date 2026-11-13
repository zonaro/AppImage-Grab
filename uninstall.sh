#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.local/share/appimage-grab"
if [ -n "$(printenv XDG_DATA_HOME || :)" ]; then DEST="$(printenv XDG_DATA_HOME)/appimage-grab"; fi
BIN="$HOME/.local/bin/appimage-grab-host"
ID="$(tr -d '\n' < "$ROOT/extension/chromium/id.txt")"
python3 "$ROOT/scripts/register_hosts.py" --host-path "$BIN" --extension-id "$ID" --remove
if [ -f "$BIN" ] && grep -q 'python3 -m bridge.host' "$BIN"; then rm -f "$BIN"; fi
if [ -f "$DEST/bridge/host.py" ]; then rm -rf -- "$DEST"; fi
echo 'Native Messaging host removed. Uninstall the browser extension manually.'
echo 'Downloaded apps, Gear Lever settings and Shelly settings are untouched.'
echo 'Signing key preserved in ~/.local/share/appimage-grab-keys/ (back it up securely).'
echo 'Logs preserved in ~/.local/state/appimage-grab.'
