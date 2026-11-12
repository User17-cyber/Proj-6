//go:build linux || darwin

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func isWindowsService() bool { return false }
func runWindowsService()     {}

func requireAdmin() error {
	if os.Geteuid() != 0 {
		return errors.New("the VPN service must run as root (use sudo)")
	}
	return nil
}

func launchApp() error {
	info, err := ensureService()
	if err != nil {
		return err
	}
	return openAppWindow(info.URL())
}

func openDefaultBrowser(url string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", url).Start()
	}
	return exec.Command("xdg-open", url).Start()
}

func showErrorDialog(err error) {
	if os.Getenv("TERM") != "" && isTerminal() {
		return // the message was printed to the terminal
	}
	msg := err.Error()
	if runtime.GOOS == "darwin" {
		_ = exec.Command("osascript", "-e", fmt.Sprintf(`display alert "Meridian" message %q as critical`, msg)).Run()
		return
	}
	if p, e := exec.LookPath("zenity"); e == nil {
		_ = exec.Command(p, "--error", "--title=Meridian", "--text="+msg).Run()
	} else if p, e := exec.LookPath("kdialog"); e == nil {
		_ = exec.Command(p, "--title", "Meridian", "--error", msg).Run()
	}
}

func isTerminal() bool {
	fi, err := os.Stdin.Stat()
	return err == nil && fi.Mode()&os.ModeCharDevice != 0
}

// --- service installation ---

const (
	linuxUnitPath  = "/etc/systemd/system/meridian.service"
	linuxBinPath   = "/usr/local/bin/meridian"
	darwinPlist    = "/Library/LaunchDaemons/com.meridian-vpn.daemon.plist"
	darwinLabel    = "com.meridian-vpn.daemon"
	darwinBinPath  = "/Library/PrivilegedHelperTools/com.meridian-vpn.daemon"
	desktopEntry   = "/usr/share/applications/meridian.desktop"
	desktopIconDir = "/usr/share/icons/hicolor/scalable/apps"
)

// installedBinary copies this executable to a root-owned location (unless
// a package already put it in one) and returns its path.
func installedBinary(dest string) (string, error) {
	self, err := os.Executable()
	if err != nil {
		return "", err
	}
	if self, err = filepath.EvalSymlinks(self); err != nil {
		return "", err
	}
	if runtime.GOOS == "linux" && (strings.HasPrefix(self, "/usr/bin/") || strings.HasPrefix(self, "/usr/lib/") || strings.HasPrefix(self, "/opt/")) {
		return self, nil
	}
	if self == dest {
		return dest, nil
	}
	data, err := os.ReadFile(self)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return "", err
	}
	tmp := dest + ".new"
	if err := os.WriteFile(tmp, data, 0o755); err != nil {
		return "", err
	}
	if err := os.Chown(tmp, 0, 0); err != nil {
		return "", err
	}
	return dest, os.Rename(tmp, dest)
}

func serviceInstalled() bool {
	if runtime.GOOS == "darwin" {
		_, err := os.Stat(darwinPlist)
		return err == nil
	}
	_, err := os.Stat(linuxUnitPath)
	if err != nil {
		_, err = os.Stat("/lib/systemd/system/meridian.service")
	}
	return err == nil
}

func installService() error {
	if err := requireAdmin(); err != nil {
		return err
	}
	if runtime.GOOS == "darwin" {
		return installLaunchd()
	}
	return installSystemd()
}

func installSystemd() error {
	if _, err := exec.LookPath("systemctl"); err != nil {
		return errors.New("systemd was not found; run \"sudo meridian service run\" to start the service by hand")
	}
	bin, err := installedBinary(linuxBinPath)
	if err != nil {
		return err
	}
	unit := `[Unit]
Description=Meridian VPN service
Documentation=https://github.com/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=` + bin + ` service run
Restart=on-failure
RestartSec=2
NoNewPrivileges=yes
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
`
	if err := os.WriteFile(linuxUnitPath, []byte(unit), 0o644); err != nil {
		return err
	}
	installDesktopEntry(bin)
	for _, args := range [][]string{{"daemon-reload"}, {"enable", "--now", "meridian.service"}, {"restart", "meridian.service"}} {
		if out, err := exec.Command("systemctl", args...).CombinedOutput(); err != nil {
			return fmt.Errorf("systemctl %s: %v: %s", strings.Join(args, " "), err, out)
		}
	}
	fmt.Println("Meridian service installed and started. Open \"Meridian\" from your applications menu or run: meridian")
	return nil
}

func installDesktopEntry(bin string) {
	entry := "[Desktop Entry]\nType=Application\nName=Meridian VPN\nGenericName=VPN\nComment=Private VPN with ad blocking and location switching\nExec=" + bin + "\nIcon=meridian\nTerminal=false\nCategories=Network;Security;\nStartupWMClass=Meridian\n"
	if _, err := os.Stat(desktopEntry); err == nil && strings.HasPrefix(bin, "/usr/bin/") {
		return // installed by the package
	}
	_ = os.WriteFile(desktopEntry, []byte(entry), 0o644)
	_ = os.MkdirAll(desktopIconDir, 0o755)
	_ = os.WriteFile(filepath.Join(desktopIconDir, "meridian.svg"), appIconSVG, 0o644)
}

func installLaunchd() error {
	bin, err := installedBinary(darwinBinPath)
	if err != nil {
		return err
	}
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>` + darwinLabel + `</string>
	<key>ProgramArguments</key>
	<array><string>` + bin + `</string><string>service</string><string>run</string></array>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><true/>
	<key>StandardErrorPath</key><string>/var/log/meridian.log</string>
	<key>StandardOutPath</key><string>/var/log/meridian.log</string>
</dict>
</plist>
`
	_ = exec.Command("launchctl", "bootout", "system/"+darwinLabel).Run()
	if err := os.WriteFile(darwinPlist, []byte(plist), 0o644); err != nil {
		return err
	}
	if out, err := exec.Command("launchctl", "bootstrap", "system", darwinPlist).CombinedOutput(); err != nil {
		if out2, err2 := exec.Command("launchctl", "load", "-w", darwinPlist).CombinedOutput(); err2 != nil {
			return fmt.Errorf("launchctl: %v: %s %s", err, out, out2)
		}
	}
	fmt.Println("Meridian service installed and started.")
	return nil
}

func uninstallService() error {
	if err := requireAdmin(); err != nil {
		return err
	}
	if runtime.GOOS == "darwin" {
		_ = exec.Command("launchctl", "bootout", "system/"+darwinLabel).Run()
		_ = os.Remove(darwinPlist)
		_ = os.Remove(darwinBinPath)
		fmt.Println("Meridian service removed. Saved locations stay in /Library/Application Support/Meridian until you delete that folder.")
		return nil
	}
	_ = exec.Command("systemctl", "disable", "--now", "meridian.service").Run()
	_ = os.Remove(linuxUnitPath)
	_ = exec.Command("systemctl", "daemon-reload").Run()
	if self, _ := os.Executable(); self != linuxBinPath {
		_ = os.Remove(linuxBinPath)
	}
	_ = os.Remove(filepath.Join(desktopIconDir, "meridian.svg"))
	if data, err := os.ReadFile(desktopEntry); err == nil && strings.Contains(string(data), linuxBinPath) {
		_ = os.Remove(desktopEntry)
	}
	fmt.Println("Meridian service removed. Saved locations stay in /var/lib/meridian until you delete that folder.")
	return nil
}

func startService() error {
	if runtime.GOOS == "darwin" {
		return exec.Command("launchctl", "kickstart", "system/"+darwinLabel).Run()
	}
	return exec.Command("systemctl", "start", "meridian.service").Run()
}

func stopService() error {
	if runtime.GOOS == "darwin" {
		return exec.Command("launchctl", "kill", "TERM", "system/"+darwinLabel).Run()
	}
	return exec.Command("systemctl", "stop", "meridian.service").Run()
}

// startServiceAsUser asks the system to start an installed service.
func startServiceAsUser() error {
	if os.Geteuid() == 0 {
		return startService()
	}
	if runtime.GOOS == "linux" {
		// polkit usually lets the desktop user start system units with a prompt.
		return exec.Command("systemctl", "start", "meridian.service").Run()
	}
	return nil // launchd keeps the daemon alive by itself
}

// installServiceElevated runs "meridian service install" with admin rights,
// showing the system's password prompt.
func installServiceElevated() error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	if os.Geteuid() == 0 {
		return installService()
	}
	if runtime.GOOS == "darwin" {
		script := fmt.Sprintf(`do shell script %q with administrator privileges with prompt "Meridian needs your password once to install its VPN service."`,
			shellQuote(self)+" service install")
		out, err := exec.Command("osascript", "-e", script).CombinedOutput()
		if err != nil {
			return fmt.Errorf("the VPN service was not installed: %s", strings.TrimSpace(string(out)))
		}
		return nil
	}
	if _, err := exec.LookPath("pkexec"); err == nil {
		out, err := exec.Command("pkexec", self, "service", "install").CombinedOutput()
		if err != nil {
			return fmt.Errorf("the VPN service was not installed: %s", strings.TrimSpace(string(out)))
		}
		return nil
	}
	return fmt.Errorf("install the VPN service first by running: sudo %s service install", self)
}

func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }
