//go:build windows

package platform

import (
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
)

func programData() string {
	if p := os.Getenv("ProgramData"); p != "" {
		return p
	}
	return `C:\ProgramData`
}

// DataDir holds private state (locations with keys, lists).
func DataDir() string { return filepath.Join(programData(), AppName, "data") }

// RunDir holds ui.json, readable by local users.
func RunDir() string { return filepath.Join(programData(), AppName) }

func setSDDL(path, sddl string) error {
	sd, err := windows.SecurityDescriptorFromString(sddl)
	if err != nil {
		return err
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		return err
	}
	return windows.SetNamedSecurityInfo(path, windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, dacl, nil)
}

// SecureDir creates dir accessible only to SYSTEM and Administrators.
func SecureDir(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	return setSDDL(dir, "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)")
}

// PublicDir creates dir that local users can read.
func PublicDir(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return setSDDL(dir, "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;GR;;;BU)")
}

// PublicFile makes a file readable by local users.
func PublicFile(path string) error {
	return setSDDL(path, "D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;GR;;;BU)")
}
