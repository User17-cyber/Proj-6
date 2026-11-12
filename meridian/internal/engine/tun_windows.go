//go:build windows

package engine

import (
	"golang.org/x/sys/windows"
	"golang.zx2c4.com/wireguard/tun"

	"meridian/internal/netcfg"
)

const defaultFwMark = 0

func fwmarkFor(uint32) uint32 { return 0 }

// A fixed GUID keeps Windows from creating a new network profile
// ("Network 2", "Network 3"...) on every connection.
var adapterGUID = windows.GUID{Data1: 0x6d657269, Data2: 0x6469, Data3: 0x616e, Data4: [8]byte{0x56, 0x50, 0x4e, 0x00, 0x00, 0x00, 0x00, 0x01}}

func createTUN(mtu int) (tun.Device, error) {
	return tun.CreateTUNWithRequestedGUID(netcfg.WindowsTunName, &adapterGUID, mtu)
}
