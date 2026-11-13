#!/usr/bin/env bash
# Build two unpacked WebExtensions and stamp them with the source commit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REVISION="$(printenv AIG_BUILD_SHA || :)"
if [[ -z "$REVISION" ]] && command -v git >/dev/null 2>&1; then
  REVISION="$(git -C "$ROOT" rev-parse --verify HEAD 2>/dev/null || true)"
fi
if [[ ! "$REVISION" =~ ^[[:xdigit:]]{40}$ ]]; then
  echo "A full Git commit SHA is required (set AIG_BUILD_SHA or run from a Git clone)." >&2
  exit 1
fi
COMMIT_ISO="$(git -C "$ROOT" show -s --format=%cI "$REVISION" 2>/dev/null || true)"
if [[ ! "$COMMIT_ISO" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]; then
  echo "The selected Git commit must be available to derive the extension version." >&2
  exit 1
fi
# Fail before packaging if any source icon is malformed (Chrome notifications
# reject unreadable PNGs with "Unable to download all specified images").
python3 "$ROOT/scripts/check-icons.py" "$ROOT/extension/common/icons"
# Clean up package artifacts produced by previous versions.
# This build ONLY creates unpacked extension folders.
rm -rf -- "$ROOT/dist/packages"
for family in chromium firefox; do
  mkdir -p "$ROOT/dist/$family"
  cp -a "$ROOT/extension/common/." "$ROOT/dist/$family/"
  VERSION_INFO="$(python3 "$ROOT/scripts/manifest_version.py" \
    "$ROOT/extension/$family/manifest.json" "$ROOT/dist/$family/manifest.json" "$COMMIT_ISO")"
  printf '{"commit":"%s","branch":"main","repository":"zonaro/AppImage-Grab"}\n' \
    "$REVISION" > "$ROOT/dist/$family/version.json"
  printf 'globalThis.AIG_BUILD_COMMIT = "%s";\n' "$REVISION" > "$ROOT/dist/$family/build-revision.js"
done
python3 "$ROOT/scripts/check-icons.py" "$ROOT/dist/chromium/icons" "$ROOT/dist/firefox/icons"
printf '{"commit":"%s","branch":"main","repository":"zonaro/AppImage-Grab"}\n' \
  "$REVISION" > "$ROOT/version.json"
printf 'Build revision: %s\nExtension version: %s\nExtensions prepared in:\n  %s\n  %s\n' \
  "$REVISION" "$VERSION_INFO" "$ROOT/dist/chromium" "$ROOT/dist/firefox"
