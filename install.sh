#!/usr/bin/env bash
# User-scoped setup. Browser security requires manual approval for unpacked extensions.
set -euo pipefail
# Quando executado por curl | bash, baixa temporariamente o repositório.
# Quando executado de um clone local, utiliza diretamente os arquivos locais.
# Prefer local files only when actually invoked from a script file.
# A curl | bash execution must not silently reuse files from the current directory.
ROOT=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [[ -z "$ROOT" || ! -f "$ROOT/bridge/host.py" || ! -f "$ROOT/scripts/build-extensions.sh" ]]; then
  command -v git >/dev/null || { echo 'git é obrigatório para instalação remota' >&2; exit 1; }
  TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf -- "$TEMP_DIR"' EXIT
  git clone --quiet --depth 1 https://github.com/zonaro/gear-lever-grab.git "$TEMP_DIR/repository"
  bash "$TEMP_DIR/repository/install.sh"
  exit $?
fi
DEST="$HOME/.local/share/gear-lever-grab"
if [ -n "$(printenv XDG_DATA_HOME || :)" ]; then DEST="$(printenv XDG_DATA_HOME)/gear-lever-grab"; fi
BIN="$HOME/.local/bin/gear-lever-grab-host"
KEY_DIR="$HOME/.local/share/gear-lever-grab-keys"
EXT_ID="$(tr -d '\n' < "$ROOT/extension/chromium/id.txt")"

command -v python3 >/dev/null || { echo 'python3 is required' >&2; exit 1; }
if ! command -v gearlever >/dev/null && ! { command -v flatpak >/dev/null && flatpak info it.mijorus.gearlever >/dev/null 2>&1; }; then
  echo 'Warning: Gear Lever was not detected. Install it before activating the extension.' >&2
fi
bash "$ROOT/scripts/build-extensions.sh"
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
python3 "$DEST/scripts/register_hosts.py" ${HOST_ARGS[@]}

cat <<EOF

Gear Lever Grab files and Native Messaging host are ready.
Browsers do not support reliable, silent user-profile installation of local
extensions. No browser preferences or enterprise policies were modified.

CHROMIUM FAMILY (Chrome, Chromium, Edge, Brave, Vivaldi, Opera, Thorium)
  Open your browser's extensions page (e.g., edge://extensions or chrome://extensions).
EOF
if [ -f "$PACKAGE_DIR/gear-lever-grab.crx" ]; then
  cat <<EOF
  Signed local CRX3 package:
    $PACKAGE_DIR/gear-lever-grab.crx
  If your browser allows local CRX installation, drag the file into the
  extensions page and approve the installation. Some browsers reject this
  installation method; use the fallback below if it fails.
EOF
fi
cat <<EOF
  Reliable developer-mode fallback:
  Enable Developer mode -> Load unpacked -> choose the directory:
    $DEST/dist/chromium

FIREFOX / FLOORP / WATERFOX
  Package (unsigned, for temporary development installation):
    $PACKAGE_DIR/gear-lever-grab.xpi
  Open about:debugging#/runtime/this-firefox -> Load Temporary Add-on,
  then select the .xpi file (or dist/firefox/manifest.json).
  For permanent installation, Mozilla AMO signing is required.

Finally open the extension popup and switch automation ON if you want it.
It starts OFF. The OFF position never interferes with normal downloads.

Re-run the one-line installer to update files; reload a previously
unpacked extension in your browser's extensions page.
To uninstall the bridge: bash "$DEST/uninstall.sh"
EOF

# Show the browser extensions page once when running in a graphical,
# interactive terminal. Opt out with GLG_OPEN_BROWSER=0.
python3 "$DEST/scripts/open_browser_extensions.py"
