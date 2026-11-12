package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"meridian/internal/geo"
)

const conf = `[Interface]
PrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=
Address = 10.64.0.2/32
DNS = 10.64.0.1

[Peer]
PublicKey = xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 185.65.135.1:51820
`

func TestImportAndPlace(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	res, err := s.Import("mullvad-se-sto-wg-001.conf", conf)
	if err != nil {
		t.Fatal(err)
	}
	l := res.Location
	if l.Country != "SE" || l.City != "Stockholm" || l.Name != "Stockholm" || l.Provider != "Mullvad" || l.PlaceFrom != "filename" {
		t.Fatalf("location = %+v", l)
	}
	// Re-importing the same peer updates instead of duplicating.
	res2, err := s.Import("other-name.conf", conf)
	if err != nil || !res2.Updated || res2.Location.ID != l.ID || len(s.Locations()) != 1 {
		t.Fatalf("re-import: %+v %v", res2, err)
	}
	// The exit lookup corrects a guess, but not a user's choice.
	if got, _ := s.SetExit(l.ID, &geo.Info{IP: "1.2.3.4", CountryCode: "NL", City: "Amsterdam"}); got.Country != "NL" || got.PlaceFrom != "exit" {
		t.Fatalf("exit did not place: %+v", got)
	}
	cc := "DE"
	if _, err := s.Update(l.ID, Patch{Country: &cc}); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.SetExit(l.ID, &geo.Info{IP: "1.2.3.4", CountryCode: "NL"}); got.Country != "DE" {
		t.Fatalf("exit overrode the user: %+v", got)
	}
	bad := "ZZ"
	if _, err := s.Update(l.ID, Patch{Country: &bad}); err == nil {
		t.Fatal("bad country accepted")
	}

	// The file is private and reloads.
	fi, err := os.Stat(path)
	if err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v %v", fi.Mode(), err)
	}
	s2, err := Open(path)
	if err != nil || len(s2.Locations()) != 1 || !strings.Contains(s2.Locations()[0].Config, "PrivateKey") {
		t.Fatalf("reload failed: %v", err)
	}
	if err := s2.Delete(l.ID); err != nil || len(s2.Locations()) != 0 {
		t.Fatal("delete failed")
	}
}

func TestDamagedFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	os.WriteFile(path, []byte("{not json"), 0o600)
	s, err := Open(path)
	if err != nil || !s.Settings().AdBlock {
		t.Fatalf("damaged file not replaced with defaults: %v", err)
	}
	matches, _ := filepath.Glob(path + ".damaged-*")
	if len(matches) != 1 {
		t.Fatal("damaged file not kept")
	}
}
