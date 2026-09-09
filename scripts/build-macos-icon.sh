#!/usr/bin/env bash

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/pigui-icon.XXXXXX")"
iconset_dir="$work_dir/Pace.iconset"
master_png="$work_dir/icon-1024.png"
compiled_dir="$work_dir/compiled"
icon_composer="${ICON_COMPOSER_APP:-/Applications/Icon Composer.app}"
ictool="$icon_composer/Contents/Executables/ictool"

if [[ ! -x "$ictool" ]]; then
  ictool="$(xcode-select -p)/../Applications/Icon Composer.app/Contents/Executables/ictool"
fi

if [[ ! -x "$ictool" ]]; then
  echo "Install Icon Composer or set ICON_COMPOSER_APP to its app path." >&2
  exit 1
fi

cleanup() {
  rm -rf "$work_dir"
}

trap cleanup EXIT
mkdir "$iconset_dir" "$compiled_dir"

# Keep the system-rendered layers for macOS 26, with a raster fallback for
# older macOS, Linux, and the unpackaged Electron Dock icon.
xcrun actool "$root_dir/build/Pace.icon" \
  --compile "$compiled_dir" \
  --output-format human-readable-text \
  --output-partial-info-plist "$compiled_dir/partial.plist" \
  --app-icon Pace --include-all-app-icons \
  --enable-on-demand-resources NO --development-region en \
  --target-device mac --minimum-deployment-target 12.0 --platform macosx

"$ictool" "$root_dir/build/Pace.icon" --export-image \
  --output-file "$work_dir/render.png" --platform macOS \
  --rendition Default --width 1024 --height 1024 --scale 1

# ictool exports edge-to-edge artwork; legacy Dock icons need the same
# transparent inset as actool's macOS fallback, without a white matte.
swift "$root_dir/scripts/pad-macos-icon.swift" "$work_dir/render.png" "$master_png"

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

# PNG for Electron Dock icon during `bun run dev` (app.dock.setIcon).
cp "$iconset_dir/icon_512x512.png" "$root_dir/build/icon-512.png"
cp "$compiled_dir/Assets.car" "$root_dir/build/Assets.car"
