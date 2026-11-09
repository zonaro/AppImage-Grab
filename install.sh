#!/usr/bin/env bash
# Re-running this script installs or repairs the newest Git main commit.
set -euo pipefail
REPOSITORY="https://github.com/zonaro/gear-lever-grab.git"
if [[ "$(printenv GLG_FROM_MAIN || :)" != "1" ]]; then
  command -v git >/dev/null || { echo "Git is required to install/update." >&2; exit 1; }
  TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf -- "$TEMP_DIR"' EXIT
  echo "Fetching the latest Gear Lever Grab revision from main…"
  git clone --quiet --depth 1 --branch main "$REPOSITORY" "$TEMP_DIR/repository"
  GLG_FROM_MAIN=1 bash "$TEMP_DIR/repository/install.sh"
  exit $?
fi
ROOT="$(cd "$(dirname "$0")" && pwd)"
[[ -d "$ROOT/.git" ]] || { echo "The installer must run from the freshly cloned main branch." >&2; exit 1; }
command -v python3 >/dev/null || { echo "Python 3 is required." >&2; exit 1; }
REVISION="$(git -C "$ROOT" rev-parse --verify HEAD)"
[[ "$REVISION" =~ ^[[:xdigit:]]{40}$ ]] || { echo "Invalid Git commit SHA." >&2; exit 1; }
DEST="$HOME/.local/share/gear-lever-grab"
if [ -n "$(printenv XDG_DATA_HOME || :)" ]; then DEST="$(printenv XDG_DATA_HOME)/gear-lever-grab"; fi
# Report the installed SHA versus the freshly fetched main SHA.
PREVIOUS_COMMIT=""
if [[ -f "$DEST/version.json" ]]; then
  PREVIOUS_COMMIT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("commit",""))' "$DEST/version.json" 2>/dev/null || :)"
fi
if [[ -z "$PREVIOUS_COMMIT" ]]; then
  printf 'Installing Gear Lever Grab at main commit: %s\n' "$REVISION"
elif [[ "$PREVIOUS_COMMIT" == "$REVISION" ]]; then
  printf 'Already at latest main commit: %s (refreshing files)\n' "$REVISION"
else
  printf 'Updating Gear Lever Grab from %s to %s\n' "$PREVIOUS_COMMIT" "$REVISION"
fi
BIN="$HOME/.local/bin/gear-lever-grab-host"
KEY_DIR="$HOME/.local/share/gear-lever-grab-keys"
EXT_ID="$(tr -d '\n' < "$ROOT/extension/chromium/id.txt")"

command -v python3 >/dev/null || { echo 'python3 is required' >&2; exit 1; }
if ! command -v gearlever >/dev/null && ! { command -v flatpak >/dev/null && flatpak info it.mijorus.gearlever >/dev/null 2>&1; }; then
  echo 'Warning: Gear Lever was not detected. Install it before activating the extension.' >&2
fi
GLG_BUILD_SHA="$REVISION" bash "$ROOT/scripts/build-extensions.sh"
mkdir -p "$DEST" "$(dirname "$BIN")" "$KEY_DIR"
chmod 700 "$KEY_DIR"
cp -a "$ROOT/bridge" "$ROOT/scripts" "$ROOT/extension" "$ROOT/dist" "$DEST/"
cp "$ROOT/uninstall.sh" "$DEST/uninstall.sh"

# An unsigned Firefox XPI can be used for temporary installation.
# A CRX3 requires a signing key; try the detected Chromium browser packer.
# If unavailable, keep the unpacked extension as a supported fallback.
python3 "$DEST/scripts/package_extensions.py" --root "$DEST" --key-dir "$KEY_DIR"

cat > "$BIN" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$DEST"
exec python3 -m bridge.host
EOF
chmod 755 "$BIN"

HOST_ARGS=(--host-path "$BIN" --extension-id "$EXT_ID")
PACKAGE_DIR="$DEST/dist/packages"
if [ -s "$PACKAGE_DIR/chromium-id.txt" ] && [ -f "$PACKAGE_DIR/gear-lever-grab.crx" ]; then
  PACKED_ID="$(tr -d '\n' < "$PACKAGE_DIR/chromium-id.txt")"
  HOST_ARGS+=(--packed-extension-id "$PACKED_ID")
fi
python3 "$DEST/scripts/register_hosts.py" "${HOST_ARGS[@]}"

# The installed version is written last, after a successful bridge update.
# The rename is atomic so the host never reads truncated JSON.
cp "$ROOT/version.json" "$DEST/version.json.pending"
mv -f "$DEST/version.json.pending" "$DEST/version.json"
printf '\nInstalled Git main commit: %s\n' "$REVISION"


cat <<EOF

Gear Lever Grab files and Native Messaging host are ready.
Browsers do not support reliable, silent user-profile installation of local
extensions. No browser preferences or enterprise policies were modified.

CHROMIUM FAMILY (Chrome, Chromium, Edge, Brave, Vivaldi, Opera, Thorium)
  RECOMMENDED: Install with Developer mode (avoids CRX_REQUIRED_PROOF_MISSING).
  1. Open your browser's extensions page (e.g., edge://extensions).
  2. Enable Developer mode.
  3. Click Load unpacked and select the DIRECTORY:
     $DEST/dist/chromium
  4. Keep browser permission prompts under your control. Turn ON the
     Grab download automation separately when you want it.

EOF
if [ -f "$PACKAGE_DIR/gear-lever-grab.crx" ]; then
  cat <<EOF
  ADVANCED / EXPERIMENTAL: A locally signed CRX3 package was also built:
    $PACKAGE_DIR/gear-lever-grab.crx
  This package has a local signing key, but NOT a browser store signature.
  Chrome/Edge may reject it with CRX_REQUIRED_PROOF_MISSING. This is NOT
  fixed by repacking it. Use Load unpacked above if the browser rejects it.
EOF
fi
cat <<EOF

FIREFOX / FLOORP / WATERFOX
  Package (unsigned, for temporary development installation):
    $PACKAGE_DIR/gear-lever-grab.xpi
  Open about:debugging#/runtime/this-firefox -> Load Temporary Add-on,
  then select the .xpi file (or dist/firefox/manifest.json).
  For permanent installation, Mozilla AMO signing is required.

Finally open the extension popup and switch automation ON if you want it.
It starts OFF. The OFF position never interferes with normal downloads.

Re-run the same one-line installer for future updates; reload a previously
unpacked extension in your browser's extensions page.
To uninstall the bridge: bash "$DEST/uninstall.sh"
EOF

# Show the browser extensions page once when running in a graphical,
# interactive terminal. Opt out with GLG_OPEN_BROWSER=0.
python3 "$DEST/scripts/open_browser_extensions.py"
