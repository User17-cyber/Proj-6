// Package geo looks up the public IP address and approximate location the
// rest of the Internet sees, which shows whether the VPN changed it.
package geo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Info is the visible public address and its location.
type Info struct {
	IP          string    `json:"ip"`
	City        string    `json:"city,omitempty"`
	Region      string    `json:"region,omitempty"`
	Country     string    `json:"country,omitempty"`
	CountryCode string    `json:"countryCode,omitempty"`
	Org         string    `json:"org,omitempty"`
	Lat         float64   `json:"lat,omitempty"`
	Lon         float64   `json:"lon,omitempty"`
	Source      string    `json:"source"`
	At          time.Time `json:"at"`
}

// Provider is a "what is my IP" service that returns JSON.
type Provider struct {
	Name string
	URL  string
}

// Providers are tried in order until one answers.
var Providers = []Provider{
	{"ipwho.is", "https://ipwho.is/"},
	{"ipapi.co", "https://ipapi.co/json/"},
	{"ip.sb", "https://api.ip.sb/geoip"},
	{"ifconfig.co", "https://ifconfig.co/json"},
}

func init() {
	// MERIDIAN_GEO_URL points at a single provider (used by tests).
	if u := os.Getenv("MERIDIAN_GEO_URL"); u != "" {
		Providers = []Provider{{"custom", u}}
	}
}

// Lookup asks the providers in turn.
func Lookup(ctx context.Context, client *http.Client) (*Info, error) {
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	var errs []error
	for _, p := range Providers {
		info, err := fetch(ctx, client, p)
		if err == nil {
			return info, nil
		}
		errs = append(errs, fmt.Errorf("%s: %w", p.Name, err))
		if ctx.Err() != nil {
			break
		}
	}
	return nil, errors.Join(errs...)
}

func fetch(ctx context.Context, client *http.Client, p Provider) (*Info, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", p.URL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Meridian-VPN/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return nil, err
	}
	info, err := Parse(body)
	if err != nil {
		return nil, err
	}
	info.Source = p.Name
	info.At = time.Now()
	return info, nil
}

// Parse reads the JSON formats of the common providers.
func Parse(body []byte) (*Info, error) {
	var m map[string]any
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, fmt.Errorf("not JSON: %w", err)
	}
	if s, ok := m["success"].(bool); ok && !s {
		return nil, fmt.Errorf("provider error: %v", m["message"])
	}
	if e, ok := m["error"].(bool); ok && e {
		return nil, fmt.Errorf("provider error: %v", m["reason"])
	}
	info := &Info{
		IP:          str(m, "ip", "query"),
		City:        str(m, "city"),
		Region:      str(m, "region", "region_name", "regionName"),
		Country:     str(m, "country_name", "country"),
		CountryCode: strings.ToUpper(str(m, "country_code", "countryCode", "country_iso")),
		Org:         str(m, "org", "organization", "asn_org", "isp"),
		Lat:         num(m, "latitude", "lat"),
		Lon:         num(m, "longitude", "lon"),
	}
	if info.Org == "" {
		if c, ok := m["connection"].(map[string]any); ok {
			info.Org = str(c, "org", "isp")
		}
	}
	if len(info.Country) == 2 && info.CountryCode == "" {
		info.CountryCode, info.Country = strings.ToUpper(info.Country), ""
	}
	if info.IP == "" {
		return nil, errors.New("response has no IP address")
	}
	return info, nil
}

func str(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k].(string); ok && v != "" {
			return v
		}
	}
	return ""
}

func num(m map[string]any, keys ...string) float64 {
	for _, k := range keys {
		switch v := m[k].(type) {
		case float64:
			return v
		case string:
			var f float64
			if _, err := fmt.Sscanf(v, "%g", &f); err == nil {
				return f
			}
		}
	}
	return 0
}
