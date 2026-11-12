package wintun

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func fakeRelease(t *testing.T) ([]byte, string) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range map[string]string{
		"wintun/bin/amd64/wintun.dll": "MZ amd64",
		"wintun/bin/arm64/wintun.dll": "MZ arm64",
		"wintun/bin/x86/wintun.dll":   "MZ x86",
		"wintun/LICENSE.txt":          "license text",
		"wintun/README.md":            "readme",
	} {
		w, _ := zw.Create(name)
		w.Write([]byte(body))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(buf.Bytes())
	return buf.Bytes(), hex.EncodeToString(sum[:])
}

func TestExtract(t *testing.T) {
	data, sum := fakeRelease(t)
	for arch, want := range map[string]string{"amd64": "MZ amd64", "arm64": "MZ arm64", "386": "MZ x86"} {
		dll, lic, err := Extract(data, sum, arch)
		if err != nil || string(dll) != want || string(lic) != "license text" {
			t.Errorf("%s: %q %q %v", arch, dll, lic, err)
		}
	}
	if _, _, err := Extract(data, SHA256, "amd64"); err == nil || !strings.Contains(err.Error(), "integrity") {
		t.Errorf("tampered download accepted: %v", err)
	}
	if _, _, err := Extract(data, sum, "riscv64"); err == nil {
		t.Error("unknown architecture accepted")
	}
}

func TestDownload(t *testing.T) {
	data, sum := fakeRelease(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(data) }))
	defer srv.Close()
	got, err := Download(srv.Client(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := Extract(got, sum, "arm64"); err != nil {
		t.Fatal(err)
	}
}
