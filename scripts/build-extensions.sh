#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for family in chromium firefox; do
  mkdir -p "$ROOT/dist/$family"
  cp "$ROOT/extension/common/"* "$ROOT/dist/$family/"
  cp "$ROOT/extension/$family/manifest.json" "$ROOT/dist/$family/manifest.json"
done
printf 'Extensões preparadas em:\n  %s\n  %s\n' "$ROOT/dist/chromium" "$ROOT/dist/firefox"
