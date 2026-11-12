package dnsproxy

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/binary"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/net/dns/dnsmessage"
	"golang.zx2c4.com/wireguard/tun"

	"meridian/internal/packet"
)

// fakeTun stands in for the operating system side of the TUN device.
type fakeTun struct {
	out     chan []byte // packets the OS sends into the tunnel
	mu      sync.Mutex
	written [][]byte // packets delivered back to the OS
	got     chan []byte
	events  chan tun.Event
}

func newFakeTun() *fakeTun {
	return &fakeTun{out: make(chan []byte, 16), got: make(chan []byte, 16), events: make(chan tun.Event)}
}

func (f *fakeTun) File() *os.File { return nil }
func (f *fakeTun) Read(bufs [][]byte, sizes []int, offset int) (int, error) {
	pkt, ok := <-f.out
	if !ok {
		return 0, os.ErrClosed
	}
	sizes[0] = copy(bufs[0][offset:], pkt)
	return 1, nil
}
func (f *fakeTun) Write(bufs [][]byte, offset int) (int, error) {
	for _, b := range bufs {
		c := append([]byte(nil), b[offset:]...)
		f.mu.Lock()
		f.written = append(f.written, c)
		f.mu.Unlock()
		f.got <- c
	}
	return len(bufs), nil
}
func (f *fakeTun) MTU() (int, error)        { return 1420, nil }
func (f *fakeTun) Name() (string, error)    { return "fake0", nil }
func (f *fakeTun) Events() <-chan tun.Event { return f.events }
func (f *fakeTun) Close() error             { return nil }
func (f *fakeTun) BatchSize() int           { return 1 }

type mapMatcher map[string]bool

func (m mapMatcher) Match(name string) (bool, string) {
	for d := name; d != ""; {
		if m[d] {
			return true, "test list"
		}
		i := strings.IndexByte(d, '.')
		if i < 0 {
			break
		}
		d = d[i+1:]
	}
	return false, ""
}

// fakeUpstream answers from a table and counts calls.
type fakeUpstream struct {
	mu    sync.Mutex
	calls int
	fn    func(q question) []byte
}

func (f *fakeUpstream) String() string { return "fake" }
func (f *fakeUpstream) Exchange(ctx context.Context, query []byte) ([]byte, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()
	q, err := parseQuery(query)
	if err != nil {
		return nil, err
	}
	return f.fn(q), nil
}

func buildQuery(t *testing.T, id uint16, name string, typ dnsmessage.Type, edns bool) []byte {
	t.Helper()
	b := dnsmessage.NewBuilder(nil, dnsmessage.Header{ID: id, RecursionDesired: true})
	b.StartQuestions()
	b.Question(dnsmessage.Question{Name: dnsmessage.MustNewName(name), Type: typ, Class: dnsmessage.ClassINET})
	if edns {
		b.StartAdditionals()
		var rh dnsmessage.ResourceHeader
		rh.SetEDNS0(1232, dnsmessage.RCodeSuccess, false)
		b.OPTResource(rh, dnsmessage.OPTResource{})
	}
	out, err := b.Finish()
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func answer(q question, ttl uint32, cname string, ips ...string) []byte {
	b := dnsmessage.NewBuilder(nil, dnsmessage.Header{ID: q.ID, Response: true, RecursionAvailable: true, RecursionDesired: true})
	b.EnableCompression()
	b.StartQuestions()
	b.Question(q.Raw)
	b.StartAnswers()
	owner := q.Raw.Name
	if cname != "" {
		target := dnsmessage.MustNewName(cname + ".")
		b.CNAMEResource(dnsmessage.ResourceHeader{Name: owner, Class: dnsmessage.ClassINET, TTL: ttl}, dnsmessage.CNAMEResource{CNAME: target})
		owner = target
	}
	for _, s := range ips {
		a := netip.MustParseAddr(s)
		rh := dnsmessage.ResourceHeader{Name: owner, Class: dnsmessage.ClassINET, TTL: ttl}
		if a.Is4() {
			b.AResource(rh, dnsmessage.AResource{A: a.As4()})
		} else {
			b.AAAAResource(rh, dnsmessage.AAAAResource{AAAA: a.As16()})
		}
	}
	out, _ := b.Finish()
	return out
}

var (
	clientAddr = netip.MustParseAddrPort("10.66.66.2:40000")
	virtualDNS = netip.AddrPortFrom(DefaultVirtualIP, 53)
)

type harness struct {
	t     *testing.T
	ft    *fakeTun
	p     *Proxy
	up    *fakeUpstream
	bufs  [][]byte
	sizes []int
}

func newHarness(t *testing.T, blocked mapMatcher) *harness {
	ft := newFakeTun()
	up := &fakeUpstream{fn: func(q question) []byte { return answer(q, 300, "", "93.184.216.34") }}
	p := New(ft, blocked, 16)
	p.SetConfig(Config{Blocking: true, Upstream: up, TCPFallback: netip.MustParseAddr("9.9.9.9"), InterceptAll: true, BlockDoT: true})
	t.Cleanup(func() { p.Close() })
	return &harness{t: t, ft: ft, p: p, up: up, bufs: [][]byte{make([]byte, 2048)}, sizes: []int{0}}
}

// send pushes one packet from the OS through Proxy.Read and reports
// whether it continued into the tunnel, and the (possibly rewritten) bytes.
func (h *harness) send(pkt []byte) (forwarded bool, out []byte) {
	h.ft.out <- pkt
	n, err := h.p.Read(h.bufs, h.sizes, 16)
	if err != nil || n != 1 {
		h.t.Fatalf("Read = %d, %v", n, err)
	}
	return h.sizes[0] > 0, h.bufs[0][16 : 16+h.sizes[0]]
}

func (h *harness) reply() (packet.Info, answerInfo) {
	h.t.Helper()
	select {
	case pkt := <-h.ft.got:
		if !packet.ValidTransportChecksum(pkt) {
			h.t.Fatal("bad UDP checksum on injected reply")
		}
		info, ok := packet.Parse(pkt)
		if !ok {
			h.t.Fatal("unparseable reply")
		}
		ai, err := inspectResponse(info.Payload)
		if err != nil {
			h.t.Fatal(err)
		}
		return info, ai
	case <-time.After(3 * time.Second):
		h.t.Fatal("no reply injected")
	}
	return packet.Info{}, answerInfo{}
}

func TestBlockedQueryAnsweredLocally(t *testing.T) {
	h := newHarness(t, mapMatcher{"doubleclick.net": true})
	q := buildQuery(t, 0x1234, "stats.g.doubleclick.net.", dnsmessage.TypeA, false)
	fwd, _ := h.send(packet.BuildUDP(clientAddr, virtualDNS, q, 0))
	if fwd {
		t.Fatal("query to the virtual resolver must not enter the tunnel")
	}
	info, ai := h.reply()
	if info.Src != DefaultVirtualIP || info.SrcPort != 53 || info.Dst != clientAddr.Addr() || info.DstPort != clientAddr.Port() {
		t.Fatalf("reply addressed %v:%d -> %v:%d", info.Src, info.SrcPort, info.Dst, info.DstPort)
	}
	if ai.ID != 0x1234 || len(ai.Addrs) != 1 || !ai.Addrs[0].IsUnspecified() {
		t.Fatalf("blocked answer = %+v", ai)
	}
	if h.up.calls != 0 {
		t.Fatal("blocked query reached the upstream")
	}
	if st := h.p.Stats(); st.Queries != 1 || st.Blocked != 1 {
		t.Fatalf("stats = %+v", st)
	}
	if top := h.p.TopBlocked(5); len(top) != 1 || top[0].Domain != "stats.g.doubleclick.net" {
		t.Fatalf("top = %+v", top)
	}
}

func TestAllowedQueryForwardedAndCached(t *testing.T) {
	h := newHarness(t, mapMatcher{})
	q := buildQuery(t, 7, "example.com.", dnsmessage.TypeA, true)
	h.send(packet.BuildUDP(clientAddr, virtualDNS, q, 0))
	_, ai := h.reply()
	if ai.ID != 7 || len(ai.Addrs) != 1 || ai.Addrs[0].String() != "93.184.216.34" {
		t.Fatalf("answer = %+v", ai)
	}
	// Second query is served from cache with the new ID.
	q2 := buildQuery(t, 8, "Example.COM.", dnsmessage.TypeA, true)
	h.send(packet.BuildUDP(clientAddr, virtualDNS, q2, 0))
	_, ai2 := h.reply()
	if ai2.ID != 8 || h.up.calls != 1 {
		t.Fatalf("cache miss: id=%d calls=%d", ai2.ID, h.up.calls)
	}
	if st := h.p.Stats(); st.Cached != 1 {
		t.Fatalf("stats = %+v", st)
	}
	log := h.p.Recent(10)
	if len(log) != 2 || !log[0].Cached || log[1].Cached || log[1].Answer != "93.184.216.34" {
		t.Fatalf("log = %+v", log)
	}
	// Changing the upstream clears the cache.
	h.p.SetConfig(Config{Blocking: true, Upstream: &fakeUpstream{fn: h.up.fn}})
	if _, ok := h.p.cache.get(cacheKey(question{Name: "example.com", Type: dnsmessage.TypeA, Class: dnsmessage.ClassINET})); ok {
		t.Fatal("cache survived an upstream change")
	}
}

func TestCNAMECloakingBlocked(t *testing.T) {
	h := newHarness(t, mapMatcher{"tracker.example": true})
	h.up.fn = func(q question) []byte { return answer(q, 300, "metrics.tracker.example", "198.51.100.7") }
	q := buildQuery(t, 9, "metrics.news-site.example.", dnsmessage.TypeA, false)
	h.send(packet.BuildUDP(clientAddr, virtualDNS, q, 0))
	_, ai := h.reply()
	if len(ai.Addrs) != 1 || !ai.Addrs[0].IsUnspecified() {
		t.Fatalf("cloaked tracker not blocked: %+v", ai)
	}
	if e := h.p.Recent(1)[0]; !e.Blocked || !strings.HasPrefix(e.Via, "cname") {
		t.Fatalf("log entry = %+v", e)
	}
}

func TestBlockingOffForwardsEverything(t *testing.T) {
	h := newHarness(t, mapMatcher{"doubleclick.net": true})
	cfg := h.p.Config()
	cfg.Blocking = false
	h.p.SetConfig(cfg)
	h.send(packet.BuildUDP(clientAddr, virtualDNS, buildQuery(t, 1, "ad.doubleclick.net.", dnsmessage.TypeA, false), 0))
	_, ai := h.reply()
	if len(ai.Addrs) != 1 || ai.Addrs[0].IsUnspecified() {
		t.Fatalf("blocked although blocking is off: %+v", ai)
	}
}

func TestFirefoxCanary(t *testing.T) {
	h := newHarness(t, mapMatcher{})
	h.send(packet.BuildUDP(clientAddr, virtualDNS, buildQuery(t, 2, "use-application-dns.net.", dnsmessage.TypeA, false), 0))
	_, ai := h.reply()
	if ai.RCode != dnsmessage.RCodeNameError {
		t.Fatalf("rcode = %v", ai.RCode)
	}
}

func TestDirectQueries(t *testing.T) {
	h := newHarness(t, mapMatcher{"ads.example": true})
	google := netip.MustParseAddrPort("8.8.8.8:53")
	// Blocked: answered as if from 8.8.8.8, never reaches the tunnel.
	fwd, _ := h.send(packet.BuildUDP(clientAddr, google, buildQuery(t, 3, "x.ads.example.", dnsmessage.TypeAAAA, false), 0))
	if fwd {
		t.Fatal("blocked direct query entered the tunnel")
	}
	info, ai := h.reply()
	if info.Src != google.Addr() || len(ai.Addrs) != 1 || !ai.Addrs[0].IsUnspecified() || !ai.Addrs[0].Is6() {
		t.Fatalf("direct reply %v %+v", info.Src, ai)
	}
	// Allowed: passes through untouched.
	pkt := packet.BuildUDP(clientAddr, google, buildQuery(t, 4, "fine.example.", dnsmessage.TypeA, false), 0)
	fwd, out := h.send(pkt)
	if !fwd || string(out) != string(pkt) {
		t.Fatal("allowed direct query was modified or dropped")
	}
}

func TestDoTBlockedAndOtherTrafficUntouched(t *testing.T) {
	h := newHarness(t, mapMatcher{})
	syn := tcpPacket(clientAddr, netip.MustParseAddrPort("1.1.1.1:853"))
	if fwd, _ := h.send(syn); fwd {
		t.Fatal("DNS-over-TLS was not dropped")
	}
	web := tcpPacket(clientAddr, netip.MustParseAddrPort("93.184.216.34:443"))
	if fwd, out := h.send(web); !fwd || string(out) != string(web) {
		t.Fatal("ordinary traffic was modified")
	}
}

func tcpPacket(src, dst netip.AddrPort) []byte {
	pkt := make([]byte, 40)
	pkt[0] = 0x45
	binary.BigEndian.PutUint16(pkt[2:4], 40)
	pkt[8] = 64
	pkt[9] = packet.ProtoTCP
	s, d := src.Addr().As4(), dst.Addr().As4()
	copy(pkt[12:16], s[:])
	copy(pkt[16:20], d[:])
	tcp := pkt[20:]
	binary.BigEndian.PutUint16(tcp[0:2], src.Port())
	binary.BigEndian.PutUint16(tcp[2:4], dst.Port())
	tcp[12] = 5 << 4
	tcp[13] = 0x02
	binary.BigEndian.PutUint16(tcp[16:18], packet.TransportChecksum(src.Addr(), dst.Addr(), packet.ProtoTCP, tcp))
	var sum uint32
	for i := 0; i < 20; i += 2 {
		sum += uint32(pkt[i])<<8 | uint32(pkt[i+1])
	}
	for sum > 0xffff {
		sum = sum>>16 + sum&0xffff
	}
	binary.BigEndian.PutUint16(pkt[10:12], ^uint16(sum))
	return pkt
}

func TestTCPFallbackNAT(t *testing.T) {
	h := newHarness(t, mapMatcher{})
	fwd, out := h.send(tcpPacket(clientAddr, virtualDNS))
	if !fwd {
		t.Fatal("TCP DNS dropped")
	}
	info, _ := packet.Parse(out)
	if info.Dst != netip.MustParseAddr("9.9.9.9") || !packet.ValidTransportChecksum(out) || !packet.ValidIPv4HeaderChecksum(out) {
		t.Fatalf("not rewritten: %v", info.Dst)
	}
	// The server's reply is rewritten back to come from the virtual IP.
	reply := tcpPacket(netip.MustParseAddrPort("9.9.9.9:53"), clientAddr)
	buf := append(make([]byte, 16), reply...)
	if _, err := h.p.Write([][]byte{buf}, 16); err != nil {
		t.Fatal(err)
	}
	got := <-h.ft.got
	ri, _ := packet.Parse(got)
	if ri.Src != DefaultVirtualIP || !packet.ValidTransportChecksum(got) {
		t.Fatalf("reply source %v", ri.Src)
	}
	// Unrelated DNS-over-TCP from the same server is left alone.
	other := tcpPacket(netip.MustParseAddrPort("9.9.9.9:53"), netip.MustParseAddrPort("10.66.66.2:41111"))
	h.p.Write([][]byte{append(make([]byte, 16), other...)}, 16)
	if oi, _ := packet.Parse(<-h.ft.got); oi.Src != netip.MustParseAddr("9.9.9.9") {
		t.Fatal("unrelated packet rewritten")
	}
}

func TestTruncation(t *testing.T) {
	h := newHarness(t, mapMatcher{})
	var ips []string
	for i := 1; i <= 60; i++ {
		ips = append(ips, netip.AddrFrom4([4]byte{198, 51, 100, byte(i)}).String())
	}
	h.up.fn = func(q question) []byte { return answer(q, 60, "", ips...) }
	h.send(packet.BuildUDP(clientAddr, virtualDNS, buildQuery(t, 5, "big.example.", dnsmessage.TypeA, false), 0))
	_, ai := h.reply()
	if !ai.Trunc || ai.Answers != 0 {
		t.Fatalf("expected truncated reply, got %+v", ai)
	}
	// With EDNS0 the full answer fits.
	h.send(packet.BuildUDP(clientAddr, virtualDNS, buildQuery(t, 6, "big.example.", dnsmessage.TypeA, true), 0))
	if _, ai := h.reply(); ai.Trunc || ai.Answers != 60 {
		t.Fatalf("EDNS reply = %+v", ai)
	}
}

func TestPrivateReverseLookupsStayLocal(t *testing.T) {
	h := newHarness(t, mapMatcher{})
	h.send(packet.BuildUDP(clientAddr, virtualDNS, buildQuery(t, 10, "1.1.168.192.in-addr.arpa.", dnsmessage.TypePTR, false), 0))
	if _, ai := h.reply(); ai.RCode != dnsmessage.RCodeNameError || h.up.calls != 0 {
		t.Fatalf("rcode %v calls %d", ai.RCode, h.up.calls)
	}
}

func TestAgeTTLs(t *testing.T) {
	q, _ := parseQuery(buildQuery(t, 1, "example.com.", dnsmessage.TypeA, false))
	msg := answer(q, 100, "cdn.example.net", "192.0.2.1")
	if !ageTTLs(msg, 40) {
		t.Fatal("walk failed")
	}
	ai, _ := inspectResponse(msg)
	if ai.MinTTL != 60 {
		t.Fatalf("ttl = %d", ai.MinTTL)
	}
	ageTTLs(msg, 1000)
	if ai, _ := inspectResponse(msg); ai.MinTTL != 1 {
		t.Fatalf("ttl floor = %d", ai.MinTTL)
	}
}

// udpServer is a minimal DNS server for upstream tests.
func udpServer(t *testing.T, truncate bool) netip.AddrPort {
	pc, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ln, err := net.Listen("tcp", pc.LocalAddr().String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pc.Close(); ln.Close() })
	go func() {
		buf := make([]byte, 1500)
		for {
			n, addr, err := pc.ReadFrom(buf)
			if err != nil {
				return
			}
			q, _ := parseQuery(buf[:n])
			resp := answer(q, 30, "", "192.0.2.53")
			if truncate {
				resp = truncated(q)
			}
			pc.WriteTo(resp, addr)
		}
	}()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			var l [2]byte
			io.ReadFull(c, l[:])
			msg := make([]byte, binary.BigEndian.Uint16(l[:]))
			io.ReadFull(c, msg)
			q, _ := parseQuery(msg)
			resp := answer(q, 30, "", "192.0.2.54")
			out := append([]byte{byte(len(resp) >> 8), byte(len(resp))}, resp...)
			c.Write(out)
			c.Close()
		}
	}()
	return netip.MustParseAddrPort(pc.LocalAddr().String())
}

func TestUDPUpstream(t *testing.T) {
	srv := udpServer(t, false)
	dead := netip.MustParseAddrPort("127.0.0.1:9") // discard port, never answers
	u := &UDP{Servers: []netip.AddrPort{dead, srv}}
	resp, err := u.Exchange(context.Background(), buildQuery(t, 77, "example.org.", dnsmessage.TypeA, false))
	if err != nil {
		t.Fatal(err)
	}
	if ai, _ := inspectResponse(resp); ai.ID != 77 || ai.Addrs[0].String() != "192.0.2.53" {
		t.Fatalf("answer %+v", ai)
	}
	// Truncated UDP answers are retried over TCP.
	u2 := &UDP{Servers: []netip.AddrPort{udpServer(t, true)}}
	resp, err = u2.Exchange(context.Background(), buildQuery(t, 78, "example.org.", dnsmessage.TypeA, false))
	if err != nil {
		t.Fatal(err)
	}
	if ai, _ := inspectResponse(resp); ai.Addrs[0].String() != "192.0.2.54" {
		t.Fatalf("TCP retry answer %+v", ai)
	}
}

func TestDoHUpstream(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("Content-Type") != "application/dns-message" {
			http.Error(w, "bad request", 400)
			return
		}
		body, _ := io.ReadAll(r.Body)
		q, err := parseQuery(body)
		if err != nil || q.ID != 0 {
			http.Error(w, "bad query", 400)
			return
		}
		w.Header().Set("Content-Type", "application/dns-message")
		w.Write(answer(q, 60, "", "192.0.2.80"))
	}))
	defer srv.Close()
	ap := netip.MustParseAddrPort(strings.TrimPrefix(srv.URL, "https://"))
	// Use a hostname in the URL; the bootstrap address supplies the IP.
	d, err := NewDoH("https://example.com:"+strconv.Itoa(int(ap.Port()))+"/dns-query", []netip.Addr{ap.Addr()})
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(srv.Certificate())
	d.client.Transport.(*http.Transport).TLSClientConfig = &tls.Config{ServerName: "example.com", RootCAs: pool}
	resp, err := d.Exchange(context.Background(), buildQuery(t, 4242, "example.net.", dnsmessage.TypeA, false))
	if err != nil {
		t.Fatal(err)
	}
	if ai, _ := inspectResponse(resp); ai.ID != 4242 || ai.Addrs[0].String() != "192.0.2.80" {
		t.Fatalf("answer %+v", ai)
	}
	if _, err := NewDoH("http://insecure.example/dns-query", nil); err == nil {
		t.Fatal("plain http accepted")
	}
}
