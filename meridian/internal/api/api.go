// Package api serves the app's user interface and a JSON API on the
// loopback interface. Every API call needs the random token the service
// writes for the local user; the Host header is checked so that web pages
// cannot reach the API through DNS rebinding.
package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"rsc.io/qr"

	"meridian/internal/blocklist"
	"meridian/internal/dnsproxy"
	"meridian/internal/engine"
	"meridian/internal/geo"
	"meridian/internal/regions"
	"meridian/internal/sshsetup"
	"meridian/internal/store"
	"meridian/internal/wgconf"
)

// Backend is what the API controls (implemented by the daemon).
type Backend interface {
	Store() *store.Store
	Engine() *engine.Engine
	Blocklists() *blocklist.Manager
	Connect(id string) error
	Disconnect() error
	ApplySettings(s store.Settings) error
	UpdateLists(force bool)
	DNSStats() (dnsproxy.Stats, store.Totals)
	Version() string
	Setup() *sshsetup.Manager
	ServerScript() []byte
}

// Server is the HTTP server.
type Server struct {
	b     Backend
	token string
	ui    fs.FS
	port  int

	mu      sync.Mutex
	clients map[chan struct{}]struct{}
}

// New creates the server. ui holds index.html and its assets.
func New(b Backend, token string, ui fs.FS) *Server {
	return &Server{b: b, token: token, ui: ui, clients: map[chan struct{}]struct{}{}}
}

// Notify wakes every event stream (the status changed).
func (s *Server) Notify() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for ch := range s.clients {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// Serve listens on addr (for example 127.0.0.1:47811, or :0 for any port)
// and returns the port in use.
func (s *Server) Serve(ctx context.Context, addr string) (int, error) {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return 0, err
	}
	s.port = ln.Addr().(*net.TCPAddr).Port
	srv := &http.Server{
		Handler:           s.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Shutdown(sctx)
	}()
	go func() { _ = srv.Serve(ln) }()
	return s.port, nil
}

// Handler returns the HTTP handler (exported for tests).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/status", s.status)
	mux.HandleFunc("GET /api/events", s.events)
	mux.HandleFunc("GET /api/locations", s.locations)
	mux.HandleFunc("POST /api/locations/import", s.importLocations)
	mux.HandleFunc("PATCH /api/locations/{id}", s.patchLocation)
	mux.HandleFunc("DELETE /api/locations/{id}", s.deleteLocation)
	mux.HandleFunc("GET /api/locations/{id}/config", s.exportConfig)
	mux.HandleFunc("GET /api/locations/{id}/qr.svg", s.qrCode)
	mux.HandleFunc("POST /api/connect", s.connect)
	mux.HandleFunc("POST /api/disconnect", s.disconnect)
	mux.HandleFunc("GET /api/settings", s.getSettings)
	mux.HandleFunc("PUT /api/settings", s.putSettings)
	mux.HandleFunc("GET /api/adblock", s.adblock)
	mux.HandleFunc("PUT /api/adblock/lists", s.putLists)
	mux.HandleFunc("POST /api/adblock/rules", s.rules)
	mux.HandleFunc("POST /api/adblock/update", s.updateLists)
	mux.HandleFunc("POST /api/dns/flush", s.flushDNS)
	mux.HandleFunc("GET /api/meta", s.meta)
	mux.HandleFunc("POST /api/servers/setup", s.startSetup)
	mux.HandleFunc("GET /api/servers/setup/{id}", s.getSetup)
	mux.HandleFunc("GET /api/server-script", s.serverScript)
	mux.Handle("GET /", s.static())
	return s.guard(mux)
}

func (s *Server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if host != "127.0.0.1" && host != "localhost" && host != "::1" {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Cache-Control", "no-store")
			auth := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if subtle.ConstantTimeCompare([]byte(auth), []byte(s.token)) != 1 {
				writeErr(w, http.StatusUnauthorized, errors.New("missing or wrong access token"))
				return
			}
			if r.Method != "GET" && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") && r.ContentLength > 0 {
				writeErr(w, http.StatusUnsupportedMediaType, errors.New("JSON body expected"))
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) static() http.Handler {
	files := http.FileServer(http.FS(s.ui))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/regions.json" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"countries": regions.Countries, "cities": regions.Cities})
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		files.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func readJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 8<<20))
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("invalid request: %w", err)
	}
	return nil
}

// --- status ---

type statusResponse struct {
	engine.Status
	DNS        dnsproxy.Stats `json:"dns"`
	Totals     store.Totals   `json:"totals"`
	Rules      int            `json:"rules"`
	Locations  int            `json:"locations"`
	LastUsed   string         `json:"lastUsed"`
	ServerTime time.Time      `json:"serverTime"`
}

func (s *Server) snapshot() statusResponse {
	st := s.b.Engine().Status()
	dns, totals := s.b.DNSStats()
	return statusResponse{
		Status:     st,
		DNS:        dns,
		Totals:     totals,
		Rules:      s.b.Blocklists().RuleCount(),
		Locations:  len(s.b.Store().Locations()),
		LastUsed:   s.b.Store().Last(),
		ServerTime: time.Now(),
	}
}

func (s *Server) status(w http.ResponseWriter, r *http.Request) { writeJSON(w, s.snapshot()) }

// events streams status updates as server-sent events.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, 500, errors.New("streaming unsupported"))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	ch := make(chan struct{}, 1)
	s.mu.Lock()
	s.clients[ch] = struct{}{}
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.clients, ch)
		s.mu.Unlock()
	}()
	send := func() bool {
		data, _ := json.Marshal(s.snapshot())
		if _, err := fmt.Fprintf(w, "event: status\ndata: %s\n\n", data); err != nil {
			return false
		}
		fl.Flush()
		return true
	}
	if !send() {
		return
	}
	tick := time.NewTicker(15 * time.Second)
	defer tick.Stop()
	var last time.Time
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ch:
			// Coalesce bursts to at most four updates a second.
			if d := time.Since(last); d < 250*time.Millisecond {
				time.Sleep(250*time.Millisecond - d)
			}
		case <-tick.C:
		}
		last = time.Now()
		if !send() {
			return
		}
	}
}

// --- locations ---

type locationView struct {
	store.Location
	Config   string `json:"config,omitempty"`
	Endpoint string `json:"endpoint"`
	IPv6     bool   `json:"ipv6"`
	Full     bool   `json:"fullTunnel"`
}

func view(l store.Location) locationView {
	v := locationView{Location: l}
	v.Config = "" // never send private keys to the page
	if c, err := wgconf.Parse(l.Config); err == nil {
		v.Endpoint = c.Peers[0].Endpoint
		v.Full = c.FullTunnel4()
		for _, a := range c.Interface.Addresses {
			if a.Addr().Is6() && c.FullTunnel6() {
				v.IPv6 = true
			}
		}
	}
	return v
}

func (s *Server) locations(w http.ResponseWriter, r *http.Request) {
	locs := s.b.Store().Locations()
	out := make([]locationView, 0, len(locs))
	for _, l := range locs {
		out = append(out, view(l))
	}
	writeJSON(w, out)
}

type importFile struct {
	Name string `json:"name"`
	Text string `json:"text"`
}

type importOutcome struct {
	Name     string        `json:"name"`
	Error    string        `json:"error,omitempty"`
	Location *locationView `json:"location,omitempty"`
	Warnings []string      `json:"warnings,omitempty"`
	Updated  bool          `json:"updated,omitempty"`
}

func (s *Server) importLocations(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Files []importFile `json:"files"`
	}
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	if len(req.Files) == 0 || len(req.Files) > 500 {
		writeErr(w, 400, errors.New("send between 1 and 500 configs"))
		return
	}
	var out []importOutcome
	for _, f := range req.Files {
		res, err := s.b.Store().Import(f.Name, f.Text)
		o := importOutcome{Name: f.Name}
		if err != nil {
			o.Error = err.Error()
		} else {
			v := view(res.Location)
			o.Location, o.Warnings, o.Updated = &v, res.Warnings, res.Updated
		}
		out = append(out, o)
	}
	s.Notify()
	writeJSON(w, out)
}

func (s *Server) patchLocation(w http.ResponseWriter, r *http.Request) {
	var p store.Patch
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, err)
		return
	}
	l, err := s.b.Store().Update(r.PathValue("id"), p)
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	s.Notify()
	writeJSON(w, view(l))
}

func (s *Server) deleteLocation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if st := s.b.Engine().Status(); st.Location != nil && st.Location.ID == id && st.State != engine.Disconnected {
		writeErr(w, 409, errors.New("disconnect before removing this location"))
		return
	}
	if err := s.b.Store().Delete(id); err != nil {
		writeErr(w, 404, err)
		return
	}
	s.Notify()
	writeJSON(w, map[string]bool{"ok": true})
}

func (s *Server) exportConfig(w http.ResponseWriter, r *http.Request) {
	l, ok := s.b.Store().Get(r.PathValue("id"))
	if !ok {
		writeErr(w, 404, errors.New("location not found"))
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = io.WriteString(w, l.Config)
}

// qrCode renders the config as a QR code so a phone's WireGuard app can
// scan it.
func (s *Server) qrCode(w http.ResponseWriter, r *http.Request) {
	l, ok := s.b.Store().Get(r.PathValue("id"))
	if !ok {
		writeErr(w, 404, errors.New("location not found"))
		return
	}
	code, err := qr.Encode(l.Config, qr.L)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	const quiet = 4
	n := code.Size + 2*quiet
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" shape-rendering="crispEdges"><rect width="%d" height="%d" fill="#fff"/><path fill="#000" d="`, n, n, n, n)
	for y := 0; y < code.Size; y++ {
		for x := 0; x < code.Size; x++ {
			if code.Black(x, y) {
				fmt.Fprintf(&b, "M%d %dh1v1h-1z", x+quiet, y+quiet)
			}
		}
	}
	b.WriteString(`"/></svg>`)
	w.Header().Set("Content-Type", "image/svg+xml")
	_, _ = io.WriteString(w, b.String())
}

func (s *Server) connect(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
	}
	if r.ContentLength > 0 {
		if err := readJSON(r, &req); err != nil {
			writeErr(w, 400, err)
			return
		}
	}
	if err := s.b.Connect(req.ID); err != nil {
		writeErr(w, 400, err)
		return
	}
	writeJSON(w, s.snapshot())
}

func (s *Server) disconnect(w http.ResponseWriter, r *http.Request) {
	if err := s.b.Disconnect(); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, s.snapshot())
}

// --- settings ---

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.b.Store().Settings())
}

func (s *Server) putSettings(w http.ResponseWriter, r *http.Request) {
	cur := s.b.Store().Settings()
	// Decode onto the current settings so partial updates work.
	if err := readJSON(r, &cur); err != nil {
		writeErr(w, 400, err)
		return
	}
	if cur.MTU != 0 && (cur.MTU < 1280 || cur.MTU > 1500) {
		writeErr(w, 400, errors.New("MTU must be between 1280 and 1500, or 0 for automatic"))
		return
	}
	valid := cur.DNSUpstream == "auto" || cur.DNSUpstream == "custom"
	for _, p := range dnsproxy.Presets {
		valid = valid || cur.DNSUpstream == p.ID
	}
	if !valid {
		writeErr(w, 400, errors.New("unknown DNS choice"))
		return
	}
	if err := s.b.ApplySettings(cur); err != nil {
		writeErr(w, 500, err)
		return
	}
	s.Notify()
	writeJSON(w, s.b.Store().Settings())
}

// --- ad blocker ---

type adblockResponse struct {
	Enabled bool                   `json:"enabled"`
	Stats   dnsproxy.Stats         `json:"stats"`
	Totals  store.Totals           `json:"totals"`
	Rules   int                    `json:"rules"`
	Lists   []blocklist.ListStatus `json:"lists"`
	Allow   []string               `json:"allow"`
	Block   []string               `json:"block"`
	Top     []dnsproxy.DomainCount `json:"top"`
	Recent  []dnsproxy.LogEntry    `json:"recent"`
	Running bool                   `json:"running"`
}

func (s *Server) adblock(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 400 {
		limit = 100
	}
	set := s.b.Store().Settings()
	stats, totals := s.b.DNSStats()
	resp := adblockResponse{
		Enabled: set.AdBlock,
		Stats:   stats,
		Totals:  totals,
		Rules:   s.b.Blocklists().RuleCount(),
		Lists:   s.b.Blocklists().Status(),
		Allow:   set.Blocklists.Allow,
		Block:   set.Blocklists.Block,
		Top:     []dnsproxy.DomainCount{},
		Recent:  []dnsproxy.LogEntry{},
	}
	if p := s.b.Engine().Proxy(); p != nil {
		resp.Running = true
		resp.Top = p.TopBlocked(10)
		resp.Recent = p.Recent(limit)
	}
	writeJSON(w, resp)
}

func (s *Server) putLists(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled    []string           `json:"enabled"`
		CustomURLs []blocklist.Source `json:"customUrls"`
	}
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	for i := range req.CustomURLs {
		u := &req.CustomURLs[i]
		if !strings.HasPrefix(u.URL, "https://") && !strings.HasPrefix(u.URL, "http://") {
			writeErr(w, 400, fmt.Errorf("list address must start with https://"))
			return
		}
		u.Custom = true
		if u.ID == "" {
			u.ID = "custom-" + strconv.FormatInt(time.Now().UnixNano()+int64(i), 36)
		}
		if strings.TrimSpace(u.Name) == "" {
			u.Name = u.URL
		}
		u.Category = "custom"
	}
	set := s.b.Store().Settings()
	set.Blocklists.Enabled = req.Enabled
	set.Blocklists.CustomURLs = req.CustomURLs
	if err := s.b.ApplySettings(set); err != nil {
		writeErr(w, 500, err)
		return
	}
	s.b.UpdateLists(false)
	s.adblock(w, r)
}

func (s *Server) rules(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Action string `json:"action"` // allow, block, unallow, unblock
		Domain string `json:"domain"`
	}
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	d := blocklist.Normalize(strings.TrimPrefix(strings.TrimSpace(req.Domain), "*."))
	if d == "" {
		writeErr(w, 400, errors.New("enter a domain name such as ads.example.com"))
		return
	}
	set := s.b.Store().Settings()
	bl := &set.Blocklists
	remove := func(list []string) []string {
		var out []string
		for _, x := range list {
			if x != d {
				out = append(out, x)
			}
		}
		return out
	}
	switch req.Action {
	case "allow":
		bl.Block = remove(bl.Block)
		bl.Allow = append(remove(bl.Allow), d)
	case "block":
		bl.Allow = remove(bl.Allow)
		bl.Block = append(remove(bl.Block), d)
	case "unallow":
		bl.Allow = remove(bl.Allow)
	case "unblock":
		bl.Block = remove(bl.Block)
	default:
		writeErr(w, 400, errors.New("unknown action"))
		return
	}
	if err := s.b.ApplySettings(set); err != nil {
		writeErr(w, 500, err)
		return
	}
	if p := s.b.Engine().Proxy(); p != nil {
		p.FlushCache()
	}
	s.adblock(w, r)
}

func (s *Server) updateLists(w http.ResponseWriter, r *http.Request) {
	s.b.UpdateLists(true)
	time.Sleep(150 * time.Millisecond) // let the status show "downloading"
	s.adblock(w, r)
}

func (s *Server) flushDNS(w http.ResponseWriter, r *http.Request) {
	if p := s.b.Engine().Proxy(); p != nil {
		p.FlushCache()
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func (s *Server) meta(w http.ResponseWriter, r *http.Request) {
	presets := []map[string]string{}
	for _, p := range dnsproxy.Presets {
		presets = append(presets, map[string]string{"id": p.ID, "name": p.Name, "url": p.URL})
	}
	writeJSON(w, map[string]any{
		"version":    s.b.Version(),
		"dnsPresets": presets,
		"virtualDns": dnsproxy.DefaultVirtualIP.String(),
		"geo":        geo.Providers,
	})
}

// --- own server setup ---

func (s *Server) startSetup(w http.ResponseWriter, r *http.Request) {
	var req sshsetup.Request
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	job, err := s.b.Setup().Start(req)
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	writeJSON(w, job)
}

func (s *Server) getSetup(w http.ResponseWriter, r *http.Request) {
	job, err := s.b.Setup().Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	writeJSON(w, job)
}

func (s *Server) serverScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/x-shellscript; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="meridian-server.sh"`)
	_, _ = w.Write(s.b.ServerScript())
}
