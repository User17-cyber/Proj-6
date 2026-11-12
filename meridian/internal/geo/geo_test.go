package geo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseProviders(t *testing.T) {
	cases := map[string]struct {
		body              string
		ip, city, cc, org string
	}{
		"ipwho.is": {`{"ip":"185.65.134.1","success":true,"country":"Netherlands","country_code":"NL","region":"North Holland","city":"Amsterdam","latitude":52.37,"longitude":4.89,"connection":{"org":"M247 Europe SRL"}}`,
			"185.65.134.1", "Amsterdam", "NL", "M247 Europe SRL"},
		"ipapi.co": {`{"ip":"203.0.113.9","city":"Tokyo","region":"Tokyo","country":"JP","country_name":"Japan","country_code":"JP","latitude":35.6,"longitude":139.7,"org":"Example KK"}`,
			"203.0.113.9", "Tokyo", "JP", "Example KK"},
		"ip.sb": {`{"organization":"Hetzner","longitude":11.07,"city":"Nuremberg","country":"Germany","ip":"198.51.100.4","country_code":"DE","region":"Bavaria","latitude":49.45}`,
			"198.51.100.4", "Nuremberg", "DE", "Hetzner"},
		"ifconfig.co": {`{"ip":"192.0.2.77","country":"Sweden","country_iso":"SE","region_name":"Stockholm","city":"Stockholm","latitude":59.3,"longitude":18.0,"asn_org":"31173 Services AB"}`,
			"192.0.2.77", "Stockholm", "SE", "31173 Services AB"},
	}
	for name, c := range cases {
		info, err := Parse([]byte(c.body))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if info.IP != c.ip || info.City != c.city || info.CountryCode != c.cc || info.Org != c.org || info.Lat == 0 {
			t.Errorf("%s: %+v", name, info)
		}
	}
	if _, err := Parse([]byte(`{"success":false,"message":"rate limited"}`)); err == nil {
		t.Error("error response accepted")
	}
	if _, err := Parse([]byte(`<html>`)); err == nil {
		t.Error("HTML accepted")
	}
}

func TestLookupFallsBack(t *testing.T) {
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "busy", 429) }))
	defer bad.Close()
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ip":"192.0.2.1","country_code":"NL","city":"Amsterdam"}`))
	}))
	defer good.Close()
	old := Providers
	defer func() { Providers = old }()
	Providers = []Provider{{"bad", bad.URL}, {"good", good.URL}}
	info, err := Lookup(context.Background(), nil)
	if err != nil || info.Source != "good" || info.IP != "192.0.2.1" {
		t.Fatalf("info=%+v err=%v", info, err)
	}
}
