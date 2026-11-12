//go:build !linux && !windows && !darwin

package netcfg

import (
	"errors"

	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/tun"
)

type unsupported struct{}

// New returns the configurator for this platform.
func New(Logf) Configurator { return unsupported{} }

func (unsupported) Up(tun.Device, conn.Bind, Plan) error {
	return errors.New("this operating system is not supported")
}
func (unsupported) Update(Plan) error { return errors.New("this operating system is not supported") }
func (unsupported) Down() error       { return nil }

// Cleanup removes leftovers from a crashed run.
func Cleanup(Logf) {}
