package blocklist

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestParseLine(t *testing.T) {
	cases := []struct {
		in   string
		ok   bool
		want Rule
	}{
		{"0.0.0.0 ads.example.com", true, Rule{Domain: "ads.example.com", Kind: Exact}},
		{"127.0.0.1\tTracker.Example.COM. # comment", true, Rule{Domain: "tracker.example.com", Kind: Exact}},
		{":: ipv6.example.com", true, Rule{Domain: "ipv6.example.com", Kind: Exact}},
		{"0.0.0.0 localhost", false, Rule{}},
		{"127.0.0.1 localhost.localdomain", false, Rule{}},
		{"0.0.0.0 0.0.0.0", false, Rule{}},
		{"255.255.255.255 broadcasthost", false, Rule{}},
		{"plain.example.org", true, Rule{Domain: "plain.example.org", Kind: Exact}},
		{"*.wild.example.org", true, Rule{Domain: "wild.example.org", Kind: Wildcard}},
		{"||adblock.example.net^", true, Rule{Domain: "adblock.example.net", Kind: Wildcard}},
		{"||important.example.net^$important", true, Rule{Domain: "important.example.net", Kind: Wildcard}},
		{"@@||allowed.example.net^", true, Rule{Domain: "allowed.example.net", Kind: Wildcard, Allow: true}},
		{"@@||allowed.example.net^|", true, Rule{Domain: "allowed.example.net", Kind: Wildcard, Allow: true}},
		{"||client.example.net^$client=192.168.1.5", false, Rule{}},
		{"||example.com/path^", false, Rule{}},
		{"/ad[0-9]+\\.example/", false, Rule{}},
		{"! comment", false, Rule{}},
		{"# comment", false, Rule{}},
		{"[Adblock Plus]", false, Rule{}},
		{"singlelabel", false, Rule{}},
		{"bad..example.com", false, Rule{}},
		{"under_score.example.com", true, Rule{Domain: "under_score.example.com", Kind: Exact}},
		{"1.2.3.4", false, Rule{}},
	}
	for _, c := range cases {
		got, ok := ParseLine(c.in)
		if ok != c.ok || (ok && got != c.want) {
			t.Errorf("ParseLine(%q) = %+v, %v; want %+v, %v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestSetMatch(t *testing.T) {
	s := NewSet(10)
	s.Add(Rule{Domain: "ads.example.com", Kind: Exact}, 0)
	s.Add(Rule{Domain: "tracker.net", Kind: Wildcard}, 1)
	s.Add(Rule{Domain: "good.tracker.net", Kind: Wildcard, Allow: true}, 2)
	s.Add(Rule{Domain: "doubleclick.net", Kind: Wildcard}, 2)

	cases := map[string]bool{
		"ads.example.com":          true,
		"ADS.Example.com.":         true,
		"x.ads.example.com":        false, // exact rule does not cover subdomains
		"example.com":              false,
		"tracker.net":              true,
		"a.b.tracker.net":          true,
		"good.tracker.net":         false, // exception wins
		"cdn.good.tracker.net":     false,
		"stats.g.doubleclick.net":  true,
		"notdoubleclick.net":       false,
		"doubleclick.net.evil.com": false,
	}
	for name, want := range cases {
		if got, _ := s.Match(name); got != want {
			t.Errorf("Match(%q) = %v, want %v", name, got, want)
		}
	}
	if _, lists := s.Match("a.tracker.net"); lists != 1<<1 {
		t.Errorf("list mask = %b", lists)
	}
}

func TestManager(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		fmt.Fprintln(w, "# test list")
		fmt.Fprintln(w, "0.0.0.0 downloaded.example.com")
		fmt.Fprintln(w, "||wild.example.org^")
	}))
	defer srv.Close()

	dir := t.TempDir()
	m := NewManager(dir, srv.Client(), t.Logf)
	m.Apply(Settings{
		Enabled:    []string{"essentials", "mine"},
		CustomURLs: []Source{{ID: "mine", Name: "My list", URL: srv.URL, Custom: true}},
		Block:      []string{"https://blocked-by-me.example/path", "*.also.example"},
		Allow:      []string{"ads.doubleclick.net"},
	})
	if b, list := m.Match("stats.doubleclick.net"); !b || list != "Meridian essentials" {
		t.Fatalf("essentials not active: %v %q", b, list)
	}
	if b, _ := m.Match("ads.doubleclick.net"); b {
		t.Fatal("allow rule ignored")
	}
	if b, list := m.Match("x.blocked-by-me.example"); !b || list != "Your block rules" {
		t.Fatalf("custom block: %v %q", b, list)
	}
	if b, _ := m.Match("also.example"); !b {
		t.Fatal("wildcard custom rule not normalised")
	}
	if b, _ := m.Match("downloaded.example.com"); b {
		t.Fatal("list should not match before download")
	}

	if err := m.Update(context.Background(), time.Hour, false); err != nil {
		t.Fatal(err)
	}
	if b, list := m.Match("downloaded.example.com"); !b || list != "My list" {
		t.Fatalf("downloaded list not active: %v %q", b, list)
	}
	if b, _ := m.Match("deep.wild.example.org"); !b {
		t.Fatal("adblock rule from download not active")
	}
	// A fresh cache is not downloaded again.
	if err := m.Update(context.Background(), time.Hour, false); err != nil || hits != 1 {
		t.Fatalf("unexpected re-download: hits=%d err=%v", hits, err)
	}
	// A new manager loads the cache without the network.
	m2 := NewManager(dir, nil, nil)
	m2.Apply(m.Settings())
	if b, _ := m2.Match("downloaded.example.com"); !b {
		t.Fatal("cached list not loaded")
	}
	var mine ListStatus
	for _, st := range m.Status() {
		if st.ID == "mine" {
			mine = st
		}
	}
	if !mine.Enabled || mine.Rules != 2 || mine.Updated.IsZero() {
		t.Fatalf("status = %+v", mine)
	}
}

func TestManagerDownloadErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/empty") {
			fmt.Fprintln(w, "<html>not a list</html>")
			return
		}
		http.Error(w, "nope", 404)
	}))
	defer srv.Close()
	m := NewManager(t.TempDir(), srv.Client(), nil)
	m.Apply(Settings{
		Enabled: []string{"a", "b"},
		CustomURLs: []Source{
			{ID: "a", Name: "A", URL: srv.URL + "/missing"},
			{ID: "b", Name: "B", URL: srv.URL + "/empty"},
		},
	})
	err := m.Update(context.Background(), time.Hour, true)
	if err == nil || !strings.Contains(err.Error(), "HTTP 404") || !strings.Contains(err.Error(), "no usable domains") {
		t.Fatalf("err = %v", err)
	}
}

// TestRealLists parses real downloaded lists when they are available.
func TestRealLists(t *testing.T) {
	dir := os.Getenv("MERIDIAN_LIST_DIR")
	if dir == "" {
		t.Skip("set MERIDIAN_LIST_DIR to a folder of downloaded lists")
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		f, err := os.Open(dir + "/" + e.Name())
		if err != nil {
			t.Fatal(err)
		}
		set := NewSet(100000)
		start := time.Now()
		_ = Parse(f, func(r Rule) { set.Add(r, 0) })
		f.Close()
		t.Logf("%-60s %8d rules in %v", e.Name(), set.Len(), time.Since(start))
		if set.Len() == 0 {
			t.Errorf("%s: no rules", e.Name())
		}
	}
}
