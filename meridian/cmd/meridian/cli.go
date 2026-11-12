package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"text/tabwriter"
	"time"

	"meridian/internal/daemon"
	"meridian/internal/platform"
)

// client talks to the running service.
type client struct {
	info daemon.UIInfo
	http *http.Client
}

func runDirFromEnv() string {
	if d := os.Getenv("MERIDIAN_RUN_DIR"); d != "" {
		return d
	}
	return platform.RunDir()
}

func newClient() (*client, error) {
	info, err := daemon.ReadUIInfo(runDirFromEnv())
	if err != nil {
		return nil, errors.New("the Meridian service is not running (start it with \"meridian service install\" as administrator)")
	}
	return &client{info: info, http: &http.Client{Timeout: 60 * time.Second, Transport: &http.Transport{Proxy: nil}}}, nil
}

func (c *client) do(method, path string, body any, out any) error {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, fmt.Sprintf("http://127.0.0.1:%d%s", c.info.Port, path), rd)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.info.Token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("cannot reach the Meridian service: %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		var e struct{ Error string }
		if json.Unmarshal(data, &e) == nil && e.Error != "" {
			return errors.New(e.Error)
		}
		return fmt.Errorf("service answered HTTP %d", resp.StatusCode)
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

type statusView struct {
	State    string `json:"state"`
	Error    string `json:"error"`
	Warning  string `json:"warning"`
	Location *struct {
		ID, Name, Country, City string
	} `json:"location"`
	Since    time.Time `json:"since"`
	RxBytes  uint64    `json:"rxBytes"`
	TxBytes  uint64    `json:"txBytes"`
	Endpoint string    `json:"endpoint"`
	Exit     *struct {
		IP, City, CountryCode, Org string
	} `json:"exit"`
	Home *struct {
		IP, City, CountryCode string
	} `json:"home"`
	DNSServer  string `json:"dnsServer"`
	KillSwitch bool   `json:"killSwitch"`
	AdBlock    bool   `json:"adBlock"`
	DNS        struct {
		Queries, Blocked uint64
	} `json:"dns"`
}

func human(n uint64) string {
	const u = 1024
	if n < u {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := uint64(u), 0
	for m := n / u; m >= u; m /= u {
		div *= u
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(n)/float64(div), "KMGTPE"[exp])
}

func printStatus(s statusView) {
	switch s.State {
	case "connected", "connecting", "reconnecting":
		where := ""
		if s.Location != nil {
			where = s.Location.Name
			if s.Location.Country != "" {
				where += " (" + s.Location.Country + ")"
			}
		}
		fmt.Printf("%s to %s via %s\n", strings.Title(s.State), where, s.Endpoint)
		if !s.Since.IsZero() {
			fmt.Printf("  connected for %s, %s down / %s up\n", time.Since(s.Since).Round(time.Second), human(s.RxBytes), human(s.TxBytes))
		}
		if s.Exit != nil {
			fmt.Printf("  visible as %s, %s %s (%s)\n", s.Exit.IP, s.Exit.City, s.Exit.CountryCode, s.Exit.Org)
		}
		fmt.Printf("  DNS: %s, ad blocker %s (%d of %d queries blocked)\n", s.DNSServer, onOff(s.AdBlock), s.DNS.Blocked, s.DNS.Queries)
		fmt.Printf("  kill switch %s\n", onOff(s.KillSwitch))
	default:
		fmt.Println("Disconnected")
		if s.Home != nil {
			fmt.Printf("  visible as %s, %s %s (unprotected)\n", s.Home.IP, s.Home.City, s.Home.CountryCode)
		}
	}
	if s.Warning != "" {
		fmt.Println("  ! " + s.Warning)
	}
	if s.Error != "" {
		fmt.Println("  error: " + s.Error)
	}
}

func onOff(b bool) string {
	if b {
		return "on"
	}
	return "off"
}

func cliStatus([]string) error {
	c, err := newClient()
	if err != nil {
		return err
	}
	var s statusView
	if err := c.do("GET", "/api/status", nil, &s); err != nil {
		return err
	}
	printStatus(s)
	return nil
}

type locView struct {
	ID, Name, Country, City, Provider, Endpoint string
	Favorite                                    bool
}

func cliLocations([]string) error {
	c, err := newClient()
	if err != nil {
		return err
	}
	var locs []locView
	if err := c.do("GET", "/api/locations", nil, &locs); err != nil {
		return err
	}
	if len(locs) == 0 {
		fmt.Println("No locations yet. Import one with: meridian import my-server.conf")
		return nil
	}
	tw := tabwriter.NewWriter(os.Stdout, 2, 4, 2, ' ', 0)
	fmt.Fprintln(tw, "ID\tNAME\tCOUNTRY\tCITY\tPROVIDER\tSERVER")
	for _, l := range locs {
		star := ""
		if l.Favorite {
			star = " ★"
		}
		fmt.Fprintf(tw, "%s\t%s%s\t%s\t%s\t%s\t%s\n", l.ID, l.Name, star, l.Country, l.City, l.Provider, l.Endpoint)
	}
	return tw.Flush()
}

func cliConnect(args []string) error {
	c, err := newClient()
	if err != nil {
		return err
	}
	id := ""
	if len(args) > 0 {
		var locs []locView
		if err := c.do("GET", "/api/locations", nil, &locs); err != nil {
			return err
		}
		want := strings.ToLower(strings.Join(args, " "))
		for _, l := range locs {
			if strings.ToLower(l.ID) == want || strings.ToLower(l.Name) == want || strings.ToLower(l.Country) == want || strings.ToLower(l.City) == want {
				id = l.ID
				break
			}
		}
		if id == "" {
			return fmt.Errorf("no location matches %q (see \"meridian locations\")", want)
		}
	}
	var s statusView
	if err := c.do("POST", "/api/connect", map[string]string{"id": id}, &s); err != nil {
		return err
	}
	// Wait briefly for the handshake.
	for i := 0; i < 20 && s.State == "connecting"; i++ {
		time.Sleep(500 * time.Millisecond)
		_ = c.do("GET", "/api/status", nil, &s)
	}
	printStatus(s)
	return nil
}

func cliDisconnect([]string) error {
	c, err := newClient()
	if err != nil {
		return err
	}
	var s statusView
	if err := c.do("POST", "/api/disconnect", nil, &s); err != nil {
		return err
	}
	printStatus(s)
	return nil
}

func cliImport(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: meridian import FILE.conf...")
	}
	c, err := newClient()
	if err != nil {
		return err
	}
	type file struct {
		Name string `json:"name"`
		Text string `json:"text"`
	}
	var files []file
	for _, a := range args {
		data, err := os.ReadFile(a)
		if err != nil {
			return err
		}
		files = append(files, file{Name: filepath.Base(a), Text: string(data)})
	}
	var out []struct {
		Name     string
		Error    string
		Updated  bool
		Warnings []string
		Location *locView
	}
	if err := c.do("POST", "/api/locations/import", map[string]any{"files": files}, &out); err != nil {
		return err
	}
	failed := 0
	for _, o := range out {
		switch {
		case o.Error != "":
			failed++
			fmt.Printf("✗ %s: %s\n", o.Name, o.Error)
		default:
			verb := "added"
			if o.Updated {
				verb = "updated"
			}
			fmt.Printf("✓ %s %s as %q (%s %s)\n", o.Name, verb, o.Location.Name, o.Location.Country, o.Location.City)
			for _, w := range o.Warnings {
				fmt.Println("    note: " + w)
			}
		}
	}
	if failed > 0 {
		return fmt.Errorf("%d of %d files could not be imported", failed, len(out))
	}
	return nil
}

func cliURL([]string) error {
	info, err := daemon.ReadUIInfo(runDirFromEnv())
	if err != nil {
		return errors.New("the Meridian service is not running")
	}
	fmt.Println(info.URL())
	return nil
}
