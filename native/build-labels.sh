#!/bin/sh
# Builds resources/labels from native/labels.swift, for Apple silicon and Intel at once.
# Vision's text recognition asks no permission, so it needs no Info.plist of its own.
# Needs Xcode's command line tools.
#   sh native/build-labels.sh
set -e
cd "$(dirname "$0")/.."
work=$(mktemp -d)
for arch in arm64 x86_64; do
  swiftc -O -target $arch-apple-macos11.0 native/labels.swift -o "$work/$arch"
done
lipo -create "$work/arm64" "$work/x86_64" -output resources/labels
rm -rf "$work"
codesign --force -s - --identifier com.starskourge.haligtree.labels resources/labels
echo "built resources/labels"
