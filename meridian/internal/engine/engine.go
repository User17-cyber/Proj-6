// Package engine runs the VPN: a userspace WireGuard device, the DNS
// filter on its packet path, and the operating system configuration.
package engine

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/device"
	"golang.zx2c4.com/wireguard/tun"

	"meridian/internal/dnsproxy"
	"meridian/internal/geo"
	"meridian/internal/netcfg"
	"meridian/internal/wgconf"
)

// State of the connection.
type State string

const (
	Disconnected  State = "disconnected"
	Connecting    State = "connecting"
	Connected     State = "connected"
	Reconnecting  State = "reconnecting"
	Disconnecting State = "disconnecting"
)

// Settings are the user options that affect a running tunnel.
type Settings struct {
	AdBlock      bool   `json:"adBlock"`
	KillSwitch   bool   `json:"killSwitch"`
	AllowLAN     bool   `json:"allowLan"`
	BlockIPv6    bool   `json:"blockIPv6Leaks"`
	DNSUpstream  string `json:"dnsUpstream"` // auto, quad9, cloudflare, mullvad, google, custom
	CustomDNS    string `json:"customDns"`   // IPs or an https:// DoH URL
	BlockDoT     bool   `json:"blockDoT"`
	InterceptAll bool   `json:"interceptAllDns"`
	CheckExit    bool   `json:"checkExitLocation"`
	QueryLog     bool   `json:"queryLog"`
	MTU          int    `json:"mtu"` // 0 = from the config, else 1420
}

// DefaultSettings are used on first run.
func DefaultSettings() Settings {
	return Settings{
		AdBlock: true, KillSwitch: true, AllowLAN: true, BlockIPv6: true,
		DNSUpstream: "auto", BlockDoT: true, InterceptAll: true, CheckExit: true, QueryLog: true,
	}
}

// Target is a location to connect to.
type Target struct {
	ID      string
	Name    string
	Country string
	City    string
	Config  *wgconf.Config
}

// TargetInfo is the public part of a Target.
type TargetInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Country string `json:"country"`
	City    string `json:"city"`
}

// Status is a snapshot for the UI.
type Status struct {
	State      State       `json:"state"`
	Error      string      `json:"error,omitempty"`
	Warning    string      `json:"warning,omitempty"`
	Location   *TargetInfo `json:"location,omitempty"`
	Since      time.Time   `json:"since,omitempty"`
	Handshake  time.Time   `json:"handshake,omitempty"`
	RxBytes    uint64      `json:"rxBytes"`
	TxBytes    uint64      `json:"txBytes"`
	RxRate     float64     `json:"rxRate"`
	TxRate     float64     `json:"txRate"`
	Endpoint   string      `json:"endpoint,omitempty"`
	TunnelIPs  []string    `json:"tunnelIps,omitempty"`
	IPv6       bool        `json:"ipv6"`
	Exit       *geo.Info   `json:"exit,omitempty"`
	Home       *geo.Info   `json:"home,omitempty"`
	DNSServer  string      `json:"dnsServer,omitempty"`
	KillSwitch bool        `json:"killSwitch"`
	AdBlock    bool        `json:"adBlock"`
}

// Options configure an Engine.
type Options struct {
	Logf      func(string, ...any)
	Matcher   dnsproxy.Matcher
	Net       netcfg.Configurator
	CreateTUN func(mtu int) (tun.Device, error)
	NewBind   func() conn.Bind
	FwMark    uint32
	// OnChange is called (without locks held) when the status changes.
	OnChange func()
	// OnExit is called when the exit location of a target is learned.
	OnExit func(targetID string, info *geo.Info)
	// HTTPClient is used for exit-location lookups.
	HTTPClient *http.Client
}

// Engine owns at most one tunnel.
type Engine struct {
	opts Options

	mu       sync.Mutex
	settings Settings
	dev      *device.Device
	tunDev   tun.Device
	proxy    *dnsproxy.Proxy
	bind     conn.Bind
	netUp    bool
	target   *Target
	plan     netcfg.Plan
	cfgUsed  *wgconf.Config
	ipv6     bool
	status   Status
	stop     chan struct{}
	home     *geo.Info
	upstream string
}

// New creates an engine. It does not touch the network until Connect.
func New(opts Options, s Settings) *Engine {
	if opts.Logf == nil {
		opts.Logf = func(string, ...any) {}
	}
	if opts.CreateTUN == nil {
		opts.CreateTUN = createTUN
	}
	if opts.NewBind == nil {
		opts.NewBind = conn.NewDefaultBind
	}
	if opts.FwMark == 0 {
		opts.FwMark = defaultFwMark
	}
	if opts.Net == nil {
		opts.Net = netcfg.New(opts.Logf)
	}
	if opts.HTTPClient == nil {
		// No keep-alive: a connection opened before the tunnel came up
		// would otherwise be reused afterwards and report the wrong
		// address (or hang, as the server no longer knows it).
		opts.HTTPClient = &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{Proxy: nil, DisableKeepAlives: true}}
	}
	return &Engine{opts: opts, settings: s, status: Status{State: Disconnected}}
}

func (e *Engine) changed() {
	if e.opts.OnChange != nil {
		e.opts.OnChange()
	}
}

// Status returns a snapshot of the connection.
func (e *Engine) Status() Status {
	e.mu.Lock()
	defer e.mu.Unlock()
	s := e.status
	s.KillSwitch = e.settings.KillSwitch
	s.AdBlock = e.settings.AdBlock
	s.Home = e.home
	if s.State == Disconnected {
		s.Location = nil
	}
	return s
}

// Proxy returns the DNS proxy of the running tunnel, or nil.
func (e *Engine) Proxy() *dnsproxy.Proxy {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.proxy
}

// Settings returns the current settings.
func (e *Engine) Settings() Settings {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.settings
}

func (e *Engine) mtu(cfg *wgconf.Config) int {
	switch {
	case e.settings.MTU >= 1280:
		return e.settings.MTU
	case cfg.Interface.MTU > 0:
		return cfg.Interface.MTU
	}
	return 1420
}

// resolveEndpoints turns host names into addresses before the tunnel (and
// possibly the kill switch) is up.
func resolveEndpoints(ctx context.Context, cfg *wgconf.Config) ([]netip.AddrPort, error) {
	out := make([]netip.AddrPort, len(cfg.Peers))
	for i, p := range cfg.Peers {
		host, portStr, err := net.SplitHostPort(p.Endpoint)
		if err != nil {
			return nil, err
		}
		port, _ := strconv.Atoi(portStr)
		if a, err := netip.ParseAddr(host); err == nil {
			out[i] = netip.AddrPortFrom(a.Unmap(), uint16(port))
			continue
		}
		addrs, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if err != nil || len(addrs) == 0 {
			return nil, fmt.Errorf("cannot find the server %s: %v", host, err)
		}
		best := addrs[0].Unmap()
		for _, a := range addrs {
			if a.Unmap().Is4() { // IPv4 works on more networks
				best = a.Unmap()
				break
			}
		}
		out[i] = netip.AddrPortFrom(best, uint16(port))
	}
	return out, nil
}

// prepare copies the config with Meridian's adjustments: keepalive so a
// dead connection is noticed, and no listen port clashes.
func prepare(cfg *wgconf.Config) *wgconf.Config {
	c := *cfg
	c.Peers = append([]wgconf.Peer(nil), cfg.Peers...)
	for i := range c.Peers {
		if c.Peers[i].PersistentKeepalive == 0 {
			c.Peers[i].PersistentKeepalive = 25
		}
	}
	c.Interface.ListenPort = 0
	return &c
}

func hasIPv6(cfg *wgconf.Config) bool {
	if !cfg.FullTunnel6() {
		return false
	}
	for _, a := range cfg.Interface.Addresses {
		if a.Addr().Is6() {
			return true
		}
	}
	return false
}

func (e *Engine) buildPlan(cfg *wgconf.Config, endpoints []netip.AddrPort, mtu int) netcfg.Plan {
	s := e.settings
	p := netcfg.Plan{
		Addresses:  append([]netip.Prefix(nil), cfg.Interface.Addresses...),
		MTU:        mtu,
		Full4:      cfg.FullTunnel4(),
		DNS:        []netip.Addr{dnsproxy.DefaultVirtualIP},
		Endpoints:  endpoints,
		KillSwitch: s.KillSwitch,
		AllowLAN:   s.AllowLAN,
		FwMark:     e.opts.FwMark,
		Routes:     []netip.Prefix{netip.PrefixFrom(dnsproxy.DefaultVirtualIP, 32)},
	}
	v6 := hasIPv6(cfg)
	p.Full6 = v6 || (s.BlockIPv6 && p.Full4)
	p.Block6 = p.Full6 && !v6
	if !p.Full4 {
		// A split-tunnel config: route only what the server accepts.
		for _, peer := range cfg.Peers {
			for _, a := range peer.AllowedIPs {
				if a.Bits() > 0 && (a.Addr().Is4() || v6) {
					p.Routes = append(p.Routes, a)
				}
			}
		}
	}
	return p
}

// upstreamFor picks where allowed DNS queries go.
func (e *Engine) upstreamFor(cfg *wgconf.Config) (dnsproxy.Upstream, netip.Addr, string) {
	s := e.settings
	for _, p := range dnsproxy.Presets {
		if s.DNSUpstream == p.ID {
			u, err := dnsproxy.NewDoH(p.URL, p.Bootstrap)
			if err == nil {
				return u, p.Bootstrap[0], p.Name
			}
		}
	}
	if s.DNSUpstream == "custom" && strings.TrimSpace(s.CustomDNS) != "" {
		custom := strings.TrimSpace(s.CustomDNS)
		if strings.HasPrefix(custom, "https://") {
			if u, ips, err := e.customDoH(custom); err == nil {
				fallback := dnsproxy.FallbackServers[0].Addr()
				for _, ip := range ips {
					if ip.Is4() {
						fallback = ip
						break
					}
				}
				return u, fallback, custom
			} else {
				e.opts.Logf("engine: custom DNS-over-HTTPS unusable (%v); using automatic DNS", err)
			}
		} else {
			var servers []netip.AddrPort
			for _, f := range strings.FieldsFunc(custom, func(r rune) bool { return r == ',' || r == ' ' }) {
				if ap, err := netip.ParseAddrPort(f); err == nil {
					servers = append(servers, ap)
				} else if a, err := netip.ParseAddr(f); err == nil {
					servers = append(servers, netip.AddrPortFrom(a, 53))
				}
			}
			if len(servers) > 0 {
				return &dnsproxy.UDP{Servers: servers}, firstV4(servers), custom
			}
		}
	}
	// Automatic: the location's own resolver (unfiltered port on Meridian
	// servers, so the app's filter is the only one), else Quad9.
	var servers []netip.AddrPort
	if cfg.Meta.PlainDNS.IsValid() {
		servers = append(servers, cfg.Meta.PlainDNS)
	}
	var v6 []netip.AddrPort
	for _, a := range cfg.Interface.DNS {
		if a.Is4() {
			servers = append(servers, netip.AddrPortFrom(a, 53))
		} else if e.ipv6 {
			v6 = append(v6, netip.AddrPortFrom(a, 53))
		}
	}
	servers = append(servers, v6...)
	label := ""
	if len(servers) == 0 {
		servers = dnsproxy.FallbackServers
		label = "Quad9 (through the tunnel)"
	} else {
		label = "VPN server (" + servers[0].Addr().String() + ")"
	}
	return &dnsproxy.UDP{Servers: servers}, firstV4(servers), label
}

func firstV4(s []netip.AddrPort) netip.Addr {
	for _, ap := range s {
		if ap.Addr().Is4() {
			return ap.Addr()
		}
	}
	return dnsproxy.FallbackServers[0].Addr()
}

func (e *Engine) customDoH(raw string) (dnsproxy.Upstream, []netip.Addr, error) {
	host := strings.TrimPrefix(raw, "https://")
	if i := strings.IndexAny(host, "/?"); i >= 0 {
		host = host[:i]
	}
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	var ips []netip.Addr
	if a, err := netip.ParseAddr(strings.Trim(host, "[]")); err == nil {
		ips = []netip.Addr{a}
	} else {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		found, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, nil, err
		}
		ips = found
	}
	u, err := dnsproxy.NewDoH(raw, ips)
	return u, ips, err
}

func (e *Engine) proxyConfig(cfg *wgconf.Config, mtu int) dnsproxy.Config {
	up, fallback, label := e.upstreamFor(cfg)
	e.upstream = label
	return dnsproxy.Config{
		VirtualIP:    dnsproxy.DefaultVirtualIP,
		Blocking:     e.settings.AdBlock,
		Upstream:     up,
		TCPFallback:  fallback,
		InterceptAll: e.settings.InterceptAll && e.settings.AdBlock,
		BlockDoT:     e.settings.BlockDoT && e.settings.AdBlock,
		MaxUDP:       mtu - 48,
		NoAAAA:       !e.ipv6,
	}
}

// Connect connects to t, or switches to it if already connected. While
// switching, the tunnel interface, routes and kill switch stay in place.
func (e *Engine) Connect(t Target) error {
	if t.Config == nil {
		return errors.New("location has no configuration")
	}
	cfg := prepare(t.Config)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	endpoints, err := resolveEndpoints(ctx, cfg)
	cancel()
	if err != nil {
		return err
	}

	e.mu.Lock()
	mtu := e.mtu(cfg)
	e.ipv6 = hasIPv6(cfg)
	plan := e.buildPlan(cfg, endpoints, mtu)
	uapi := cfg.UAPI(endpoints, fwmarkFor(e.opts.FwMark))
	switching := e.dev != nil

	if !switching {
		e.status = Status{State: Connecting, Location: info(t)}
		e.mu.Unlock()
		e.changed()
		e.mu.Lock()
		if err := e.bringUp(cfg, uapi, plan, mtu); err != nil {
			e.status = Status{State: Disconnected, Error: err.Error()}
			e.mu.Unlock()
			e.changed()
			return err
		}
	} else {
		e.stopMonitor()
		if err := e.dev.IpcSet(uapi); err != nil {
			e.mu.Unlock()
			return fmt.Errorf("switching location: %w", err)
		}
		if err := e.opts.Net.Update(plan); err != nil {
			e.mu.Unlock()
			return fmt.Errorf("switching location: %w", err)
		}
	}
	e.target = &t
	e.plan = plan
	e.cfgUsed = cfg
	e.proxy.SetConfig(e.proxyConfig(cfg, mtu))
	e.proxy.SetLogging(e.settings.QueryLog)
	var tips []string
	for _, a := range cfg.Interface.Addresses {
		tips = append(tips, a.Addr().String())
	}
	e.status = Status{
		State:     Connecting,
		Location:  info(t),
		Endpoint:  endpoints[0].String(),
		TunnelIPs: tips,
		IPv6:      e.ipv6,
		DNSServer: e.upstream,
	}
	e.stop = make(chan struct{})
	go e.monitor(e.dev, e.stop, t.ID)
	e.mu.Unlock()
	e.changed()
	e.opts.Logf("engine: %s %s (%s)", map[bool]string{true: "switched to", false: "connecting to"}[switching], t.Name, endpoints[0])
	return nil
}

func info(t Target) *TargetInfo {
	return &TargetInfo{ID: t.ID, Name: t.Name, Country: t.Country, City: t.City}
}

func (e *Engine) bringUp(cfg *wgconf.Config, uapi string, plan netcfg.Plan, mtu int) error {
	tunDev, err := e.opts.CreateTUN(mtu)
	if err != nil {
		return fmt.Errorf("creating the tunnel interface: %w", err)
	}
	proxy := dnsproxy.New(tunDev, e.opts.Matcher, device.MessageTransportOffsetContent)
	bind := e.opts.NewBind()
	logger := &device.Logger{
		Verbosef: func(string, ...any) {},
		Errorf:   func(f string, a ...any) { e.opts.Logf("wireguard: "+f, a...) },
	}
	dev := device.NewDevice(proxy, bind, logger)
	fail := func(err error) error {
		dev.Close()
		return err
	}
	if err := dev.IpcSet(uapi); err != nil {
		return fail(fmt.Errorf("configuring WireGuard: %w", err))
	}
	if err := dev.Up(); err != nil {
		return fail(fmt.Errorf("starting WireGuard: %w", err))
	}
	if err := e.opts.Net.Up(tunDev, bind, plan); err != nil {
		_ = e.opts.Net.Down()
		return fail(fmt.Errorf("configuring the network: %w", err))
	}
	e.dev, e.tunDev, e.proxy, e.bind, e.netUp = dev, tunDev, proxy, bind, true
	return nil
}

// Disconnect tears the tunnel down and restores the system.
func (e *Engine) Disconnect() error {
	e.mu.Lock()
	if e.dev == nil {
		e.status = Status{State: Disconnected}
		e.mu.Unlock()
		return nil
	}
	e.status.State = Disconnecting
	e.mu.Unlock()
	e.changed()

	e.mu.Lock()
	e.stopMonitor()
	var errs []error
	if e.netUp {
		errs = append(errs, e.opts.Net.Down())
		e.netUp = false
	}
	e.dev.Close()
	e.dev, e.tunDev, e.proxy, e.bind, e.target, e.cfgUsed = nil, nil, nil, nil, nil, nil
	e.status = Status{State: Disconnected}
	checkHome := e.settings.CheckExit
	e.mu.Unlock()
	e.changed()
	e.opts.Logf("engine: disconnected")
	if checkHome {
		go e.RefreshHome()
	}
	return errors.Join(errs...)
}

// Apply changes settings, updating a running tunnel in place.
func (e *Engine) Apply(s Settings) error {
	e.mu.Lock()
	old := e.settings
	e.settings = s
	if e.dev == nil || e.cfgUsed == nil {
		e.mu.Unlock()
		e.changed()
		return nil
	}
	cfg := e.cfgUsed
	plan := e.buildPlan(cfg, e.plan.Endpoints, e.plan.MTU)
	var err error
	if plan.KillSwitch != old.KillSwitch || plan.AllowLAN != old.AllowLAN || s.BlockIPv6 != old.BlockIPv6 || s.MTU != old.MTU {
		err = e.opts.Net.Update(plan)
		e.plan = plan
	}
	e.proxy.SetConfig(e.proxyConfig(cfg, e.plan.MTU))
	e.proxy.SetLogging(s.QueryLog)
	e.status.DNSServer = e.upstream
	e.mu.Unlock()
	e.changed()
	return err
}

// Close disconnects; used at shutdown.
func (e *Engine) Close() { _ = e.Disconnect() }

func (e *Engine) stopMonitor() {
	if e.stop != nil {
		close(e.stop)
		e.stop = nil
	}
}

type peerStats struct {
	handshake time.Time
	rx, tx    uint64
}

func readStats(dev *device.Device) (peerStats, error) {
	var ps peerStats
	text, err := dev.IpcGet()
	if err != nil {
		return ps, err
	}
	var sec, nsec int64
	sc := bufio.NewScanner(strings.NewReader(text))
	for sc.Scan() {
		k, v, ok := strings.Cut(sc.Text(), "=")
		if !ok {
			continue
		}
		switch k {
		case "last_handshake_time_sec":
			sec, _ = strconv.ParseInt(v, 10, 64)
		case "last_handshake_time_nsec":
			nsec, _ = strconv.ParseInt(v, 10, 64)
		case "rx_bytes":
			n, _ := strconv.ParseUint(v, 10, 64)
			ps.rx += n
		case "tx_bytes":
			n, _ := strconv.ParseUint(v, 10, 64)
			ps.tx += n
		}
	}
	if sec > 0 {
		ps.handshake = time.Unix(sec, nsec)
	}
	return ps, nil
}

const (
	// WireGuard rekeys every 2 minutes and rejects sessions after 3; with
	// keepalives a healthy tunnel never goes longer without a handshake.
	staleAfter    = 3*time.Minute + 15*time.Second
	slowHandshake = 12 * time.Second
)

func (e *Engine) monitor(dev *device.Device, stop chan struct{}, targetID string) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	start := time.Now()
	var last peerStats
	var lastAt time.Time
	exitChecked := false
	for {
		select {
		case <-stop:
			return
		case <-t.C:
		}
		ps, err := readStats(dev)
		if err != nil {
			continue
		}
		now := time.Now()
		e.mu.Lock()
		if e.stop != stop {
			e.mu.Unlock()
			return
		}
		st := &e.status
		before := st.State
		if !lastAt.IsZero() {
			dt := now.Sub(lastAt).Seconds()
			st.RxRate = ema(st.RxRate, float64(ps.rx-min(ps.rx, last.rx))/dt)
			st.TxRate = ema(st.TxRate, float64(ps.tx-min(ps.tx, last.tx))/dt)
		}
		last, lastAt = ps, now
		st.RxBytes, st.TxBytes, st.Handshake = ps.rx, ps.tx, ps.handshake
		fresh := !ps.handshake.IsZero() && now.Sub(ps.handshake) < staleAfter
		switch {
		case fresh && st.State != Connected:
			st.State = Connected
			st.Warning = ""
			if st.Since.IsZero() {
				st.Since = now
			}
		case !fresh && st.State == Connected:
			st.State = Reconnecting
			st.Warning = "The server stopped answering. Retrying…"
		case !fresh && st.State == Connecting && now.Sub(start) > slowHandshake:
			st.Warning = "No answer from the server yet. Check that it is online and that UDP traffic to it is not blocked."
		}
		becameConnected := before != Connected && st.State == Connected
		check := becameConnected && !exitChecked && e.settings.CheckExit
		if becameConnected {
			e.proxy.FlushCache()
		}
		changed := before != st.State || becameConnected
		e.mu.Unlock()
		if check {
			exitChecked = true
			go e.checkExit(stop, targetID)
		}
		if changed {
			e.changed()
		} else if e.opts.OnChange != nil {
			e.opts.OnChange() // traffic counters moved
		}
	}
}

func ema(prev, cur float64) float64 { return prev*0.6 + cur*0.4 }

func (e *Engine) checkExit(stop chan struct{}, targetID string) {
	for attempt := 0; attempt < 3; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		info, err := geo.Lookup(ctx, e.opts.HTTPClient)
		cancel()
		select {
		case <-stop:
			return
		default:
		}
		if err == nil {
			e.mu.Lock()
			if e.stop == stop {
				e.status.Exit = info
			}
			e.mu.Unlock()
			e.opts.Logf("engine: exit address %s (%s, %s)", info.IP, info.City, info.CountryCode)
			if e.opts.OnExit != nil {
				e.opts.OnExit(targetID, info)
			}
			e.changed()
			return
		}
		e.opts.Logf("engine: exit location lookup failed: %v", err)
		select {
		case <-stop:
			return
		case <-time.After(5 * time.Second):
		}
	}
}

// RefreshHome looks up the address visible without the VPN.
func (e *Engine) RefreshHome() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	info, err := geo.Lookup(ctx, e.opts.HTTPClient)
	if err != nil {
		return
	}
	e.mu.Lock()
	if e.dev == nil {
		e.home = info
	}
	e.mu.Unlock()
	e.changed()
}

// ClearHome forgets the unprotected location (when the user turns the
// lookup off).
func (e *Engine) ClearHome() {
	e.mu.Lock()
	e.home = nil
	e.mu.Unlock()
}
