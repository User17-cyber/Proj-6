// Package wgconf parses and writes WireGuard configuration files in the
// wg-quick format used by every WireGuard client and most VPN providers.
//
// Meridian keeps location details (country, city, an unfiltered resolver) in
// comments such as "# Meridian-Country: NL", so a config stays valid for the
// official WireGuard apps while still telling Meridian where it exits.
package wgconf

import (
	"bufio"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"strconv"
	"strings"

	"golang.org/x/crypto/curve25519"
)

// Key is a Curve25519 key (private, public or preshared).
type Key [32]byte

// ParseKey decodes a base64 WireGuard key.
func ParseKey(s string) (Key, error) {
	var k Key
	b, err := base64.StdEncoding.DecodeString(strings.TrimSpace(s))
	if err != nil || len(b) != 32 {
		return k, errors.New("invalid key: must be 32 bytes of base64")
	}
	copy(k[:], b)
	return k, nil
}

// NewPrivateKey returns a random, clamped Curve25519 private key.
func NewPrivateKey() (Key, error) {
	var k Key
	if _, err := rand.Read(k[:]); err != nil {
		return k, err
	}
	k[0] &= 248
	k[31] = (k[31] & 127) | 64
	return k, nil
}

func (k Key) String() string { return base64.StdEncoding.EncodeToString(k[:]) }
func (k Key) Hex() string    { return hex.EncodeToString(k[:]) }
func (k Key) IsZero() bool   { return k == Key{} }

// Public derives the public key from a private key.
func (k Key) Public() Key {
	var pub Key
	out, err := curve25519.X25519(k[:], curve25519.Basepoint)
	if err == nil {
		copy(pub[:], out)
	}
	return pub
}

// Interface is the [Interface] section.
type Interface struct {
	PrivateKey Key
	Addresses  []netip.Prefix
	DNS        []netip.Addr
	DNSSearch  []string
	MTU        int
	ListenPort int
}

// Peer is a [Peer] section.
type Peer struct {
	PublicKey           Key
	PresharedKey        Key // zero when absent
	AllowedIPs          []netip.Prefix
	Endpoint            string // "host:port" exactly as written
	PersistentKeepalive int
}

// Meta holds Meridian location details read from "# Meridian-*" comments.
type Meta struct {
	Name     string         // display name
	Country  string         // ISO 3166-1 alpha-2, upper case
	City     string         //
	PlainDNS netip.AddrPort // unfiltered resolver on a Meridian server
	Provider string         // e.g. "Meridian server", "Mullvad"
}

// Config is a parsed WireGuard configuration.
type Config struct {
	Interface Interface
	Peers     []Peer
	Meta      Meta
	// Warnings lists lines that were understood but ignored, such as
	// PostUp scripts, which Meridian never runs.
	Warnings []string
}

// ignoredKeys are valid wg-quick keys that Meridian deliberately skips.
var ignoredKeys = map[string]bool{
	"preup": true, "postup": true, "predown": true, "postdown": true,
	"saveconfig": true, "table": true, "fwmark": true,
}

// amneziaKeys belong to AmneziaWG, an incompatible WireGuard fork.
var amneziaKeys = map[string]bool{
	"jc": true, "jmin": true, "jmax": true, "s1": true, "s2": true,
	"h1": true, "h2": true, "h3": true, "h4": true,
}

// Parse reads a wg-quick style configuration.
func Parse(text string) (*Config, error) {
	c := &Config{}
	const (
		secNone = iota
		secInterface
		secPeer
	)
	section := secNone
	sawInterface := false
	var peer *Peer
	seenKey := map[string]bool{}

	sc := bufio.NewScanner(strings.NewReader(text))
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	lineNo := 0
	for sc.Scan() {
		lineNo++
		raw := strings.TrimSpace(strings.TrimPrefix(sc.Text(), "\uFEFF"))
		if raw == "" {
			continue
		}
		if raw[0] == '#' || raw[0] == ';' {
			parseMetaComment(raw, &c.Meta)
			continue
		}
		line := raw
		if i := strings.IndexByte(line, '#'); i >= 0 {
			line = strings.TrimSpace(line[:i])
		}
		if line == "" {
			continue
		}
		if line[0] == '[' {
			name := strings.ToLower(strings.Trim(line, "[] \t"))
			switch name {
			case "interface":
				if sawInterface {
					return nil, fmt.Errorf("line %d: more than one [Interface] section", lineNo)
				}
				sawInterface = true
				section = secInterface
				seenKey = map[string]bool{}
			case "peer":
				c.Peers = append(c.Peers, Peer{})
				peer = &c.Peers[len(c.Peers)-1]
				section = secPeer
				seenKey = map[string]bool{}
			default:
				return nil, fmt.Errorf("line %d: unknown section %s", lineNo, line)
			}
			continue
		}
		eq := strings.IndexByte(line, '=')
		if eq < 0 {
			return nil, fmt.Errorf("line %d: expected \"Key = Value\"", lineNo)
		}
		key := strings.ToLower(strings.TrimSpace(line[:eq]))
		val := strings.TrimSpace(line[eq+1:])
		if section == secNone {
			return nil, fmt.Errorf("line %d: %q appears before any [Interface] or [Peer] section", lineNo, key)
		}
		if amneziaKeys[key] {
			return nil, errors.New("this is an AmneziaWG config; Meridian supports standard WireGuard configs only")
		}
		if ignoredKeys[key] {
			c.Warnings = append(c.Warnings, fmt.Sprintf("ignored %s (Meridian never runs config scripts or custom routing tables)", strings.TrimSpace(line[:eq])))
			continue
		}
		listKey := key == "address" || key == "dns" || key == "allowedips"
		if seenKey[key] && !listKey {
			return nil, fmt.Errorf("line %d: %s is set twice in one section", lineNo, line[:eq])
		}
		seenKey[key] = true

		var err error
		if section == secInterface {
			err = c.Interface.set(key, val)
		} else {
			err = peer.set(key, val)
		}
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", lineNo, err)
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if !sawInterface {
		return nil, errors.New("missing [Interface] section")
	}
	if c.Interface.PrivateKey.IsZero() {
		return nil, errors.New("[Interface] has no PrivateKey")
	}
	if len(c.Interface.Addresses) == 0 {
		return nil, errors.New("[Interface] has no Address")
	}
	if len(c.Peers) == 0 {
		return nil, errors.New("missing [Peer] section")
	}
	for i := range c.Peers {
		p := &c.Peers[i]
		if p.PublicKey.IsZero() {
			return nil, fmt.Errorf("peer %d has no PublicKey", i+1)
		}
		if p.Endpoint == "" {
			return nil, fmt.Errorf("peer %d has no Endpoint, so there is no server to connect to", i+1)
		}
	}
	return c, nil
}

func splitList(val string) []string {
	var out []string
	for _, f := range strings.Split(val, ",") {
		if f = strings.TrimSpace(f); f != "" {
			out = append(out, f)
		}
	}
	return out
}

func (in *Interface) set(key, val string) error {
	switch key {
	case "privatekey":
		k, err := ParseKey(val)
		if err != nil {
			return fmt.Errorf("PrivateKey: %w", err)
		}
		in.PrivateKey = k
	case "address":
		for _, f := range splitList(val) {
			p, err := parsePrefixOrAddr(f)
			if err != nil {
				return fmt.Errorf("Address %q: %w", f, err)
			}
			in.Addresses = append(in.Addresses, p)
		}
	case "dns":
		for _, f := range splitList(val) {
			if a, err := netip.ParseAddr(f); err == nil {
				in.DNS = append(in.DNS, a.Unmap())
			} else {
				in.DNSSearch = append(in.DNSSearch, f)
			}
		}
	case "mtu":
		n, err := strconv.Atoi(val)
		if err != nil || n < 576 || n > 65535 {
			return fmt.Errorf("MTU %q is not a number between 576 and 65535", val)
		}
		in.MTU = n
	case "listenport":
		n, err := strconv.Atoi(val)
		if err != nil || n < 0 || n > 65535 {
			return fmt.Errorf("ListenPort %q is not a valid port", val)
		}
		in.ListenPort = n
	default:
		return fmt.Errorf("unknown [Interface] key %q", key)
	}
	return nil
}

func (p *Peer) set(key, val string) error {
	switch key {
	case "publickey":
		k, err := ParseKey(val)
		if err != nil {
			return fmt.Errorf("PublicKey: %w", err)
		}
		p.PublicKey = k
	case "presharedkey":
		k, err := ParseKey(val)
		if err != nil {
			return fmt.Errorf("PresharedKey: %w", err)
		}
		p.PresharedKey = k
	case "allowedips":
		for _, f := range splitList(val) {
			pr, err := parsePrefixOrAddr(f)
			if err != nil {
				return fmt.Errorf("AllowedIPs %q: %w", f, err)
			}
			p.AllowedIPs = append(p.AllowedIPs, pr.Masked())
		}
	case "endpoint":
		host, port, err := net.SplitHostPort(val)
		if err != nil {
			return fmt.Errorf("Endpoint %q must look like host:port", val)
		}
		if n, err := strconv.Atoi(port); err != nil || n < 1 || n > 65535 {
			return fmt.Errorf("Endpoint %q has an invalid port", val)
		}
		if host == "" {
			return fmt.Errorf("Endpoint %q has no host", val)
		}
		p.Endpoint = val
	case "persistentkeepalive":
		if strings.EqualFold(val, "off") {
			p.PersistentKeepalive = 0
			return nil
		}
		n, err := strconv.Atoi(val)
		if err != nil || n < 0 || n > 65535 {
			return fmt.Errorf("PersistentKeepalive %q is not a number of seconds", val)
		}
		p.PersistentKeepalive = n
	default:
		return fmt.Errorf("unknown [Peer] key %q", key)
	}
	return nil
}

func parsePrefixOrAddr(s string) (netip.Prefix, error) {
	if strings.Contains(s, "/") {
		p, err := netip.ParsePrefix(s)
		if err != nil {
			return netip.Prefix{}, err
		}
		return netip.PrefixFrom(p.Addr().Unmap(), p.Bits()), nil
	}
	a, err := netip.ParseAddr(s)
	if err != nil {
		return netip.Prefix{}, err
	}
	a = a.Unmap()
	return netip.PrefixFrom(a, a.BitLen()), nil
}

// parseMetaComment reads "# Meridian-Country: NL" style lines.
func parseMetaComment(line string, m *Meta) {
	s := strings.TrimSpace(strings.TrimLeft(line, "#; \t"))
	if len(s) < 9 || !strings.EqualFold(s[:9], "meridian-") {
		return
	}
	s = s[9:]
	sep := strings.IndexAny(s, ":=")
	if sep < 0 {
		return
	}
	key := strings.ToLower(strings.TrimSpace(s[:sep]))
	val := strings.TrimSpace(s[sep+1:])
	switch key {
	case "name":
		m.Name = val
	case "country":
		if len(val) == 2 {
			m.Country = strings.ToUpper(val)
		}
	case "city":
		m.City = val
	case "plaindns":
		if ap, err := netip.ParseAddrPort(val); err == nil {
			m.PlainDNS = ap
		} else if a, err := netip.ParseAddr(val); err == nil {
			m.PlainDNS = netip.AddrPortFrom(a, 53)
		}
	case "provider":
		m.Provider = val
	}
}

// FullTunnel4 reports whether the peers route all IPv4 traffic.
func (c *Config) FullTunnel4() bool { return c.hasDefault(false) }

// FullTunnel6 reports whether the peers route all IPv6 traffic.
func (c *Config) FullTunnel6() bool { return c.hasDefault(true) }

func (c *Config) hasDefault(v6 bool) bool {
	for _, p := range c.Peers {
		for _, a := range p.AllowedIPs {
			if a.Bits() == 0 && a.Addr().Is6() == v6 {
				return true
			}
		}
	}
	return false
}

// UAPI renders the configuration in the wireguard-go IPC "set" format.
// endpoints holds the resolved endpoint of each peer, in order.
func (c *Config) UAPI(endpoints []netip.AddrPort, fwmark uint32) string {
	var b strings.Builder
	fmt.Fprintf(&b, "private_key=%s\n", c.Interface.PrivateKey.Hex())
	fmt.Fprintf(&b, "listen_port=%d\n", c.Interface.ListenPort)
	if fwmark != 0 {
		fmt.Fprintf(&b, "fwmark=%d\n", fwmark)
	}
	b.WriteString("replace_peers=true\n")
	for i, p := range c.Peers {
		fmt.Fprintf(&b, "public_key=%s\n", p.PublicKey.Hex())
		if !p.PresharedKey.IsZero() {
			fmt.Fprintf(&b, "preshared_key=%s\n", p.PresharedKey.Hex())
		}
		if i < len(endpoints) && endpoints[i].IsValid() {
			fmt.Fprintf(&b, "endpoint=%s\n", endpoints[i].String())
		}
		fmt.Fprintf(&b, "persistent_keepalive_interval=%d\n", p.PersistentKeepalive)
		b.WriteString("replace_allowed_ips=true\n")
		for _, a := range p.AllowedIPs {
			fmt.Fprintf(&b, "allowed_ip=%s\n", a.String())
		}
	}
	return b.String()
}

// String writes the configuration back out in wg-quick format, including
// Meridian metadata comments. The result works in any WireGuard client.
func (c *Config) String() string {
	var b strings.Builder
	m := c.Meta
	if m.Name != "" {
		fmt.Fprintf(&b, "# Meridian-Name: %s\n", m.Name)
	}
	if m.Country != "" {
		fmt.Fprintf(&b, "# Meridian-Country: %s\n", m.Country)
	}
	if m.City != "" {
		fmt.Fprintf(&b, "# Meridian-City: %s\n", m.City)
	}
	if m.Provider != "" {
		fmt.Fprintf(&b, "# Meridian-Provider: %s\n", m.Provider)
	}
	if m.PlainDNS.IsValid() {
		fmt.Fprintf(&b, "# Meridian-PlainDNS: %s\n", m.PlainDNS)
	}
	b.WriteString("[Interface]\n")
	fmt.Fprintf(&b, "PrivateKey = %s\n", c.Interface.PrivateKey)
	b.WriteString("Address = " + joinPrefixes(c.Interface.Addresses) + "\n")
	if len(c.Interface.DNS) > 0 || len(c.Interface.DNSSearch) > 0 {
		var parts []string
		for _, a := range c.Interface.DNS {
			parts = append(parts, a.String())
		}
		parts = append(parts, c.Interface.DNSSearch...)
		b.WriteString("DNS = " + strings.Join(parts, ", ") + "\n")
	}
	if c.Interface.MTU > 0 {
		fmt.Fprintf(&b, "MTU = %d\n", c.Interface.MTU)
	}
	if c.Interface.ListenPort > 0 {
		fmt.Fprintf(&b, "ListenPort = %d\n", c.Interface.ListenPort)
	}
	for _, p := range c.Peers {
		b.WriteString("\n[Peer]\n")
		fmt.Fprintf(&b, "PublicKey = %s\n", p.PublicKey)
		if !p.PresharedKey.IsZero() {
			fmt.Fprintf(&b, "PresharedKey = %s\n", p.PresharedKey)
		}
		if len(p.AllowedIPs) > 0 {
			b.WriteString("AllowedIPs = " + joinPrefixes(p.AllowedIPs) + "\n")
		}
		fmt.Fprintf(&b, "Endpoint = %s\n", p.Endpoint)
		if p.PersistentKeepalive > 0 {
			fmt.Fprintf(&b, "PersistentKeepalive = %d\n", p.PersistentKeepalive)
		}
	}
	return b.String()
}

func joinPrefixes(ps []netip.Prefix) string {
	s := make([]string, len(ps))
	for i, p := range ps {
		s[i] = p.String()
	}
	return strings.Join(s, ", ")
}

// EndpointHost returns the host part of the first peer's endpoint.
func (c *Config) EndpointHost() string {
	if len(c.Peers) == 0 {
		return ""
	}
	h, _, _ := net.SplitHostPort(c.Peers[0].Endpoint)
	return h
}
