// Package netcfg applies a tunnel's addresses, routes, DNS and firewall
// (kill switch) to the operating system. Each platform has its own file.
package netcfg

import (
	"net/netip"

	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/tun"
)

// Plan is everything the operating system needs to know about a tunnel.
type Plan struct {
	Addresses  []netip.Prefix   // addresses on the tunnel interface
	MTU        int              //
	Full4      bool             // send all IPv4 into the tunnel
	Full6      bool             // send all IPv6 into the tunnel
	Block6     bool             // IPv6 is routed in but the location has none: reject it
	Routes     []netip.Prefix   // explicit routes (split tunnels, the virtual resolver)
	DNS        []netip.Addr     // resolvers to give the operating system
	Endpoints  []netip.AddrPort // VPN servers, which must stay reachable outside the tunnel
	KillSwitch bool             // block all traffic outside the tunnel
	AllowLAN   bool             // with the kill switch, still allow the local network
	FwMark     uint32           // Linux: mark on the WireGuard socket
}

// Configurator sets up and tears down a tunnel's system configuration.
type Configurator interface {
	// Up configures a freshly created tunnel device.
	Up(dev tun.Device, bind conn.Bind, p Plan) error
	// Update applies a new plan to the running tunnel (switching location)
	// without removing the kill switch.
	Update(p Plan) error
	// Down restores the system. It is safe to call more than once.
	Down() error
}

// Logf is the logger used by configurators.
type Logf func(format string, args ...any)

// LANPrefixes are the private and link-local ranges reachable with
// "Allow local network".
var LANPrefixes = []netip.Prefix{
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("224.0.0.0/4"),
	netip.MustParsePrefix("255.255.255.255/32"),
	netip.MustParsePrefix("fe80::/10"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("ff00::/8"),
}

// DummyIPv6 is put on the tunnel when a location has no IPv6, so IPv6
// traffic goes into the tunnel (where it is dropped) instead of leaking.
var DummyIPv6 = netip.MustParsePrefix("fd6d:6572:6964:6961::1/128")

// TunName is the preferred interface name.
const TunName = "meridian0"

// WindowsTunName is the adapter name shown in Windows network settings.
const WindowsTunName = "Meridian"
