// Package server embeds the server installer so the app can upload it.
package server

import _ "embed"

// InstallScript is server/install.sh.
//
//go:embed install.sh
var InstallScript []byte
