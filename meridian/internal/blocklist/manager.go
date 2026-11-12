package blocklist

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// maxListBytes caps a single download so a bad URL cannot exhaust memory.
const maxListBytes = 96 << 20

// ListStatus is what the app shows for each list.
type ListStatus struct {
	Source
	Enabled     bool      `json:"enabled"`
	Rules       int       `json:"rules"`
	Updated     time.Time `json:"updated"`
	Error       string    `json:"error,omitempty"`
	Downloading bool      `json:"downloading"`
}

// Settings selects which lists are active and holds the user's own rules.
type Settings struct {
	Enabled    []string `json:"enabled"`    // list IDs
	CustomURLs []Source `json:"customUrls"` // user-added lists
	Block      []string `json:"block"`      // domains, subdomains included
	Allow      []string `json:"allow"`      // domains, subdomains included
}

// DefaultSettings enables the default lists.
func DefaultSettings() Settings {
	var s Settings
	for _, src := range Catalog {
		if src.Default {
			s.Enabled = append(s.Enabled, src.ID)
		}
	}
	return s
}

type compiled struct {
	set   *Set
	names []string // list index -> display name
}

// Manager owns the downloaded lists and the compiled matcher.
type Manager struct {
	dir    string
	client *http.Client
	logf   func(string, ...any)

	cur atomic.Pointer[compiled]

	mu       sync.Mutex
	settings Settings
	status   map[string]*ListStatus
}

// customRuleSource is the bit used for the user's own block rules.
const customRuleSource = 63

// NewManager loads cached lists from dir. client is used for downloads.
func NewManager(dir string, client *http.Client, logf func(string, ...any)) *Manager {
	if client == nil {
		client = &http.Client{Timeout: 90 * time.Second}
	}
	if logf == nil {
		logf = func(string, ...any) {}
	}
	m := &Manager{dir: dir, client: client, logf: logf, status: map[string]*ListStatus{}}
	m.settings = DefaultSettings()
	m.cur.Store(&compiled{set: NewSet(0)})
	return m
}

func (m *Manager) sources() []Source {
	out := append([]Source(nil), Catalog...)
	return append(out, m.settings.CustomURLs...)
}

// Apply replaces the settings and recompiles the matcher from cached files.
func (m *Manager) Apply(s Settings) {
	m.mu.Lock()
	s.Block = cleanDomains(s.Block)
	s.Allow = cleanDomains(s.Allow)
	m.settings = s
	m.mu.Unlock()
	m.Compile()
}

// Settings returns the current settings.
func (m *Manager) Settings() Settings {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.settings
	s.Enabled = append([]string(nil), s.Enabled...)
	s.CustomURLs = append([]Source(nil), s.CustomURLs...)
	s.Block = append([]string(nil), s.Block...)
	s.Allow = append([]string(nil), s.Allow...)
	return s
}

func cleanDomains(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, d := range in {
		d = strings.TrimPrefix(strings.TrimSpace(d), "*.")
		d = strings.TrimPrefix(strings.TrimPrefix(d, "https://"), "http://")
		if i := strings.IndexByte(d, '/'); i >= 0 {
			d = d[:i]
		}
		if n := Normalize(d); n != "" && !seen[n] {
			seen[n] = true
			out = append(out, n)
		}
	}
	sort.Strings(out)
	return out
}

func (m *Manager) enabled(id string) bool {
	for _, e := range m.settings.Enabled {
		if e == id {
			return true
		}
	}
	return false
}

func (m *Manager) cachePath(id string) string {
	return filepath.Join(m.dir, "list-"+safeID(id)+".txt")
}

var unsafeChars = regexp.MustCompile(`[^a-zA-Z0-9_-]`)

func safeID(id string) string { return unsafeChars.ReplaceAllString(id, "_") }

// Compile rebuilds the matcher from the built-in list, cached downloads and
// custom rules. It is cheap enough to run on every settings change.
func (m *Manager) Compile() {
	m.mu.Lock()
	srcs := m.sources()
	settings := m.settings
	m.mu.Unlock()

	set := NewSet(200_000)
	names := make([]string, 64)
	idx := 0
	counts := map[string]int{}
	for _, src := range srcs {
		if !contains(settings.Enabled, src.ID) {
			continue
		}
		if idx >= customRuleSource {
			break
		}
		names[idx] = src.Name
		n := 0
		if src.URL == "" && src.ID == "essentials" {
			for _, r := range essentialsRules() {
				set.Add(r, idx)
				n++
			}
		} else if f, err := os.Open(m.cachePath(src.ID)); err == nil {
			_ = Parse(f, func(r Rule) { set.Add(r, idx); n++ })
			f.Close()
		}
		counts[src.ID] = n
		idx++
	}
	names[customRuleSource] = "Your block rules"
	for _, d := range settings.Block {
		set.Add(Rule{Domain: d, Kind: Wildcard}, customRuleSource)
	}
	for _, d := range settings.Allow {
		set.Add(Rule{Domain: d, Kind: Wildcard, Allow: true}, customRuleSource)
	}
	m.cur.Store(&compiled{set: set, names: names})

	m.mu.Lock()
	for id, n := range counts {
		st := m.statusLocked(id)
		st.Rules = n
		if fi, err := os.Stat(m.cachePath(id)); err == nil {
			st.Updated = fi.ModTime()
		}
	}
	m.mu.Unlock()
	m.logf("blocklist: compiled %d rules from %d lists", set.Len(), idx)
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func (m *Manager) statusLocked(id string) *ListStatus {
	st, ok := m.status[id]
	if !ok {
		st = &ListStatus{}
		m.status[id] = st
	}
	return st
}

// Match reports whether a name is blocked and which list blocks it.
func (m *Manager) Match(name string) (bool, string) {
	c := m.cur.Load()
	blocked, lists := c.set.Match(name)
	if !blocked {
		return false, ""
	}
	if lists&(1<<customRuleSource) != 0 {
		return true, c.names[customRuleSource]
	}
	for i := 0; i < 64; i++ {
		if lists&(1<<uint(i)) != 0 {
			return true, c.names[i]
		}
	}
	return true, ""
}

// IsAllowed reports whether the user explicitly allowed a name.
func (m *Manager) IsAllowed(name string) bool {
	return m.cur.Load().set.allowed(strings.TrimSuffix(strings.ToLower(name), "."))
}

// RuleCount returns the number of active block rules.
func (m *Manager) RuleCount() int { return m.cur.Load().set.Len() }

// Status lists every known list with its state.
func (m *Manager) Status() []ListStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []ListStatus
	for _, src := range m.sources() {
		st := ListStatus{Source: src, Enabled: m.enabled(src.ID)}
		if s, ok := m.status[src.ID]; ok {
			st.Rules, st.Updated, st.Error, st.Downloading = s.Rules, s.Updated, s.Error, s.Downloading
		}
		if src.ID == "essentials" {
			st.Rules = len(essentials)
		}
		out = append(out, st)
	}
	return out
}

// Update downloads enabled lists that are missing or older than maxAge
// (all enabled lists when force is set) and recompiles if anything changed.
func (m *Manager) Update(ctx context.Context, maxAge time.Duration, force bool) error {
	m.mu.Lock()
	var todo []Source
	for _, src := range m.sources() {
		if src.URL == "" || !m.enabled(src.ID) {
			continue
		}
		fi, err := os.Stat(m.cachePath(src.ID))
		if force || err != nil || time.Since(fi.ModTime()) > maxAge {
			todo = append(todo, src)
			m.statusLocked(src.ID).Downloading = true
		}
	}
	m.mu.Unlock()
	if len(todo) == 0 {
		return nil
	}
	if err := os.MkdirAll(m.dir, 0o700); err != nil {
		return err
	}
	changed := false
	var errs []error
	for _, src := range todo {
		err := m.download(ctx, src)
		m.mu.Lock()
		st := m.statusLocked(src.ID)
		st.Downloading = false
		if err != nil {
			st.Error = err.Error()
			errs = append(errs, fmt.Errorf("%s: %w", src.Name, err))
		} else {
			st.Error = ""
			changed = true
		}
		m.mu.Unlock()
	}
	if changed {
		m.Compile()
	}
	return errors.Join(errs...)
}

func (m *Manager) download(ctx context.Context, src Source) error {
	req, err := http.NewRequestWithContext(ctx, "GET", src.URL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Meridian-VPN/1.0 (blocklist updater)")
	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxListBytes+1))
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	if len(data) > maxListBytes {
		return errors.New("list is larger than 96 MB")
	}
	n := 0
	_ = Parse(bytes.NewReader(data), func(Rule) { n++ })
	if n == 0 {
		return errors.New("no usable domains in the downloaded file")
	}
	tmp := m.cachePath(src.ID) + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, m.cachePath(src.ID)); err != nil {
		return err
	}
	m.logf("blocklist: downloaded %s (%d rules)", src.Name, n)
	return nil
}
