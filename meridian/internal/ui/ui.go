// Package ui embeds the app's web interface.
package ui

import (
	"embed"
	"io/fs"
)

//go:embed web
var files embed.FS

// FS returns the web root (index.html and assets).
func FS() fs.FS {
	sub, err := fs.Sub(files, "web")
	if err != nil {
		panic(err)
	}
	return sub
}
