// Package packet parses and builds the IPv4, IPv6, UDP and TCP headers that
// Meridian needs to answer DNS queries inside the tunnel.
package packet

import (
	"encoding/binary"
	"net/netip"
)

const (
	ProtoTCP = 6
	ProtoUDP = 17
)

// Info describes a parsed packet. Payload aliases the original buffer.
type Info struct {
	Version   int
	Src, Dst  netip.Addr
	Proto     uint8
	IPHdrLen  int
	SrcPort   uint16
	DstPort   uint16
	Payload   []byte // transport payload (after UDP/TCP header)
	Transport []byte // transport header + payload
	Fragment  bool
}

// Parse decodes the IP and transport headers of b. ok is false for packets
// Meridian does not need to look at (fragments, IPv6 extension headers,
// truncated or malformed packets).
func Parse(b []byte) (p Info, ok bool) {
	if len(b) < 1 {
		return p, false
	}
	switch b[0] >> 4 {
	case 4:
		if len(b) < 20 {
			return p, false
		}
		ihl := int(b[0]&0x0f) * 4
		total := int(binary.BigEndian.Uint16(b[2:4]))
		if ihl < 20 || total < ihl || total > len(b) {
			return p, false
		}
		flagsFrag := binary.BigEndian.Uint16(b[6:8])
		p.Fragment = flagsFrag&0x2000 != 0 || flagsFrag&0x1fff != 0
		p.Version = 4
		p.Proto = b[9]
		p.Src = netip.AddrFrom4([4]byte(b[12:16]))
		p.Dst = netip.AddrFrom4([4]byte(b[16:20]))
		p.IPHdrLen = ihl
		p.Transport = b[ihl:total]
	case 6:
		if len(b) < 40 {
			return p, false
		}
		plen := int(binary.BigEndian.Uint16(b[4:6]))
		if 40+plen > len(b) {
			return p, false
		}
		p.Version = 6
		p.Proto = b[6]
		p.Src = netip.AddrFrom16([16]byte(b[8:24]))
		p.Dst = netip.AddrFrom16([16]byte(b[24:40]))
		p.IPHdrLen = 40
		p.Transport = b[40 : 40+plen]
	default:
		return p, false
	}
	if p.Fragment {
		return p, true
	}
	switch p.Proto {
	case ProtoUDP:
		if len(p.Transport) < 8 {
			return p, false
		}
		ulen := int(binary.BigEndian.Uint16(p.Transport[4:6]))
		if ulen < 8 || ulen > len(p.Transport) {
			return p, false
		}
		p.SrcPort = binary.BigEndian.Uint16(p.Transport[0:2])
		p.DstPort = binary.BigEndian.Uint16(p.Transport[2:4])
		p.Payload = p.Transport[8:ulen]
	case ProtoTCP:
		if len(p.Transport) < 20 {
			return p, false
		}
		off := int(p.Transport[12]>>4) * 4
		if off < 20 || off > len(p.Transport) {
			return p, false
		}
		p.SrcPort = binary.BigEndian.Uint16(p.Transport[0:2])
		p.DstPort = binary.BigEndian.Uint16(p.Transport[2:4])
		p.Payload = p.Transport[off:]
	}
	return p, true
}

// checksum folds a one's complement sum.
func fold(sum uint32) uint16 {
	for sum > 0xffff {
		sum = (sum >> 16) + (sum & 0xffff)
	}
	return ^uint16(sum)
}

func sum(b []byte, initial uint32) uint32 {
	s := initial
	n := len(b)
	for i := 0; i+1 < n; i += 2 {
		s += uint32(b[i])<<8 | uint32(b[i+1])
	}
	if n%2 == 1 {
		s += uint32(b[n-1]) << 8
	}
	return s
}

func pseudoHeaderSum(src, dst netip.Addr, proto uint8, length int) uint32 {
	var s uint32
	s = sum(src.AsSlice(), s)
	s = sum(dst.AsSlice(), s)
	s += uint32(proto)
	s += uint32(length)
	return s
}

// TransportChecksum computes the UDP or TCP checksum for a segment whose
// checksum field is zero.
func TransportChecksum(src, dst netip.Addr, proto uint8, segment []byte) uint16 {
	return fold(sum(segment, pseudoHeaderSum(src, dst, proto, len(segment))))
}

func ipv4HeaderChecksum(h []byte) uint16 {
	return fold(sum(h, 0))
}

// BuildUDP returns a complete IPv4 or IPv6 UDP packet starting at
// buf[headroom:]. src and dst must be the same address family.
func BuildUDP(src, dst netip.AddrPort, payload []byte, headroom int) []byte {
	v4 := src.Addr().Is4()
	ipLen := 40
	if v4 {
		ipLen = 20
	}
	udpLen := 8 + len(payload)
	buf := make([]byte, headroom+ipLen+udpLen)
	pkt := buf[headroom:]
	if v4 {
		pkt[0] = 0x45
		binary.BigEndian.PutUint16(pkt[2:4], uint16(ipLen+udpLen))
		pkt[6] = 0x40 // don't fragment
		pkt[8] = 64   // TTL
		pkt[9] = ProtoUDP
		s4, d4 := src.Addr().As4(), dst.Addr().As4()
		copy(pkt[12:16], s4[:])
		copy(pkt[16:20], d4[:])
		binary.BigEndian.PutUint16(pkt[10:12], ipv4HeaderChecksum(pkt[:20]))
	} else {
		pkt[0] = 0x60
		binary.BigEndian.PutUint16(pkt[4:6], uint16(udpLen))
		pkt[6] = ProtoUDP
		pkt[7] = 64 // hop limit
		s6, d6 := src.Addr().As16(), dst.Addr().As16()
		copy(pkt[8:24], s6[:])
		copy(pkt[24:40], d6[:])
	}
	udp := pkt[ipLen:]
	binary.BigEndian.PutUint16(udp[0:2], src.Port())
	binary.BigEndian.PutUint16(udp[2:4], dst.Port())
	binary.BigEndian.PutUint16(udp[4:6], uint16(udpLen))
	copy(udp[8:], payload)
	cs := TransportChecksum(src.Addr(), dst.Addr(), ProtoUDP, udp)
	if cs == 0 {
		cs = 0xffff
	}
	binary.BigEndian.PutUint16(udp[6:8], cs)
	return buf
}

// RewriteIPv4 changes the source and/or destination address of an IPv4 TCP
// or UDP packet in place and recomputes its checksums. Invalid addresses
// are left unchanged.
func RewriteIPv4(pkt []byte, newSrc, newDst netip.Addr) bool {
	p, ok := Parse(pkt)
	if !ok || p.Version != 4 || p.Fragment || (p.Proto != ProtoTCP && p.Proto != ProtoUDP) {
		return false
	}
	if newSrc.IsValid() {
		a := newSrc.As4()
		copy(pkt[12:16], a[:])
	}
	if newDst.IsValid() {
		a := newDst.As4()
		copy(pkt[16:20], a[:])
	}
	pkt[10], pkt[11] = 0, 0
	binary.BigEndian.PutUint16(pkt[10:12], ipv4HeaderChecksum(pkt[:p.IPHdrLen]))

	src := netip.AddrFrom4([4]byte(pkt[12:16]))
	dst := netip.AddrFrom4([4]byte(pkt[16:20]))
	seg := p.Transport
	if p.Proto == ProtoUDP {
		seg = seg[:binary.BigEndian.Uint16(seg[4:6])]
		if seg[6] == 0 && seg[7] == 0 {
			return true // UDP over IPv4 may omit the checksum
		}
		seg[6], seg[7] = 0, 0
		cs := TransportChecksum(src, dst, ProtoUDP, seg)
		if cs == 0 {
			cs = 0xffff
		}
		binary.BigEndian.PutUint16(seg[6:8], cs)
		return true
	}
	seg[16], seg[17] = 0, 0
	binary.BigEndian.PutUint16(seg[16:18], TransportChecksum(src, dst, ProtoTCP, seg))
	return true
}

// ValidTransportChecksum verifies a UDP or TCP checksum (used in tests).
func ValidTransportChecksum(pkt []byte) bool {
	p, ok := Parse(pkt)
	if !ok || p.Fragment {
		return false
	}
	seg := p.Transport
	if p.Proto == ProtoUDP {
		seg = seg[:binary.BigEndian.Uint16(seg[4:6])]
	}
	return fold(sum(seg, pseudoHeaderSum(p.Src, p.Dst, p.Proto, len(seg)))) == 0
}

// ValidIPv4HeaderChecksum verifies the IPv4 header checksum (used in tests).
func ValidIPv4HeaderChecksum(pkt []byte) bool {
	ihl := int(pkt[0]&0x0f) * 4
	return fold(sum(pkt[:ihl], 0)) == 0
}
