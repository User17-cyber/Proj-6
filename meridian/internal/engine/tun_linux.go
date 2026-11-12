//go:build linux

package engine

import (
	"golang.zx2c4.com/wireguard/tun"

	"meridian/internal/netcfg"
)

const defaultFwMark = 51820

func fwmarkFor(m uint32) uint32 { return m }

func createTUN(mtu int) (tun.Device, error) { return tun.CreateTUN(netcfg.TunName, mtu) }
