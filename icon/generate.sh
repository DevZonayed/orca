#!/bin/bash
# Generate app icons from Icon Composer .icon project
# Produces: build/icon.icns (macOS), build/icon.png (fallback), resources/icon.png (tray)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ICON_SOURCE="$SCRIPT_DIR/icon.icon"
BUILD_DIR="$PROJECT_DIR/build"
RESOURCES_DIR="$PROJECT_DIR/resources"
TMP_DIR=$(mktemp -d)

trap 'rm -rf "$TMP_DIR"' EXIT

echo "Compiling icon from $ICON_SOURCE..."

# Generate .icns using actool (requires Xcode)
xcrun actool \
  --compile "$TMP_DIR" \
  --platform macosx \
  --minimum-deployment-target 10.12 \
  --app-icon icon \
  --output-partial-info-plist "$TMP_DIR/partial.plist" \
  "$ICON_SOURCE" >/dev/null

if [ ! -f "$TMP_DIR/icon.icns" ]; then
  echo "Error: actool failed to produce icon.icns" >&2
  exit 1
fi

cp "$TMP_DIR/icon.icns" "$BUILD_DIR/icon.icns"
echo "  -> build/icon.icns"

# Extract 1024x1024 PNG from icns for electron-builder fallback & resources
sips -s format png --resampleWidth 1024 "$BUILD_DIR/icon.icns" --out "$BUILD_DIR/icon.png" >/dev/null 2>&1
echo "  -> build/icon.png (1024x1024)"

sips -s format png --resampleWidth 256 "$BUILD_DIR/icon.icns" --out "$RESOURCES_DIR/icon.png" >/dev/null 2>&1
echo "  -> resources/icon.png (256x256)"

# Generate .ico for Windows (256x256 PNG, works as ico input for electron-builder)
sips -s format png --resampleWidth 256 "$BUILD_DIR/icon.icns" --out "$TMP_DIR/icon-256.png" >/dev/null 2>&1

# Use iconutil-like approach: electron-builder accepts a 256x256 PNG as icon.ico source,
# but for a proper .ico we can use sips to create the png and let electron-builder handle conversion
# For now, copy the 256px PNG as the ico source - electron-builder will convert it
cp "$TMP_DIR/icon-256.png" "$BUILD_DIR/icon.ico"
echo "  -> build/icon.ico (256x256 PNG for electron-builder)"

echo "Done! Icons generated in build/ and resources/"
