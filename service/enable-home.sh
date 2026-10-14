#!/bin/sh
# Run as root on the TV after installing the IPK. Reversible with disable-home.sh.
set -e
[ "$(id -u)" = 0 ] || { echo 'Run as root on the TV.' >&2; exit 1; }
SVCDIR=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
HOOK=/var/lib/webosbrew/init.d/50-aura-home
[ -f "$SVCDIR/service.js" ] && [ -f "$SVCDIR/autostart.sh" ] || {
  echo 'Aura Home service is not installed.' >&2; exit 1;
}
[ -d /var/lib/webosbrew ] || {
  echo 'Homebrew startup directory is unavailable.' >&2; exit 1;
}
mkdir -p /var/lib/webosbrew/init.d
# Windows packaging can lose executable bits; run-parts requires this bit.
chmod 755 "$SVCDIR/autostart.sh"
if [ -e "$HOOK" ] || [ -L "$HOOK" ]; then
  [ -L "$HOOK" ] && [ "$(readlink "$HOOK")" = "$SVCDIR/autostart.sh" ] || {
    echo "Refusing to replace an existing $HOOK" >&2; exit 1;
  }
else
  ln -s "$SVCDIR/autostart.sh" "$HOOK"
fi
# Retire older upstream hook names only when they point at this same service.
for OLD in /var/lib/webosbrew/init.d/49-custom-home /var/lib/webosbrew/init.d/50-customhome; do
  if [ -L "$OLD" ] && [ "$(readlink "$OLD")" = "$SVCDIR/autostart.sh" ]; then
    rm -f "$OLD"
  fi
done
sh "$SVCDIR/autostart.sh"
echo "Aura Home watcher started; boot hook: $HOOK"
echo 'Check /tmp/aura-home-service.log and test HOME on the TV.'
