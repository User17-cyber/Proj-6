// Command testbed provides the server side of Meridian's end-to-end test:
// a userspace WireGuard server, a DNS server and a "what is my IP" web
// service. It is used by scripts/e2e-linux.sh inside network namespaces.
//
//	testbed wg   -key KEY -peer PUB -addr 10.66.66.1/24 -port 51820
//	testbed dns  -listen 10.66.66.1:53 [-listen ...]
//	testbed http -listen 198.51.100.2:80 -country NL -city Amsterdam
package main

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/netip"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"

	"golang.org/x/net/dns/dnsmessage"
	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/device"
	"golang.zx2c4.com/wireguard/tun"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: testbed wg|dns|http ...")
	}
	switch os.Args[1] {
	case "wg":
		runWG(os.Args[2:])
	case "dns":
		runDNS(os.Args[2:])
	case "http":
		runHTTP(os.Args[2:])
	default:
		log.Fatal("unknown mode")
	}
}

func hexKey(b64 string) string {
	b, err := base64.StdEncoding.DecodeString(b64)
	if err != nil || len(b) != 32 {
		log.Fatalf("bad key %q", b64)
	}
	return hex.EncodeToString(b)
}

func runWG(args []string) {
	fs := flag.NewFlagSet("wg", flag.ExitOnError)
	key := fs.String("key", "", "server private key")
	peer := fs.String("peer", "", "client public key")
	allowed := fs.String("allowed", "10.66.66.2/32,fd66:66:66::2/128", "client addresses")
	addr := fs.String("addr", "10.66.66.1/24", "tunnel address")
	addr6 := fs.String("addr6", "fd66:66:66::1/64", "tunnel IPv6 address (empty for none)")
	port := fs.Int("port", 51820, "UDP port")
	name := fs.String("name", "wgs0", "interface name")
	fs.Parse(args)

	t, err := tun.CreateTUN(*name, 1420)
	if err != nil {
		log.Fatal(err)
	}
	dev := device.NewDevice(t, conn.NewDefaultBind(), device.NewLogger(device.LogLevelError, "wg: "))
	cfg := fmt.Sprintf("private_key=%s\nlisten_port=%d\npublic_key=%s\n", hexKey(*key), *port, hexKey(*peer))
	for _, a := range strings.Split(*allowed, ",") {
		cfg += "allowed_ip=" + a + "\n"
	}
	if err := dev.IpcSet(cfg); err != nil {
		log.Fatal(err)
	}
	if err := dev.Up(); err != nil {
		log.Fatal(err)
	}
	sh := func(a ...string) {
		if out, err := exec.Command("ip", a...).CombinedOutput(); err != nil {
			log.Fatalf("ip %v: %v %s", a, err, out)
		}
	}
	sh("address", "add", *addr, "dev", *name)
	if *addr6 != "" {
		if out, err := exec.Command("ip", "-6", "address", "add", *addr6, "dev", *name).CombinedOutput(); err != nil {
			log.Printf("IPv6 unavailable, continuing without it: %s", out)
		}
	}
	sh("link", "set", "up", "dev", *name)
	log.Printf("wireguard server up on :%d", *port)
	wait()
	dev.Close()
}

// The zone answered by the test DNS server.
var zone = map[string]string{
	"example.test":                 "198.51.100.2",
	"www.example.test":             "198.51.100.2",
	"ads.doubleclick.net":          "198.51.100.66",
	"metrics.news.test":            "cname:collector.tracker-cloak.test",
	"collector.tracker-cloak.test": "198.51.100.67",
	"whoami.test":                  "198.51.100.2",
	"site.example.net":             "198.51.100.2",
}

func runDNS(args []string) {
	fs := flag.NewFlagSet("dns", flag.ExitOnError)
	var listens []string
	fs.Func("listen", "address to listen on (repeatable)", func(s string) error { listens = append(listens, s); return nil })
	fs.Parse(args)
	for _, l := range listens {
		pc, err := net.ListenPacket("udp", l)
		if err != nil {
			log.Fatal(err)
		}
		go serveDNS(pc, l)
	}
	log.Printf("dns server on %v", listens)
	wait()
}

func serveDNS(pc net.PacketConn, label string) {
	buf := make([]byte, 1500)
	for {
		n, from, err := pc.ReadFrom(buf)
		if err != nil {
			return
		}
		var p dnsmessage.Parser
		h, err := p.Start(buf[:n])
		if err != nil {
			continue
		}
		q, err := p.Question()
		if err != nil {
			continue
		}
		name := strings.TrimSuffix(strings.ToLower(q.Name.String()), ".")
		b := dnsmessage.NewBuilder(nil, dnsmessage.Header{ID: h.ID, Response: true, RecursionDesired: h.RecursionDesired, RecursionAvailable: true})
		b.EnableCompression()
		b.StartQuestions()
		b.Question(q)
		v, ok := zone[name]
		if !ok {
			b2 := dnsmessage.NewBuilder(nil, dnsmessage.Header{ID: h.ID, Response: true, RCode: dnsmessage.RCodeNameError, RecursionAvailable: true})
			b2.StartQuestions()
			b2.Question(q)
			out, _ := b2.Finish()
			pc.WriteTo(out, from)
			log.Printf("[%s] %s %s -> NXDOMAIN", label, q.Type, name)
			continue
		}
		b.StartAnswers()
		owner := q.Name
		if strings.HasPrefix(v, "cname:") {
			target := strings.TrimPrefix(v, "cname:")
			tn := dnsmessage.MustNewName(target + ".")
			b.CNAMEResource(dnsmessage.ResourceHeader{Name: owner, Class: dnsmessage.ClassINET, TTL: 60}, dnsmessage.CNAMEResource{CNAME: tn})
			owner, v = tn, zone[target]
		}
		if q.Type == dnsmessage.TypeA {
			a := netip.MustParseAddr(v).As4()
			b.AResource(dnsmessage.ResourceHeader{Name: owner, Class: dnsmessage.ClassINET, TTL: 60}, dnsmessage.AResource{A: a})
		} else if q.Type == dnsmessage.TypeAAAA {
			b.AAAAResource(dnsmessage.ResourceHeader{Name: owner, Class: dnsmessage.ClassINET, TTL: 60}, dnsmessage.AAAAResource{AAAA: netip.MustParseAddr("2001:db8::2").As16()})
		}
		out, _ := b.Finish()
		pc.WriteTo(out, from)
		log.Printf("[%s] %s %s -> %s", label, q.Type, name, v)
	}
}

func runHTTP(args []string) {
	fs := flag.NewFlagSet("http", flag.ExitOnError)
	listen := fs.String("listen", ":80", "address")
	natIP := fs.String("vpn-ip", "198.51.100.1", "address the VPN server's traffic arrives from")
	fs.Parse(args)
	http.HandleFunc("/geo", func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		resp := map[string]any{"ip": host, "success": true}
		if host == *natIP {
			resp["country_code"], resp["country"], resp["city"], resp["connection"] = "NL", "Netherlands", "Amsterdam", map[string]string{"org": "Testbed VPN Hosting"}
			resp["latitude"], resp["longitude"] = 52.37, 4.9
		} else {
			resp["country_code"], resp["country"], resp["city"], resp["connection"] = "US", "United States", "Springfield", map[string]string{"org": "Testbed Home ISP"}
			resp["latitude"], resp["longitude"] = 39.8, -89.6
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		fmt.Fprintf(w, "hello from the test internet, you are %s\n", host)
	})
	log.Printf("http on %s", *listen)
	log.Fatal(http.ListenAndServe(*listen, nil))
}

func wait() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
	<-ch
}
