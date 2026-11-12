//go:build linux

package netcfg

import (
	"bytes"
	"errors"
	"fmt"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/tun"
)

// Policy routing in the style of wg-quick: everything without the
// WireGuard socket's mark goes to our table, except routes the main table
// knows more specifically (the local network, Docker bridges...).
const (
	rulePrioSuppress = 32761
	rulePrioTunnel   = 32762
	nftTable         = "meridian"
	iptChain         = "MERIDIAN"
	resolvConf       = "/etc/resolv.conf"
)

var runDir = "/run/meridian"

type linux struct {
	logf Logf

	mu       sync.Mutex
	name     string
	plan     Plan
	table    uint32
	dnsMode  string // resolved, resolvconf, file
	fwMode   string // nft, iptables
	stopDNS  chan struct{}
	upCalled bool
}

// New returns the configurator for this platform.
func New(logf Logf) Configurator {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &linux{logf: logf}
}

func run(args ...string) (string, error) {
	return runInput("", args...)
}

func runInput(stdin string, args ...string) (string, error) {
	cmd := exec.Command(args[0], args[1:]...)
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("%s: %v: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func have(bin string) bool {
	_, err := exec.LookPath(bin)
	return err == nil
}

func (l *linux) Up(dev tun.Device, _ conn.Bind, p Plan) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	name, err := dev.Name()
	if err != nil {
		return err
	}
	if !have("ip") {
		return errors.New("the \"ip\" command (iproute2) is required")
	}
	l.name = name
	l.table = p.FwMark
	if l.table == 0 {
		l.table = 51820
	}
	l.upCalled = true
	_ = os.MkdirAll(runDir, 0o755)

	// Without this, reverse-path filtering drops replies to marked packets.
	_ = os.WriteFile("/proc/sys/net/ipv4/conf/all/src_valid_mark", []byte("1"), 0o644)
	_ = os.WriteFile("/proc/sys/net/ipv6/conf/"+name+"/disable_ipv6", []byte("0"), 0o644)

	if err := l.applyAddresses(p, nil); err != nil {
		return err
	}
	if _, err := run("ip", "link", "set", "mtu", fmt.Sprint(p.MTU), "up", "dev", name); err != nil {
		return err
	}
	if err := l.applyRoutes(p, nil); err != nil {
		return err
	}
	if err := l.applyFirewall(p); err != nil {
		return err
	}
	if err := l.applyDNS(p); err != nil {
		return err
	}
	l.plan = p
	return nil
}

func (l *linux) Update(p Plan) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	old := l.plan
	if err := l.applyAddresses(p, &old); err != nil {
		return err
	}
	if p.MTU != old.MTU {
		if _, err := run("ip", "link", "set", "mtu", fmt.Sprint(p.MTU), "dev", l.name); err != nil {
			return err
		}
	}
	if err := l.applyRoutes(p, &old); err != nil {
		return err
	}
	if err := l.applyFirewall(p); err != nil {
		return err
	}
	if !sameAddrs(p.DNS, old.DNS) {
		if err := l.applyDNS(p); err != nil {
			return err
		}
	}
	l.plan = p
	return nil
}

func sameAddrs(a, b []netip.Addr) bool {
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

func (l *linux) applyAddresses(p Plan, old *Plan) error {
	if old != nil {
		for _, a := range old.Addresses {
			fam := "-4"
			if a.Addr().Is6() {
				fam = "-6"
			}
			_, _ = run("ip", fam, "address", "del", a.String(), "dev", l.name)
		}
	}
	for _, a := range p.Addresses {
		fam := "-4"
		if a.Addr().Is6() {
			fam = "-6"
		}
		if _, err := run("ip", fam, "address", "replace", a.String(), "dev", l.name); err != nil {
			if a.Addr().Is6() {
				l.logf("netcfg: IPv6 address not added (IPv6 disabled?): %v", err)
				continue
			}
			return err
		}
	}
	return nil
}

func (l *linux) applyRoutes(p Plan, old *Plan) error {
	table := fmt.Sprint(l.table)
	if old != nil {
		want := map[netip.Prefix]bool{}
		for _, r := range p.Routes {
			want[r] = true
		}
		for _, r := range old.Routes {
			if !want[r] {
				_, _ = run("ip", famFlag(r.Addr()), "route", "del", r.String(), "dev", l.name)
			}
		}
	}
	for _, r := range p.Routes {
		if _, err := run("ip", famFlag(r.Addr()), "route", "replace", r.String(), "dev", l.name); err != nil {
			if r.Addr().Is6() {
				l.logf("netcfg: %v", err)
				continue
			}
			return err
		}
	}
	// When switching location the default routes stay in place, so
	// traffic never falls back to the normal connection mid-switch.
	if old != nil && old.Full4 == p.Full4 && old.Full6 == p.Full6 && old.Block6 == p.Block6 {
		return nil
	}
	if old != nil {
		_, _ = run("ip", "-4", "route", "flush", "table", table)
		_, _ = run("ip", "-6", "route", "flush", "table", table)
	}
	if p.Full4 {
		if _, err := run("ip", "-4", "route", "replace", "0.0.0.0/0", "dev", l.name, "table", table); err != nil {
			return err
		}
	}
	if p.Full6 {
		var err error
		if p.Block6 {
			_, err = run("ip", "-6", "route", "replace", "unreachable", "::/0", "table", table)
		} else {
			_, err = run("ip", "-6", "route", "replace", "::/0", "dev", l.name, "table", table)
		}
		if err != nil {
			l.logf("netcfg: IPv6 default route not added (IPv6 disabled?): %v", err)
		}
	}
	for _, fam := range []string{"-4", "-6"} {
		full := p.Full4
		if fam == "-6" {
			full = p.Full6
		}
		l.delRules(fam)
		if !full {
			continue
		}
		if _, err := run("ip", fam, "rule", "add", "priority", fmt.Sprint(rulePrioSuppress), "table", "main", "suppress_prefixlength", "0"); err != nil && fam == "-4" {
			return err
		}
		if _, err := run("ip", fam, "rule", "add", "priority", fmt.Sprint(rulePrioTunnel), "not", "fwmark", table, "table", table); err != nil && fam == "-4" {
			return err
		}
	}
	return nil
}

func famFlag(a netip.Addr) string {
	if a.Is6() {
		return "-6"
	}
	return "-4"
}

func (l *linux) delRules(fam string) {
	for _, prio := range []int{rulePrioSuppress, rulePrioTunnel} {
		for i := 0; i < 4; i++ {
			if _, err := run("ip", fam, "rule", "del", "priority", fmt.Sprint(prio)); err != nil {
				break
			}
		}
	}
}

// --- firewall: DNS leak guard and kill switch ---

func (l *linux) applyFirewall(p Plan) error {
	if l.fwMode == "" {
		switch {
		case have("nft"):
			l.fwMode = "nft"
		case have("iptables"):
			l.fwMode = "iptables"
		default:
			if p.KillSwitch {
				return errors.New("the kill switch needs nftables (nft) or iptables")
			}
			l.logf("netcfg: no nft or iptables; DNS leak guard disabled")
			return nil
		}
	}
	if l.fwMode == "nft" {
		_, err := runInput(nftRuleset(l.name, l.table, p), "nft", "-f", "-")
		return err
	}
	return l.applyIptables(p)
}

func nftRuleset(ifname string, mark uint32, p Plan) string {
	var b strings.Builder
	// Declaring the table first makes "delete" safe when it does not exist.
	fmt.Fprintf(&b, "table inet %s {}\ndelete table inet %s\n", nftTable, nftTable)
	fmt.Fprintf(&b, "table inet %s {\n chain output {\n  type filter hook output priority 0; policy accept;\n", nftTable)
	fmt.Fprintf(&b, "  oifname \"lo\" accept\n  oifname %q accept\n  meta mark %d accept\n", ifname, mark)
	// DNS may only travel inside the tunnel, even to the local router.
	b.WriteString("  udp dport 53 reject\n  tcp dport 53 reject with tcp reset\n")
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
			fmt.Fprintf(&b, "  ip daddr { %s } accept\n  ip6 daddr { %s } accept\n", strings.Join(v4, ", "), strings.Join(v6, ", "))
		}
		b.WriteString("  udp sport 68 udp dport 67 accept\n  udp sport 546 udp dport 547 accept\n")
		b.WriteString("  icmpv6 type { nd-router-solicit, nd-neighbor-solicit, nd-neighbor-advert } accept\n")
		b.WriteString("  meta l4proto tcp reject with tcp reset\n  reject with icmpx type admin-prohibited\n")
	}
	b.WriteString(" }\n}\n")
	return b.String()
}

func (l *linux) applyIptables(p Plan) error {
	removeIptables()
	for _, bin := range []string{"iptables", "ip6tables"} {
		if !have(bin) {
			continue
		}
		v6 := bin == "ip6tables"
		rules := [][]string{
			{"-o", "lo", "-j", "ACCEPT"},
			{"-o", l.name, "-j", "ACCEPT"},
			{"-m", "mark", "--mark", fmt.Sprint(l.table), "-j", "ACCEPT"},
			{"-p", "udp", "--dport", "53", "-j", "REJECT"},
			{"-p", "tcp", "--dport", "53", "-j", "REJECT", "--reject-with", "tcp-reset"},
		}
		if p.KillSwitch {
			if p.AllowLAN {
				for _, pr := range LANPrefixes {
					if pr.Addr().Is6() == v6 {
						rules = append(rules, []string{"-d", pr.String(), "-j", "ACCEPT"})
					}
				}
			}
			if v6 {
				rules = append(rules, []string{"-p", "udp", "--sport", "546", "--dport", "547", "-j", "ACCEPT"})
				for _, t := range []string{"router-solicitation", "neighbour-solicitation", "neighbour-advertisement"} {
					rules = append(rules, []string{"-p", "ipv6-icmp", "--icmpv6-type", t, "-j", "ACCEPT"})
				}
			} else {
				rules = append(rules, []string{"-p", "udp", "--sport", "68", "--dport", "67", "-j", "ACCEPT"})
			}
			rules = append(rules, []string{"-p", "tcp", "-j", "REJECT", "--reject-with", "tcp-reset"}, []string{"-j", "REJECT"})
		}
		if _, err := run(bin, "-N", iptChain); err != nil {
			return err
		}
		for _, r := range rules {
			if _, err := run(append([]string{bin, "-A", iptChain}, r...)...); err != nil {
				if v6 {
					l.logf("netcfg: %v", err)
					break
				}
				return err
			}
		}
		if _, err := run(bin, "-I", "OUTPUT", "1", "-j", iptChain); err != nil && !v6 {
			return err
		}
	}
	return nil
}

func removeIptables() {
	for _, bin := range []string{"iptables", "ip6tables"} {
		if !have(bin) {
			continue
		}
		for i := 0; i < 4; i++ {
			if _, err := run(bin, "-D", "OUTPUT", "-j", iptChain); err != nil {
				break
			}
		}
		_, _ = run(bin, "-F", iptChain)
		_, _ = run(bin, "-X", iptChain)
	}
}

func removeFirewall() {
	if have("nft") {
		_, _ = runInput(fmt.Sprintf("table inet %s {}\ndelete table inet %s\n", nftTable, nftTable), "nft", "-f", "-")
	}
	removeIptables()
}

// --- DNS ---

func usesResolved() bool {
	if !have("resolvectl") {
		return false
	}
	data, err := os.ReadFile(resolvConf)
	if err != nil {
		return false
	}
	return bytes.Contains(data, []byte("127.0.0.53")) || bytes.Contains(data, []byte("127.0.0.54"))
}

func (l *linux) applyDNS(p Plan) error {
	if len(p.DNS) == 0 {
		return nil
	}
	l.stopDNSWatch()
	var servers []string
	for _, a := range p.DNS {
		servers = append(servers, a.String())
	}
	switch {
	case usesResolved():
		l.dnsMode = "resolved"
		if _, err := run(append([]string{"resolvectl", "dns", l.name}, servers...)...); err != nil {
			return err
		}
		if _, err := run("resolvectl", "domain", l.name, "~."); err != nil {
			return err
		}
		_, _ = run("resolvectl", "default-route", l.name, "true")
		_, _ = run("resolvectl", "llmnr", l.name, "false")
		_, _ = run("resolvectl", "mdns", l.name, "false")
		_, _ = run("resolvectl", "flush-caches")
	case have("resolvconf") && !isResolvedShim():
		l.dnsMode = "resolvconf"
		var b strings.Builder
		for _, s := range servers {
			b.WriteString("nameserver " + s + "\n")
		}
		if _, err := runInput(b.String(), "resolvconf", "-a", l.name, "-m", "0", "-x"); err != nil {
			return err
		}
	default:
		l.dnsMode = "file"
		if err := writeResolvConf(servers); err != nil {
			return err
		}
		l.stopDNS = make(chan struct{})
		go l.watchResolvConf(servers, l.stopDNS)
	}
	l.logf("netcfg: DNS set to %s via %s", strings.Join(servers, ", "), l.dnsMode)
	return nil
}

func isResolvedShim() bool {
	p, err := exec.LookPath("resolvconf")
	if err != nil {
		return false
	}
	target, err := filepath.EvalSymlinks(p)
	return err == nil && strings.Contains(target, "resolvectl")
}

func resolvBackupPath() string { return filepath.Join(runDir, "resolv.conf.backup") }

func writeResolvConf(servers []string) error {
	backup := resolvBackupPath()
	if _, err := os.Stat(backup); errors.Is(err, os.ErrNotExist) {
		// Keep the original (following a symlink, keep the link itself).
		if target, err := os.Readlink(resolvConf); err == nil {
			if err := os.WriteFile(backup, []byte("symlink:"+target), 0o600); err != nil {
				return err
			}
		} else if data, err := os.ReadFile(resolvConf); err == nil {
			if err := os.WriteFile(backup, append([]byte("file:"), data...), 0o600); err != nil {
				return err
			}
		}
	}
	var b strings.Builder
	b.WriteString("# Written by Meridian VPN while connected. The original is restored on disconnect.\n")
	for _, s := range servers {
		b.WriteString("nameserver " + s + "\n")
	}
	b.WriteString("options edns0 trust-ad\n")
	return replaceFile(resolvConf, []byte(b.String()))
}

// replaceFile swaps in new contents atomically, or writes in place when
// the file is a mount point (as in containers and "ip netns exec").
func replaceFile(path string, data []byte) error {
	tmp := path + ".meridian"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return os.WriteFile(path, data, 0o644)
	}
	return nil
}

func restoreResolvConf() {
	data, err := os.ReadFile(resolvBackupPath())
	if err != nil {
		return
	}
	switch {
	case bytes.HasPrefix(data, []byte("symlink:")):
		_ = os.Remove(resolvConf)
		_ = os.Symlink(string(data[len("symlink:"):]), resolvConf)
	case bytes.HasPrefix(data, []byte("file:")):
		_ = replaceFile(resolvConf, data[len("file:"):])
	}
	_ = os.Remove(resolvBackupPath())
}

// watchResolvConf puts our resolver back if a network manager rewrites
// the file while we are connected.
func (l *linux) watchResolvConf(servers []string, stop chan struct{}) {
	t := time.NewTicker(3 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			data, err := os.ReadFile(resolvConf)
			if err == nil && !bytes.Contains(data, []byte("nameserver "+servers[0])) {
				l.logf("netcfg: %s was changed by another program; restoring tunnel DNS", resolvConf)
				_ = os.Remove(resolvBackupPath())
				_ = writeResolvConf(servers)
			}
		}
	}
}

func (l *linux) stopDNSWatch() {
	if l.stopDNS != nil {
		close(l.stopDNS)
		l.stopDNS = nil
	}
}

func (l *linux) revertDNS() {
	l.stopDNSWatch()
	switch l.dnsMode {
	case "resolved":
		_, _ = run("resolvectl", "revert", l.name)
		_, _ = run("resolvectl", "flush-caches")
	case "resolvconf":
		_, _ = run("resolvconf", "-d", l.name, "-f")
	case "file":
		restoreResolvConf()
	}
	l.dnsMode = ""
}

func (l *linux) Down() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !l.upCalled {
		return nil
	}
	l.upCalled = false
	l.revertDNS()
	removeFirewall()
	l.delRules("-4")
	l.delRules("-6")
	table := fmt.Sprint(l.table)
	_, _ = run("ip", "-4", "route", "flush", "table", table)
	_, _ = run("ip", "-6", "route", "flush", "table", table)
	for _, r := range l.plan.Routes {
		_, _ = run("ip", famFlag(r.Addr()), "route", "del", r.String(), "dev", l.name)
	}
	l.plan = Plan{}
	return nil
}

// Cleanup removes anything a crashed previous run left behind.
func Cleanup(logf Logf) {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	l := &linux{logf: logf, table: 51820, name: TunName}
	l.delRules("-4")
	l.delRules("-6")
	_, _ = run("ip", "-4", "route", "flush", "table", "51820")
	_, _ = run("ip", "-6", "route", "flush", "table", "51820")
	removeFirewall()
	if _, err := os.Stat(resolvBackupPath()); err == nil {
		logf("netcfg: restoring %s after an unclean shutdown", resolvConf)
		restoreResolvConf()
	}
}
