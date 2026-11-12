package packet

import (
	"bytes"
	"encoding/binary"
	"net/netip"
	"testing"
)

func TestBuildUDPv4(t *testing.T) {
	src := netip.MustParseAddrPort("100.100.53.53:53")
	dst := netip.MustParseAddrPort("10.66.66.2:41000")
	payload := []byte("hello dns")
	buf := BuildUDP(src, dst, payload, 16)
	pkt := buf[16:]
	if !ValidIPv4HeaderChecksum(pkt) || !ValidTransportChecksum(pkt) {
		t.Fatal("bad checksum")
	}
	p, ok := Parse(pkt)
	if !ok || p.Version != 4 || p.Proto != ProtoUDP || p.Src != src.Addr() || p.Dst != dst.Addr() ||
		p.SrcPort != 53 || p.DstPort != 41000 || !bytes.Equal(p.Payload, payload) {
		t.Fatalf("parsed %+v", p)
	}
}

func TestBuildUDPv6(t *testing.T) {
	src := netip.MustParseAddrPort("[2001:db8::1]:53")
	dst := netip.MustParseAddrPort("[fd66:66:66::2]:5000")
	pkt := BuildUDP(src, dst, []byte{1, 2, 3}, 0)
	if !ValidTransportChecksum(pkt) {
		t.Fatal("bad checksum")
	}
	p, ok := Parse(pkt)
	if !ok || p.Version != 6 || p.Src != src.Addr() || p.DstPort != 5000 || len(p.Payload) != 3 {
		t.Fatalf("parsed %+v", p)
	}
}

// A TCP SYN captured from a real stack (checksums valid).
func tcpSYN(t *testing.T) []byte {
	t.Helper()
	pkt := make([]byte, 40)
	pkt[0] = 0x45
	binary.BigEndian.PutUint16(pkt[2:4], 40)
	pkt[8] = 64
	pkt[9] = ProtoTCP
	copy(pkt[12:16], []byte{10, 66, 66, 2})
	copy(pkt[16:20], []byte{100, 100, 53, 53})
	binary.BigEndian.PutUint16(pkt[10:12], ipv4HeaderChecksum(pkt[:20]))
	tcp := pkt[20:]
	binary.BigEndian.PutUint16(tcp[0:2], 40000)
	binary.BigEndian.PutUint16(tcp[2:4], 53)
	binary.BigEndian.PutUint32(tcp[4:8], 12345)
	tcp[12] = 5 << 4
	tcp[13] = 0x02
	binary.BigEndian.PutUint16(tcp[14:16], 65535)
	binary.BigEndian.PutUint16(tcp[16:18], TransportChecksum(netip.MustParseAddr("10.66.66.2"), netip.MustParseAddr("100.100.53.53"), ProtoTCP, tcp))
	if !ValidTransportChecksum(pkt) {
		t.Fatal("fixture checksum")
	}
	return pkt
}

func TestRewriteIPv4TCP(t *testing.T) {
	pkt := tcpSYN(t)
	if !RewriteIPv4(pkt, netip.Addr{}, netip.MustParseAddr("9.9.9.9")) {
		t.Fatal("rewrite failed")
	}
	p, _ := Parse(pkt)
	if p.Dst != netip.MustParseAddr("9.9.9.9") || p.Src != netip.MustParseAddr("10.66.66.2") {
		t.Fatalf("addresses %v -> %v", p.Src, p.Dst)
	}
	if !ValidIPv4HeaderChecksum(pkt) || !ValidTransportChecksum(pkt) {
		t.Fatal("checksums not updated")
	}
}

func TestRewriteIPv4UDP(t *testing.T) {
	buf := BuildUDP(netip.MustParseAddrPort("9.9.9.9:53"), netip.MustParseAddrPort("10.66.66.2:41000"), []byte("x"), 0)
	if !RewriteIPv4(buf, netip.MustParseAddr("100.100.53.53"), netip.Addr{}) {
		t.Fatal("rewrite failed")
	}
	if !ValidIPv4HeaderChecksum(buf) || !ValidTransportChecksum(buf) {
		t.Fatal("checksums not updated")
	}
}

func TestParseRejectsGarbage(t *testing.T) {
	for _, b := range [][]byte{nil, {0x45}, {0x60, 0, 0}, make([]byte, 19), {0x50, 0, 0, 0}} {
		if _, ok := Parse(b); ok {
			t.Errorf("Parse(%v) accepted garbage", b)
		}
	}
	// Total length larger than the buffer.
	pkt := BuildUDP(netip.MustParseAddrPort("1.1.1.1:53"), netip.MustParseAddrPort("2.2.2.2:53"), []byte("abc"), 0)
	if _, ok := Parse(pkt[:len(pkt)-1]); ok {
		t.Error("accepted truncated packet")
	}
}
