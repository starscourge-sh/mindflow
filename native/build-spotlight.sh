#!/bin/sh
# Builds resources/spotlight.node (real spotlight under quick capture and the stickies) from native/spotlight.mm, for Apple silicon and Intel at once.
# Needs Xcode's command line tools and Node's headers (any Node: N-API is the same in all).
#   sh native/build-spotlight.sh
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p process.versions.node)
HEADERS="$HOME/Library/Caches/node-gyp/$VERSION/include/node"
[ -f "$HEADERS/node_api.h" ] || npx node-gyp install "$VERSION"
clang++ -x objective-c++ -std=c++17 -O2 -fobjc-arc -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 \
  -bundle -undefined dynamic_lookup -I"$HEADERS" -framework CoreSpotlight -framework UniformTypeIdentifiers -framework Foundation \
  native/spotlight.mm -o resources/spotlight.node
echo "built resources/spotlight.node"
