#!/bin/sh
# Builds build/quicklook/HaligtreeQuickLook.appex from native/quicklook: Finder's
# Space on a .md file shows it in Haligtree's paper and Fraunces. Apple silicon
# and Intel at once; signed by this Mac alone ('-'), as the app is.
# Packaging copies it into Haligtree.app/Contents/PlugIns (electron-builder.yml,
# mac.extraFiles), where electron-builder leaves its signature as it is.
# Also builds build/quicklook/haligtree-md2html, the same renderer on the command
# line, for checking the HTML without Quick Look:
#   build/quicklook/haligtree-md2html note.md build/quicklook/HaligtreeQuickLook.appex/Contents/Resources
# Needs Xcode's command line tools.
#   sh native/build-quicklook.sh
set -e
cd "$(dirname "$0")/.."
SRC=native/quicklook
OUT=build/quicklook
APPEX=$OUT/HaligtreeQuickLook.appex
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for ARCH in arm64 x86_64; do
  swiftc -Osize -swift-version 5 -target $ARCH-apple-macos12.0 -module-name HaligtreeQuickLook \
    -application-extension -parse-as-library \
    -Xlinker -e -Xlinker _NSExtensionMain \
    -framework QuickLookUI -framework UniformTypeIdentifiers \
    $SRC/Markdown.swift $SRC/Page.swift $SRC/PreviewProvider.swift -o "$TMP/ext-$ARCH"
  swiftc -Osize -swift-version 5 -target $ARCH-apple-macos12.0 \
    $SRC/Markdown.swift $SRC/Page.swift $SRC/main.swift -o "$TMP/cli-$ARCH"
done

rm -rf "$APPEX"
mkdir -p "$APPEX/Contents/MacOS" "$APPEX/Contents/Resources"
lipo -create "$TMP/ext-arm64" "$TMP/ext-x86_64" -output "$APPEX/Contents/MacOS/HaligtreeQuickLook"
lipo -create "$TMP/cli-arm64" "$TMP/cli-x86_64" -output "$OUT/haligtree-md2html"
cp $SRC/Info.plist "$APPEX/Contents/Info.plist"
VERSION=$(node -p "require('./package.json').version")
plutil -replace CFBundleShortVersionString -string "$VERSION" "$APPEX/Contents/Info.plist"
printf 'XPC!????' > "$APPEX/Contents/PkgInfo"
# Fraunces with its SOFT and WONK axes, upright and italic: the face the app ships.
FONTS=node_modules/@fontsource-variable/fraunces/files
cp $FONTS/fraunces-latin-full-normal.woff2 "$APPEX/Contents/Resources/fraunces-normal.woff2"
cp $FONTS/fraunces-latin-full-italic.woff2 "$APPEX/Contents/Resources/fraunces-italic.woff2"

codesign --force --sign - --entitlements $SRC/entitlements.plist --options runtime --timestamp=none "$APPEX"
codesign --force --sign - --timestamp=none "$OUT/haligtree-md2html"
echo "built $APPEX and $OUT/haligtree-md2html"
