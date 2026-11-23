#!/bin/bash
# One heavy job at a time on the whole Mac: builds, typechecks, unit tests and probes all wait their turn here, from
# every worktree and every agent, so the person's own work stays quick and results are not spoiled by load.
#   qa/solo.sh <command...>     waits for a free turn, runs the command, gives the turn back.
#   qa/solo.sh --status         what is running now.
# SOLO_SLOTS: how many heavy jobs may run at once (default 1; the user allows at most 2).
# SOLO_MAX: seconds before the job is stopped (default 300, at most 600).
# The lock lives outside the repo on purpose, so every worktree shares it.
D=${SOLO_DIR:-/private/tmp/haligtree-solo}
mkdir -p "$D"
slots=${SOLO_SLOTS:-1}; case "$slots" in ''|*[!0-9]*) slots=1;; esac; [ "$slots" -gt 2 ] && slots=2; [ "$slots" -lt 1 ] && slots=1
max=${SOLO_MAX:-300}; case "$max" in ''|*[!0-9]*) max=300;; esac; [ "$max" -gt 600 ] && max=600
alive() { kill -0 "$1" 2>/dev/null || ps -p "$1" >/dev/null 2>&1; }
# A slot is a folder holding the pid of the job's waiter; a slot whose waiter is gone is cleared.
held() {
  [ -d "$1" ] || return 1
  local p; p=$(cat "$1/pid" 2>/dev/null)
  if [ -z "$p" ]; then
    [ $(( $(date +%s) - $(stat -f %m "$1" 2>/dev/null || echo 0) )) -lt 10 ] && return 0
  elif alive "$p"; then return 0
  fi
  rm -f "$1/pid" "$1/what"; rmdir "$1" 2>/dev/null; return 1
}
if [ "$1" = "--status" ]; then
  for s in "$D"/slot.*; do held "$s" && echo "RUNNING $(cat "$s/what" 2>/dev/null)"; done
  echo "load:$(uptime | sed 's/.*averages*://')"
  exit 0
fi
[ $# -gt 0 ] || { echo "usage: qa/solo.sh <command...> | qa/solo.sh --status" >&2; exit 2; }
mine=""; job=""; watch=""
cleanup() {
  [ -n "$job" ] && kill -TERM -"$job" 2>/dev/null
  [ -n "$watch" ] && kill -TERM -"$watch" 2>/dev/null
  [ -n "$mine" ] && { rm -f "$mine/pid" "$mine/what"; rmdir "$mine" 2>/dev/null; }
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
start=$(date +%s)
while [ -z "$mine" ]; do
  for i in $(seq 1 "$slots"); do
    s="$D/slot.$i"
    held "$s" && continue
    if mkdir "$s" 2>/dev/null; then echo $$ > "$s/pid"; echo "$(basename "$PWD"): $*" | cut -c1-160 > "$s/what"; mine=$s; break; fi
  done
  [ -z "$mine" ] && sleep 1
done
echo "[solo] turn after $(( $(date +%s) - start ))s; load:$(uptime | sed 's/.*averages*://')" >&2
# The job runs in its own process group, so stopping it stops everything it started.
set -m
case "$*" in *electron-vite*|*"tsc "*|*"npm run build"*) nice -n 19 "$@" & ;; *) "$@" & ;; esac
job=$!
( sleep "$max"; echo "[solo] stopped after ${max}s: over the limit (SOLO_MAX, at most 600)" >&2
  kill -TERM -"$job" 2>/dev/null; sleep 5; kill -KILL -"$job" 2>/dev/null ) </dev/null >/dev/null &
watch=$!
wait "$job"; code=$?
# Anything the job left behind in its group is stopped on the way out (cleanup), so nothing outlives it.
echo "[solo] exit $code after $(( $(date +%s) - start ))s" >&2
exit $code
