// Package sshsetup turns a fresh server into a Meridian location over SSH:
// it uploads the installer, runs it and imports the config it prints. The
// password or key is used for this one session and never stored.
package sshsetup

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// Request describes the server to set up.
type Request struct {
	Host          string `json:"host"`
	Port          int    `json:"port"`
	User          string `json:"user"`
	Password      string `json:"password"`
	PrivateKey    string `json:"privateKey"`
	Passphrase    string `json:"passphrase"`
	ServerAdBlock bool   `json:"serverAdBlock"`
	Device        string `json:"device"`
}

// Job is the progress of one setup.
type Job struct {
	ID         string   `json:"id"`
	State      string   `json:"state"` // running, done, failed
	Log        []string `json:"log"`
	Error      string   `json:"error,omitempty"`
	LocationID string   `json:"locationId,omitempty"`
	HostKey    string   `json:"hostKey,omitempty"`
}

// Importer saves the config the server printed and returns the location ID.
type Importer func(name, config string) (string, error)

// Manager runs setup jobs.
type Manager struct {
	script []byte
	imp    Importer
	logf   func(string, ...any)

	mu   sync.Mutex
	jobs map[string]*Job
}

// New creates a manager that uploads script and imports with imp.
func New(script []byte, imp Importer, logf func(string, ...any)) *Manager {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &Manager{script: script, imp: imp, logf: logf, jobs: map[string]*Job{}}
}

var hostRe = regexp.MustCompile(`^[A-Za-z0-9.:\-\[\]]{1,253}$`)
var deviceRe = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

// Start validates the request and begins the setup in the background.
func (m *Manager) Start(req Request) (Job, error) {
	req.Host = strings.TrimSpace(req.Host)
	req.User = strings.TrimSpace(req.User)
	if !hostRe.MatchString(req.Host) {
		return Job{}, errors.New("enter the server's IP address or host name")
	}
	if req.Port == 0 {
		req.Port = 22
	}
	if req.Port < 1 || req.Port > 65535 {
		return Job{}, errors.New("invalid SSH port")
	}
	if req.User == "" {
		req.User = "root"
	}
	if req.Password == "" && strings.TrimSpace(req.PrivateKey) == "" {
		return Job{}, errors.New("enter the server's password or an SSH private key")
	}
	if req.Device == "" {
		h, _ := os.Hostname()
		req.Device = "meridian-" + h
	}
	req.Device = strings.Trim(deviceRe.ReplaceAllString(req.Device, "-"), "-.")
	if len(req.Device) > 40 {
		req.Device = req.Device[:40]
	}
	if req.Device == "" {
		req.Device = "meridian-app"
	}
	var b [8]byte
	_, _ = rand.Read(b[:])
	job := &Job{ID: hex.EncodeToString(b[:]), State: "running"}
	m.mu.Lock()
	m.jobs[job.ID] = job
	m.mu.Unlock()
	go m.run(job, req)
	return m.Get(job.ID)
}

// Get returns a snapshot of a job.
func (m *Manager) Get(id string) (Job, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.jobs[id]
	if !ok {
		return Job{}, errors.New("setup job not found")
	}
	c := *j
	c.Log = append([]string(nil), j.Log...)
	return c, nil
}

func (m *Manager) logLine(j *Job, format string, a ...any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j.Log = append(j.Log, fmt.Sprintf(format, a...))
	if len(j.Log) > 400 {
		j.Log = j.Log[len(j.Log)-400:]
	}
}

func (m *Manager) finish(j *Job, locID string, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err != nil {
		j.State, j.Error = "failed", err.Error()
		j.Log = append(j.Log, "✗ "+err.Error())
		return
	}
	j.State, j.LocationID = "done", locID
	j.Log = append(j.Log, "✓ Server ready and added to Meridian")
}

func authMethods(req Request) ([]ssh.AuthMethod, error) {
	if k := strings.TrimSpace(req.PrivateKey); k != "" {
		var signer ssh.Signer
		var err error
		if req.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(k+"\n"), []byte(req.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(k + "\n"))
		}
		var missing *ssh.PassphraseMissingError
		if errors.As(err, &missing) {
			return nil, errors.New("this key is protected by a passphrase; enter it too")
		}
		if err != nil {
			return nil, fmt.Errorf("the private key could not be read: %v", err)
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer)}, nil
	}
	pw := req.Password
	return []ssh.AuthMethod{
		ssh.Password(pw),
		ssh.KeyboardInteractive(func(_, _ string, qs []string, _ []bool) ([]string, error) {
			out := make([]string, len(qs))
			for i := range qs {
				out[i] = pw
			}
			return out, nil
		}),
	}, nil
}

var ansi = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)

func (m *Manager) run(j *Job, req Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()
	locID, err := m.setup(ctx, j, req)
	m.finish(j, locID, err)
	req.Password, req.PrivateKey, req.Passphrase = "", "", ""
}

func (m *Manager) setup(ctx context.Context, j *Job, req Request) (string, error) {
	auth, err := authMethods(req)
	if err != nil {
		return "", err
	}
	addr := net.JoinHostPort(strings.Trim(req.Host, "[]"), strconv.Itoa(req.Port))
	m.logLine(j, "Connecting to %s as %s…", addr, req.User)
	var fingerprint string
	cfg := &ssh.ClientConfig{
		User: req.User,
		Auth: auth,
		// A server created minutes ago has no known key yet; record and
		// show its fingerprint (trust on first use).
		HostKeyCallback: func(_ string, _ net.Addr, key ssh.PublicKey) error {
			fingerprint = ssh.FingerprintSHA256(key)
			return nil
		},
		Timeout: 20 * time.Second,
	}
	d := net.Dialer{Timeout: 20 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return "", fmt.Errorf("cannot reach %s: %v (check the address, and that SSH is allowed by the provider's firewall)", addr, err)
	}
	sc, chans, reqs, err := ssh.NewClientConn(conn, addr, cfg)
	if err != nil {
		conn.Close()
		if strings.Contains(err.Error(), "unable to authenticate") {
			return "", errors.New("the server rejected the username or password/key")
		}
		return "", fmt.Errorf("SSH failed: %v", err)
	}
	client := ssh.NewClient(sc, chans, reqs)
	defer client.Close()
	m.mu.Lock()
	j.HostKey = fingerprint
	m.mu.Unlock()
	m.logLine(j, "Connected. Server key %s", fingerprint)
	go func() {
		<-ctx.Done()
		client.Close()
	}()

	sudo := ""
	if req.User != "root" {
		if req.Password != "" {
			sudo = "sudo -S -p '' "
		} else {
			sudo = "sudo -n "
		}
	}

	// Upload the installer.
	path := "/tmp/meridian-server-" + j.ID + ".sh"
	if err := runSession(client, "umask 077 && cat > "+path, bytes.NewReader(m.script), nil); err != nil {
		return "", fmt.Errorf("uploading the installer failed: %v", err)
	}
	m.logLine(j, "Installer uploaded. Installing WireGuard, DNS resolvers and firewall (this takes 1–3 minutes)…")

	args := []string{"install", "--name", req.Device}
	if !req.ServerAdBlock {
		args = append(args, "--no-adblock")
	}
	cmd := sudo + "bash " + path + " " + strings.Join(args, " ") + "; rc=$?; rm -f " + path + "; exit $rc"
	var stdin io.Reader
	if sudo == "sudo -S -p '' " {
		stdin = strings.NewReader(req.Password + "\n")
	}
	var config strings.Builder
	inConfig := false
	err = runSession(client, cmd, stdin, func(line string) {
		line = strings.TrimRight(ansi.ReplaceAllString(line, ""), "\r")
		switch {
		case line == "-----BEGIN MERIDIAN CONFIG-----":
			inConfig = true
		case line == "-----END MERIDIAN CONFIG-----":
			inConfig = false
		case inConfig:
			config.WriteString(line + "\n")
		case strings.TrimSpace(line) != "":
			m.logLine(j, "%s", line) // the config (with its key) is never logged
		}
	})
	if err != nil {
		if strings.Contains(err.Error(), "exited with status") && sudo != "" {
			return "", fmt.Errorf("the installer failed (%v); the account may need sudo rights", err)
		}
		return "", fmt.Errorf("the installer failed: %v", err)
	}
	if !strings.Contains(config.String(), "[Peer]") {
		return "", errors.New("the installer finished but printed no configuration")
	}
	m.logLine(j, "Importing the new location…")
	return m.imp(req.Device, config.String())
}

// runSession runs one command, feeding stdin and passing each output line
// to onLine (stdout and stderr together).
func runSession(c *ssh.Client, cmd string, stdin io.Reader, onLine func(string)) error {
	s, err := c.NewSession()
	if err != nil {
		return err
	}
	defer s.Close()
	if stdin != nil {
		s.Stdin = stdin
	}
	if onLine == nil {
		var out bytes.Buffer
		s.Stdout, s.Stderr = &out, &out
		if err := s.Run(cmd); err != nil {
			return fmt.Errorf("%v: %s", err, strings.TrimSpace(out.String()))
		}
		return nil
	}
	pr, pw := io.Pipe()
	s.Stdout, s.Stderr = pw, pw
	done := make(chan struct{})
	go func() {
		defer close(done)
		sc := bufio.NewScanner(pr)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		for sc.Scan() {
			onLine(sc.Text())
		}
	}()
	err = s.Run(cmd)
	pw.Close()
	<-done
	if err != nil {
		var ee *ssh.ExitError
		if errors.As(err, &ee) {
			return fmt.Errorf("exited with status %d", ee.ExitStatus())
		}
		return err
	}
	return nil
}
