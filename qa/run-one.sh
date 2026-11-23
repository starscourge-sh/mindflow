#!/bin/bash
# Runs ONE probe against a built tree, off screen and silent, on a throwaway copy of the seeded sandbox book.
#   qa/run-one.sh <out-dir> <probe> [KEY=VAL ...]
#     out-dir   the build, inside this repo:  ./node_modules/.bin/electron-vite build --outDir out-gate
#     probe     a file name in qa/ without .mjs (box-parity). Add "+book" (book-shelf+book) to run on a copy of
#               a data folder with several books instead (qa/local.noindex/book-master, or BOOK_MASTER=<folder>).
#     KEY=VAL   extra settings for the probe, such as QA_SHOTS=/some/folder.
# The first run makes the seed (qa/make-seed.mjs) in qa/local.noindex/seed; delete that folder to make a fresh one,
# which you should after a change to what the sandbox lays down (src/renderer/src/components/haligtree/sandbox.tsx).
# Everything runs through qa/solo.sh: one heavy job at a time on the whole Mac.
# Prints "<probe>: N passed, M failed, exit X" and every FAIL line; the whole log is in qa/local.noindex/logs.
set -u
root=$(cd "$(dirname "$0")/.." && pwd)
[ $# -ge 2 ] || { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
out=$1; probe=$2; shift 2
L=$root/qa/local.noindex
entry=$root/$out/main/index.js
[ -f "$entry" ] || { echo "No build at $out: run ./node_modules/.bin/electron-vite build --outDir $out first" >&2; exit 2; }
data=sb; case "$probe" in *+book) data=book; probe=${probe%+book};; esac
[ -f "$root/qa/$probe.mjs" ] || { echo "No probe qa/$probe.mjs" >&2; exit 2; }
mkdir -p "$L/runs" "$L/logs"
cd "$root" || exit 1

# The seed: made once, by the built app itself, then copied for every run.
if [ $data = sb ] && [ ! -f "$L/seed/sandbox/haligtree.db" ]; then
  echo "No seed yet: making one in qa/local.noindex/seed (about a minute)"
  rm -rf "$L/seed.making"; mkdir -p "$L/seed.making"
  if QA_ARGS=--sandbox QA_DATA="$L/seed.making" QA_ENTRY="$entry" HALIGTREE_QA_AWAY=1 \
      "$root/qa/solo.sh" node qa/make-seed.mjs > "$L/logs/make-seed.log" 2>&1 && [ -f "$L/seed.making/sandbox/haligtree.db" ]; then
    rm -rf "$L/seed"; mv "$L/seed.making" "$L/seed"
  else
    echo "Could not make the seed; see qa/local.noindex/logs/make-seed.log" >&2
    tail -5 "$L/logs/make-seed.log" >&2
    rm -rf "$L/seed.making"; exit 1
  fi
fi

D=$L/runs/$probe.$$
cleanup() { rm -rf "$D"; }
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
rm -rf "$D"
if [ $data = book ]; then
  master=${BOOK_MASTER:-$L/book-master}
  [ -f "$master/books.json" ] || { echo "No book master at $master: copy a data folder with several books there (never the real one, only a copy)" >&2; exit 2; }
  cp -cR "$master" "$D" 2>/dev/null || cp -R "$master" "$D"; args=""
else
  # -c clones on APFS (instant, no extra space); plain copy elsewhere.
  cp -cR "$L/seed" "$D" 2>/dev/null || cp -R "$L/seed" "$D"; args="--sandbox"
fi
log=$L/logs/$probe.log
env ${1+"$@"} QA_ARGS="${QA_ARGS-$args}" QA_DATA="$D" QA_ENTRY="$entry" HALIGTREE_QA_AWAY=1 \
  "$root/qa/solo.sh" node "qa/$probe.mjs" > "$log" 2>&1
code=$?
p=$(grep -c '^PASS' "$log"); f=$(grep -c '^FAIL' "$log")
echo "$probe: $p passed, $f failed, exit $code"
grep '^FAIL' "$log" | cut -c1-300
exit $code
