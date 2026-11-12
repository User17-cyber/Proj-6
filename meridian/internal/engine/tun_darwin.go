//go:build darwin

package engine

import "golang.zx2c4.com/wireguard/tun"

const defaultFwMark = 0

func fwmarkFor(uint32) uint32 { return 0 }

// macOS names the interface utunN itself.
func createTUN(mtu int) (tun.Device, error) { return tun.CreateTUN("utun", mtu) }
