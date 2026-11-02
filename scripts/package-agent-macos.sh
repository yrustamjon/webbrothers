#!/usr/bin/env bash
# Native macOS packaging only. Optional BMP_MAC_SIGN_IDENTITY signs the app.
set -euo pipefail
bmp_version="${1:?VERSION kerak}"
bmp_arch="${2:?ARCH kerak}"
bmp_binary="${3:?BIN kerak}"
bmp_output="${4:?OUTPUT_DIRECTORY kerak}"
bmp_root="$(cd "$(dirname "$0")/.." && pwd)"
case "$bmp_arch" in amd64|arm64) ;; *) echo 'ARCH: amd64 yoki arm64'; exit 1;; esac
if [[ ! "$bmp_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]]; then echo 'Yaroqsiz versiya'; exit 1; fi
if [ "$(uname -s)" != Darwin ]; then echo 'Bu paket macOSda yigʻiladi.'; exit 1; fi
if [ ! -f "$bmp_binary" ]; then echo 'Agent binari topilmadi.'; exit 1; fi
bmp_kind="arm64"; [ "$bmp_arch" != amd64 ] || bmp_kind=x86_64
lipo "$bmp_binary" -verify_arch "$bmp_kind"
mkdir -p "$bmp_output"
bmp_output="$(cd "$bmp_output" && pwd)"
bmp_stage="$(mktemp -d)"
trap 'rm -rf "$bmp_stage"' EXIT
bmp_app="$bmp_stage/WebBrothers Agent.app"
mkdir -p "$bmp_app/Contents/MacOS" "$bmp_app/Contents/Resources"
cp "$bmp_binary" "$bmp_app/Contents/Resources/browser-agent"
cp "$bmp_root/installers/macos/launch.command" "$bmp_app/Contents/Resources/launch.command"
cp "$bmp_root/installers/macos/app-launcher" "$bmp_app/Contents/MacOS/WebBrothers Agent"
printf '%s\n' "$bmp_version" > "$bmp_app/Contents/Resources/VERSION"
printf '%s\n' "$bmp_arch" > "$bmp_app/Contents/Resources/ARCH"
chmod 755 "$bmp_app/Contents/MacOS/WebBrothers Agent" "$bmp_app/Contents/Resources/launch.command" "$bmp_app/Contents/Resources/browser-agent"
cat > "$bmp_app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>WebBrothers Agent</string>
<key>CFBundleIdentifier</key><string>uz.webbrothers.agent</string>
<key>CFBundleExecutable</key><string>WebBrothers Agent</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${bmp_version%%-*}</string>
<key>CFBundleVersion</key><string>${bmp_version%%-*}</string>
<key>LSMinimumSystemVersion</key><string>12.0</string>
</dict></plist>
PLIST
plutil -lint "$bmp_app/Contents/Info.plist"
if [ -n "${BMP_MAC_SIGN_IDENTITY:-}" ]; then
  codesign --force --options runtime --timestamp --sign "$BMP_MAC_SIGN_IDENTITY" "$bmp_app/Contents/Resources/browser-agent"
  codesign --force --options runtime --timestamp --sign "$BMP_MAC_SIGN_IDENTITY" "$bmp_app"
  codesign --verify --deep --strict "$bmp_app"
else
  echo 'DIQQAT: imzosiz sinov paketi; Developer ID/notarization bajarilmagan.'
fi
ln -s /Applications "$bmp_stage/Applications"
hdiutil create -volname 'WebBrothers Agent' -srcfolder "$bmp_stage" -ov -format UDZO "$bmp_output/bmp-agent-darwin-$bmp_arch.dmg"
