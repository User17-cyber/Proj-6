// Package wintun fetches the Wintun TUN driver for Windows from its official
// site and checks it against the checksum pinned by WireGuard for Windows'
// own build script.
package wintun

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	URL    = "https://www.wintun.net/builds/wintun-0.14.1.zip"
	SHA256 = "07c256185d6ee3652e09fa55c0b673e2624b565e02c4b9091c79ca7d2f24ef51"
)

// Download fetches the release zip.
func Download(client *http.Client, url string) ([]byte, error) {
	if client == nil {
		client = &http.Client{Timeout: 90 * time.Second}
	}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download answered HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 16<<20))
}

// Extract verifies the zip's SHA-256 and returns the DLL for goarch
// (amd64, arm64 or 386) and the license text.
func Extract(data []byte, wantSHA256, goarch string) (dll, license []byte, err error) {
	sum := sha256.Sum256(data)
	if got := hex.EncodeToString(sum[:]); got != wantSHA256 {
		return nil, nil, fmt.Errorf("integrity check failed (SHA-256 %s)", got)
	}
	arch := map[string]string{"amd64": "amd64", "arm64": "arm64", "386": "x86"}[goarch]
	if arch == "" {
		return nil, nil, fmt.Errorf("no Wintun build for %s", goarch)
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, nil, err
	}
	read := func(f *zip.File) ([]byte, error) {
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		defer rc.Close()
		return io.ReadAll(io.LimitReader(rc, 8<<20))
	}
	for _, f := range zr.File {
		switch f.Name {
		case "wintun/bin/" + arch + "/wintun.dll":
			if dll, err = read(f); err != nil {
				return nil, nil, err
			}
		case "wintun/LICENSE.txt":
			if license, err = read(f); err != nil {
				return nil, nil, err
			}
		}
	}
	if dll == nil {
		return nil, nil, fmt.Errorf("no Wintun build for %s in the download", goarch)
	}
	return dll, license, nil
}
