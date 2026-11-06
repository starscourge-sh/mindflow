#!/bin/sh
# Builds resources/meeting (record a meeting) from native/meeting.swift, for Apple silicon and Intel at once.
# Its Info.plist is sewn into the program, so macOS finds the reasons it gives for the microphone and the Mac's sound.
# ScreenCaptureKit's sound needs macOS 13; the program says so plainly on an older Mac rather than not starting.
# Needs Xcode's command line tools.
#   sh native/build-meeting.sh
set -e
cd "$(dirname "$0")/.."
work=$(mktemp -d)
for arch in arm64 x86_64; do
  swiftc -O -target $arch-apple-macos13.0 native/meeting.swift -o "$work/$arch" \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/meeting-Info.plist
done
lipo -create "$work/arm64" "$work/x86_64" -output resources/meeting
rm -rf "$work"
codesign --force -s - --identifier com.starskourge.haligtree.meeting resources/meeting
echo "built resources/meeting"
