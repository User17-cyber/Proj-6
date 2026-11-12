// Package daemon is the privileged background service: it owns the tunnel,
// the blocklists and the saved locations, and serves the local API.
package daemon

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"meridian/internal/api"
	"meridian/internal/blocklist"
	"meridian/internal/dnsproxy"
	"meridian/internal/engine"
	"meridian/internal/geo"
	"meridian/internal/netcfg"
	"meridian/internal/platform"
	"meridian/internal/sshsetup"
	"meridian/internal/store"
	"meridian/internal/wgconf"
	"meridian/server"
)

// DefaultListen is the API address; another port is used if it is taken.
const DefaultListen = "127.0.0.1:47811"

// Options configure the service.
type Options struct {
	DataDir string
	RunDir  string
	Listen  string
	Version string
	UI      fs.FS
	Logf    func(string, ...any)
	// Engine options for tests (TUN factory, network configurator).
	EngineOptions engine.Options
}

// UIInfo is written to RunDir/ui.json for the app and CLI.
type UIInfo struct {
	Port    int    `json:"port"`
	Token   string `json:"token"`
	PID     int    `json:"pid"`
	Version string `json:"version"`
}

// URL returns the address of the app page, with the token in the fragment
// (fragments are never sent to the server or logged).
func (u UIInfo) URL() string { return fmt.Sprintf("http://127.0.0.1:%d/#token=%s", u.Port, u.Token) }

// Daemon implements api.Backend.
type Daemon struct {
	opts  Options
	store *store.Store
	lists *blocklist.Manager
	eng   *engine.Engine
	srv   *api.Server
	setup *sshsetup.Manager

	mu          sync.Mutex
	flushed     dnsproxy.Stats
	flushedRx   uint64
	flushedTx   uint64
	flushedFrom *dnsproxy.Proxy
	updating    bool
	connectMu   sync.Mutex
}

// Run starts the service and blocks until ctx is cancelled.
func Run(ctx context.Context, o Options) error {
	if o.Logf == nil {
		o.Logf = func(string, ...any) {}
	}
	if o.Listen == "" {
		o.Listen = DefaultListen
	}
	if err := platform.SecureDir(o.DataDir); err != nil {
		return fmt.Errorf("preparing %s: %w", o.DataDir, err)
	}
	if err := platform.PublicDir(o.RunDir); err != nil {
		return fmt.Errorf("preparing %s: %w", o.RunDir, err)
	}
	netcfg.Cleanup(o.Logf)

	st, err := store.Open(filepath.Join(o.DataDir, "state.json"))
	if err != nil {
		return err
	}
	// Keep-alive is off so a download never reuses a connection made
	// before the tunnel went up or down.
	direct := &http.Client{Timeout: 90 * time.Second, Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, DisableKeepAlives: true}}
	lists := blocklist.NewManager(filepath.Join(o.DataDir, "lists"), direct, o.Logf)
	set := st.Settings()
	lists.Apply(set.Blocklists)

	d := &Daemon{opts: o, store: st, lists: lists}
	d.setup = sshsetup.New(server.InstallScript, d.importFromServer, o.Logf)
	eo := o.EngineOptions
	eo.Logf = o.Logf
	eo.Matcher = lists
	eo.OnChange = d.notify
	eo.OnExit = d.onExit
	d.eng = engine.New(eo, set.Settings)

	token, err := randomToken()
	if err != nil {
		return err
	}
	d.srv = api.New(d, token, o.UI)
	port, err := d.srv.Serve(ctx, o.Listen)
	if err != nil {
		o.Logf("daemon: %s is busy (%v); using a free port", o.Listen, err)
		if port, err = d.srv.Serve(ctx, "127.0.0.1:0"); err != nil {
			return err
		}
	}
	info := UIInfo{Port: port, Token: token, PID: os.Getpid(), Version: o.Version}
	uiFile := filepath.Join(o.RunDir, "ui.json")
	if err := writeUIInfo(uiFile, info); err != nil {
		return err
	}
	defer os.Remove(uiFile)
	o.Logf("daemon: Meridian %s listening on 127.0.0.1:%d", o.Version, port)

	go d.listUpdater(ctx)
	go d.totalsLoop(ctx)
	if set.AutoConnect {
		go d.autoConnect(ctx, set.AutoConnectTo)
	} else if set.ShowHomeLocation && set.CheckExit {
		go d.eng.RefreshHome()
	}

	<-ctx.Done()
	o.Logf("daemon: shutting down")
	d.eng.Close()
	d.flushTotals()
	return nil
}

// autoConnect connects at startup, retrying while the network comes up
// (at boot, Wi-Fi and DNS may take a while).
func (d *Daemon) autoConnect(ctx context.Context, id string) {
	delay := 2 * time.Second
	for attempt := 1; ; attempt++ {
		err := d.Connect(id)
		if err == nil {
			return
		}
		d.opts.Logf("daemon: auto-connect attempt %d failed: %v", attempt, err)
		if attempt >= 12 || d.eng.Status().State != engine.Disconnected {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
		delay = min(delay*2, 30*time.Second)
	}
}

func randomToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func writeUIInfo(path string, info UIInfo) error {
	data, _ := json.Marshal(info)
	tmp := path + ".tmp"
	_ = os.Remove(tmp)
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := platform.PublicFile(tmp); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ReadUIInfo reads the running service's address and token.
func ReadUIInfo(runDir string) (UIInfo, error) {
	var info UIInfo
	data, err := os.ReadFile(filepath.Join(runDir, "ui.json"))
	if err != nil {
		return info, err
	}
	err = json.Unmarshal(data, &info)
	return info, err
}

// --- api.Backend ---

func (d *Daemon) Store() *store.Store            { return d.store }
func (d *Daemon) Engine() *engine.Engine         { return d.eng }
func (d *Daemon) Blocklists() *blocklist.Manager { return d.lists }
func (d *Daemon) Version() string                { return d.opts.Version }
func (d *Daemon) notify()                        { d.srv.Notify() }
func (d *Daemon) Setup() *sshsetup.Manager       { return d.setup }
func (d *Daemon) ServerScript() []byte           { return server.InstallScript }

// importFromServer saves the config printed by a freshly set-up server.
func (d *Daemon) importFromServer(device, config string) (string, error) {
	res, err := d.store.Import(device+".conf", config)
	if err != nil {
		return "", err
	}
	d.notify()
	return res.Location.ID, nil
}
func (d *Daemon) onExit(id string, info *geo.Info) { d.store.SetExit(id, info) }

// Connect connects to a location (or the last used, favourite or first).
func (d *Daemon) Connect(id string) error {
	d.connectMu.Lock()
	defer d.connectMu.Unlock()
	locs := d.store.Locations()
	if len(locs) == 0 {
		return errors.New("add a location first: import a WireGuard config or set up your own server")
	}
	if id == "" {
		id = d.store.Last()
	}
	loc, ok := d.store.Get(id)
	if !ok {
		loc = locs[0] // favourites sort first
	}
	cfg, err := wgconf.Parse(loc.Config)
	if err != nil {
		return fmt.Errorf("%s: %w", loc.Name, err)
	}
	err = d.eng.Connect(engine.Target{ID: loc.ID, Name: loc.Name, Country: loc.Country, City: loc.City, Config: cfg})
	if err == nil {
		d.store.MarkUsed(loc.ID)
	}
	return err
}

// Disconnect disconnects.
func (d *Daemon) Disconnect() error {
	d.connectMu.Lock()
	defer d.connectMu.Unlock()
	d.flushTotals()
	return d.eng.Disconnect()
}

// ApplySettings saves settings and applies them to the tunnel and lists.
func (d *Daemon) ApplySettings(s store.Settings) error {
	old := d.store.Settings()
	if err := d.store.SetSettings(s); err != nil {
		return err
	}
	d.lists.Apply(s.Blocklists)
	if !s.ShowHomeLocation || !s.CheckExit {
		d.eng.ClearHome()
	} else if !old.ShowHomeLocation && d.eng.Status().State == engine.Disconnected {
		go d.eng.RefreshHome()
	}
	return d.eng.Apply(s.Settings)
}

// UpdateLists downloads stale (or, with force, all) enabled lists.
func (d *Daemon) UpdateLists(force bool) {
	d.mu.Lock()
	if d.updating {
		d.mu.Unlock()
		return
	}
	d.updating = true
	d.mu.Unlock()
	go func() {
		defer func() {
			d.mu.Lock()
			d.updating = false
			d.mu.Unlock()
			d.notify()
		}()
		hours := d.store.Settings().ListUpdateHours
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		if err := d.lists.Update(ctx, time.Duration(hours)*time.Hour, force); err != nil {
			d.opts.Logf("daemon: blocklist update: %v", err)
		}
	}()
}

func (d *Daemon) listUpdater(ctx context.Context) {
	d.UpdateLists(false)
	t := time.NewTicker(30 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			d.UpdateLists(false)
		}
	}
}

// DNSStats returns counters for this connection and lifetime totals.
func (d *Daemon) DNSStats() (dnsproxy.Stats, store.Totals) {
	totals := d.store.Totals()
	p := d.eng.Proxy()
	if p == nil {
		return dnsproxy.Stats{}, totals
	}
	st := p.Stats()
	es := d.eng.Status()
	d.mu.Lock()
	if d.flushedFrom == p {
		totals.Queries += st.Queries - d.flushed.Queries
		totals.Blocked += st.Blocked - d.flushed.Blocked
		totals.RxBytes += es.RxBytes - min(es.RxBytes, d.flushedRx)
		totals.TxBytes += es.TxBytes - min(es.TxBytes, d.flushedTx)
	} else {
		totals.Queries += st.Queries
		totals.Blocked += st.Blocked
		totals.RxBytes += es.RxBytes
		totals.TxBytes += es.TxBytes
	}
	d.mu.Unlock()
	return st, totals
}

// flushTotals adds this connection's new counts to the lifetime totals.
func (d *Daemon) flushTotals() {
	p := d.eng.Proxy()
	if p == nil {
		return
	}
	st := p.Stats()
	es := d.eng.Status()
	d.mu.Lock()
	var delta store.Totals
	if d.flushedFrom != p {
		d.flushedFrom, d.flushed, d.flushedRx, d.flushedTx = p, dnsproxy.Stats{}, 0, 0
	}
	delta.Queries = st.Queries - d.flushed.Queries
	delta.Blocked = st.Blocked - d.flushed.Blocked
	delta.RxBytes = es.RxBytes - min(es.RxBytes, d.flushedRx)
	delta.TxBytes = es.TxBytes - min(es.TxBytes, d.flushedTx)
	d.flushed, d.flushedRx, d.flushedTx = st, max(es.RxBytes, d.flushedRx), max(es.TxBytes, d.flushedTx)
	d.mu.Unlock()
	if delta != (store.Totals{}) {
		d.store.AddTotals(delta)
	}
}

func (d *Daemon) totalsLoop(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			d.flushTotals()
		}
	}
}
