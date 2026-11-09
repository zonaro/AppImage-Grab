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
EXT_ID="$(tr -d '\n' < "$ROOT/extension/chromium/id.txt")"

command -v python3 >/dev/null || { echo 'python3 is required' >&2; exit 1; }
if ! command -v gearlever >/dev/null && ! { command -v flatpak >/dev/null && flatpak info it.mijorus.gearlever >/dev/null 2>&1; }; then
  echo 'Warning: Gear Lever was not detected. Install it before activating the extension.' >&2
fi
GLG_BUILD_SHA="$REVISION" bash "$ROOT/scripts/build-extensions.sh"
mkdir -p "$DEST" "$(dirname "$BIN")"
cp -a "$ROOT/bridge" "$ROOT/scripts" "$ROOT/extension" "$ROOT/dist" "$DEST/"
cp "$ROOT/uninstall.sh" "$DEST/uninstall.sh"

# Remove obsolete local packages from previous installs, but preserve any
# private signing key left by old versions (never delete user secrets).
rm -rf -- "$DEST/dist/packages"
rm -f -- "$DEST/scripts/package_extensions.py" "$DEST/scripts/open_browser_extensions.py"

cat > "$BIN" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$DEST"
exec python3 -m bridge.host
EOF
chmod 755 "$BIN"

python3 "$DEST/scripts/register_hosts.py" --host-path "$BIN" --extension-id "$EXT_ID"

# Generate the user-specific, standalone HTML guide with fully resolved
# extension paths, installed revision and detected browsers.
GUIDE="$DEST/install-guide.html"
python3 "$DEST/scripts/generate_install_guide.py" \
  --output "$GUIDE" \
  --chromium "$DEST/dist/chromium" \
  --firefox-manifest "$DEST/dist/firefox/manifest.json" \
  --commit "$REVISION"

# The installed version is written last, after a successful bridge update.
# The rename is atomic so the host never reads truncated JSON.
cp "$ROOT/version.json" "$DEST/version.json.pending"
mv -f "$DEST/version.json.pending" "$DEST/version.json"
printf '\nInstalled Git main commit: %s\n' "$REVISION"


cat <<EOF

Gear Lever Grab installed/updated successfully.
Installed main commit: $REVISION
Native Messaging host: $BIN

Chromium-family extension folder (Load unpacked):
  $DEST/dist/chromium
Firefox temporary add-on manifest (Load Temporary Add-on):
  $DEST/dist/firefox/manifest.json

Local installation guide:
  $GUIDE

Browser extension installation is manual. This installer does NOT generate
CRX/XPI packages, modify browser profiles, or force-install extensions.
Chrome/Edge/Brave/Chromium: Developer mode -> Load unpacked -> select the folder.
Firefox: about:debugging -> This Firefox -> Load Temporary Add-on -> manifest.json.

After updating, reload the unpacked extension in your browser extensions page.
Your ON/OFF preference is preserved. The native host is already updated.

To skip automatic guide opening on future runs: GLG_OPEN_BROWSER=0
EOF

# Open the local HTML guide in the default browser when a graphical session is
# available. Never silently install or activate extensions.
python3 "$DEST/scripts/generate_install_guide.py" \
  --output "$GUIDE" \
  --chromium "$DEST/dist/chromium" \
  --firefox-manifest "$DEST/dist/firefox/manifest.json" \
  --commit "$REVISION" \
  --open-only
