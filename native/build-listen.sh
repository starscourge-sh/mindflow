#!/bin/sh
# Builds resources/listen (talk to type) from native/listen.swift, for Apple silicon and Intel at once.
# Its Info.plist is sewn into the program, so macOS finds the reasons it gives for speech and the microphone.
# Needs Xcode's command line tools.
#   sh native/build-listen.sh
set -e
cd "$(dirname "$0")/.."
work=$(mktemp -d)
for arch in arm64 x86_64; do
  swiftc -O -target $arch-apple-macos11.0 native/listen.swift -o "$work/$arch" \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/listen-Info.plist
done
lipo -create "$work/arm64" "$work/x86_64" -output resources/listen
rm -rf "$work"
codesign --force -s - --identifier com.starskourge.haligtree.listen resources/listen
echo "built resources/listen"
