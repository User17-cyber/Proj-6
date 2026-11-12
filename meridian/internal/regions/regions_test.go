package regions

import "testing"

func TestLookup(t *testing.T) {
	for code, name := range map[string]string{"NL": "Netherlands", "us": "United States", "GB": "United Kingdom", "XK": "Kosovo", "HK": "Hong Kong"} {
		c, ok := Lookup(code)
		if !ok || c.Name != name {
			t.Errorf("Lookup(%s) = %+v", code, c)
		}
	}
	if c, _ := Lookup("SG"); c.X == 0 || c.Y == 0 {
		t.Error("Singapore has no map position")
	}
	if _, ok := Lookup("ZZ"); ok {
		t.Error("ZZ accepted")
	}
}

func TestDetect(t *testing.T) {
	cases := []struct {
		file, host    string
		country, city string
		ok            bool
	}{
		{"mullvad-nl-ams-wg-001.conf", "", "NL", "Amsterdam", true},
		{"mullvad-us-nyc-wg-301.conf", "", "US", "New York", true},
		{"wg.conf", "se-sto-wg-001.relays.mullvad.net", "SE", "Stockholm", true},
		{"US-FREE#12.conf", "", "US", "", true},
		{"ProtonVPN-JP-3.conf", "", "JP", "", true},
		{"nl1.conf", "", "NL", "", true},
		{"de-fra-wg-004.conf", "", "DE", "Frankfurt", true},
		{"ch-zrh.conf", "", "CH", "Zurich", true},
		{"my-laptop.conf", "", "", "", false},
		{"home.conf", "203.0.113.5", "", "", false},
		{"office.conf", "vpn.example.com", "", "", false},
	}
	for _, c := range cases {
		g, ok := Detect(c.file, c.host)
		if ok != c.ok || g.Country != c.country || g.City != c.city {
			t.Errorf("Detect(%q, %q) = %+v, %v; want %s/%s %v", c.file, c.host, g, ok, c.country, c.city, c.ok)
		}
	}
}

func TestCitiesHaveValidCountries(t *testing.T) {
	for _, c := range Cities {
		if _, ok := Lookup(c.Country); !ok {
			t.Errorf("city %s has unknown country %s", c.Name, c.Country)
		}
		if c.Lat < -90 || c.Lat > 90 || c.Lon < -180 || c.Lon > 180 {
			t.Errorf("city %s has bad coordinates", c.Name)
		}
	}
}
