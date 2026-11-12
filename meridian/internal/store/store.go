// Package store keeps locations and settings in a JSON file that only the
// system account can read (it holds WireGuard private keys).
package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"meridian/internal/blocklist"
	"meridian/internal/engine"
	"meridian/internal/geo"
	"meridian/internal/regions"
	"meridian/internal/wgconf"
)

// Location is a saved WireGuard server.
type Location struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Country   string    `json:"country"`
	City      string    `json:"city"`
	Provider  string    `json:"provider,omitempty"`
	Config    string    `json:"config"` // wg-quick text, includes the private key
	Favorite  bool      `json:"favorite,omitempty"`
	AddedAt   time.Time `json:"addedAt"`
	LastUsed  time.Time `json:"lastUsed,omitempty"`
	PlaceFrom string    `json:"placeFrom,omitempty"` // config, filename, endpoint, exit, user
	Exit      *geo.Info `json:"exit,omitempty"`      // last observed exit address
}

// Settings are all user preferences.
type Settings struct {
	engine.Settings
	Blocklists       blocklist.Settings `json:"blocklists"`
	AutoConnect      bool               `json:"autoConnect"`
	AutoConnectTo    string             `json:"autoConnectTo"` // location ID, "" = last used
	ListUpdateHours  int                `json:"listUpdateHours"`
	ShowHomeLocation bool               `json:"showHomeLocation"`
}

// Totals are lifetime counters.
type Totals struct {
	Queries uint64 `json:"queries"`
	Blocked uint64 `json:"blocked"`
	RxBytes uint64 `json:"rxBytes"`
	TxBytes uint64 `json:"txBytes"`
}

type file struct {
	Version   int        `json:"version"`
	Locations []Location `json:"locations"`
	Settings  Settings   `json:"settings"`
	Last      string     `json:"lastLocation"`
	Totals    Totals     `json:"totals"`
}

// Store is safe for concurrent use.
type Store struct {
	path string
	mu   sync.Mutex
	f    file
}

// DefaultSettings for a fresh install.
func DefaultSettings() Settings {
	return Settings{
		Settings:         engine.DefaultSettings(),
		Blocklists:       blocklist.DefaultSettings(),
		ListUpdateHours:  24,
		ShowHomeLocation: true,
	}
}

// Open loads (or creates) the store at path.
func Open(path string) (*Store, error) {
	s := &Store{path: path}
	s.f.Version = 1
	s.f.Settings = DefaultSettings()
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, s.saveLocked()
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &s.f); err != nil {
		// Keep the damaged file for inspection and start fresh.
		_ = os.Rename(path, path+".damaged-"+time.Now().Format("20060102-150405"))
		s.f = file{Version: 1, Settings: DefaultSettings()}
		return s, s.saveLocked()
	}
	if s.f.Settings.ListUpdateHours <= 0 {
		s.f.Settings.ListUpdateHours = 24
	}
	if s.f.Settings.DNSUpstream == "" {
		s.f.Settings.DNSUpstream = "auto"
	}
	return s, nil
}

func (s *Store) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s.f, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func newID() string {
	var b [6]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// Locations returns all locations, favourites first then by country.
func (s *Store) Locations() []Location {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := append([]Location(nil), s.f.Locations...)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Favorite != b.Favorite {
			return a.Favorite
		}
		an, bn := countryName(a.Country), countryName(b.Country)
		if an != bn {
			return an < bn
		}
		return strings.ToLower(a.Name) < strings.ToLower(b.Name)
	})
	return out
}

func countryName(code string) string {
	if c, ok := regions.Lookup(code); ok {
		return c.Name
	}
	return "~" // unknown sorts last
}

// Get returns a location by ID.
func (s *Store) Get(id string) (Location, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, l := range s.f.Locations {
		if l.ID == id {
			return l, true
		}
	}
	return Location{}, false
}

// ImportResult describes one imported config.
type ImportResult struct {
	Location Location `json:"location"`
	Warnings []string `json:"warnings,omitempty"`
	Updated  bool     `json:"updated"`
}

// Import parses a config and saves it as a location. A config for a peer
// that already exists (same server key and private key) replaces it.
func (s *Store) Import(filename, text string) (ImportResult, error) {
	cfg, err := wgconf.Parse(text)
	if err != nil {
		return ImportResult{}, err
	}
	loc := Location{
		Name:     strings.TrimSpace(cfg.Meta.Name),
		Country:  cfg.Meta.Country,
		City:     cfg.Meta.City,
		Provider: cfg.Meta.Provider,
		Config:   cfg.String(),
		AddedAt:  time.Now(),
	}
	if loc.Country != "" {
		loc.PlaceFrom = "config"
	} else if g, ok := regions.Detect(filename, cfg.EndpointHost()); ok {
		loc.Country, loc.City, loc.PlaceFrom = g.Country, g.City, g.Source
	}
	if loc.Name == "" {
		switch {
		case loc.City != "":
			loc.Name = loc.City
		case filename != "":
			loc.Name = strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
		case loc.Country != "":
			if c, ok := regions.Lookup(loc.Country); ok {
				loc.Name = c.Name
			}
		default:
			loc.Name = cfg.EndpointHost()
		}
	}
	if loc.Provider == "" {
		loc.Provider = guessProvider(filename, cfg.EndpointHost())
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	res := ImportResult{Warnings: cfg.Warnings}
	for i, old := range s.f.Locations {
		oc, err := wgconf.Parse(old.Config)
		if err == nil && oc.Interface.PrivateKey == cfg.Interface.PrivateKey && oc.Peers[0].PublicKey == cfg.Peers[0].PublicKey {
			loc.ID, loc.Favorite, loc.LastUsed, loc.AddedAt, loc.Exit = old.ID, old.Favorite, old.LastUsed, old.AddedAt, old.Exit
			if old.PlaceFrom == "user" {
				loc.Country, loc.City, loc.PlaceFrom = old.Country, old.City, old.PlaceFrom
			}
			s.f.Locations[i] = loc
			res.Location, res.Updated = loc, true
			return res, s.saveLocked()
		}
	}
	loc.ID = newID()
	s.f.Locations = append(s.f.Locations, loc)
	res.Location = loc
	return res, s.saveLocked()
}

func guessProvider(filename, host string) string {
	s := strings.ToLower(filename + " " + host)
	for _, p := range [][2]string{
		{"mullvad", "Mullvad"}, {"proton", "Proton VPN"}, {"ivpn", "IVPN"}, {"airvpn", "AirVPN"},
		{"windscribe", "Windscribe"}, {"surfshark", "Surfshark"}, {"nord", "NordVPN"},
		{"azire", "AzireVPN"}, {"ovpn", "OVPN"}, {"meridian", "Meridian server"},
	} {
		if strings.Contains(s, p[0]) {
			return p[1]
		}
	}
	return ""
}

// Patch holds editable location fields; nil means unchanged.
type Patch struct {
	Name     *string `json:"name"`
	Country  *string `json:"country"`
	City     *string `json:"city"`
	Favorite *bool   `json:"favorite"`
}

// Update edits a location.
func (s *Store) Update(id string, p Patch) (Location, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.f.Locations {
		l := &s.f.Locations[i]
		if l.ID != id {
			continue
		}
		if p.Name != nil && strings.TrimSpace(*p.Name) != "" {
			l.Name = strings.TrimSpace(*p.Name)
		}
		if p.Country != nil {
			cc := strings.ToUpper(strings.TrimSpace(*p.Country))
			if _, ok := regions.Lookup(cc); !ok && cc != "" {
				return Location{}, errors.New("unknown country code")
			}
			l.Country, l.PlaceFrom = cc, "user"
		}
		if p.City != nil {
			l.City, l.PlaceFrom = strings.TrimSpace(*p.City), "user"
		}
		if p.Favorite != nil {
			l.Favorite = *p.Favorite
		}
		return *l, s.saveLocked()
	}
	return Location{}, errors.New("location not found")
}

// Delete removes a location.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, l := range s.f.Locations {
		if l.ID == id {
			s.f.Locations = append(s.f.Locations[:i], s.f.Locations[i+1:]...)
			if s.f.Last == id {
				s.f.Last = ""
			}
			return s.saveLocked()
		}
	}
	return errors.New("location not found")
}

// MarkUsed records a connection to a location.
func (s *Store) MarkUsed(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.f.Locations {
		if s.f.Locations[i].ID == id {
			s.f.Locations[i].LastUsed = time.Now()
			s.f.Last = id
			_ = s.saveLocked()
			return
		}
	}
}

// SetExit remembers the exit address seen through a location and fills in
// its country and city if they were unknown.
func (s *Store) SetExit(id string, info *geo.Info) (Location, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.f.Locations {
		l := &s.f.Locations[i]
		if l.ID != id {
			continue
		}
		l.Exit = info
		if info.CountryCode != "" && (l.Country == "" || l.PlaceFrom == "filename" || l.PlaceFrom == "endpoint" || l.PlaceFrom == "exit") {
			if _, ok := regions.Lookup(info.CountryCode); ok {
				l.Country, l.City, l.PlaceFrom = info.CountryCode, info.City, "exit"
			}
		}
		_ = s.saveLocked()
		return *l, true
	}
	return Location{}, false
}

// Last returns the most recently used location ID.
func (s *Store) Last() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.f.Last
}

// Settings returns the settings.
func (s *Store) Settings() Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.f.Settings
}

// SetSettings replaces the settings.
func (s *Store) SetSettings(v Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if v.ListUpdateHours <= 0 {
		v.ListUpdateHours = 24
	}
	s.f.Settings = v
	return s.saveLocked()
}

// Totals returns lifetime counters.
func (s *Store) Totals() Totals {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.f.Totals
}

// AddTotals adds to the lifetime counters.
func (s *Store) AddTotals(d Totals) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.f.Totals.Queries += d.Queries
	s.f.Totals.Blocked += d.Blocked
	s.f.Totals.RxBytes += d.RxBytes
	s.f.Totals.TxBytes += d.TxBytes
	_ = s.saveLocked()
}
