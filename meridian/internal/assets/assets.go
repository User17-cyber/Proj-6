// Package assets holds the app icon.
package assets

import _ "embed"

// IconSVG is the app icon.
//
//go:embed icon.svg
var IconSVG []byte

// Icon32PNG and Icon256PNG are raster versions for window icons.
//
//go:embed icon-32.png
var Icon32PNG []byte

//go:embed icon-256.png
var Icon256PNG []byte
