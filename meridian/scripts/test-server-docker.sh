#!/usr/bin/env bash
# Tests server/install.sh on a systemd container that plays a cloud VPS,
# then connects the real Meridian service to it from a network namespace.
#
#   [mcli netns] ──docker0── [VPS container: install.sh, WireGuard, Unbound]
#        └─────────────── host: 198.18.0.1 web "internet", test DNS, blocklist
#
# Needs root, Docker and the tools used by e2e-linux.sh. Builds the image
# from scripts/vps.Dockerfile (Ubuntu 24.04 by default: BASE=debian:12 also works).
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${WORK:-$(mktemp -d /tmp/meridian-srvtest.XXXXXX)}
BASE=${BASE:-ubuntu:24.04}
KEEP=${KEEP:-0}
NAME=mvps-test
PASS=0
FAIL=0

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok() { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad() { FAIL=$((FAIL + 1)); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }
check() { local d=$1; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }
check_not() { local d=$1; shift; if "$@" >/dev/null 2>&1; then bad "$d"; else ok "$d"; fi; }
vps() { docker exec "$NAME" "$@"; }
c() { ip netns exec msc "$@"; }
api() {
	local token port
	token=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["token"])' "$WORK/run/ui.json")
	port=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["port"])' "$WORK/run/ui.json")
	c curl -s --max-time 30 -X "$1" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' ${3:+--data "$3"} "http://127.0.0.1:$port$2"
}
state() { api GET /api/status | python3 -c 'import json,sys;print(json.load(sys.stdin)["state"])'; }
wait_state() { for _ in $(seq 1 $(($2 * 4))); do [ "$(state 2>/dev/null)" = "$1" ] && return 0; sleep 0.25; done; return 1; }
resolves_to() { local want=$1; shift; [ "$(c dig +short +time=3 +tries=1 "$@" 2>/dev/null | grep -v '^;' | tail -1)" = "$want" ]; }

cleanup() {
	if [ "$KEEP" = 1 ]; then echo "kept $WORK, container $NAME and netns msc"; return; fi
	for f in "$WORK"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null; done
	docker rm -f "$NAME" "$NAME-ssh" >/dev/null 2>&1
	ip netns del msc 2>/dev/null
	ip link del veth-msc-h 2>/dev/null
	ip addr del 198.18.0.1/32 dev lo 2>/dev/null
	rm -rf /etc/netns/msc
}
trap cleanup EXIT

say "Building"
mkdir -p "$WORK/run" "$WORK/data" "$WORK/www"
(cd "$ROOT" && go build -o "$WORK/meridian" ./cmd/meridian && go build -o "$WORK/testbed" ./tools/testbed) || exit 1
(cd "$WORK" && GOFLAGS=-mod=mod go build -o "$WORK/wireguard-go" golang.zx2c4.com/wireguard) || exit 1
cp "$ROOT/scripts/vps.Dockerfile" "$WORK/Dockerfile"
docker build -q --build-arg BASE="$BASE" -t meridian-vps-test:"${BASE//[:\/]/-}" "$WORK" >/dev/null || exit 1

say "Host services: test web, DNS and blocklist"
ip addr add 198.18.0.1/32 dev lo 2>/dev/null
printf '0.0.0.0 ads.doubleclick.net\n0.0.0.0 tracker.example.org\n' >"$WORK/www/hosts"
for i in $(seq 1 200); do echo "0.0.0.0 filler$i.ads.test" >>"$WORK/www/hosts"; done
(cd "$WORK/www" && exec python3 -m http.server 8099 --bind 172.17.0.1 >"$WORK/blocklist-http.log" 2>&1) &
echo $! >"$WORK/blhttp.pid"
"$WORK/testbed" dns -listen 172.17.0.1:5300 >"$WORK/dns.log" 2>&1 &
echo $! >"$WORK/dns.pid"
sleep 1

say "Starting the VPS ($BASE)"
docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" --hostname vps-ams --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
	--tmpfs /run --tmpfs /run/lock --ip 172.17.0.99 meridian-vps-test:"${BASE//[:\/]/-}" >/dev/null 2>&1 ||
	docker run -d --name "$NAME" --hostname vps-ams --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
		--tmpfs /run --tmpfs /run/lock meridian-vps-test:"${BASE//[:\/]/-}" >/dev/null
for _ in $(seq 1 40); do vps systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded' && break; sleep 0.5; done
VPS_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$NAME")
[ -n "$VPS_IP" ] || { echo "could not find the container's address"; exit 1; }
echo "VPS at $VPS_IP"
# The web server reports "VPN" for traffic NATed out of the VPS.
"$WORK/testbed" http -listen 198.18.0.1:8080 -vpn-ip "$VPS_IP" >"$WORK/web.log" 2>&1 &
echo $! >"$WORK/web.pid"
docker cp "$ROOT/server/install.sh" "$NAME":/root/meridian-server.sh

say "Running the installer"
vps env MERIDIAN_BLOCKLIST_URL=http://172.17.0.1:8099/hosts bash /root/meridian-server.sh install \
	--endpoint "$VPS_IP" --country NL --city Amsterdam --forward-dns 172.17.0.1@5300 --name laptop >"$WORK/install.log" 2>&1
INSTALL_RC=$?
tail -25 "$WORK/install.log"
check "installer finished successfully" test "$INSTALL_RC" = 0
check "WireGuard interface is up" vps ip link show meridian
check "wg-quick service active" vps systemctl is-active wg-quick@meridian
check "unfiltered resolver active" vps systemctl is-active meridian-dns-plain
check "filtering resolver active" vps systemctl is-active meridian-dns-filter
check "blocklist loaded into Unbound" vps grep -q 'local-zone: "ads.doubleclick.net." always_null' /etc/meridian/blocklist.conf
check "blocklist refresh timer enabled" vps systemctl is-enabled meridian-blocklist.timer
check "IP forwarding enabled" sh -c "docker exec $NAME sysctl -n net.ipv4.ip_forward | grep -qx 1"
check "NAT and client isolation rules loaded" sh -c "docker exec $NAME nft list table inet meridian | grep -q masquerade"
check "management command installed" vps test -x /usr/local/sbin/meridian-server
sed -n '/-----BEGIN MERIDIAN CONFIG-----/,/-----END MERIDIAN CONFIG-----/p' "$WORK/install.log" | sed '1d;$d' >"$WORK/laptop.conf"
check "client config printed between markers" grep -q '^\[Peer\]' "$WORK/laptop.conf"
check "config carries the location (NL, Amsterdam)" sh -c "grep -q 'Meridian-Country: NL' $WORK/laptop.conf && grep -q 'Meridian-City: Amsterdam' $WORK/laptop.conf"
vps meridian-server add phone >"$WORK/add.log" 2>&1
check "second device added" grep -q 'Added device "phone"' "$WORK/add.log"
check "devices listed" sh -c "docker exec $NAME meridian-server list | grep -q phone"
check "installer is re-runnable (adds a device instead of reinstalling)" sh -c "docker exec $NAME bash /root/meridian-server.sh install --name tablet | grep -q 'Added device \"tablet\"'"
vps meridian-server remove tablet >/dev/null 2>&1
check_not "removed device is gone from WireGuard" sh -c "docker exec $NAME grep -q '# tablet' /etc/wireguard/meridian.conf"
check "remaining devices still configured" sh -c "docker exec $NAME grep -q '# phone' /etc/wireguard/meridian.conf && docker exec $NAME grep -q '# laptop' /etc/wireguard/meridian.conf"

say "Client namespace on the same network"
ip netns del msc 2>/dev/null
ip netns add msc
ip -n msc link set lo up
ip link add veth-msc-h type veth peer name veth-msc netns msc
ip link set veth-msc-h master docker0 up
ip -n msc addr add 172.17.0.200/16 dev veth-msc
ip -n msc link set veth-msc up
ip -n msc route add default via 172.17.0.1
mkdir -p /etc/netns/msc
echo "nameserver 172.17.0.1" >/etc/netns/msc/resolv.conf
check "client reaches the test web directly" sh -c "ip netns exec msc curl -s --max-time 5 http://198.18.0.1:8080/ | grep -q 172.17.0.200"

say "Connecting Meridian to the new server"
ip netns exec msc env MERIDIAN_GEO_URL=http://198.18.0.1:8080/geo "$WORK/meridian" service run --data-dir "$WORK/data" \
	--run-dir "$WORK/run" --listen 127.0.0.1:47811 >"$WORK/meridian.log" 2>&1 &
echo $! >"$WORK/meridian.pid"
for _ in $(seq 1 60); do api GET /api/status >/dev/null 2>&1 && break; sleep 0.25; done
ip netns exec msc env MERIDIAN_RUN_DIR="$WORK/run" "$WORK/meridian" import "$WORK/laptop.conf"
api POST /api/connect '{}' >/dev/null
check "handshake with the new server" wait_state connected 20
ip netns exec msc env MERIDIAN_RUN_DIR="$WORK/run" "$WORK/meridian" status
check "traffic exits from the VPS" sh -c "ip netns exec msc curl -s --max-time 5 http://198.18.0.1:8080/ | grep -q $VPS_IP"
check "DNS through the server's own resolver" resolves_to 198.51.100.2 site.example.net
check "app blocks ads on the device" resolves_to 0.0.0.0 ads.doubleclick.net
check "server's unfiltered port answers blocked names (app decides)" resolves_to 198.51.100.66 @10.66.66.1 -p 5353 ads.doubleclick.net
api PUT /api/settings '{"adBlock":false}' >/dev/null
check "with the app's blocker off, phones' filtered port still blocks" resolves_to 0.0.0.0 @10.66.66.1 ads.doubleclick.net
check "...and allows normal names" resolves_to 198.51.100.2 @10.66.66.1 site.example.net
check "app blocker off really is off" resolves_to 198.51.100.66 ads.doubleclick.net
check_not "resolvers refuse queries from outside the tunnel" sh -c "dig +short +time=2 +tries=1 @$VPS_IP site.example.net | grep -q 198"
api POST /api/disconnect >/dev/null
check "disconnected cleanly" wait_state disconnected 10

say "One-click setup over SSH (a second, untouched server)"
docker rm -f "$NAME-ssh" >/dev/null 2>&1
docker run -d --name "$NAME-ssh" --hostname vps-two --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
	--tmpfs /run --tmpfs /run/lock meridian-vps-test:"${BASE//[:\/]/-}" >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME-ssh" systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded' && break; sleep 0.5; done
VPS2_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$NAME-ssh")
for _ in $(seq 1 20); do ip netns exec msc bash -c "echo > /dev/tcp/$VPS2_IP/22" 2>/dev/null && break; sleep 0.5; done
JOB=$(api POST /api/servers/setup "{\"host\":\"$VPS2_IP\",\"user\":\"root\",\"password\":\"wrong\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
for _ in $(seq 1 40); do S=$(api GET "/api/servers/setup/$JOB"); echo "$S" | grep -q '"state":"running"' || break; sleep 0.5; done
check "wrong password fails with a clear message" sh -c "echo '$S' | grep -q 'rejected the username or password'"
JOB=$(api POST /api/servers/setup "{\"host\":\"$VPS2_IP\",\"user\":\"root\",\"password\":\"meridian-test-password\",\"serverAdBlock\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
for _ in $(seq 1 600); do S=$(api GET "/api/servers/setup/$JOB"); echo "$S" | grep -q '"state":"running"' || break; sleep 1; done
echo "$S" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("\n".join("    | "+l for l in d["log"][-8:]))'
check "setup over SSH completed" sh -c "echo '$S' | grep -q '\"state\":\"done\"'"
check_not "the private key never appears in the setup log" sh -c "echo '$S' | grep -q PrivateKey"
check "server key fingerprint shown" sh -c "echo '$S' | grep -q 'SHA256:'"
LOC2=$(echo "$S" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("locationId",""))')
api POST /api/connect "{\"id\":\"$LOC2\"}" >/dev/null
check "connected to the server set up over SSH" wait_state connected 20
check "traffic exits from the second server" sh -c "ip netns exec msc curl -s --max-time 5 http://198.18.0.1:8080/ | grep -q $VPS2_IP"
api POST /api/disconnect >/dev/null
wait_state disconnected 10
docker rm -f "$NAME-ssh" >/dev/null 2>&1

say "Uninstall"
vps meridian-server uninstall >/dev/null 2>&1
check_not "WireGuard interface removed" vps ip link show meridian
check_not "resolvers removed" vps systemctl is-active meridian-dns-plain

say "Result: $PASS passed, $FAIL failed (logs in $WORK)"
[ "$FAIL" = 0 ]
