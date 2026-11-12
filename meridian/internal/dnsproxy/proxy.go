// Package dnsproxy wraps the tunnel's TUN device and handles DNS inside it.
//
// The operating system is told to use a virtual resolver address
// (VirtualIP). Queries sent there never leave the machine as-is: Meridian
// answers blocked names itself and forwards the rest through the tunnel to
// the chosen upstream, plain or encrypted. Because this happens on the
// packet path, it works with any WireGuard server and cannot leak DNS to the
// local network.
package dnsproxy

import (
	"context"
	"net/netip"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/net/dns/dnsmessage"
	"golang.zx2c4.com/wireguard/tun"

	"meridian/internal/packet"
)

// DefaultVirtualIP is the resolver address handed to the operating system.
// It is a carrier-grade NAT address that never appears on the public
// Internet; Meridian routes it into the tunnel and answers it locally.
var DefaultVirtualIP = netip.MustParseAddr("100.100.53.53")

// Matcher decides whether a name is blocked.
type Matcher interface {
	Match(name string) (blocked bool, list string)
}

// Config controls the proxy and can be swapped at any time.
type Config struct {
	VirtualIP    netip.Addr
	Blocking     bool       // apply the blocklists
	Upstream     Upstream   // where allowed queries go
	TCPFallback  netip.Addr // IPv4 server for DNS-over-TCP retries
	InterceptAll bool       // also filter DNS sent to other servers
	BlockDoT     bool       // drop DNS-over-TLS (port 853) so apps fall back to filtered DNS
	MaxUDP       int        // largest DNS payload that fits the tunnel MTU
	NoAAAA       bool       // the location has no IPv6: answer AAAA queries with no records
}

// LogEntry is one DNS query in the activity log.
type LogEntry struct {
	Time     time.Time `json:"time"`
	Domain   string    `json:"domain"`
	Type     string    `json:"type"`
	Blocked  bool      `json:"blocked"`
	List     string    `json:"list,omitempty"`
	Via      string    `json:"via,omitempty"` // "cname" when blocked through a CNAME
	Answer   string    `json:"answer,omitempty"`
	Cached   bool      `json:"cached,omitempty"`
	Millis   int       `json:"ms"`
	Failed   bool      `json:"failed,omitempty"`
	Direct   string    `json:"direct,omitempty"` // server the app queried directly
	ClientIP string    `json:"-"`
}

// Stats are cumulative counters since the proxy started.
type Stats struct {
	Queries uint64 `json:"queries"`
	Blocked uint64 `json:"blocked"`
	Cached  uint64 `json:"cached"`
	Failed  uint64 `json:"failed"`
}

// DomainCount is an entry in the top-blocked list.
type DomainCount struct {
	Domain string `json:"domain"`
	Count  int    `json:"count"`
}

const (
	logSize        = 400
	maxTopDomains  = 4000
	maxConcurrent  = 256
	queryTimeout   = 6 * time.Second
	tcpNATIdle     = 2 * time.Minute
	firefoxCanary  = "use-application-dns.net"
	injectQueueLen = 512
)

// Proxy is a tun.Device that filters DNS.
type Proxy struct {
	tun.Device
	matcher  Matcher
	cfg      atomic.Pointer[Config]
	headroom int

	inject chan []byte
	done   chan struct{}
	once   sync.Once
	sem    chan struct{}

	queries, blocked, cached, failed atomic.Uint64

	mu        sync.Mutex
	log       []LogEntry
	logNext   int
	logKeep   bool
	top       map[string]int
	listeners map[chan LogEntry]struct{}

	cache *cache

	natMu     sync.Mutex
	nat       map[uint16]natEntry // client TCP port -> entry
	natActive atomic.Bool
}

type natEntry struct {
	server netip.Addr
	seen   time.Time
}

// New wraps dev. headroom is the number of spare bytes the device expects
// in front of each packet written to it (wireguard-go uses 16).
func New(dev tun.Device, m Matcher, headroom int) *Proxy {
	p := &Proxy{
		Device:    dev,
		matcher:   m,
		headroom:  headroom,
		inject:    make(chan []byte, injectQueueLen),
		done:      make(chan struct{}),
		sem:       make(chan struct{}, maxConcurrent),
		log:       make([]LogEntry, 0, logSize),
		logKeep:   true,
		top:       map[string]int{},
		listeners: map[chan LogEntry]struct{}{},
		cache:     newCache(4096),
		nat:       map[uint16]natEntry{},
	}
	p.cfg.Store(&Config{VirtualIP: DefaultVirtualIP, MaxUDP: 1232})
	go p.injector()
	go p.janitor()
	return p
}

// SetConfig replaces the configuration. The DNS cache is cleared when the
// upstream changes, because answers (CDN addresses especially) depend on
// where the query exits.
func (p *Proxy) SetConfig(c Config) {
	if !c.VirtualIP.IsValid() {
		c.VirtualIP = DefaultVirtualIP
	}
	if c.MaxUDP <= 0 {
		c.MaxUDP = 1232
	}
	old := p.cfg.Load()
	if old == nil || old.Upstream != c.Upstream {
		p.cache.clear()
	}
	p.cfg.Store(&c)
}

// Config returns the current configuration.
func (p *Proxy) Config() Config { return *p.cfg.Load() }

// FlushCache drops all cached answers.
func (p *Proxy) FlushCache() { p.cache.clear() }

// SetLogging turns the in-memory query log on or off.
func (p *Proxy) SetLogging(on bool) {
	p.mu.Lock()
	p.logKeep = on
	if !on {
		p.log = p.log[:0]
		p.logNext = 0
	}
	p.mu.Unlock()
}

// Close stops the proxy and the wrapped device.
func (p *Proxy) Close() error {
	p.once.Do(func() { close(p.done) })
	return p.Device.Close()
}

// Read is called by wireguard-go for packets leaving the computer.
func (p *Proxy) Read(bufs [][]byte, sizes []int, offset int) (int, error) {
	n, err := p.Device.Read(bufs, sizes, offset)
	cfg := p.cfg.Load()
	for i := 0; i < n; i++ {
		if sizes[i] <= 0 {
			continue
		}
		if p.outbound(bufs[i][offset:offset+sizes[i]], cfg) {
			sizes[i] = 0 // consumed: wireguard-go skips empty slots
		}
	}
	return n, err
}

// outbound inspects a packet heading into the tunnel and reports whether it
// was consumed.
func (p *Proxy) outbound(pkt []byte, cfg *Config) bool {
	// Cheap pre-filter: only UDP or TCP packets are of interest.
	if len(pkt) < 20 {
		return false
	}
	switch pkt[0] >> 4 {
	case 4:
		if pkt[9] != packet.ProtoUDP && pkt[9] != packet.ProtoTCP {
			return false
		}
	case 6:
		if pkt[6] != packet.ProtoUDP && pkt[6] != packet.ProtoTCP {
			return false
		}
	default:
		return false
	}
	info, ok := packet.Parse(pkt)
	if !ok || info.Fragment {
		return false
	}
	toVirtual := info.Dst == cfg.VirtualIP
	switch {
	case info.Proto == packet.ProtoUDP && info.DstPort == 53 && toVirtual:
		q := append([]byte(nil), info.Payload...)
		client := netip.AddrPortFrom(info.Src, info.SrcPort)
		select {
		case p.sem <- struct{}{}:
			go func() {
				defer func() { <-p.sem }()
				p.serve(q, client, cfg)
			}()
		default: // overloaded: drop, the client will retry
		}
		return true

	case info.Proto == packet.ProtoTCP && info.DstPort == 53 && toVirtual:
		// DNS over TCP (after a truncated answer) is passed to a real
		// server by rewriting the address; blocking already happened on
		// the UDP query.
		if !cfg.TCPFallback.Is4() || info.Version != 4 {
			return true
		}
		p.natMu.Lock()
		p.nat[info.SrcPort] = natEntry{server: cfg.TCPFallback, seen: time.Now()}
		p.natMu.Unlock()
		p.natActive.Store(true)
		packet.RewriteIPv4(pkt, netip.Addr{}, cfg.TCPFallback)
		return false

	case info.Proto == packet.ProtoUDP && info.DstPort == 53 && cfg.InterceptAll:
		return p.direct(info, cfg)

	case info.Proto == packet.ProtoTCP && info.DstPort == 853 && cfg.BlockDoT:
		return true
	}
	return false
}

// direct filters a query an app sent straight to some other DNS server.
func (p *Proxy) direct(info packet.Info, cfg *Config) bool {
	q, err := parseQuery(info.Payload)
	if err != nil {
		return false
	}
	p.queries.Add(1)
	entry := LogEntry{Time: time.Now(), Domain: q.Name, Type: typeName(q.Type), Direct: info.Dst.String()}
	if cfg.Blocking {
		if blocked, list, nx := p.decide(q.Name); blocked {
			p.blocked.Add(1)
			entry.Blocked, entry.List = true, list
			resp := blockedResponse(q, nx)
			pkt := packet.BuildUDP(netip.AddrPortFrom(info.Dst, 53), netip.AddrPortFrom(info.Src, info.SrcPort), resp, p.headroom)
			p.send(pkt)
			p.record(entry)
			return true
		}
	}
	p.record(entry)
	return false
}

// decide applies the blocklist. nx asks for NXDOMAIN instead of 0.0.0.0.
func (p *Proxy) decide(name string) (blocked bool, list string, nx bool) {
	if name == firefoxCanary {
		// Tells Firefox not to switch on its own DNS-over-HTTPS, which
		// would bypass filtering.
		return true, "Firefox DoH canary", true
	}
	if p.matcher == nil {
		return false, "", false
	}
	b, l := p.matcher.Match(name)
	return b, l, false
}

// serve answers one query sent to the virtual resolver.
func (p *Proxy) serve(query []byte, client netip.AddrPort, cfg *Config) {
	start := time.Now()
	q, err := parseQuery(query)
	if err != nil {
		return
	}
	p.queries.Add(1)
	entry := LogEntry{Time: start, Domain: q.Name, Type: typeName(q.Type), ClientIP: client.Addr().String()}
	resp := p.resolve(q, query, cfg, &entry)
	entry.Millis = int(time.Since(start).Milliseconds())
	p.record(entry)
	if resp == nil {
		return
	}
	limit := min(q.UDPSize, cfg.MaxUDP)
	if limit < 512 {
		limit = 512
	}
	if len(resp) > limit {
		resp = truncated(q)
	}
	pkt := packet.BuildUDP(netip.AddrPortFrom(cfg.VirtualIP, 53), client, resp, p.headroom)
	p.send(pkt)
}

func (p *Proxy) resolve(q question, query []byte, cfg *Config, entry *LogEntry) []byte {
	if cfg.Blocking {
		if blocked, list, nx := p.decide(q.Name); blocked {
			p.blocked.Add(1)
			entry.Blocked, entry.List = true, list
			return blockedResponse(q, nx)
		}
	}
	if cfg.NoAAAA && q.Type == dnsmessage.TypeAAAA {
		// Without IPv6 in the tunnel, IPv6 answers would only make apps
		// wait for connections that cannot work.
		return errorResponse(q, dnsmessage.RCodeSuccess)
	}
	if q.Class == dnsmessage.ClassINET && (q.Type == dnsmessage.TypePTR) && isPrivateReverse(q.Name) {
		// Reverse lookups of local addresses would only leak them.
		return errorResponse(q, dnsmessage.RCodeNameError)
	}
	key := cacheKey(q)
	if resp, ok := p.cache.get(key); ok {
		p.cached.Add(1)
		entry.Cached = true
		setID(resp, q.ID)
		if ai, err := inspectResponse(resp); err == nil && len(ai.Addrs) > 0 {
			entry.Answer = ai.Addrs[0].String()
		}
		return resp
	}
	if cfg.Upstream == nil {
		entry.Failed = true
		p.failed.Add(1)
		return errorResponse(q, dnsmessage.RCodeServerFailure)
	}
	ctx, cancel := context.WithTimeout(context.Background(), queryTimeout)
	defer cancel()
	resp, err := cfg.Upstream.Exchange(ctx, query)
	if err != nil {
		entry.Failed = true
		p.failed.Add(1)
		return nil // let the client time out and retry
	}
	ai, err := inspectResponse(resp)
	if err != nil {
		entry.Failed = true
		p.failed.Add(1)
		return errorResponse(q, dnsmessage.RCodeServerFailure)
	}
	if cfg.Blocking {
		// CNAME uncloaking: trackers hidden behind a first-party name.
		for _, c := range ai.CNAMEs {
			if blocked, list, _ := p.decide(c); blocked {
				p.blocked.Add(1)
				entry.Blocked, entry.List, entry.Via = true, list, "cname "+c
				return blockedResponse(q, false)
			}
		}
	}
	if len(ai.Addrs) > 0 {
		entry.Answer = ai.Addrs[0].String()
	}
	if ttl, ok := cacheTTL(ai); ok && !ai.Trunc {
		p.cache.put(key, resp, ttl)
	}
	return resp
}

func isPrivateReverse(name string) bool {
	if strings.HasSuffix(name, ".ip6.arpa") {
		return strings.HasSuffix(name, ".d.f.ip6.arpa") || strings.HasSuffix(name, ".8.e.f.ip6.arpa")
	}
	if !strings.HasSuffix(name, ".in-addr.arpa") {
		return false
	}
	parts := strings.Split(strings.TrimSuffix(name, ".in-addr.arpa"), ".")
	if len(parts) < 2 {
		return false
	}
	a, b := parts[len(parts)-1], parts[len(parts)-2]
	switch a {
	case "10", "127":
		return true
	case "192":
		return b == "168"
	case "169":
		return b == "254"
	case "172":
		switch b {
		case "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31":
			return true
		}
	}
	return false
}

func (p *Proxy) send(pkt []byte) {
	select {
	case p.inject <- pkt:
	case <-p.done:
	default: // queue full: drop
	}
}

func (p *Proxy) injector() {
	for {
		select {
		case <-p.done:
			return
		case pkt := <-p.inject:
			_, _ = p.Device.Write([][]byte{pkt}, p.headroom)
		}
	}
}

// Write is called by wireguard-go for packets arriving from the tunnel.
func (p *Proxy) Write(bufs [][]byte, offset int) (int, error) {
	if p.natActive.Load() {
		cfg := p.cfg.Load()
		for _, b := range bufs {
			pkt := b[offset:]
			if len(pkt) < 40 || pkt[0]>>4 != 4 || pkt[9] != packet.ProtoTCP {
				continue
			}
			info, ok := packet.Parse(pkt)
			if !ok || info.SrcPort != 53 {
				continue
			}
			p.natMu.Lock()
			e, ok := p.nat[info.DstPort]
			if ok && e.server == info.Src {
				e.seen = time.Now()
				p.nat[info.DstPort] = e
			}
			p.natMu.Unlock()
			if ok && e.server == info.Src {
				packet.RewriteIPv4(pkt, cfg.VirtualIP, netip.Addr{})
			}
		}
	}
	return p.Device.Write(bufs, offset)
}

func (p *Proxy) janitor() {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-p.done:
			return
		case <-t.C:
			p.natMu.Lock()
			for port, e := range p.nat {
				if time.Since(e.seen) > tcpNATIdle {
					delete(p.nat, port)
				}
			}
			p.natActive.Store(len(p.nat) > 0)
			p.natMu.Unlock()
			p.cache.expire()
		}
	}
}

func (p *Proxy) record(e LogEntry) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e.Blocked {
		if _, ok := p.top[e.Domain]; ok || len(p.top) < maxTopDomains {
			p.top[e.Domain]++
		}
	}
	if !p.logKeep {
		return
	}
	if len(p.log) < logSize {
		p.log = append(p.log, e)
	} else {
		p.log[p.logNext] = e
	}
	p.logNext = (p.logNext + 1) % logSize
	for ch := range p.listeners {
		select {
		case ch <- e:
		default:
		}
	}
}

// Stats returns counters since the proxy started.
func (p *Proxy) Stats() Stats {
	return Stats{
		Queries: p.queries.Load(),
		Blocked: p.blocked.Load(),
		Cached:  p.cached.Load(),
		Failed:  p.failed.Load(),
	}
}

// Recent returns the query log, newest first.
func (p *Proxy) Recent(limit int) []LogEntry {
	p.mu.Lock()
	defer p.mu.Unlock()
	n := len(p.log)
	if limit <= 0 || limit > n {
		limit = n
	}
	out := make([]LogEntry, 0, limit)
	for i := 0; i < limit; i++ {
		idx := (p.logNext - 1 - i + n*2) % n
		if n < logSize {
			idx = n - 1 - i
		}
		out = append(out, p.log[idx])
	}
	return out
}

// TopBlocked returns the most blocked domains.
func (p *Proxy) TopBlocked(limit int) []DomainCount {
	p.mu.Lock()
	out := make([]DomainCount, 0, len(p.top))
	for d, c := range p.top {
		out = append(out, DomainCount{d, c})
	}
	p.mu.Unlock()
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Domain < out[j].Domain
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

// Subscribe returns a channel that receives new log entries.
func (p *Proxy) Subscribe() (<-chan LogEntry, func()) {
	ch := make(chan LogEntry, 64)
	p.mu.Lock()
	p.listeners[ch] = struct{}{}
	p.mu.Unlock()
	return ch, func() {
		p.mu.Lock()
		delete(p.listeners, ch)
		p.mu.Unlock()
	}
}
