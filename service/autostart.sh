#!/bin/sh
# Homebrew init.d invokes this symlink on cold boot. It exits promptly while
# the registered service keeps watching HOME and handles standby wakeups.
SCRIPT=$0
case "$SCRIPT" in /*) ;; *) SCRIPT="$(pwd)/$SCRIPT" ;; esac
if [ -L "$SCRIPT" ]; then
  LINK=$(readlink "$SCRIPT") || exit 1
  case "$LINK" in /*) SCRIPT=$LINK ;; *) SCRIPT="$(dirname "$SCRIPT")/$LINK" ;; esac
fi
SVCDIR=$(CDPATH= cd "$(dirname "$SCRIPT")" && pwd -P) || exit 1
[ -f "$SVCDIR/service.js" ] || exit 1
[ -x /usr/bin/node ] || exit 1
sh "$SVCDIR/stop-watcher.sh" "$SVCDIR" || exit 1
export NODE_PATH=/usr/lib/node_modules:/usr/lib/nodejs
cd "$SVCDIR" || exit 1
nohup /usr/bin/node service.js --boot --watch \
  >/tmp/aura-home-service.stdout 2>&1 </dev/null &
exit 0
