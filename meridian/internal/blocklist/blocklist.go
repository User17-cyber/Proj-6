// Package blocklist matches domain names against ad, tracker and malware
// blocklists. It reads the three formats DNS blocklists are published in:
//
//	hosts files       0.0.0.0 ads.example.com      (exact name)
//	domain lists      ads.example.com              (exact name)
//	adblock rules     ||example.com^               (name and every subdomain)
//	                  @@||cdn.example.com^          (exception)
//
// plus "*.example.com" wildcards in custom rules.
package blocklist

import (
	"bufio"
	"io"
	"net/netip"
	"strings"
)

// Kind says how a rule matches.
type Kind uint8

const (
	Exact    Kind = iota // only this name
	Wildcard             // this name and all subdomains
)

// Rule is one parsed list entry.
type Rule struct {
	Domain string
	Kind   Kind
	Allow  bool // exception rule (@@)
}

// Normalize lower-cases a DNS name and strips a trailing dot. It returns ""
// for names that cannot be blocked meaningfully.
func Normalize(name string) string {
	name = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(name)), ".")
	if !validDomain(name) {
		return ""
	}
	return name
}

func validDomain(d string) bool {
	if len(d) == 0 || len(d) > 253 || !strings.Contains(d, ".") {
		return false
	}
	if _, err := netip.ParseAddr(d); err == nil {
		return false
	}
	label := 0
	for i := 0; i < len(d); i++ {
		c := d[i]
		switch {
		case c == '.':
			if label == 0 {
				return false
			}
			label = 0
			continue
		case c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '-', c == '_':
		default:
			return false
		}
		label++
		if label > 63 {
			return false
		}
	}
	return label > 0
}

// hostsSkip are names that appear in hosts files but must never be blocked.
var hostsSkip = map[string]bool{
	"localhost": true, "localhost.localdomain": true, "local": true,
	"broadcasthost": true, "ip6-localhost": true, "ip6-loopback": true,
	"ip6-localnet": true, "ip6-mcastprefix": true, "ip6-allnodes": true,
	"ip6-allrouters": true, "ip6-allhosts": true, "0.0.0.0": true,
}

// ParseLine parses one line of any supported format. ok is false for
// comments, blank lines and rules a DNS blocker cannot apply.
func ParseLine(line string) (r Rule, ok bool) {
	line = strings.TrimSpace(line)
	if line == "" {
		return r, false
	}
	switch line[0] {
	case '#', '!', '[', ';':
		return r, false
	case '/': // regular expression rules are not supported
		return r, false
	}

	// Adblock syntax: ||domain^ and @@||domain^, optionally $important.
	if strings.HasPrefix(line, "@@") {
		r.Allow = true
		line = line[2:]
	}
	if strings.HasPrefix(line, "||") {
		body := line[2:]
		if i := strings.IndexByte(body, '$'); i >= 0 {
			if mods := body[i+1:]; mods != "important" {
				return r, false // client-, type- or rewrite-specific rule
			}
			body = body[:i]
		}
		body = strings.TrimSuffix(body, "|")
		if !strings.HasSuffix(body, "^") {
			return r, false // a URL path rule, not a domain rule
		}
		d := Normalize(strings.TrimSuffix(body, "^"))
		if d == "" {
			return r, false
		}
		r.Domain, r.Kind = d, Wildcard
		return r, true
	}
	if r.Allow {
		return r, false // other exception syntax is not supported
	}
	if strings.ContainsAny(line, "|^$/") {
		return r, false
	}

	// Strip trailing comments ("0.0.0.0 ads.com # tracker").
	if i := strings.IndexByte(line, '#'); i >= 0 {
		line = strings.TrimSpace(line[:i])
	}
	fields := strings.Fields(line)
	switch len(fields) {
	case 0:
		return r, false
	case 1: // domain list or wildcard
		d := fields[0]
		if strings.HasPrefix(d, "*.") {
			d = Normalize(d[2:])
			if d == "" {
				return r, false
			}
			return Rule{Domain: d, Kind: Wildcard}, true
		}
		d = Normalize(d)
		if d == "" {
			return r, false
		}
		return Rule{Domain: d, Kind: Exact}, true
	default: // hosts file: IP name [name...]; only the first name is used
		if _, err := netip.ParseAddr(fields[0]); err != nil {
			return r, false
		}
		name := strings.ToLower(fields[1])
		if hostsSkip[name] {
			return r, false
		}
		d := Normalize(name)
		if d == "" {
			return r, false
		}
		return Rule{Domain: d, Kind: Exact}, true
	}
}

// Parse calls fn for every usable rule in r.
func Parse(r io.Reader, fn func(Rule)) error {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		if rule, ok := ParseLine(sc.Text()); ok {
			fn(rule)
		}
	}
	return sc.Err()
}

// Set is a collection of block and allow rules, each tagged with the index
// of the list it came from (up to 64 lists).
type Set struct {
	exact      map[string]uint64
	wild       map[string]uint64
	allowExact map[string]uint64
	allowWild  map[string]uint64
}

// NewSet returns an empty set sized for about n rules.
func NewSet(n int) *Set {
	return &Set{
		exact:      make(map[string]uint64, n),
		wild:       make(map[string]uint64, n/4),
		allowExact: map[string]uint64{},
		allowWild:  map[string]uint64{},
	}
}

// Add inserts a rule from list number src (0-63).
func (s *Set) Add(r Rule, src int) {
	bit := uint64(1) << uint(src&63)
	switch {
	case r.Allow && r.Kind == Wildcard:
		s.allowWild[r.Domain] |= bit
	case r.Allow:
		s.allowExact[r.Domain] |= bit
	case r.Kind == Wildcard:
		s.wild[r.Domain] |= bit
	default:
		s.exact[r.Domain] |= bit
	}
}

// Len returns the number of block rules.
func (s *Set) Len() int { return len(s.exact) + len(s.wild) }

// Match reports whether name is blocked, and if so a bitmask of the lists
// that block it. Exception rules win over block rules.
func (s *Set) Match(name string) (blocked bool, lists uint64) {
	if s == nil {
		return false, 0
	}
	name = strings.TrimSuffix(strings.ToLower(name), ".")
	if name == "" {
		return false, 0
	}
	if s.allowed(name) {
		return false, 0
	}
	if m, ok := s.exact[name]; ok {
		lists |= m
	}
	for d := name; ; {
		if m, ok := s.wild[d]; ok {
			lists |= m
		}
		i := strings.IndexByte(d, '.')
		if i < 0 {
			break
		}
		d = d[i+1:]
	}
	return lists != 0, lists
}

func (s *Set) allowed(name string) bool {
	if _, ok := s.allowExact[name]; ok {
		return true
	}
	for d := name; ; {
		if _, ok := s.allowWild[d]; ok {
			return true
		}
		i := strings.IndexByte(d, '.')
		if i < 0 {
			return false
		}
		d = d[i+1:]
	}
}
