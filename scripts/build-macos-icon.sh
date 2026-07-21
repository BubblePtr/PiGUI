#!/usr/bin/env bash

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/pigui-icon.XXXXXX")"
iconset_dir="$work_dir/PiGUI.iconset"
master_png="$work_dir/icon-1024.png"

cleanup() {
  rm -rf "$work_dir"
}

trap cleanup EXIT
mkdir "$iconset_dir"

# Quick Look adds an opaque white matte around transparent SVG content.
sips -s format png "$root_dir/build/icon.svg" --out "$master_png" >/dev/null

render_icon() {
  local size="$1"
  local name="$2"
  sips -z "$size" "$size" "$master_png" --out "$iconset_dir/$name" >/dev/null
}

render_icon 16 icon_16x16.png
render_icon 32 icon_16x16@2x.png
render_icon 32 icon_32x32.png
render_icon 64 icon_32x32@2x.png
render_icon 128 icon_128x128.png
render_icon 256 icon_128x128@2x.png
render_icon 256 icon_256x256.png
render_icon 512 icon_256x256@2x.png
render_icon 512 icon_512x512.png
cp "$master_png" "$iconset_dir/icon_512x512@2x.png"

iconutil -c icns "$iconset_dir" -o "$root_dir/build/icon.icns"

