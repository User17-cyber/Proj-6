//go:build darwin

package netcfg

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/tun"
)

// The macOS implementation follows wg-quick's darwin script: addresses
// with ifconfig, the default route split into two halves on the utun
// interface, a host route that keeps each VPN server reachable through the
// real gateway, DNS set on every network service with networksetup, and
// a pf anchor (inside Apple's "com.apple/*" anchor point, which the stock
// /etc/pf.conf evaluates) for the DNS leak guard and kill switch.

const (
	pfAnchor   = "com.apple/250.MeridianVPN"
	darwinRun  = "/var/run/meridian"
	backupFile = "netcfg-backup.json"
)

type darwin struct {
	logf Logf

	mu       sync.Mutex
	name     string
	plan     Plan
	up       bool
	gw4      string // gateway (or "iface:<name>") the endpoint routes use
	gw6      string
	epRoutes []netip.AddrPort
	pfToken  string
	stop     chan struct{}
}

type darwinBackup struct {
	DNS     map[string][]string `json:"dns"`    // service -> servers ("Empty" when none)
	Search  map[string][]string `json:"search"` // service -> search domains
	Routes  []string            `json:"routes"` // endpoint host routes we added
	PfToken string              `json:"pfToken"`
	SavedAt time.Time           `json:"savedAt"`
}

// New returns the configurator for this platform.
func New(logf Logf) Configurator {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &darwin{logf: logf}
}

func cmd(args ...string) (string, error) {
	out, err := exec.Command(args[0], args[1:]...).CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("%s: %v: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func cmdInput(stdin string, args ...string) (string, error) {
	c := exec.Command(args[0], args[1:]...)
	c.Stdin = strings.NewReader(stdin)
	out, err := c.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("%s: %v: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func (d *darwin) Up(dev tun.Device, _ conn.Bind, p Plan) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	name, err := dev.Name()
	if err != nil {
		return err
	}
	d.name = name
	d.up = true
	_ = os.MkdirAll(darwinRun, 0o755)
	if err := d.applyAddresses(p, nil); err != nil {
		return err
	}
	if _, err := cmd("ifconfig", name, "mtu", fmt.Sprint(p.MTU), "up"); err != nil {
		return err
	}
	if err := d.applyEndpointRoutes(p.Endpoints); err != nil {
		return err
	}
	if err := d.applyRoutes(p, nil); err != nil {
		return err
	}
	if err := d.applyFirewall(p); err != nil {
		return err
	}
	if err := d.applyDNS(p); err != nil {
		return err
	}
	d.plan = p
	d.stop = make(chan struct{})
	go d.watchNetwork(d.stop)
	return nil
}

func (d *darwin) Update(p Plan) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	old := d.plan
	if err := d.applyAddresses(p, &old); err != nil {
		return err
	}
	if p.MTU != old.MTU {
		_, _ = cmd("ifconfig", d.name, "mtu", fmt.Sprint(p.MTU))
	}
	if err := d.applyEndpointRoutes(p.Endpoints); err != nil {
		return err
	}
	if err := d.applyRoutes(p, &old); err != nil {
		return err
	}
	if err := d.applyFirewall(p); err != nil {
		return err
	}
	d.plan = p
	return nil
}

func (d *darwin) applyAddresses(p Plan, old *Plan) error {
	addrs := append([]netip.Prefix(nil), p.Addresses...)
	if p.Block6 {
		addrs = append(addrs, DummyIPv6)
	}
	if old != nil {
		olds := append([]netip.Prefix(nil), old.Addresses...)
		if old.Block6 {
			olds = append(olds, DummyIPv6)
		}
		for _, a := range olds {
			if a.Addr().Is4() {
				_, _ = cmd("ifconfig", d.name, "inet", a.Addr().String(), "-alias")
			} else {
				_, _ = cmd("ifconfig", d.name, "inet6", a.Addr().String(), "-alias")
			}
		}
	}
	for _, a := range addrs {
		var err error
		if a.Addr().Is4() {
			_, err = cmd("ifconfig", d.name, "inet", a.String(), a.Addr().String(), "alias")
		} else {
			_, err = cmd("ifconfig", d.name, "inet6", a.String(), "alias")
		}
		if err != nil {
			if a.Addr().Is6() {
				d.logf("netcfg: %v", err)
				continue
			}
			return err
		}
	}
	return nil
}

func halves(full4, full6 bool) []string {
	var out []string
	if full4 {
		out = append(out, "-inet 0.0.0.0/1", "-inet 128.0.0.0/1")
	}
	if full6 {
		out = append(out, "-inet6 ::/1", "-inet6 8000::/1")
	}
	return out
}

func (d *darwin) applyRoutes(p Plan, old *Plan) error {
	route := func(op, fam, dst string) error {
		_, err := cmd("route", "-q", "-n", op, fam, dst, "-interface", d.name)
		return err
	}
	// The two default-route halves: replaced only if the families change,
	// so a location switch never opens a gap.
	if old == nil || old.Full4 != p.Full4 || old.Full6 != p.Full6 {
		if old != nil {
			for _, h := range halves(old.Full4, old.Full6) {
				f := strings.Fields(h)
				_ = route("delete", f[0], f[1])
			}
		}
		for _, h := range halves(p.Full4, p.Full6) {
			f := strings.Fields(h)
			if err := route("add", f[0], f[1]); err != nil {
				if f[0] == "-inet6" {
					d.logf("netcfg: %v", err)
					continue
				}
				return err
			}
		}
	}
	want := map[netip.Prefix]bool{}
	for _, r := range p.Routes {
		want[r] = true
	}
	had := map[netip.Prefix]bool{}
	if old != nil {
		for _, r := range old.Routes {
			had[r] = true
			if !want[r] {
				_ = route("delete", famArg(r.Addr()), r.String())
			}
		}
	}
	for _, r := range p.Routes {
		if had[r] {
			continue
		}
		if err := route("add", famArg(r.Addr()), r.String()); err != nil && r.Addr().Is4() {
			return err
		}
	}
	return nil
}

func famArg(a netip.Addr) string {
	if a.Is6() {
		return "-inet6"
	}
	return "-inet"
}

// defaultGateway finds the system's default gateway that is not ours. It
// returns the gateway address, or "iface:<name>" for interface routes.
func (d *darwin) defaultGateway(inet6 bool) string {
	fam := "inet"
	if inet6 {
		fam = "inet6"
	}
	out, err := cmd("netstat", "-nr", "-f", fam)
	if err != nil {
		return ""
	}
	sc := bufio.NewScanner(strings.NewReader(out))
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) < 4 || f[0] != "default" {
			continue
		}
		// Columns: Destination Gateway Flags Netif [Expire]
		iface := f[3]
		if strings.HasPrefix(iface, "utun") || strings.HasPrefix(iface, "ipsec") {
			continue // ours, or another VPN's
		}
		gw := f[1]
		if strings.HasPrefix(gw, "link#") {
			return "iface:" + iface
		}
		if i := strings.IndexByte(gw, '%'); i >= 0 {
			gw = gw[:i] + "%" + iface
		}
		return gw
	}
	return ""
}

// applyEndpointRoutes routes each VPN server through the real gateway, so
// the encrypted traffic does not loop into the tunnel.
func (d *darwin) applyEndpointRoutes(eps []netip.AddrPort) error {
	d.removeEndpointRoutes()
	gw4, gw6 := d.defaultGateway(false), d.defaultGateway(true)
	d.gw4, d.gw6 = gw4, gw6
	for _, ep := range eps {
		gw := gw4
		if ep.Addr().Is6() {
			gw = gw6
		}
		if gw == "" {
			d.logf("netcfg: no default gateway for %s yet; the server route will be added when the network returns", ep.Addr())
			continue
		}
		args := []string{"route", "-q", "-n", "add", famArg(ep.Addr()), ep.Addr().String()}
		if strings.HasPrefix(gw, "iface:") {
			args = append(args, "-interface", strings.TrimPrefix(gw, "iface:"))
		} else {
			args = append(args, "-gateway", gw)
		}
		if _, err := cmd(args...); err != nil {
			return err
		}
		d.epRoutes = append(d.epRoutes, ep)
	}
	d.saveBackup(nil)
	return nil
}

func (d *darwin) removeEndpointRoutes() {
	for _, ep := range d.epRoutes {
		_, _ = cmd("route", "-q", "-n", "delete", famArg(ep.Addr()), ep.Addr().String())
	}
	d.epRoutes = nil
}

// watchNetwork re-points the server routes when the default gateway
// changes (switching Wi-Fi networks, for example).
func (d *darwin) watchNetwork(stop chan struct{}) {
	t := time.NewTicker(4 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
		}
		d.mu.Lock()
		if d.up && (d.defaultGateway(false) != d.gw4 || d.defaultGateway(true) != d.gw6) {
			d.logf("netcfg: network changed; updating the route to the VPN server")
			if err := d.applyEndpointRoutes(d.plan.Endpoints); err != nil {
				d.logf("netcfg: %v", err)
			}
			if d.plan.KillSwitch {
				_ = d.applyFirewall(d.plan)
			}
		}
		d.mu.Unlock()
	}
}

// --- pf: DNS leak guard and kill switch ---

func (d *darwin) pfRules(p Plan) string {
	var b strings.Builder
	fmt.Fprintf(&b, "pass out quick on lo0 all flags any keep state\n")
	fmt.Fprintf(&b, "pass out quick on %s all flags any keep state\n", d.name)
	for _, ep := range p.Endpoints {
		fam := "inet"
		if ep.Addr().Is6() {
			fam = "inet6"
		}
		fmt.Fprintf(&b, "pass out quick %s proto udp from any to %s port %d keep state\n", fam, ep.Addr(), ep.Port())
	}
	// DNS may only travel inside the tunnel.
	b.WriteString("block return out quick proto { tcp, udp } from any to any port 53\n")
	if p.KillSwitch {
		if p.AllowLAN {
			var v4, v6 []string
			for _, pr := range LANPrefixes {
				if pr.Addr().Is4() {
					v4 = append(v4, pr.String())
				} else {
					v6 = append(v6, pr.String())
				}
			}
			fmt.Fprintf(&b, "pass out quick inet from any to { %s } flags any keep state\n", strings.Join(v4, ", "))
			fmt.Fprintf(&b, "pass out quick inet6 from any to { %s } flags any keep state\n", strings.Join(v6, ", "))
		}
		b.WriteString("pass out quick inet proto udp from any port 68 to any port 67 keep state\n")
		b.WriteString("pass out quick inet6 proto udp from any port 546 to any port 547 keep state\n")
		b.WriteString("pass out quick inet6 proto icmp6 all icmp6-type { routersol, neighbrsol, neighbradv } keep state\n")
		b.WriteString("block return out quick all\n")
	}
	return b.String()
}

var reToken = regexp.MustCompile(`Token\s*:\s*(\d+)`)

func (d *darwin) applyFirewall(p Plan) error {
	if _, err := cmdInput(d.pfRules(p), "pfctl", "-q", "-a", pfAnchor, "-f", "-"); err != nil {
		return fmt.Errorf("loading the firewall rules: %w", err)
	}
	if d.pfToken == "" {
		out, err := cmd("pfctl", "-E")
		if err != nil {
			return fmt.Errorf("enabling the firewall: %w", err)
		}
		if m := reToken.FindStringSubmatch(out); m != nil {
			d.pfToken = m[1]
		}
		d.saveBackup(nil)
	}
	return nil
}

func (d *darwin) removeFirewall() {
	_, _ = cmd("pfctl", "-q", "-a", pfAnchor, "-F", "all")
	if d.pfToken != "" {
		_, _ = cmd("pfctl", "-q", "-X", d.pfToken)
		d.pfToken = ""
	}
}

// --- DNS ---

func networkServices() []string {
	out, err := cmd("networksetup", "-listallnetworkservices")
	if err != nil {
		return nil
	}
	var svcs []string
	for i, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if i == 0 || line == "" || strings.HasPrefix(line, "*") { // header and disabled services
			continue
		}
		svcs = append(svcs, line)
	}
	return svcs
}

func readList(args ...string) []string {
	out, err := cmd(args...)
	if err != nil || strings.Contains(out, "aren't any") || strings.Contains(out, "There aren") {
		return []string{"Empty"}
	}
	var v []string
	for _, f := range strings.Fields(out) {
		v = append(v, f)
	}
	if len(v) == 0 {
		return []string{"Empty"}
	}
	return v
}

func (d *darwin) applyDNS(p Plan) error {
	if len(p.DNS) == 0 {
		return nil
	}
	b := d.loadBackup()
	if b.DNS == nil {
		b.DNS, b.Search = map[string][]string{}, map[string][]string{}
		for _, svc := range networkServices() {
			b.DNS[svc] = readList("networksetup", "-getdnsservers", svc)
			b.Search[svc] = readList("networksetup", "-getsearchdomains", svc)
		}
		d.saveBackup(&b)
	}
	var servers []string
	for _, a := range p.DNS {
		servers = append(servers, a.String())
	}
	for _, svc := range networkServices() {
		if _, err := cmd(append([]string{"networksetup", "-setdnsservers", svc}, servers...)...); err != nil {
			d.logf("netcfg: %v", err)
		}
		_, _ = cmd("networksetup", "-setsearchdomains", svc, "Empty")
	}
	flushDarwinDNS()
	return nil
}

func flushDarwinDNS() {
	_, _ = cmd("dscacheutil", "-flushcache")
	_, _ = cmd("killall", "-HUP", "mDNSResponder")
}

func restoreDNS(b darwinBackup, logf Logf) {
	for svc, servers := range b.DNS {
		if _, err := cmd(append([]string{"networksetup", "-setdnsservers", svc}, servers...)...); err != nil {
			logf("netcfg: restoring DNS for %s: %v", svc, err)
		}
	}
	for svc, domains := range b.Search {
		_, _ = cmd(append([]string{"networksetup", "-setsearchdomains", svc}, domains...)...)
	}
	flushDarwinDNS()
}

// --- crash-safe state ---

func backupPath() string { return filepath.Join(darwinRun, backupFile) }

func (d *darwin) loadBackup() darwinBackup {
	var b darwinBackup
	if data, err := os.ReadFile(backupPath()); err == nil {
		_ = json.Unmarshal(data, &b)
	}
	return b
}

func (d *darwin) saveBackup(b *darwinBackup) {
	cur := d.loadBackup()
	if b != nil {
		cur.DNS, cur.Search = b.DNS, b.Search
	}
	cur.Routes = nil
	for _, ep := range d.epRoutes {
		cur.Routes = append(cur.Routes, ep.Addr().String())
	}
	cur.PfToken = d.pfToken
	cur.SavedAt = time.Now()
	data, _ := json.Marshal(cur)
	_ = os.MkdirAll(darwinRun, 0o755)
	_ = os.WriteFile(backupPath(), data, 0o600)
}

func (d *darwin) Down() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if !d.up {
		return nil
	}
	d.up = false
	if d.stop != nil {
		close(d.stop)
		d.stop = nil
	}
	if b := d.loadBackup(); b.DNS != nil {
		restoreDNS(b, d.logf)
	}
	d.removeFirewall()
	d.removeEndpointRoutes()
	for _, r := range d.plan.Routes {
		_, _ = cmd("route", "-q", "-n", "delete", famArg(r.Addr()), r.String(), "-interface", d.name)
	}
	_ = os.Remove(backupPath())
	d.plan = Plan{}
	return nil
}

// Cleanup undoes what a crashed previous run left behind.
func Cleanup(logf Logf) {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	data, err := os.ReadFile(backupPath())
	if err != nil {
		_, _ = cmd("pfctl", "-q", "-a", pfAnchor, "-F", "all")
		return
	}
	var b darwinBackup
	if json.Unmarshal(data, &b) != nil {
		_ = os.Remove(backupPath())
		return
	}
	logf("netcfg: restoring network settings after an unclean shutdown")
	if b.DNS != nil {
		restoreDNS(b, logf)
	}
	for _, r := range b.Routes {
		if a, err := netip.ParseAddr(r); err == nil {
			_, _ = cmd("route", "-q", "-n", "delete", famArg(a), r)
		}
	}
	_, _ = cmd("pfctl", "-q", "-a", pfAnchor, "-F", "all")
	if b.PfToken != "" {
		_, _ = cmd("pfctl", "-q", "-X", b.PfToken)
	}
	_ = os.Remove(backupPath())
}
