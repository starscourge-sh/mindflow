#!/bin/sh
# Builds resources/understand from native/understand.swift, for Apple silicon and Intel at once.
# Natural Language runs on every Mac this app supports; Apple Intelligence and Translation are
# linked weakly, so an older Mac simply says it lacks them (see --status).
# Needs Xcode's command line tools and the macOS 26 SDK.
#   sh native/build-understand.sh
set -e
cd "$(dirname "$0")/.."
work=$(mktemp -d)
for arch in arm64 x86_64; do
  swiftc -O -target $arch-apple-macos11.0 native/understand.swift -o "$work/$arch" \
    -Xlinker -weak_framework -Xlinker FoundationModels -Xlinker -weak_framework -Xlinker Translation
done
lipo -create "$work/arm64" "$work/x86_64" -output resources/understand
rm -rf "$work"
codesign --force -s - --identifier com.starskourge.haligtree.understand resources/understand
echo "built resources/understand"
