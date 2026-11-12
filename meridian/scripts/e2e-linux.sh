#!/usr/bin/env bash
# End-to-end test of Meridian on Linux with real tunnels.
#
# Builds three network namespaces and runs the real Meridian service in one:
#
#   [mcli] 192.168.77.2 ── 192.168.77.1 [msrv] 198.51.100.1 ── 198.51.100.2 [minet]
#   Meridian service        WireGuard servers, DNS, NAT       web, "what is my IP",
#                           and the home router's DNS         the ISP's DNS
#
# Needs root, iproute2, nftables, wireguard-tools (for keys), dig and curl.
# Usage: sudo scripts/e2e-linux.sh            (KEEP=1 leaves everything running)
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${WORK:-$(mktemp -d /tmp/meridian-e2e.XXXXXX)}
BIN=$WORK/meridian
TESTBED=$WORK/testbed
KEEP=${KEEP:-0}
PASS=0
FAIL=0
SKIP=0
HAVE_V6=0
[ -d /proc/sys/net/ipv6 ] && HAVE_V6=1

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok() { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad() { FAIL=$((FAIL + 1)); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }
skip() { SKIP=$((SKIP + 1)); printf '  \033[33mSKIP\033[0m %s\n' "$*"; }
check() { # check "description" command... (shell functions allowed)
	local d=$1
	shift
	if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi
}
check_not() {
	local d=$1
	shift
	if "$@" >/dev/null 2>&1; then bad "$d"; else ok "$d"; fi
}
jcheck() { # jcheck "description" "$json" 'python expression using d'
	if printf '%s' "$2" | python3 -c "import json,sys; d=json.load(sys.stdin); assert ($3)" 2>/dev/null; then ok "$1"; else bad "$1"; fi
}
bg() { # bg NAME NETNS command... : start in a namespace, record the real PID
	local name=$1 ns=$2
	shift 2
	ip netns exec "$ns" "$@" >>"$WORK/$name.log" 2>&1 &
	echo $! >"$WORK/$name.pid"
}
c() { ip netns exec mcli "$@"; }
m() { c env MERIDIAN_RUN_DIR="$WORK/run" "$BIN" "$@"; }
api() { # api METHOD PATH [JSON]
	local token port
	token=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["token"])' "$WORK/run/ui.json")
	port=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["port"])' "$WORK/run/ui.json")
	c curl -s --max-time 30 -X "$1" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
		${3:+--data "$3"} "http://127.0.0.1:$port$2"
}
state() { api GET /api/status | python3 -c 'import json,sys;print(json.load(sys.stdin)["state"])'; }
wait_state() { # wait_state want seconds
	for _ in $(seq 1 $(($2 * 4))); do
		[ "$(state 2>/dev/null)" = "$1" ] && return 0
		sleep 0.25
	done
	return 1
}
resolve() { c dig +short +time=3 +tries=1 "$@" 2>/dev/null | grep -v '^;'; }
resolves_to() { local want=$1; shift; [ "$(resolve "$@" | tail -1)" = "$want" ]; }
web_sees() { c curl -s --max-time 5 "$@" http://198.51.100.2/ | grep -q "you are $WANT_IP"; }
web_works() { c curl -s --max-time 4 "$@" http://198.51.100.2/ >/dev/null; }
start_meridian() {
	bg meridian mcli env MERIDIAN_GEO_URL=http://198.51.100.2/geo "$BIN" service run \
		--data-dir "$WORK/data" --run-dir "$WORK/run" --listen 127.0.0.1:47811
	for _ in $(seq 1 60); do api GET /api/status >/dev/null 2>&1 && return 0; sleep 0.25; done
	return 1
}

cleanup() {
	if [ "$KEEP" = 1 ]; then echo "kept $WORK and the namespaces"; return; fi
	for f in "$WORK"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null; done
	sleep 1
	for f in "$WORK"/*.pid; do [ -f "$f" ] && kill -9 "$(cat "$f")" 2>/dev/null; done
	for ns in mcli msrv minet; do ip netns del $ns 2>/dev/null; done
	rm -rf /etc/netns/mcli
}
trap cleanup EXIT

say "Building"
(cd "$ROOT" && go build -o "$BIN" ./cmd/meridian && go build -o "$TESTBED" ./tools/testbed) || exit 1
mkdir -p "$WORK/run" "$WORK/data"

say "Creating namespaces (IPv6 in this kernel: $HAVE_V6)"
for ns in mcli msrv minet; do ip netns del $ns 2>/dev/null; ip netns add $ns; ip -n $ns link set lo up; done
ip link add veth-c netns mcli type veth peer name veth-s netns msrv
ip link add veth-si netns msrv type veth peer name veth-i netns minet
ip -n mcli addr add 192.168.77.2/24 dev veth-c && ip -n mcli link set veth-c up
ip -n msrv addr add 192.168.77.1/24 dev veth-s && ip -n msrv link set veth-s up
ip -n msrv addr add 198.51.100.1/24 dev veth-si && ip -n msrv link set veth-si up
ip -n minet addr add 198.51.100.2/24 dev veth-i && ip -n minet link set veth-i up
ip -n mcli route add default via 192.168.77.1
ip -n minet route add default via 198.51.100.1
ip netns exec msrv sysctl -qw net.ipv4.ip_forward=1
# Only tunnel traffic is NATed; the client's own traffic is routed as is,
# so the web server can tell the two apart.
ip netns exec msrv nft -f - <<'EOF'
table ip nat {
	chain post { type nat hook postrouting priority 100; ip saddr { 10.66.66.0/24, 10.77.77.0/24 } oifname "veth-si" masquerade; }
}
EOF
mkdir -p /etc/netns/mcli
echo "nameserver 198.51.100.2" >/etc/netns/mcli/resolv.conf

say "Starting servers"
SK1=$(wg genkey); SP1=$(echo "$SK1" | wg pubkey)
SK2=$(wg genkey); SP2=$(echo "$SK2" | wg pubkey)
CK1=$(wg genkey); CP1=$(echo "$CK1" | wg pubkey)
CK2=$(wg genkey); CP2=$(echo "$CK2" | wg pubkey)
bg wg1 msrv "$TESTBED" wg -name wgs0 -key "$SK1" -peer "$CP1" -port 51820 -addr 10.66.66.1/24 -addr6 fd66:66:66::1/64 \
	-allowed 10.66.66.2/32,fd66:66:66::2/128
bg wg2 msrv "$TESTBED" wg -name wgs1 -key "$SK2" -peer "$CP2" -port 51821 -addr 10.77.77.1/24 -addr6 "" -allowed 10.77.77.2/32
sleep 1
bg srvdns msrv "$TESTBED" dns -listen 10.66.66.1:53 -listen 10.66.66.1:5353 -listen 10.77.77.1:53 -listen 192.168.77.1:53
bg ispdns minet "$TESTBED" dns -listen 198.51.100.2:53
bg http minet "$TESTBED" http -listen 198.51.100.2:80 -vpn-ip 198.51.100.1
sleep 1

cat >"$WORK/amsterdam.conf" <<EOF
# Meridian-Country: NL
# Meridian-City: Amsterdam
# Meridian-PlainDNS: 10.66.66.1:5353
[Interface]
PrivateKey = $CK1
Address = 10.66.66.2/32, fd66:66:66::2/128
DNS = 10.66.66.1

[Peer]
PublicKey = $SP1
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 192.168.77.1:51820
PersistentKeepalive = 25
EOF
# A provider-style file: no Meridian comments, no IPv6, no keepalive.
cat >"$WORK/mullvad-se-sto-wg-001.conf" <<EOF
[Interface]
PrivateKey = $CK2
Address = 10.77.77.2/32
DNS = 10.77.77.1

[Peer]
PublicKey = $SP2
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 192.168.77.1:51821
EOF

say "Before Meridian"
WANT_IP=192.168.77.2 check "the web sees the real address" web_sees

say "Starting the Meridian service"
check "service started and API answers" start_meridian
check "API rejects requests without the token" sh -c "ip netns exec mcli curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:47811/api/status | grep -qx 401"
check "API rejects a foreign Host header (DNS rebinding)" sh -c "ip netns exec mcli curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.example' http://127.0.0.1:47811/ | grep -qx 403"
m import "$WORK/amsterdam.conf" "$WORK/mullvad-se-sto-wg-001.conf"
LOCS=$(api GET /api/locations)
jcheck "two locations imported" "$LOCS" 'len(d)==2'
jcheck "private keys never reach the app" "$LOCS" '"PrivateKey" not in json.dumps(d) and "'"$CK1"'" not in json.dumps(d)'
jcheck "provider file placed in Stockholm, SE automatically" "$LOCS" 'any(l["city"]=="Stockholm" and l["country"]=="SE" and l["provider"]=="Mullvad" for l in d)'
AMS=$(printf '%s' "$LOCS" | python3 -c 'import json,sys;print([l["id"] for l in json.load(sys.stdin) if l["city"]=="Amsterdam"][0])')
STO=$(printf '%s' "$LOCS" | python3 -c 'import json,sys;print([l["id"] for l in json.load(sys.stdin) if l["city"]=="Stockholm"][0])')

say "Connecting to Amsterdam"
api POST /api/connect "{\"id\":\"$AMS\"}" >/dev/null
check "handshake completes (connected)" wait_state connected 15
m status
WANT_IP=198.51.100.1 check "web traffic now exits from the VPN server" web_sees
sleep 2
jcheck "exit location verified as Amsterdam, NL" "$(api GET /api/status)" 'd["exit"]["countryCode"]=="NL" and d["exit"]["city"]=="Amsterdam"'
check "system DNS points at the virtual resolver" grep -qx "nameserver 100.100.53.53" /etc/netns/mcli/resolv.conf
check "allowed domain resolves through the tunnel" resolves_to 198.51.100.2 example.test
check "ad domain blocked (0.0.0.0)" resolves_to 0.0.0.0 ads.doubleclick.net
check "upstream is the server's unfiltered resolver (port 5353)" grep -q "\[10.66.66.1:5353\] TypeA example.test" "$WORK/srvdns.log"
api POST /api/adblock/rules '{"action":"block","domain":"tracker-cloak.test"}' >/dev/null
check "CNAME-cloaked tracker blocked" resolves_to 0.0.0.0 metrics.news.test
check "app querying another DNS server directly is still filtered" resolves_to 0.0.0.0 @198.51.100.2 ads.doubleclick.net
check "direct DNS to another server travels through the tunnel" resolves_to 198.51.100.2 @198.51.100.2 www.example.test
check_not "the ISP's DNS never saw the real address" grep -q "192.168.77.2" "$WORK/ispdns.log"
check_not "DNS over TLS (port 853) is dropped" c curl -s --max-time 3 telnet://198.51.100.2:853
api POST /api/adblock/rules '{"action":"allow","domain":"ads.doubleclick.net"}' >/dev/null
check "allow rule unblocks a domain" resolves_to 198.51.100.66 ads.doubleclick.net
jcheck "query log and counters record blocking" "$(api GET /api/adblock)" 'd["stats"]["blocked"]>=3 and any(e["blocked"] and e.get("via","").startswith("cname") for e in d["recent"])'
if [ "$HAVE_V6" = 1 ]; then
	check "IPv6 tunnel address configured" sh -c "ip -n mcli -6 addr show dev meridian0 | grep -q fd66:66:66::2"
else
	skip "IPv6 tunnel address (kernel without IPv6)"
fi

say "Kill switch and local network"
check_not "app bound to the physical interface is blocked (kill switch)" web_works --interface veth-c
check "local network reachable (Allow LAN on)" c ping -c1 -W2 192.168.77.1
check_not "DNS to the home router is blocked even with Allow LAN" resolves_to 198.51.100.2 @192.168.77.1 example.test
check_not "the home router's DNS never saw a query" grep -q "\[192.168.77.1:53\] Type" "$WORK/srvdns.log"
api PUT /api/settings '{"allowLan":false}' >/dev/null
check_not "local network blocked (Allow LAN off)" c ping -c1 -W2 192.168.77.1
api PUT /api/settings '{"killSwitch":false,"allowLan":true}' >/dev/null
WANT_IP=192.168.77.2 check "physical interface usable with the kill switch off" web_sees --interface veth-c
api PUT /api/settings '{"killSwitch":true}' >/dev/null
check_not "kill switch back on" web_works --interface veth-c

say "Switching to Stockholm while connected"
api POST /api/connect "{\"id\":\"$STO\"}" >/dev/null
check "switched and connected" wait_state connected 15
check "kill switch stayed on during the switch" sh -c "ip netns exec mcli nft list table inet meridian | grep -q admin-prohibited"
WANT_IP=198.51.100.1 check "traffic flows through the new server" web_sees
check "new location's DNS server answers" resolves_to 198.51.100.2 www.example.test
check "query reached the Stockholm resolver" grep -q "\[10.77.77.1:53\] TypeA www.example.test" "$WORK/srvdns.log"
check "no IPv6 at this location: AAAA answers suppressed" sh -c "[ -z \"\$(ip netns exec mcli dig +short +time=3 +tries=1 AAAA www.example.test | grep -v '^;')\" ]"
if [ "$HAVE_V6" = 1 ]; then
	check "IPv6 rejected instead of leaking" sh -c "ip -n mcli -6 route show table 51820 | grep -q unreachable"
else
	skip "IPv6 unreachable route (kernel without IPv6)"
fi

say "Server outage"
kill "$(cat "$WORK/wg2.pid")"
check_not "traffic stops when the server dies (never falls back to the real connection)" web_works
check_not "...even for apps bound to the physical interface" web_works --interface veth-c

say "Disconnecting"
api POST /api/disconnect >/dev/null
check "disconnected" wait_state disconnected 10
check "resolv.conf restored" grep -qx "nameserver 198.51.100.2" /etc/netns/mcli/resolv.conf
check_not "firewall rules removed" c nft list table inet meridian
check_not "policy routing rules removed" sh -c "ip -n mcli rule | grep -q 51820"
WANT_IP=192.168.77.2 check "direct traffic works again" web_sees

say "Crash recovery"
api POST /api/connect "{\"id\":\"$AMS\"}" >/dev/null
wait_state connected 15
kill -9 "$(cat "$WORK/meridian.pid")"
sleep 0.5
check_not "after a crash traffic stays blocked (fails closed)" web_works --interface veth-c
check "service restarts" start_meridian
check_not "restart removes the stale firewall" c nft list table inet meridian
check "restart restores resolv.conf" grep -qx "nameserver 198.51.100.2" /etc/netns/mcli/resolv.conf
jcheck "locations survived the crash" "$(api GET /api/locations)" 'len(d)==2'
WANT_IP=192.168.77.2 check "network usable after recovery" web_sees

say "Result: $PASS passed, $FAIL failed, $SKIP skipped (logs in $WORK)"
[ "$FAIL" = 0 ]
