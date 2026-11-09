#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.local/share/gear-lever-grab"
if [ -n "$(printenv XDG_DATA_HOME || :)" ]; then DEST="$(printenv XDG_DATA_HOME)/gear-lever-grab"; fi
BIN="$HOME/.local/bin/gear-lever-grab-host"
ID="$(tr -d '\n' < "$ROOT/extension/chromium/id.txt")"
python3 "$ROOT/scripts/register_hosts.py" --host-path "$BIN" --extension-id "$ID" --remove
if [ -f "$BIN" ] && grep -q 'python3 -m bridge.host' "$BIN"; then rm -f "$BIN"; fi
if [ -f "$DEST/bridge/host.py" ]; then rm -rf -- "$DEST"; fi
echo 'Native Messaging host removed. Uninstall the browser extension manually.'
echo 'Downloaded apps and Gear Lever settings are untouched.'
echo 'Signing key preserved in ~/.local/share/gear-lever-grab-keys/ (back it up securely).'
echo 'Logs preserved in ~/.local/state/gear-lever-grab.'
