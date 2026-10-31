#!/bin/sh
# Builds resources/transcribe from native/transcribe.swift, for Apple silicon and Intel at once.
# Its Info.plist is sewn into the program, so macOS finds the reason it gives for speech recognition.
# Needs Xcode's command line tools.
#   sh native/build-transcribe.sh
set -e
cd "$(dirname "$0")/.."
work=$(mktemp -d)
for arch in arm64 x86_64; do
  swiftc -O -target $arch-apple-macos11.0 native/transcribe.swift -o "$work/$arch" \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/transcribe-Info.plist
done
lipo -create "$work/arm64" "$work/x86_64" -output resources/transcribe
rm -rf "$work"
codesign --force -s - --identifier com.starskourge.haligtree.transcribe resources/transcribe
echo "built resources/transcribe"
