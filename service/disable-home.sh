#!/bin/sh
# Disable takeover without uninstalling Aura Home or deleting its settings.
set -e
[ "$(id -u)" = 0 ] || { echo 'Run as root on the TV.' >&2; exit 1; }
SVCDIR=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
for HOOK in /var/lib/webosbrew/init.d/50-aura-home \
            /var/lib/webosbrew/init.d/49-custom-home \
            /var/lib/webosbrew/init.d/50-customhome; do
  if [ -L "$HOOK" ] && [ "$(readlink "$HOOK")" = "$SVCDIR/autostart.sh" ]; then
    rm -f "$HOOK"
  fi
done
sh "$SVCDIR/stop-watcher.sh" "$SVCDIR"
echo 'Aura Home boot and HOME-key takeover disabled. The app remains installed.'
