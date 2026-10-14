# Aura Home for LG webOS

An app-only preview of a custom home screen for a rooted LG OLED65C5 running webOS 26 / 11.2.0-3706. The latest installable `.ipk` is in [Releases](https://github.com/Rukeru/aura-home-webos/releases). It has not yet been tested on the TV, so open it manually from the stock launcher first.

Aura Home shows transparent weather and clock tiles near the top of the screen and an icon-only app dock along the bottom. Click the clock to open Quick controls for **All apps**, inputs, settings, app arrangement, and ambient collections. The 18 supplied photos are grouped into Space & Night Skies, Mountains & Landscapes, and Flowers. Wallpapers rotate within the selected collection and fade over 2.4 seconds after the next image loads. Weather location, clock format, rotation interval, and app order are saved on the device.

## Install and test

1. Download `tld.my.customhome_0.6.1_all.ipk` from the [0.6.1 release](https://github.com/Rukeru/aura-home-webos/releases/tag/v0.6.1).
2. Install it with webOS Dev Manager or LG's `ares-install` tool. The app ID is `tld.my.customhome`, inherited from the upstream project; installation replaces an existing app with that ID.
3. Open **Aura Home** manually from the stock launcher. Set your weather city from Settings, then test app launches, inputs, remote navigation, and saving settings before considering any Home-button changes.

The package contains no boot service or Home-key watcher. The upstream project demonstrated its launcher on webOS 24 / 9.2.1; this version's Luna permissions and hardware behavior still need confirmation on webOS 26 / 11.2.0-3706. If app discovery is denied, the UI shows a retry control instead of sample apps.

## Build from source

```sh
npm ci
npm run build
npm exec --yes --package=@webos-tools/cli -- ares-package dist -o . --no-minify
```

`src/` holds the launcher. `public/ambient-collections/` holds optimized display copies of the supplied photos, grouped by theme; the original images were left untouched. `public/icons/ICON-SOURCES.txt` documents icon sources. Build output and dependencies are intentionally excluded from this repository.

Production build, TypeScript, and browser checks passed. Browser checks cover remote-style navigation, app discovery and paging, wallpaper changes and crossfades, weather search, and saved app order using a simulated webOS bridge. The weather responses in those checks are samples.

Based on [zzeppieri/webos-custom-home](https://github.com/zzeppieri/webos-custom-home) at `41f8fc2cf368374293d036979390e683e40c370d`. Upstream MIT license is retained in [LICENSE](LICENSE).
