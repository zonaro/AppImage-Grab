#!/usr/bin/env bash
# Build two unpacked WebExtensions and stamp them with the source commit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REVISION="$(printenv GLG_BUILD_SHA || :)"
if [[ -z "$REVISION" ]] && command -v git >/dev/null 2>&1; then
  REVISION="$(git -C "$ROOT" rev-parse --verify HEAD 2>/dev/null || true)"
fi
if [[ ! "$REVISION" =~ ^[[:xdigit:]]{40}$ ]]; then
  echo "A full Git commit SHA is required (set GLG_BUILD_SHA or run from a Git clone)." >&2
  exit 1
fi
for family in chromium firefox; do
  mkdir -p "$ROOT/dist/$family"
  cp "$ROOT/extension/common/"* "$ROOT/dist/$family/"
  cp "$ROOT/extension/$family/manifest.json" "$ROOT/dist/$family/manifest.json"
  printf '{"commit":"%s","branch":"main","repository":"zonaro/gear-lever-grab"}\n' \
    "$REVISION" > "$ROOT/dist/$family/version.json"
  printf 'globalThis.GLG_BUILD_COMMIT = "%s";\n' "$REVISION" > "$ROOT/dist/$family/build-revision.js"
done
printf '{"commit":"%s","branch":"main","repository":"zonaro/gear-lever-grab"}\n' \
  "$REVISION" > "$ROOT/version.json"
printf 'Build revision: %s\nExtensions prepared in:\n  %s\n  %s\n' \
  "$REVISION" "$ROOT/dist/chromium" "$ROOT/dist/firefox"
