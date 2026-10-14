# Aura Home for LG webOS

An experimental custom home screen for a rooted LG OLED65C5 running webOS 26 / 11.2.0-3706. The latest installable `.ipk` is in [Releases](https://github.com/Rukeru/aura-home-webos/releases). Home-key takeover and boot launch have been packaged, but have **not yet been verified on this TV**.

Aura Home shows transparent weather and clock tiles near the top of the screen and an icon-only app dock along the bottom. Click the clock to open Quick controls for **All apps**, inputs, settings, app arrangement, and ambient collections. The 18 supplied photos are grouped into Space & Night Skies, Mountains & Landscapes, and Flowers. Wallpapers rotate within the selected collection and fade over 2.4 seconds after the next image loads. Weather location, clock format, rotation interval, and app order are saved on the device.

## Install and test on the TV

1. Download `tld.my.customhome_0.7.0_all.ipk` from the [0.7.0 release](https://github.com/Rukeru/aura-home-webos/releases/tag/v0.7.0).
2. Install it with webOS Dev Manager or LG's `ares-install` tool. The app ID is `tld.my.customhome`, inherited from the upstream project; installation replaces an existing app with that ID.
3. Open **Aura Home** manually from the stock launcher. Set your weather city from Settings, then test app launches, inputs, remote navigation, and saved settings.
4. With root SSH access to the TV, run the packaged activation script:

   ```sh
   ssh root@TV_IP 'sh /media/developer/apps/usr/palm/services/tld.my.customhome.service/enable-home.sh'
   ```

   This creates a Homebrew `init.d` symlink and immediately starts the registered service with `--boot --watch`. Installing the `.ipk` alone leaves the takeover inactive. The activation script checks for an existing hook and refuses to overwrite an unrelated file. If your TV installs services outside `/media/developer`, use the installed service's actual path.

5. Press HOME, then test a cold boot and standby wake. The service logs to `/tmp/aura-home-service.log` and reports its state at `luna://tld.my.customhome.service/status`.

The watcher polls every `/dev/input/event*` device without grabbing input, so LG's original HOME handling still runs. The default HOME key code is `773`, as observed by the upstream author. If your remote uses another code, write that decimal code to `/var/lib/webosbrew/aura-home-keycode` and rerun `autostart.sh`; the service also accepts `AURA_HOME_KEY_CODE` as an environment override. Event record width follows the service Node process architecture (16 bytes on 32-bit, 24 bytes on 64-bit). The upstream project demonstrated this approach on webOS 24 / 9.2.1; webOS 26 Luna permissions and the TV's input events still need on-device confirmation. If app discovery is denied, the UI shows a retry control instead of sample apps.

To stop boot launch and HOME interception while keeping the app installed:

```sh
ssh root@TV_IP 'sh /media/developer/apps/usr/palm/services/tld.my.customhome.service/disable-home.sh'
```

The disable script removes only hooks pointing to this installed service and stops only the matching watcher process. After disabling it, HOME returns to LG's launcher. You can also uninstall `tld.my.customhome` after disabling takeover.

## Build from source

```sh
npm ci
npm run build
npm exec --yes --package=@webos-tools/cli -- ares-package dist service -o . --no-minify
```

`src/` holds the launcher; `service/` holds the registered Luna service and activation/rollback scripts. `public/ambient-collections/` holds optimized display copies of the supplied photos, grouped by theme; the original images were left untouched. `public/icons/ICON-SOURCES.txt` documents icon sources. Build output and dependencies are intentionally excluded from this repository.

Production build, TypeScript, browser checks, service simulation, shell syntax, and `.ipk` structure checks passed. Browser checks cover remote-style navigation, app discovery and paging, wallpaper changes and crossfades, weather search, and saved app order using a simulated webOS bridge. The weather responses in those checks are samples. Service checks simulate boot retries, HOME events, device changes, and standby wake. None of these checks proves the behavior on the OLED65C5 until it is tested there.

Based on [zzeppieri/webos-custom-home](https://github.com/zzeppieri/webos-custom-home) at `41f8fc2cf368374293d036979390e683e40c370d`. Upstream MIT license is retained in [LICENSE](LICENSE).
