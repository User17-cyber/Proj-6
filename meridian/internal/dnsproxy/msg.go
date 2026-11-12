package dnsproxy

import (
	"encoding/binary"
	"errors"
	"net/netip"
	"strings"

	"golang.org/x/net/dns/dnsmessage"
)

// question is the part of a query Meridian decides on.
type question struct {
	ID      uint16
	Name    string // lower case, no trailing dot
	Type    dnsmessage.Type
	Class   dnsmessage.Class
	Raw     dnsmessage.Question
	UDPSize int // EDNS0 payload size, 512 without EDNS0
	RD      bool
	OpCode  dnsmessage.OpCode
}

var errNotQuery = errors.New("not a standard DNS query")

func parseQuery(msg []byte) (question, error) {
	var q question
	var p dnsmessage.Parser
	h, err := p.Start(msg)
	if err != nil {
		return q, err
	}
	if h.Response || h.OpCode != 0 {
		return q, errNotQuery
	}
	qs, err := p.AllQuestions()
	if err != nil {
		return q, err
	}
	if len(qs) != 1 {
		return q, errNotQuery
	}
	q.ID = h.ID
	q.RD = h.RecursionDesired
	q.OpCode = h.OpCode
	q.Raw = qs[0]
	q.Name = strings.TrimSuffix(strings.ToLower(qs[0].Name.String()), ".")
	q.Type = qs[0].Type
	q.Class = qs[0].Class
	q.UDPSize = 512
	if err := p.SkipAllAnswers(); err == nil {
		if err := p.SkipAllAuthorities(); err == nil {
			for {
				rh, err := p.AdditionalHeader()
				if err != nil {
					break
				}
				if rh.Type == dnsmessage.TypeOPT {
					if sz := int(rh.Class); sz > 512 {
						q.UDPSize = min(sz, 4096)
					}
				}
				if err := p.SkipAdditional(); err != nil {
					break
				}
			}
		}
	}
	return q, nil
}

// blockedTTL is short so that allow rules take effect quickly.
const blockedTTL = 60

// blockedResponse answers A with 0.0.0.0 and AAAA with ::, which makes
// connections fail at once, and every other type with an empty answer.
// With nx set it answers NXDOMAIN instead.
func blockedResponse(q question, nx bool) []byte {
	rcode := dnsmessage.RCodeSuccess
	if nx {
		rcode = dnsmessage.RCodeNameError
	}
	b := dnsmessage.NewBuilder(nil, dnsmessage.Header{
		ID: q.ID, Response: true, OpCode: q.OpCode, RecursionDesired: q.RD,
		RecursionAvailable: true, RCode: rcode,
	})
	b.EnableCompression()
	_ = b.StartQuestions()
	_ = b.Question(q.Raw)
	if !nx && q.Class == dnsmessage.ClassINET {
		rh := dnsmessage.ResourceHeader{Name: q.Raw.Name, Class: dnsmessage.ClassINET, TTL: blockedTTL}
		switch q.Type {
		case dnsmessage.TypeA:
			_ = b.StartAnswers()
			_ = b.AResource(rh, dnsmessage.AResource{})
		case dnsmessage.TypeAAAA:
			_ = b.StartAnswers()
			_ = b.AAAAResource(rh, dnsmessage.AAAAResource{})
		}
	}
	out, _ := b.Finish()
	return out
}

// errorResponse returns an empty response with the given code.
func errorResponse(q question, rcode dnsmessage.RCode) []byte {
	b := dnsmessage.NewBuilder(nil, dnsmessage.Header{
		ID: q.ID, Response: true, OpCode: q.OpCode, RecursionDesired: q.RD,
		RecursionAvailable: true, RCode: rcode,
	})
	_ = b.StartQuestions()
	_ = b.Question(q.Raw)
	out, _ := b.Finish()
	return out
}

// truncated returns the header and question of resp with the TC bit set,
// which tells the client to retry over TCP.
func truncated(q question) []byte {
	b := dnsmessage.NewBuilder(nil, dnsmessage.Header{
		ID: q.ID, Response: true, OpCode: q.OpCode, RecursionDesired: q.RD,
		RecursionAvailable: true, Truncated: true,
	})
	_ = b.StartQuestions()
	_ = b.Question(q.Raw)
	out, _ := b.Finish()
	return out
}

// answerInfo summarises a response for blocking, logging and caching.
type answerInfo struct {
	RCode   dnsmessage.RCode
	CNAMEs  []string
	Addrs   []netip.Addr
	MinTTL  uint32 // smallest TTL in the answer section; 0 when empty
	HasTTL  bool
	SOAMin  uint32 // negative-caching TTL from the authority SOA
	HasSOA  bool
	Trunc   bool
	ID      uint16
	Answers int
}

func inspectResponse(msg []byte) (answerInfo, error) {
	var a answerInfo
	var p dnsmessage.Parser
	h, err := p.Start(msg)
	if err != nil {
		return a, err
	}
	a.RCode, a.Trunc, a.ID = h.RCode, h.Truncated, h.ID
	if err := p.SkipAllQuestions(); err != nil {
		return a, err
	}
	for {
		rh, err := p.AnswerHeader()
		if err == dnsmessage.ErrSectionDone {
			break
		}
		if err != nil {
			return a, err
		}
		a.Answers++
		if !a.HasTTL || rh.TTL < a.MinTTL {
			a.MinTTL, a.HasTTL = rh.TTL, true
		}
		switch rh.Type {
		case dnsmessage.TypeCNAME:
			r, err := p.CNAMEResource()
			if err != nil {
				return a, err
			}
			a.CNAMEs = append(a.CNAMEs, strings.TrimSuffix(strings.ToLower(r.CNAME.String()), "."))
		case dnsmessage.TypeA:
			r, err := p.AResource()
			if err != nil {
				return a, err
			}
			a.Addrs = append(a.Addrs, netip.AddrFrom4(r.A))
		case dnsmessage.TypeAAAA:
			r, err := p.AAAAResource()
			if err != nil {
				return a, err
			}
			a.Addrs = append(a.Addrs, netip.AddrFrom16(r.AAAA))
		default:
			if err := p.SkipAnswer(); err != nil {
				return a, err
			}
		}
	}
	for {
		rh, err := p.AuthorityHeader()
		if err != nil {
			break
		}
		if rh.Type == dnsmessage.TypeSOA {
			r, err := p.SOAResource()
			if err != nil {
				break
			}
			a.SOAMin, a.HasSOA = min(r.MinTTL, rh.TTL), true
			continue
		}
		if err := p.SkipAuthority(); err != nil {
			break
		}
	}
	return a, nil
}

// setID overwrites the transaction ID of a DNS message.
func setID(msg []byte, id uint16) {
	if len(msg) >= 2 {
		binary.BigEndian.PutUint16(msg[0:2], id)
	}
}

// skipName advances past a (possibly compressed) domain name.
func skipName(msg []byte, off int) (int, bool) {
	for i := 0; i < 128; i++ {
		if off >= len(msg) {
			return 0, false
		}
		l := int(msg[off])
		switch {
		case l == 0:
			return off + 1, true
		case l&0xc0 == 0xc0:
			return off + 2, off+2 <= len(msg)
		case l&0xc0 != 0:
			return 0, false
		default:
			off += 1 + l
		}
	}
	return 0, false
}

// ageTTLs subtracts elapsed seconds from every record TTL in place (never
// below 1), skipping the EDNS0 OPT pseudo-record whose TTL field holds flags.
func ageTTLs(msg []byte, elapsed uint32) bool {
	if len(msg) < 12 {
		return false
	}
	qd := int(binary.BigEndian.Uint16(msg[4:6]))
	rr := int(binary.BigEndian.Uint16(msg[6:8])) + int(binary.BigEndian.Uint16(msg[8:10])) + int(binary.BigEndian.Uint16(msg[10:12]))
	off := 12
	var ok bool
	for i := 0; i < qd; i++ {
		if off, ok = skipName(msg, off); !ok || off+4 > len(msg) {
			return false
		}
		off += 4
	}
	for i := 0; i < rr; i++ {
		if off, ok = skipName(msg, off); !ok || off+10 > len(msg) {
			return false
		}
		typ := binary.BigEndian.Uint16(msg[off : off+2])
		if typ != uint16(dnsmessage.TypeOPT) {
			ttl := binary.BigEndian.Uint32(msg[off+4 : off+8])
			if ttl > elapsed {
				ttl -= elapsed
			} else {
				ttl = 1
			}
			binary.BigEndian.PutUint32(msg[off+4:off+8], ttl)
		}
		rdlen := int(binary.BigEndian.Uint16(msg[off+8 : off+10]))
		off += 10 + rdlen
		if off > len(msg) {
			return false
		}
	}
	return true
}

// typeName returns "A", "AAAA", "HTTPS" and so on.
func typeName(t dnsmessage.Type) string {
	switch t {
	case 64:
		return "SVCB"
	case 65:
		return "HTTPS"
	}
	s := t.String()
	return strings.TrimPrefix(s, "Type")
}
