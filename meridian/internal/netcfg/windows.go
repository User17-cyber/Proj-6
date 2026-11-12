//go:build windows

package netcfg

import (
	"errors"
	"fmt"
	"net/netip"
	"sync"

	"golang.org/x/sys/windows"
	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/tun"
	"golang.zx2c4.com/wireguard/windows/tunnel/firewall"
	"golang.zx2c4.com/wireguard/windows/tunnel/winipcfg"
)

// The Windows implementation follows WireGuard for Windows: addresses,
// routes and DNS go on the Wintun adapter through the IP Helper API, the
// WireGuard socket is bound to the physical interface carrying the default
// route (so encrypted packets never loop back into the tunnel), and the kill
// switch is WireGuard's Windows Filtering Platform firewall. That firewall
// only accepts the process if it runs as a service with its own SID, which
// is how "meridian service install" registers it.

type win struct {
	logf Logf

	mu        sync.Mutex
	luid      winipcfg.LUID
	binder    conn.BindSocketToInterface
	callbacks []winipcfg.ChangeCallback
	plan      Plan
	fw        bool
	up        bool

	bindMu     sync.Mutex
	last4      winipcfg.LUID
	last6      winipcfg.LUID
	lastIndex4 uint32
	lastIndex6 uint32
}

// New returns the configurator for this platform.
func New(logf Logf) Configurator {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &win{logf: logf}
}

func (w *win) Up(dev tun.Device, bind conn.Bind, p Plan) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	nt, ok := dev.(*tun.NativeTun)
	if !ok {
		return errors.New("unexpected tunnel device")
	}
	w.luid = winipcfg.LUID(nt.LUID())
	w.binder, _ = bind.(conn.BindSocketToInterface)
	w.up = true
	if err := w.monitorDefaultRoutes(); err != nil {
		return err
	}
	if err := w.configure(p); err != nil {
		return err
	}
	if err := w.setFirewall(p, nil); err != nil {
		return err
	}
	w.plan = p
	return nil
}

func (w *win) Update(p Plan) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	old := w.plan
	if err := w.configure(p); err != nil {
		return err
	}
	if err := w.setFirewall(p, &old); err != nil {
		return err
	}
	w.plan = p
	return nil
}

func (w *win) Down() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.up {
		return nil
	}
	w.up = false
	for _, cb := range w.callbacks {
		_ = cb.Unregister()
	}
	w.callbacks = nil
	if w.fw {
		firewall.DisableFirewall()
		w.fw = false
	}
	_ = w.luid.FlushDNS(windows.AF_INET)
	_ = w.luid.FlushDNS(windows.AF_INET6)
	_ = w.luid.FlushRoutes(windows.AF_INET)
	_ = w.luid.FlushRoutes(windows.AF_INET6)
	w.plan = Plan{}
	return nil
}

// Cleanup removes leftovers from a crashed run. The firewall uses a
// dynamic WFP session and disappears with the process, and Wintun removes
// orphaned adapters itself, so nothing is needed.
func Cleanup(Logf) {}

func (w *win) configure(p Plan) error {
	for _, family := range []winipcfg.AddressFamily{windows.AF_INET, windows.AF_INET6} {
		v4 := family == windows.AF_INET
		var addrs []netip.Prefix
		for _, a := range p.Addresses {
			if a.Addr().Is4() == v4 {
				addrs = append(addrs, a)
			}
		}
		full := (v4 && p.Full4) || (!v4 && p.Full6)
		if !v4 && p.Block6 && len(addrs) == 0 {
			// Windows only routes IPv6 into an interface that has an
			// IPv6 address; the dummy one keeps IPv6 out of the real
			// network. Packets sent with it go nowhere.
			addrs = append(addrs, DummyIPv6)
		}
		var routes []*winipcfg.RouteData
		unspec := netip.IPv4Unspecified()
		if !v4 {
			unspec = netip.IPv6Unspecified()
		}
		if full {
			routes = append(routes, &winipcfg.RouteData{Destination: netip.PrefixFrom(unspec, 0), NextHop: unspec, Metric: 0})
		}
		for _, r := range p.Routes {
			if r.Addr().Is4() == v4 {
				routes = append(routes, &winipcfg.RouteData{Destination: r.Masked(), NextHop: unspec, Metric: 0})
			}
		}

		fail := func(what string, err error) error {
			if v4 {
				return fmt.Errorf("%s: %w", what, err)
			}
			w.logf("netcfg: IPv6 %s: %v (continuing without IPv6)", what, err)
			return nil
		}
		if len(addrs) > 0 {
			err := w.luid.SetIPAddressesForFamily(family, addrs)
			if errors.Is(err, windows.ERROR_OBJECT_ALREADY_EXISTS) {
				cleanupAddresses(family, addrs, w.logf)
				err = w.luid.SetIPAddressesForFamily(family, addrs)
			}
			if err != nil {
				if e := fail("setting addresses", err); e != nil {
					return e
				}
				continue
			}
		} else {
			_ = w.luid.FlushIPAddresses(family)
		}
		if err := w.luid.SetRoutesForFamily(family, routes); err != nil {
			if e := fail("setting routes", err); e != nil {
				return e
			}
			continue
		}
		ipif, err := w.luid.IPInterface(family)
		if err != nil {
			if e := fail("reading the interface", err); e != nil {
				return e
			}
			continue
		}
		ipif.RouterDiscoveryBehavior = winipcfg.RouterDiscoveryDisabled
		ipif.DadTransmits = 0
		ipif.ManagedAddressConfigurationSupported = false
		ipif.OtherStatefulConfigurationSupported = false
		if p.MTU > 0 {
			ipif.NLMTU = uint32(p.MTU)
		}
		if full {
			// The lowest metric makes the tunnel the preferred route and
			// DNS interface.
			ipif.UseAutomaticMetric = false
			ipif.Metric = 0
		}
		if err := ipif.Set(); err != nil {
			if e := fail("setting metric and MTU", err); e != nil {
				return e
			}
			continue
		}
		var dns []netip.Addr
		for _, d := range p.DNS {
			if d.Is4() == v4 {
				dns = append(dns, d)
			}
		}
		if err := w.luid.SetDNS(family, dns, nil); err != nil {
			if e := fail("setting DNS", err); e != nil {
				return e
			}
		}
	}
	return nil
}

// cleanupAddresses removes our addresses from adapters that are down
// (left over from an earlier session).
func cleanupAddresses(family winipcfg.AddressFamily, addrs []netip.Prefix, logf Logf) {
	want := map[netip.Addr]bool{}
	for _, a := range addrs {
		want[a.Addr()] = true
	}
	ifaces, err := winipcfg.GetAdaptersAddresses(family, winipcfg.GAAFlagDefault)
	if err != nil {
		return
	}
	for _, iface := range ifaces {
		if iface.OperStatus == winipcfg.IfOperStatusUp {
			continue
		}
		for a := iface.FirstUnicastAddress; a != nil; a = a.Next {
			if ip, ok := netip.AddrFromSlice(a.Address.IP()); ok && want[ip.Unmap()] {
				prefix := netip.PrefixFrom(ip.Unmap(), int(a.OnLinkPrefixLength))
				logf("netcfg: removing stale address %s from %s", prefix, iface.FriendlyName())
				_ = iface.LUID.DeleteIPAddress(prefix)
			}
		}
	}
}

func (w *win) setFirewall(p Plan, old *Plan) error {
	if old != nil && old.KillSwitch == p.KillSwitch && w.fw == p.KillSwitch && sameAddrList(old.DNS, p.DNS) {
		return nil
	}
	if w.fw {
		firewall.DisableFirewall()
		w.fw = false
	}
	if !p.KillSwitch {
		return nil
	}
	if p.AllowLAN {
		w.logf("netcfg: on Windows the kill switch also blocks the local network (except DHCP)")
	}
	if err := firewall.EnableFirewall(uint64(w.luid), false, p.DNS); err != nil {
		return fmt.Errorf("the kill switch could not be enabled (Meridian must run as its Windows service): %w", err)
	}
	w.fw = true
	return nil
}

func sameAddrList(a, b []netip.Addr) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// monitorDefaultRoutes keeps the WireGuard socket bound to whichever
// physical interface carries the default route, following network changes
// (Wi-Fi to Ethernet, for example).
func (w *win) monitorDefaultRoutes() error {
	if w.binder == nil {
		return nil
	}
	w.bindMu.Lock()
	w.last4, w.last6 = 0, 0
	w.lastIndex4, w.lastIndex6 = ^uint32(0), ^uint32(0)
	w.bindMu.Unlock()
	update := func() {
		w.bindMu.Lock()
		defer w.bindMu.Unlock()
		if err := w.bindDefault(windows.AF_INET, &w.last4, &w.lastIndex4); err != nil {
			w.logf("netcfg: binding IPv4 socket: %v", err)
		}
		if err := w.bindDefault(windows.AF_INET6, &w.last6, &w.lastIndex6); err != nil {
			w.logf("netcfg: binding IPv6 socket: %v", err)
		}
	}
	update()
	cbr, err := winipcfg.RegisterRouteChangeCallback(func(_ winipcfg.MibNotificationType, route *winipcfg.MibIPforwardRow2) {
		if route != nil && route.DestinationPrefix.PrefixLength == 0 {
			update()
		}
	})
	if err != nil {
		return err
	}
	cbi, err := winipcfg.RegisterInterfaceChangeCallback(func(t winipcfg.MibNotificationType, _ *winipcfg.MibIPInterfaceRow) {
		if t == winipcfg.MibParameterNotification {
			update()
		}
	})
	if err != nil {
		_ = cbr.Unregister()
		return err
	}
	w.callbacks = []winipcfg.ChangeCallback{cbr, cbi}
	return nil
}

func (w *win) bindDefault(family winipcfg.AddressFamily, lastLUID *winipcfg.LUID, lastIndex *uint32) error {
	routes, err := winipcfg.GetIPForwardTable2(family)
	if err != nil {
		return err
	}
	lowest := ^uint32(0)
	index := uint32(0)
	luid := winipcfg.LUID(0)
	for i := range routes {
		r := &routes[i]
		if r.DestinationPrefix.PrefixLength != 0 || r.InterfaceLUID == w.luid {
			continue
		}
		ifrow, err := r.InterfaceLUID.Interface()
		if err != nil || ifrow.OperStatus != winipcfg.IfOperStatusUp {
			continue
		}
		iface, err := r.InterfaceLUID.IPInterface(family)
		if err != nil {
			continue
		}
		if r.Metric+iface.Metric < lowest {
			lowest = r.Metric + iface.Metric
			index = r.InterfaceIndex
			luid = r.InterfaceLUID
		}
	}
	if luid == *lastLUID && index == *lastIndex {
		return nil
	}
	*lastLUID, *lastIndex = luid, index
	// With no other default route, drop packets rather than send them
	// into our own tunnel.
	blackhole := index == 0
	if family == windows.AF_INET {
		return w.binder.BindSocketToInterface4(index, blackhole)
	}
	return w.binder.BindSocketToInterface6(index, blackhole)
}
