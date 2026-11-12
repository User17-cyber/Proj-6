//go:build !windows

package platform

import (
	"os"
	"runtime"
)

// DataDir holds private state (locations with keys, lists).
func DataDir() string {
	if runtime.GOOS == "darwin" {
		return "/Library/Application Support/Meridian"
	}
	return "/var/lib/meridian"
}

// RunDir holds ui.json, readable by local users.
func RunDir() string {
	if runtime.GOOS == "darwin" {
		return "/var/run/meridian"
	}
	return "/run/meridian"
}

// SecureDir creates dir readable only by its owner (root).
func SecureDir(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	return os.Chmod(dir, 0o700)
}

// PublicDir creates dir readable by everyone.
func PublicDir(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.Chmod(dir, 0o755)
}

// PublicFile makes a file readable by local users.
func PublicFile(path string) error { return os.Chmod(path, 0o644) }
