#!/bin/sh
# Stop only an Aura Home watcher launched from this installed service directory.
SVCDIR=$1
PIDFILE=/tmp/aura-home-service.pid
[ -n "$SVCDIR" ] && [ -f "$PIDFILE" ] || exit 0
PID=$(cat "$PIDFILE" 2>/dev/null)
case "$PID" in
  ''|*[!0-9]*) exit 1 ;;
esac
if [ -r "/proc/$PID/cmdline" ] &&
   [ "$(readlink "/proc/$PID/cwd" 2>/dev/null)" = "$SVCDIR" ] &&
   tr '\000' ' ' < "/proc/$PID/cmdline" | grep -q 'service.js'; then
  kill "$PID" 2>/dev/null || exit 1
fi
rm -f "$PIDFILE"
