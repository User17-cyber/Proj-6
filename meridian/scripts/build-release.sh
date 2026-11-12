#!/usr/bin/env bash
# Builds the downloadable apps into dist/:
#
#   Meridian-Setup-<v>-windows-x64.exe    Windows installer (needs makensis + Wintun)
#   Meridian-Setup-<v>-windows-arm64.exe
#   Meridian-<v>-windows-x64.zip          portable: Meridian.exe + wintun.dll
#   Meridian-<v>-windows-arm64.zip
#   Meridian-<v>-macos.zip                Meridian.app (Apple silicon + Intel)
#   meridian_<v>_amd64.deb / _arm64.deb   Debian, Ubuntu, Mint, Pop!_OS...
#   meridian-<v>-linux-amd64.tar.gz / -arm64.tar.gz
#   meridian-server.sh                    the server installer
#   SHA256SUMS
#
# Usage: scripts/build-release.sh [VERSION]
# Wintun (the Windows TUN driver DLL) comes from https://www.wintun.net and is
# checked against a pinned SHA-256. Set WINTUN_ZIP to use a local copy.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=${1:-${VERSION:-0.0.0-dev}}
VERSION=${VERSION#meridian-v}
VERSION=${VERSION#v}
DIST=$ROOT/dist
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
WINTUN_URL=https://www.wintun.net/builds/wintun-0.14.1.zip
WINTUN_SHA256=07c256185d6ee3652e09fa55c0b673e2624b565e02c4b9091c79ca7d2f24ef51
LDFLAGS="-s -w -X main.version=$VERSION"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
cd "$ROOT"
rm -rf "$DIST"
mkdir -p "$DIST"
NUMVER=$(echo "$VERSION" | sed -E 's/^([0-9]+)\.([0-9]+)\.([0-9]+).*/\1.\2.\3/; t; s/.*/0.0.0/')

build() { # build GOOS GOARCH OUT [extra ldflags]
	CGO_ENABLED=0 GOOS=$1 GOARCH=$2 go build -trimpath -ldflags "$LDFLAGS ${4:-}" -o "$3" ./cmd/meridian
}

notices() { # notices BINARY OUT: license texts of every module linked in
	{
		echo "Meridian VPN $VERSION includes the following third-party software."
		echo
		go version -m "$1" | awk '$1=="dep"{print $2" "$3}' | while read -r mod ver; do
			dir=$(go mod download -json "$mod@$ver" 2>/dev/null | sed -n 's/.*"Dir": "\(.*\)".*/\1/p')
			for lf in LICENSE LICENSE.md LICENSE.txt COPYING; do
				if [ -n "$dir" ] && [ -f "$dir/$lf" ]; then
					printf '\n================================================================\n%s %s\n================================================================\n\n' "$mod" "$ver"
					cat "$dir/$lf"
					break
				fi
			done
		done
		printf '\n================================================================\nMap data\n================================================================\n\n'
		echo "Country shapes from Natural Earth (public domain), via the world-atlas package (ISC)."
	} >"$2"
}

say "Linux"
for arch in amd64 arm64; do
	d=$WORK/linux-$arch
	mkdir -p "$d/meridian-$VERSION"
	build linux $arch "$d/meridian-$VERSION/meridian"
	notices "$d/meridian-$VERSION/meridian" "$d/meridian-$VERSION/THIRD_PARTY_NOTICES.txt"
	cat >"$d/meridian-$VERSION/README.txt" <<EOF
Meridian VPN $VERSION for Linux

Install (once):   sudo ./meridian service install
Open the app:     meridian            (or "Meridian VPN" in your applications menu)
Command line:     meridian status | connect [location] | disconnect | import FILE.conf
Uninstall:        sudo meridian service uninstall

Needs systemd, iproute2 and nftables (or iptables). The app window opens in
Chrome, Chromium, Edge or Brave if installed, otherwise in your default browser.
EOF
	tar -C "$d" -czf "$DIST/meridian-$VERSION-linux-$arch.tar.gz" "meridian-$VERSION"

	# .deb
	p=$d/deb
	mkdir -p "$p/DEBIAN" "$p/usr/bin" "$p/lib/systemd/system" "$p/usr/share/applications" \
		"$p/usr/share/icons/hicolor/scalable/apps" "$p/usr/share/icons/hicolor/256x256/apps" "$p/usr/share/doc/meridian"
	install -m 755 "$d/meridian-$VERSION/meridian" "$p/usr/bin/meridian"
	install -m 644 packaging/linux/meridian.service "$p/lib/systemd/system/meridian.service"
	install -m 644 packaging/linux/meridian.desktop "$p/usr/share/applications/meridian.desktop"
	install -m 644 internal/assets/icon.svg "$p/usr/share/icons/hicolor/scalable/apps/meridian.svg"
	install -m 644 packaging/icons/icon-256.png "$p/usr/share/icons/hicolor/256x256/apps/meridian.png"
	install -m 644 "$d/meridian-$VERSION/THIRD_PARTY_NOTICES.txt" "$p/usr/share/doc/meridian/copyright"
	for s in postinst prerm postrm; do install -m 755 "packaging/linux/$s" "$p/DEBIAN/$s"; done
	cat >"$p/DEBIAN/control" <<EOF
Package: meridian
Version: $VERSION
Architecture: $arch
Maintainer: Meridian VPN <noreply@localhost>
Section: net
Priority: optional
Depends: iproute2, nftables | iptables
Recommends: wireguard-tools
Installed-Size: $(du -k -s "$p" | cut -f1)
Homepage: https://github.com/
Description: Private VPN with ad blocking and location switching
 Meridian connects to WireGuard servers (your own or a provider's), blocks
 ads, trackers and malware for every app with DNS filtering on the tunnel,
 and shows where websites see you on a world map. It includes a kill
 switch and DNS and IPv6 leak protection.
EOF
	dpkg-deb --root-owner-group -Zxz --build "$p" "$DIST/meridian_${VERSION}_$arch.deb" >/dev/null
done

say "macOS"
build darwin amd64 "$WORK/meridian-darwin-amd64"
build darwin arm64 "$WORK/meridian-darwin-arm64"
app=$WORK/mac/Meridian.app
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
# A universal ("fat") binary holding both slices. Each Go-built slice keeps
# its ad-hoc signature, which Apple silicon requires.
python3 - "$app/Contents/MacOS/meridian" "$WORK/meridian-darwin-amd64" "$WORK/meridian-darwin-arm64" <<'PY'
import struct, sys
out, *ins = sys.argv[1:]
align = 14
slices, offset = [], 1 << align
for path in ins:
    data = open(path, 'rb').read()
    magic, cputype, subtype = struct.unpack('<III', data[:12])
    assert magic == 0xfeedfacf, path + ' is not a 64-bit Mach-O file'
    slices.append((cputype, subtype & 0x00ffffff, offset, data))
    offset = (offset + len(data) + (1 << align) - 1) & ~((1 << align) - 1)
with open(out, 'wb') as f:
    f.write(struct.pack('>II', 0xcafebabe, len(slices)))
    for cputype, subtype, off, data in slices:
        f.write(struct.pack('>IIIII', cputype, subtype, off, len(data), align))
    for cputype, subtype, off, data in slices:
        f.write(b'\0' * (off - f.tell()))
        f.write(data)
PY
chmod 755 "$app/Contents/MacOS/meridian"
sed "s/__VERSION__/$NUMVER/g" packaging/macos/Info.plist >"$app/Contents/Info.plist"
cp packaging/icons/icon.icns "$app/Contents/Resources/Meridian.icns"
printf 'APPL????' >"$app/Contents/PkgInfo"
notices "$WORK/meridian-darwin-arm64" "$WORK/mac/THIRD_PARTY_NOTICES.txt"
cat >"$WORK/mac/README.txt" <<EOF
Meridian VPN $VERSION for macOS 11 or newer (Apple silicon and Intel)

1. Drag Meridian.app to your Applications folder.
2. Open it. This build is not signed by Apple, so the first time macOS
   refuses: open System Settings > Privacy & Security and click
   "Open Anyway" next to the Meridian message (on older macOS, right-click
   the app and choose Open). Or run in Terminal:
       xattr -dr com.apple.quarantine /Applications/Meridian.app
3. Meridian asks for your password once to install its VPN service.

The app window opens in Chrome, Edge or Brave if installed, otherwise in
your default browser. Command line: /Applications/Meridian.app/Contents/MacOS/meridian status
EOF
(cd "$WORK/mac" && zip -qry "$DIST/Meridian-$VERSION-macos.zip" Meridian.app README.txt THIRD_PARTY_NOTICES.txt)

say "Windows"
wintun=""
if [ -n "${WINTUN_ZIP:-}" ] && [ -f "$WINTUN_ZIP" ]; then
	wintun=$WINTUN_ZIP
elif curl -fsSL --max-time 60 -o "$WORK/wintun.zip" "$WINTUN_URL" 2>/dev/null; then
	wintun=$WORK/wintun.zip
fi
if [ -n "$wintun" ]; then
	got=$(sha256sum "$wintun" | cut -d' ' -f1)
	if [ "$got" != "$WINTUN_SHA256" ]; then
		echo "wintun zip checksum mismatch: got $got, want $WINTUN_SHA256" >&2
		exit 1
	fi
	unzip -q -o "$wintun" -d "$WORK/wintun"
else
	echo "warning: Wintun not available (set WINTUN_ZIP or allow access to wintun.net); skipping Windows packages" >&2
fi
for arch in amd64 arm64; do
	label=x64
	[ $arch = arm64 ] && label=arm64
	d=$WORK/win-$arch
	mkdir -p "$d"
	build windows $arch "$d/Meridian.exe" "-H=windowsgui"
	[ -n "$wintun" ] || continue
	cp "$WORK/wintun/wintun/bin/$arch/wintun.dll" "$d/wintun.dll"
	notices "$d/Meridian.exe" "$d/LICENSE.txt"
	{
		printf '\n================================================================\nWintun (wintun.dll)\n================================================================\n\n'
		cat "$WORK/wintun/wintun/LICENSE.txt"
	} >>"$d/LICENSE.txt"
	cat >"$d/README.txt" <<EOF
Meridian VPN $VERSION for Windows 10 and 11 ($label)

Portable use: keep Meridian.exe and wintun.dll in the same folder and open
Meridian.exe. Windows asks for administrator approval once to install the
Meridian service into Program Files. The installer (Meridian-Setup) does the
same and adds Start menu and desktop shortcuts.

Command line (from a terminal): Meridian.exe status | connect [location] | disconnect
EOF
	(cd "$d" && zip -q "$DIST/Meridian-$VERSION-windows-$label.zip" Meridian.exe wintun.dll README.txt LICENSE.txt)
	if command -v makensis >/dev/null; then
		(cd packaging/windows && makensis -V2 -DVERSION="$NUMVER" -DARCH="$label" -DSRCDIR="$d" \
			-DOUTFILE="$DIST/Meridian-Setup-$VERSION-windows-$label.exe" installer.nsi)
	else
		echo "warning: makensis not found; skipping the Windows installer" >&2
	fi
done

say "Server installer"
install -m 755 server/install.sh "$DIST/meridian-server.sh"

(cd "$DIST" && sha256sum -- * >SHA256SUMS)
say "Done: $DIST"
ls -la "$DIST"
