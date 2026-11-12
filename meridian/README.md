# Meridian VPN

A desktop VPN for Windows, macOS and Linux. It has three main parts:

- **Location switching.** Pick a country on a world map and websites see you there. Meridian checks your new public address and city after it connects.
- **Ad and tracker blocking for every app.** DNS filtering runs inside the tunnel and uses well-known blocklists. It also catches trackers hidden behind first-party names (CNAME cloaking).
- **Privacy protection.** A kill switch, DNS and IPv6 leak protection, and encrypted DNS. Location changes happen without dropping the kill switch.

Meridian is built on [WireGuard](https://www.wireguard.com/) (the userspace `wireguard-go` implementation). It works with any standard WireGuard server, including your own.

## Where the locations come from

A VPN can only make you appear in places where a VPN server exists, and no app can avoid that. Meridian gets locations in two ways:

1. **Your own servers (recommended).** Rent a small Linux server in any city (Hetzner, DigitalOcean, Vultr, Linode, OVH, AWS Lightsail and others cost about $4–6 a month). In Meridian, open **Add location → My own server** and enter the server's IP address and password. Meridian sets the server up over SSH in 1–3 minutes and adds it to your map. Each server you add becomes one more location. Nobody else sees your traffic, and websites see the server's address.
2. **A VPN provider's WireGuard configs.** Mullvad, Proton VPN, IVPN, AirVPN, Windscribe and most other providers let you download `.conf` files, often as a `.zip` with one file per server. Drop them into **Add location → Config files**. Meridian reads the country and city from names such as `mullvad-nl-ams-wg-001.conf`, then confirms them after the first connection.

## Install

Download the file for your computer from the repository's **Releases** page. Builds of every commit are also attached to the **Actions → Meridian** workflow runs.

| Your computer | File | Notes |
| --- | --- | --- |
| Windows 10/11 | `Meridian-Setup-<version>-windows-x64.exe` (`-arm64` for ARM PCs) | Installs the Meridian service, plus Start menu and desktop shortcuts. |
| Mac | `Meridian-<version>-macos.zip` | Universal (Apple silicon and Intel), macOS 11+. Drag `Meridian.app` to Applications. The app is not signed by Apple, so after the first try go to **System Settings → Privacy & Security → Open Anyway**. Meridian then asks for your password once to install its service. |
| Ubuntu / Debian / Mint | `meridian_<version>_amd64.deb` | `sudo apt install ./meridian_<version>_amd64.deb`, then open "Meridian VPN" from your apps menu. |
| Other Linux | `meridian-<version>-linux-amd64.tar.gz` | `sudo ./meridian service install`. Needs systemd, iproute2 and nftables or iptables. |
| Your phone | — | Open a location's **⋯ → Show QR code** and scan it with the official WireGuard app (iOS/Android). On your own servers, phones get ad blocking from the server. |

## Using it

- **Home** shows the map, your status, the address websites see and live traffic. The power button connects. The location button opens a searchable list, and clicking a highlighted country on the map connects there.
- **Locations** lists your servers grouped by country. You can add favorites, rename a server, correct its country or city, show a phone QR code, export its config or remove it.
- **Ad blocker** has an on/off switch, counters, the most-blocked domains and a live activity log with one-click **Allow** or **Block**. It also lists the available blocklists: StevenBlack, HaGeZi Light/Pro, OISD, a threat-intelligence feed, Apple/Windows telemetry, and social, gambling, adult and fake-news filters. You can add your own lists and your own allow/block rules.
- **Settings** cover the kill switch, local network access, IPv6 leak blocking, auto-connect at startup, the DNS server (automatic, or encrypted Quad9, Cloudflare, Mullvad, Google or custom) and more.

Command line (any OS): `meridian status`, `meridian connect [name|country]`, `meridian disconnect`, `meridian import *.conf`, `meridian locations`.

## How it works

```
 app window (WebView2 / browser) ──HTTP + token──▶ Meridian service (root / SYSTEM)
                                                    ├─ wireguard-go device
                                                    ├─ DNS filter on the packet path
                                                    ├─ routes, DNS, kill switch (per OS)
                                                    └─ blocklists, saved locations
```

- The **service** runs with administrator rights and owns the tunnel. The **app** is an unprivileged window: WebView2 on Windows, and a Chrome, Edge or Brave app window (or your browser) on macOS and Linux. It talks to the service on `127.0.0.1` with a random token. Requests with a foreign `Host` header are refused, which stops DNS-rebinding attacks from websites.
- **DNS.** The system is pointed at a virtual resolver, `100.100.53.53`, which only exists inside the tunnel. Meridian answers blocked names itself with `0.0.0.0`. Everything else goes through the tunnel to the location's resolver or an encrypted (DNS-over-HTTPS) resolver. Lookups sent directly to other servers are filtered too. DNS over TLS (port 853) is blocked so apps fall back to filtered DNS. Firefox's DNS-over-HTTPS canary is answered so Firefox does not bypass the filter.
- **Kill switch.**
  - Linux: nftables, plus wg-quick-style policy routing.
  - Windows: WireGuard for Windows' WFP firewall, plus a socket bound to the physical interface.
  - macOS: a pf anchor, plus split default routes.

  In every case DNS outside the tunnel is blocked even when the kill switch is off. A crashed service fails closed, and the next start restores the network.
- **Your own server** (`server/install.sh`) runs WireGuard with NAT and client isolation. It adds two private Unbound resolvers, recursive and DNSSEC-validating. Port 53 filters ads for phones using the WireGuard app. Port 5353 is unfiltered and used by Meridian, so the app's ad-blocker switch really turns blocking off. Blocklists refresh weekly. Manage devices on the server with `meridian-server add|list|qr|remove|uninstall`.
- **Data.**
  - Saved locations (they contain private keys) are readable only by the service: `/var/lib/meridian`, `/Library/Application Support/Meridian` or `C:\ProgramData\Meridian\data`.
  - The activity log stays in memory only.
  - Private keys are never sent to the app window.

## What has been tested

- **Unit tests** cover config parsing, blocklist formats, DNS packet handling, the proxy (blocking, CNAME uncloaking, caching, truncation, UDP/TCP/DoH upstreams), the store, region detection and geolocation parsing. CI runs them on Linux, Windows and macOS.
- **`scripts/e2e-linux.sh`** runs the real service in network namespaces against WireGuard servers. Its 49 checks include:
  - connecting and verifying the exit location;
  - ad and CNAME blocking, filtering of direct DNS, the DoT block and allow rules;
  - DNS and IPv6 leak tests;
  - the kill switch and LAN access;
  - switching locations while connected, a server outage and crash recovery.
- **`scripts/test-server-docker.sh`** installs the server on systemd containers (Ubuntu 22.04 and 24.04 pass locally; CI adds Debian 12), connects Meridian through it, checks both resolvers, and sets up a second server over SSH from the app.
- **The UI** was exercised in headless Chromium against the live service.

**Not yet verified on real hardware:** the Windows and macOS network layers and app windows. They compile and pass unit tests on those systems in CI, and follow WireGuard's own Windows and wg-quick macOS logic, but nobody has connected with them yet. Please test there before relying on the kill switch.

## Limitations

- On Windows, the kill switch also blocks the local network (printers, casting) except DHCP. With it off, Windows may also send DNS queries to your router.
- The macOS build is unsigned and uses a browser window rather than a native one.
- There is no mobile app yet. Phones use the official WireGuard app with QR codes.
- Location is not just your IP. Browser time zone, language, GPS and logged-in accounts can still reveal where you are.
- This is new software and has not had a security audit.

## Build from source

Needs Go 1.26+.

```sh
cd meridian
go test ./...                         # unit tests
sudo scripts/e2e-linux.sh             # real-tunnel test (root, iproute2, nftables, wireguard-tools, dig)
sudo scripts/test-server-docker.sh    # server installer test (root, Docker)
scripts/build-release.sh 1.0.0        # apps into dist/ (Windows parts need makensis and wintun.net access)
sudo go run ./cmd/meridian service run --data-dir /tmp/m --run-dir /tmp/m   # run the service by hand
```

The world map is generated from Natural Earth data by `tools/mapgen` (`npm install && npm run build`).

## Layout

| Path | What |
| --- | --- |
| `cmd/meridian` | the app, service and CLI (one binary); per-OS service install and window |
| `internal/engine` | connects, switches and monitors the tunnel |
| `internal/dnsproxy` | DNS filter on the tunnel's packet path, cache, upstreams |
| `internal/blocklist` | blocklist parsing, matching and downloads |
| `internal/netcfg` | routes, DNS and kill switch for Linux, Windows and macOS |
| `internal/api`, `internal/ui/web` | local API and the app interface |
| `internal/store`, `internal/regions`, `internal/geo` | saved locations, country/city data, exit-address lookup |
| `internal/sshsetup`, `server/install.sh` | one-click server setup and the server installer |
| `packaging`, `scripts/build-release.sh` | installers and packages |

## Credits

WireGuard® is a registered trademark of Jason A. Donenfeld. Meridian uses wireguard-go and parts of WireGuard for Windows (MIT), Wintun (redistributable prebuilt binaries) and the Go x/ libraries (BSD). It also uses go-webview2 (MIT) and rsc.io/qr (BSD). Map data comes from Natural Earth (public domain). The blocklists are maintained by StevenBlack, HaGeZi, OISD and their sources. Each build includes a full `THIRD_PARTY_NOTICES` or `LICENSE.txt`. Meridian's own code has no license yet; choose one before publishing it.
