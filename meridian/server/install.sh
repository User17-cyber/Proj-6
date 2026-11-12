#!/usr/bin/env bash
# Meridian server: turns a fresh Ubuntu or Debian server into a Meridian VPN
# location. Run it as root on the server:
#
#   bash meridian-server.sh                 install, then create a client config
#   meridian-server add laptop              another client config (after install)
#   meridian-server list | show NAME | qr NAME | remove NAME
#   meridian-server update-blocklist
#   meridian-server uninstall
#
# What it sets up:
#   - WireGuard on UDP 51820 (interface "meridian", 10.66.66.0/24 + fd66:66:66::/64)
#   - NAT and a firewall so clients reach the Internet but not each other
#   - two private DNS resolvers (Unbound, recursive, DNSSEC-validating):
#       10.66.66.1:53    blocks ads and trackers (for phones using the WireGuard app)
#       10.66.66.1:5353  unfiltered (the Meridian app filters on the device instead)
#   - a weekly blocklist refresh
#
# Options for install/add:
#   --port N            WireGuard UDP port (default 51820)
#   --endpoint HOST     address clients connect to (default: detected public IP)
#   --country CC        two-letter country code (default: detected)
#   --city NAME         city name (default: detected)
#   --no-adblock        do not filter DNS on the server
#   --forward-dns IP    forward DNS to IP instead of resolving recursively
#   --name NAME         client name (default: "client-N")
#   --yes               never ask questions
set -euo pipefail

VERSION=1.0.0
IFACE=meridian
ETC=/etc/meridian
WGCONF=/etc/wireguard/$IFACE.conf
NET4=10.66.66
NET6=fd66:66:66
PORT=51820
ENDPOINT=""
COUNTRY=""
CITY=""
ADBLOCK=1
FORWARD_DNS=""
CLIENT=""
BLOCKLIST_URL=${MERIDIAN_BLOCKLIST_URL:-https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts}
SELF_INSTALL=/usr/local/sbin/meridian-server

c_bold=$'\033[1m'; c_red=$'\033[31m'; c_grn=$'\033[32m'; c_off=$'\033[0m'
[ -t 1 ] || { c_bold=; c_red=; c_grn=; c_off=; }
say() { printf '%s==>%s %s\n' "$c_bold" "$c_off" "$*"; }
note() { printf '    %s\n' "$*"; }
die() { printf '%serror:%s %s\n' "$c_red" "$c_off" "$*" >&2; exit 1; }

need_root() { [ "$(id -u)" = 0 ] || die "run this as root (for example: sudo bash $0)"; }

parse_opts() {
	while [ $# -gt 0 ]; do
		case "$1" in
		--port) PORT=$2; shift ;;
		--endpoint) ENDPOINT=$2; shift ;;
		--country) COUNTRY=$(echo "$2" | tr '[:lower:]' '[:upper:]'); shift ;;
		--city) CITY=$2; shift ;;
		--no-adblock) ADBLOCK=0 ;;
		--forward-dns) FORWARD_DNS=$2; shift ;;
		--name) CLIENT=$2; shift ;;
		--yes | -y) ;;
		*) die "unknown option $1" ;;
		esac
		shift
	done
	[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "invalid port $PORT"
	[ -z "$COUNTRY" ] || [[ "$COUNTRY" =~ ^[A-Z]{2}$ ]] || die "country must be a two-letter code such as NL"
	[ -z "$CLIENT" ] || [[ "$CLIENT" =~ ^[A-Za-z0-9._-]{1,40}$ ]] || die "client names may use letters, digits, dot, dash and underscore"
}

# ---------- detection ----------

check_os() {
	[ -r /etc/os-release ] || die "cannot identify this system; Ubuntu 20.04+ or Debian 11+ is required"
	# shellcheck disable=SC1091
	. /etc/os-release
	case "${ID:-}:${VERSION_ID:-}" in
	ubuntu:2[0-9].*|ubuntu:[3-9][0-9].*|debian:1[1-9]|debian:[2-9][0-9]) ;;
	*)
		case "${ID_LIKE:-}" in
		*debian*|*ubuntu*) note "untested system ${PRETTY_NAME:-}, continuing" ;;
		*) die "unsupported system ${PRETTY_NAME:-unknown}; use Ubuntu 20.04+ or Debian 11+" ;;
		esac ;;
	esac
	if [ -d /proc/vz ] && [ ! -d /proc/bc ]; then
		die "this is an OpenVZ container, which cannot run WireGuard. Choose a KVM-based server."
	fi
}

wan_iface() { ip -4 route show default 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}'; }

is_private4() {
	case "$1" in
	10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|100.6[4-9].*|100.[7-9][0-9].*|100.1[01][0-9].*|100.12[0-7].*) return 0 ;;
	esac
	return 1
}

detect_endpoint() {
	[ -n "$ENDPOINT" ] && return
	local ip
	ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
	if [ -z "$ip" ] || is_private4 "$ip"; then
		# Behind cloud NAT (AWS, GCP, Oracle...): ask what the world sees.
		local pub
		pub=$(curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null || curl -4 -fsS --max-time 6 https://ifconfig.me 2>/dev/null || true)
		if [[ "$pub" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then ip=$pub; fi
	fi
	[ -n "$ip" ] || die "could not find this server's public IP address; pass --endpoint"
	ENDPOINT=$ip
}

detect_place() {
	[ -n "$COUNTRY" ] && return
	local json
	json=$(curl -fsS --max-time 6 "https://ipinfo.io/$ENDPOINT/json" 2>/dev/null || curl -fsS --max-time 6 "https://ipwho.is/$ENDPOINT" 2>/dev/null || true)
	COUNTRY=$(printf '%s' "$json" | sed -n 's/.*"country\(_code\)\{0,1\}" *: *"\([A-Z][A-Z]\)".*/\2/p' | head -1)
	[ -n "$CITY" ] || CITY=$(printf '%s' "$json" | sed -n 's/.*"city" *: *"\([^"]*\)".*/\1/p' | head -1)
	[[ "$COUNTRY" =~ ^[A-Z]{2}$ ]] || COUNTRY=""
}

has_ipv6() {
	ip -6 route show default 2>/dev/null | grep -q default && ip -6 addr show scope global 2>/dev/null | grep -q inet6
}

# ---------- install ----------

install_packages() {
	say "Installing WireGuard, Unbound and nftables"
	export DEBIAN_FRONTEND=noninteractive
	apt-get update -q >/dev/null
	apt-get install -y -q --no-install-recommends wireguard-tools unbound unbound-anchor dns-root-data nftables \
		qrencode curl ca-certificates iproute2 >/dev/null
	# The distribution's default Unbound instance is not used.
	systemctl disable --now unbound.service >/dev/null 2>&1 || true
	systemctl disable --now unbound-resolvconf.service >/dev/null 2>&1 || true
}

write_sysctl() {
	local wan
	wan=$(wan_iface)
	{
		echo "net.ipv4.ip_forward = 1"
		echo "net.ipv6.conf.all.forwarding = 1"
		# Keep accepting router advertisements, or the server loses its own IPv6.
		[ -n "$wan" ] && echo "net.ipv6.conf.$wan.accept_ra = 2"
	} >/etc/sysctl.d/99-meridian.conf
	sysctl -q -p /etc/sysctl.d/99-meridian.conf 2>/dev/null || true
}

write_firewall() {
	cat >$ETC/firewall.sh <<EOF
#!/bin/sh
# Called by wg-quick when the interface goes up or down.
set -e
if [ "\$1" = up ]; then
nft -f - <<'NFT'
table inet meridian {}
delete table inet meridian
table inet meridian {
	chain input {
		type filter hook input priority 0; policy accept;
		# The resolvers answer tunnel clients only.
		iifname != "$IFACE" ip daddr $NET4.1 drop
		iifname != "$IFACE" ip6 daddr $NET6::1 drop
	}
	chain forward {
		type filter hook forward priority 0; policy accept;
		iifname "$IFACE" oifname "$IFACE" drop
		iifname "$IFACE" accept
		oifname "$IFACE" ct state established,related accept
		oifname "$IFACE" drop
	}
	chain postrouting {
		type nat hook postrouting priority 100; policy accept;
		ip saddr $NET4.0/24 oifname != "$IFACE" masquerade
		ip6 saddr $NET6::/64 oifname != "$IFACE" masquerade
	}
}
NFT
else
nft delete table inet meridian 2>/dev/null || true
fi
EOF
	chmod 755 $ETC/firewall.sh
	# Hosts with ufw drop forwarded traffic by default; allow ours.
	if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
		ufw allow "$PORT"/udp >/dev/null
		ufw route allow in on "$IFACE" >/dev/null
		note "opened UDP $PORT in ufw"
	fi
	if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
		firewall-cmd -q --permanent --add-port="$PORT"/udp && firewall-cmd -q --reload
		note "opened UDP $PORT in firewalld"
	fi
}

write_wireguard() {
	say "Configuring WireGuard"
	umask 077
	mkdir -p /etc/wireguard $ETC/clients
	if [ ! -s $ETC/server.key ]; then
		wg genkey >$ETC/server.key
		wg pubkey <$ETC/server.key >$ETC/server.pub
	fi
	local v6addr=""
	has_ipv6 && v6addr=", $NET6::1/64"
	cat >$WGCONF <<EOF
# Managed by meridian-server. Clients are added with "meridian-server add".
[Interface]
Address = $NET4.1/24$v6addr
ListenPort = $PORT
PrivateKey = $(cat $ETC/server.key)
PostUp = $ETC/firewall.sh up
PostDown = $ETC/firewall.sh down
EOF
	cat >$ETC/server.env <<EOF
ENDPOINT=$ENDPOINT
PORT=$PORT
COUNTRY=$COUNTRY
CITY="$CITY"
ADBLOCK=$ADBLOCK
IPV6=$( [ -n "$v6addr" ] && echo 1 || echo 0 )
EOF
}

unbound_common() {
	local anchor="auto-trust-anchor-file: /var/lib/unbound/root.key"
	[ -s /usr/share/dns/root.key ] && anchor="trust-anchor-file: /usr/share/dns/root.key"
	cat <<EOF
	username: "unbound"
	directory: "/etc/unbound"
	chroot: ""
	pidfile: ""
	do-daemonize: no
	use-syslog: yes
	verbosity: 0
	ip-freebind: yes
	do-ip6: yes
	prefer-ip6: no
	hide-identity: yes
	hide-version: yes
	harden-glue: yes
	harden-dnssec-stripped: yes
	harden-below-nxdomain: yes
	qname-minimisation: yes
	aggressive-nsec: yes
	use-caps-for-id: no
	prefetch: yes
	rrset-roundrobin: yes
	minimal-responses: yes
	edns-buffer-size: 1232
	cache-min-ttl: 60
	cache-max-ttl: 86400
	access-control: 127.0.0.0/8 allow
	access-control: $NET4.0/24 allow
	access-control: $NET6::/64 allow
	private-address: 10.0.0.0/8
	private-address: 172.16.0.0/12
	private-address: 192.168.0.0/16
	private-address: 169.254.0.0/16
	private-address: fd00::/8
	private-address: fe80::/10
EOF
	if [ -z "$FORWARD_DNS" ]; then
		echo "	$anchor"
	fi
}

write_unbound() {
	say "Configuring private DNS resolvers"
	local v6=0
	has_ipv6 && v6=1
	{
		echo "# Unfiltered recursive resolver used by the Meridian app (it filters on the device)."
		echo "server:"
		echo "	port: 5353"
		echo "	interface: 127.0.0.1"
		echo "	interface: $NET4.1"
		[ $v6 = 1 ] && echo "	interface: $NET6::1"
		echo "	module-config: \"$( [ -z "$FORWARD_DNS" ] && echo 'validator iterator' || echo 'iterator')\""
		unbound_common
		printf 'remote-control:\n\tcontrol-enable: no\n'
		if [ -n "$FORWARD_DNS" ]; then
			printf 'forward-zone:\n\tname: "."\n\tforward-addr: %s\n' "$FORWARD_DNS"
		fi
	} >$ETC/unbound-plain.conf
	{
		echo "# Filtering resolver for devices using the WireGuard app: blocks ads and trackers."
		echo "server:"
		echo "	port: 53"
		echo "	interface: $NET4.1"
		[ $v6 = 1 ] && echo "	interface: $NET6::1"
		echo "	module-config: \"iterator\""
		echo "	do-not-query-localhost: no"
		unbound_common | grep -v 'trust-anchor'
		echo "	include: \"$ETC/blocklist.conf\""
		printf 'remote-control:\n\tcontrol-enable: no\n'
		printf 'forward-zone:\n\tname: "."\n\tforward-addr: 127.0.0.1@5353\n'
	} >$ETC/unbound-filter.conf
	[ -f $ETC/blocklist.conf ] || : >$ETC/blocklist.conf
	chmod 644 $ETC/unbound-*.conf $ETC/blocklist.conf
	for name in plain filter; do
		cat >/etc/systemd/system/meridian-dns-$name.service <<EOF
[Unit]
Description=Meridian DNS resolver ($name)
After=network-online.target wg-quick@$IFACE.service
Wants=network-online.target
$( [ $name = filter ] && echo "After=meridian-dns-plain.service" )

[Service]
ExecStartPre=-/usr/sbin/unbound-anchor -a /var/lib/unbound/root.key
ExecStart=/usr/sbin/unbound -d -p -c $ETC/unbound-$name.conf
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
	done
	mkdir -p /var/lib/unbound
	chown unbound:unbound /var/lib/unbound 2>/dev/null || true
}

write_blocklist_updater() {
	cat >$ETC/update-blocklist.sh <<EOF
#!/bin/sh
# Downloads the blocklist and loads it into the filtering resolver.
set -e
ETC=$ETC
. \$ETC/server.env
if [ "\$ADBLOCK" != 1 ]; then : >\$ETC/blocklist.conf; exit 0; fi
tmp=\$(mktemp)
trap 'rm -f "\$tmp" "\$tmp.conf"' EXIT
curl -fsSL --max-time 120 "$BLOCKLIST_URL" -o "\$tmp"
# hosts, plain-domain and "||domain^" formats are accepted.
sed -e 's/#.*//' -e 's/\r//' "\$tmp" |
	awk '{ d = (NF >= 2) ? \$2 : \$1; sub(/^\|\|/, "", d); sub(/\^.*\$/, "", d); d = tolower(d) }
	     d ~ /^[a-z0-9_-]+(\.[a-z0-9_-]+)+\$/ && d != "localhost.localdomain" && d != "0.0.0.0" && !seen[d]++ { printf "local-zone: \"%s.\" always_null\n", d }' >"\$tmp.conf"
n=\$(wc -l <"\$tmp.conf")
# Unbound before 1.10 has no always_null.
if unbound -V 2>/dev/null | head -1 | grep -q 'Version 1\.[0-9]\.'; then sed -i 's/always_null\$/always_nxdomain/' "\$tmp.conf"; fi
[ "\$n" -gt 100 ] || { echo "blocklist looks empty, keeping the old one" >&2; exit 1; }
cp "\$tmp.conf" \$ETC/blocklist.conf.new
chmod 644 \$ETC/blocklist.conf.new
mv \$ETC/blocklist.conf \$ETC/blocklist.conf.old 2>/dev/null || true
mv \$ETC/blocklist.conf.new \$ETC/blocklist.conf
if ! unbound-checkconf \$ETC/unbound-filter.conf >/dev/null 2>&1; then
	mv \$ETC/blocklist.conf.old \$ETC/blocklist.conf
	echo "new blocklist rejected by unbound-checkconf" >&2
	exit 1
fi
systemctl restart meridian-dns-filter.service 2>/dev/null || true
echo "blocklist: \$n domains"
EOF
	chmod 755 $ETC/update-blocklist.sh
	cat >/etc/systemd/system/meridian-blocklist.service <<EOF
[Unit]
Description=Refresh the Meridian DNS blocklist
After=network-online.target

[Service]
Type=oneshot
ExecStart=$ETC/update-blocklist.sh
EOF
	cat >/etc/systemd/system/meridian-blocklist.timer <<EOF
[Unit]
Description=Weekly Meridian blocklist refresh

[Timer]
OnCalendar=weekly
RandomizedDelaySec=6h
Persistent=true

[Install]
WantedBy=timers.target
EOF
}

start_services() {
	say "Starting services"
	systemctl daemon-reload
	systemctl enable -q wg-quick@$IFACE.service
	systemctl restart wg-quick@$IFACE.service
	systemctl enable -q --now meridian-dns-plain.service meridian-dns-filter.service meridian-blocklist.timer
	systemctl restart meridian-dns-plain.service meridian-dns-filter.service
	if [ "$ADBLOCK" = 1 ]; then
		if $ETC/update-blocklist.sh >/dev/null 2>&1; then
			note "ad blocking active ($(wc -l <$ETC/blocklist.conf) domains)"
		else
			note "blocklist download failed; it will be retried weekly (run: meridian-server update-blocklist)"
		fi
	fi
}

install_self() {
	if [ "$(readlink -f "$0" 2>/dev/null)" != "$SELF_INSTALL" ] && [ -f "$0" ]; then
		install -m 755 "$0" $SELF_INSTALL
	fi
}

do_install() {
	need_root
	check_os
	if [ -f $WGCONF ] && [ -f $ETC/server.env ]; then
		say "Meridian server is already installed; adding a client"
		do_add
		return
	fi
	install_packages
	detect_endpoint
	detect_place
	mkdir -p $ETC/clients
	chmod 700 $ETC
	write_sysctl
	write_wireguard
	write_firewall
	write_unbound
	write_blocklist_updater
	install_self
	start_services
	printf '%s✓ Meridian server installed%s (%s:%s%s)\n' "$c_grn" "$c_off" "$ENDPOINT" "$PORT" "${COUNTRY:+, $CITY${CITY:+, }$COUNTRY}"
	do_add
	cat <<EOF

${c_bold}Manage this server later with:${c_off}
  meridian-server add NAME       another device (each device needs its own config)
  meridian-server list           all devices
  meridian-server qr NAME        QR code for the WireGuard phone app
  meridian-server remove NAME    revoke a device
If your provider has a cloud firewall (security group), allow UDP port $PORT there.
EOF
}

# ---------- clients ----------

load_env() {
	[ -f $ETC/server.env ] || die "Meridian server is not installed here yet; run this script without arguments first"
	# shellcheck disable=SC1091
	. $ETC/server.env
}

next_ip() {
	local used n
	used=$(grep -h '^Address' $ETC/clients/*.conf 2>/dev/null | sed -n "s/.*$NET4\.\([0-9]*\)\/32.*/\1/p" | sort -n)
	for n in $(seq 2 254); do
		echo "$used" | grep -qx "$n" || { echo "$n"; return; }
	done
	die "no free addresses left (253 clients)"
}

do_add() {
	need_root
	load_env
	[ -n "$CLIENT" ] || CLIENT=client-$(($(ls $ETC/clients 2>/dev/null | wc -l) + 1))
	[ ! -f "$ETC/clients/$CLIENT.conf" ] || die "a client called $CLIENT already exists (meridian-server show $CLIENT)"
	local n key pub psk spub addr6="" allowed6="" dns6="" name
	n=$(next_ip)
	key=$(wg genkey)
	pub=$(echo "$key" | wg pubkey)
	psk=$(wg genpsk)
	spub=$(cat $ETC/server.pub)
	if [ "${IPV6:-0}" = 1 ]; then
		addr6=", $NET6::$n/128"
		allowed6=", $NET6::$n/128"
		dns6=", $NET6::1"
	fi
	name="${CITY:-${COUNTRY:-Meridian}}"
	umask 077
	{
		echo "# Meridian-Name: $name"
		echo "# Meridian-Provider: Meridian server"
		[ -n "$COUNTRY" ] && echo "# Meridian-Country: $COUNTRY"
		[ -n "$CITY" ] && echo "# Meridian-City: $CITY"
		echo "# Meridian-PlainDNS: $NET4.1:5353"
		echo "# Device: $CLIENT"
		echo "[Interface]"
		echo "PrivateKey = $key"
		echo "Address = $NET4.$n/32$addr6"
		echo "DNS = $NET4.1$dns6"
		echo
		echo "[Peer]"
		echo "PublicKey = $spub"
		echo "PresharedKey = $psk"
		echo "AllowedIPs = 0.0.0.0/0, ::/0"
		case "$ENDPOINT" in
		*:*) echo "Endpoint = [$ENDPOINT]:$PORT" ;;
		*) echo "Endpoint = $ENDPOINT:$PORT" ;;
		esac
		echo "PersistentKeepalive = 25"
	} >"$ETC/clients/$CLIENT.conf"
	cat >>$WGCONF <<EOF

[Peer]
# $CLIENT
PublicKey = $pub
PresharedKey = $psk
AllowedIPs = $NET4.$n/32$allowed6
EOF
	if ip link show $IFACE >/dev/null 2>&1; then
		local pskf
		pskf=$(mktemp)
		echo "$psk" >"$pskf"
		wg set $IFACE peer "$pub" preshared-key "$pskf" allowed-ips "$NET4.$n/32${allowed6:+,${allowed6#, }}"
		rm -f "$pskf"
	fi
	printf '%s✓ Added device "%s"%s\n\n' "$c_grn" "$CLIENT" "$c_off"
	do_show "$CLIENT"
}

do_show() {
	local f="$ETC/clients/$1.conf"
	[ -f "$f" ] || die "no client called $1"
	echo "Import this into Meridian (Add location → Paste config), or save it as a .conf file:"
	echo
	echo "-----BEGIN MERIDIAN CONFIG-----"
	cat "$f"
	echo "-----END MERIDIAN CONFIG-----"
	if [ -t 1 ] && command -v qrencode >/dev/null; then
		echo
		echo "Or scan it with the WireGuard app on a phone:"
		qrencode -t ansiutf8 <"$f"
	fi
}

do_qr() {
	local f="$ETC/clients/$1.conf"
	[ -f "$f" ] || die "no client called $1"
	qrencode -t ansiutf8 <"$f"
}

do_list() {
	load_env
	printf '%-20s %-18s %s\n' DEVICE ADDRESS "LAST HANDSHAKE"
	local f name addr pub hs
	for f in "$ETC"/clients/*.conf; do
		[ -f "$f" ] || continue
		name=$(basename "$f" .conf)
		addr=$(sed -n 's/^Address = \([^,/]*\).*/\1/p' "$f")
		pub=$(sed -n 's/^PrivateKey = //p' "$f" | wg pubkey)
		hs=$(wg show $IFACE latest-handshakes 2>/dev/null | awk -v p="$pub" '$1==p{print $2}')
		if [ -n "$hs" ] && [ "$hs" != 0 ]; then hs="$(( $(date +%s) - hs ))s ago"; else hs=never; fi
		printf '%-20s %-18s %s\n' "$name" "$addr" "$hs"
	done
}

do_remove() {
	need_root
	local f="$ETC/clients/$1.conf" pub
	[ -f "$f" ] || die "no client called $1"
	pub=$(sed -n 's/^PrivateKey = //p' "$f" | wg pubkey)
	wg set $IFACE peer "$pub" remove 2>/dev/null || true
	# Drop the [Peer] block that follows "# NAME".
	awk -v n="# $1" '
		/^\[Peer\]$/ { if (blk != "" && !skip) printf "%s", blk; blk = $0 "\n"; skip = 0; inpeer = 1; next }
		inpeer && $0 == n { skip = 1 }
		inpeer { blk = blk $0 "\n"; next }
		{ print }
		END { if (blk != "" && !skip) printf "%s", blk }' $WGCONF >$WGCONF.new
	mv $WGCONF.new $WGCONF
	chmod 600 $WGCONF
	rm -f "$f"
	echo "Removed $1."
}

do_uninstall() {
	need_root
	say "Removing Meridian server"
	systemctl disable --now meridian-blocklist.timer meridian-dns-filter.service meridian-dns-plain.service >/dev/null 2>&1 || true
	systemctl disable --now wg-quick@$IFACE.service >/dev/null 2>&1 || true
	rm -f /etc/systemd/system/meridian-*.service /etc/systemd/system/meridian-blocklist.timer /etc/sysctl.d/99-meridian.conf
	systemctl daemon-reload
	rm -rf $ETC $WGCONF $SELF_INSTALL
	echo "Done. Packages (wireguard-tools, unbound, nftables) were left installed."
}

cmd=${1:-install}
case "$cmd" in
install) shift || true; parse_opts "$@"; do_install ;;
add) shift; [ $# -gt 0 ] && [ "${1#--}" = "$1" ] && { CLIENT=$1; shift; }; parse_opts "$@"; do_add ;;
show) need_root; [ $# -ge 2 ] || die "usage: meridian-server show NAME"; do_show "$2" ;;
qr) need_root; [ $# -ge 2 ] || die "usage: meridian-server qr NAME"; do_qr "$2" ;;
list | ls) need_root; do_list ;;
remove | rm) [ $# -ge 2 ] || die "usage: meridian-server remove NAME"; do_remove "$2" ;;
update-blocklist) need_root; $ETC/update-blocklist.sh ;;
uninstall) do_uninstall ;;
version | --version) echo "meridian-server $VERSION" ;;
help | -h | --help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//' ;;
--*) parse_opts "$@"; do_install ;;
*) die "unknown command $cmd (try: help)" ;;
esac
