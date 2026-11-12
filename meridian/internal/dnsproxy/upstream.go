package dnsproxy

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"time"
)

// Upstream forwards a DNS query and returns the response.
type Upstream interface {
	Exchange(ctx context.Context, query []byte) ([]byte, error)
	String() string
}

// UDP sends queries over plain DNS (UDP, retrying over TCP when the answer
// is truncated). Inside the tunnel this is private from the local network.
type UDP struct {
	Servers []netip.AddrPort
	Dialer  net.Dialer
}

func (u *UDP) String() string {
	if len(u.Servers) == 0 {
		return "none"
	}
	return u.Servers[0].String()
}

func (u *UDP) Exchange(ctx context.Context, q []byte) ([]byte, error) {
	var lastErr error = errors.New("no DNS servers configured")
	for i, s := range u.Servers {
		attemptCtx := ctx
		var cancel context.CancelFunc
		if i < len(u.Servers)-1 {
			// Leave time for the next server if this one is silent.
			attemptCtx, cancel = context.WithTimeout(ctx, 2500*time.Millisecond)
		}
		resp, err := u.exchangeUDP(attemptCtx, s, q)
		if cancel != nil {
			cancel()
		}
		if err == nil && len(resp) > 2 && resp[2]&0x02 != 0 { // TC bit
			resp, err = u.exchangeTCP(ctx, s, q)
		}
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if ctx.Err() != nil {
			break
		}
	}
	return nil, lastErr
}

func (u *UDP) exchangeUDP(ctx context.Context, s netip.AddrPort, q []byte) ([]byte, error) {
	c, err := u.Dialer.DialContext(ctx, "udp", s.String())
	if err != nil {
		return nil, err
	}
	defer c.Close()
	if dl, ok := ctx.Deadline(); ok {
		c.SetDeadline(dl)
	} else {
		c.SetDeadline(time.Now().Add(5 * time.Second))
	}
	if _, err := c.Write(q); err != nil {
		return nil, err
	}
	buf := make([]byte, 65535)
	for {
		n, err := c.Read(buf)
		if err != nil {
			return nil, err
		}
		if n >= 12 && buf[0] == q[0] && buf[1] == q[1] {
			return append([]byte(nil), buf[:n]...), nil
		}
		// Ignore stray datagrams with the wrong ID.
	}
}

func (u *UDP) exchangeTCP(ctx context.Context, s netip.AddrPort, q []byte) ([]byte, error) {
	c, err := u.Dialer.DialContext(ctx, "tcp", s.String())
	if err != nil {
		return nil, err
	}
	defer c.Close()
	if dl, ok := ctx.Deadline(); ok {
		c.SetDeadline(dl)
	} else {
		c.SetDeadline(time.Now().Add(5 * time.Second))
	}
	msg := make([]byte, 2+len(q))
	binary.BigEndian.PutUint16(msg, uint16(len(q)))
	copy(msg[2:], q)
	if _, err := c.Write(msg); err != nil {
		return nil, err
	}
	var l [2]byte
	if _, err := io.ReadFull(c, l[:]); err != nil {
		return nil, err
	}
	resp := make([]byte, binary.BigEndian.Uint16(l[:]))
	if _, err := io.ReadFull(c, resp); err != nil {
		return nil, err
	}
	return resp, nil
}

// DoH sends queries over DNS-over-HTTPS (RFC 8484), so even the VPN server
// cannot read them.
type DoH struct {
	URL    string
	client *http.Client
}

// NewDoH creates a DoH upstream. bootstrap holds the server's IP addresses,
// so no plain DNS lookup is needed to reach it.
func NewDoH(rawURL string, bootstrap []netip.Addr) (*DoH, error) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return nil, fmt.Errorf("DNS-over-HTTPS address must start with https://")
	}
	port := u.Port()
	if port == "" {
		port = "443"
	}
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	tr := &http.Transport{
		ForceAttemptHTTP2:   true,
		TLSClientConfig:     &tls.Config{ServerName: u.Hostname(), MinVersion: tls.VersionTLS12},
		MaxIdleConnsPerHost: 4,
		IdleConnTimeout:     60 * time.Second,
		TLSHandshakeTimeout: 5 * time.Second,
		Proxy:               nil, // DNS must go straight through the tunnel
	}
	if len(bootstrap) > 0 {
		tr.DialContext = func(ctx context.Context, network, _ string) (net.Conn, error) {
			var lastErr error
			for _, ip := range bootstrap {
				c, err := dialer.DialContext(ctx, network, netip.AddrPortFrom(ip, mustPort(port)).String())
				if err == nil {
					return c, nil
				}
				lastErr = err
			}
			return nil, lastErr
		}
	} else {
		tr.DialContext = dialer.DialContext
	}
	return &DoH{URL: rawURL, client: &http.Client{Transport: tr, Timeout: 8 * time.Second}}, nil
}

func mustPort(s string) uint16 {
	var n int
	fmt.Sscanf(s, "%d", &n)
	return uint16(n)
}

func (d *DoH) String() string { return d.URL }

func (d *DoH) Exchange(ctx context.Context, q []byte) ([]byte, error) {
	id := binary.BigEndian.Uint16(q[:2])
	body := append([]byte(nil), q...)
	setID(body, 0) // RFC 8484 recommends ID 0 for cache friendliness
	req, err := http.NewRequestWithContext(ctx, "POST", d.URL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/dns-message")
	req.Header.Set("Accept", "application/dns-message")
	resp, err := d.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DoH server answered HTTP %d", resp.StatusCode)
	}
	out, err := io.ReadAll(io.LimitReader(resp.Body, 65535))
	if err != nil {
		return nil, err
	}
	if len(out) < 12 {
		return nil, errors.New("short DoH response")
	}
	setID(out, id)
	return out, nil
}

// Preset is a public resolver the user can pick.
type Preset struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	URL       string       `json:"url"`
	Bootstrap []netip.Addr `json:"-"`
}

// Presets are encrypted public resolvers, reached through the tunnel.
var Presets = []Preset{
	{ID: "quad9", Name: "Quad9 (encrypted)", URL: "https://dns.quad9.net/dns-query",
		Bootstrap: []netip.Addr{netip.MustParseAddr("9.9.9.9"), netip.MustParseAddr("149.112.112.112")}},
	{ID: "cloudflare", Name: "Cloudflare (encrypted)", URL: "https://cloudflare-dns.com/dns-query",
		Bootstrap: []netip.Addr{netip.MustParseAddr("1.1.1.1"), netip.MustParseAddr("1.0.0.1")}},
	{ID: "mullvad", Name: "Mullvad DNS (encrypted)", URL: "https://dns.mullvad.net/dns-query",
		Bootstrap: []netip.Addr{netip.MustParseAddr("194.242.2.2")}},
	{ID: "google", Name: "Google (encrypted)", URL: "https://dns.google/dns-query",
		Bootstrap: []netip.Addr{netip.MustParseAddr("8.8.8.8"), netip.MustParseAddr("8.8.4.4")}},
}

// FallbackServers are used when a location config names no DNS server.
var FallbackServers = []netip.AddrPort{
	netip.MustParseAddrPort("9.9.9.9:53"),
	netip.MustParseAddrPort("149.112.112.112:53"),
}
