//go:build windows

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"

	"meridian/internal/assets"
	"meridian/internal/daemon"
	"meridian/internal/platform"
	"meridian/internal/wintun"
)

const (
	serviceName  = "Meridian"
	windowTitle  = "Meridian VPN"
	wintunDLL    = "wintun.dll"
	seeNoClose   = 0x00000040 // SEE_MASK_NOCLOSEPROCESS
	seeNoAsync   = 0x00000100 // SEE_MASK_NOASYNC
	attachParent = ^uint32(0) // ATTACH_PARENT_PROCESS
)

var (
	kernel32        = windows.NewLazySystemDLL("kernel32.dll")
	shell32         = windows.NewLazySystemDLL("shell32.dll")
	user32          = windows.NewLazySystemDLL("user32.dll")
	procAttach      = kernel32.NewProc("AttachConsole")
	procShellExecEx = shell32.NewProc("ShellExecuteExW")
	procFindWindow  = user32.NewProc("FindWindowW")
	procSetFG       = user32.NewProc("SetForegroundWindow")
	procShowWindow  = user32.NewProc("ShowWindow")
	procSendMessage = user32.NewProc("SendMessageW")
	procCreateIcon  = user32.NewProc("CreateIconFromResourceEx")
	procDpiContext  = user32.NewProc("SetProcessDpiAwarenessContext")
	procDpiAware    = user32.NewProc("SetProcessDPIAware")
)

func init() {
	// Sharp text on high-DPI screens (what a manifest would declare).
	if procDpiContext.Find() == nil {
		procDpiContext.Call(^uintptr(3)) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (-4)
	} else if procDpiAware.Find() == nil {
		procDpiAware.Call()
	}
	// The exe is a GUI program (no console window when double-clicked).
	// For command-line use, write to the console it was started from.
	if len(os.Args) > 1 {
		if r, _, _ := procAttach.Call(uintptr(attachParent)); r != 0 {
			if f, err := os.OpenFile("CONOUT$", os.O_WRONLY, 0); err == nil {
				os.Stdout, os.Stderr = f, f
				log.SetOutput(f)
			}
		}
	}
}

func isWindowsService() bool {
	ok, err := svc.IsWindowsService()
	return err == nil && ok
}

// --- the service ---

type service struct{}

func (service) Execute(_ []string, req <-chan svc.ChangeRequest, st chan<- svc.Status) (bool, uint32) {
	st <- svc.Status{State: svc.StartPending}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- runDaemon(ctx, serviceFlags{dataDir: platform.DataDir(), runDir: platform.RunDir(), listen: daemon.DefaultListen})
	}()
	st <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	for {
		select {
		case c := <-req:
			switch c.Cmd {
			case svc.Interrogate:
				st <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				st <- svc.Status{State: svc.StopPending}
				cancel()
				select {
				case <-done:
				case <-time.After(20 * time.Second):
				}
				return false, 0
			}
		case err := <-done:
			cancel()
			if err != nil {
				log.Printf("service stopped: %v", err)
				return false, 1
			}
			return false, 0
		}
	}
}

func runWindowsService() {
	_ = platform.SecureDir(platform.DataDir())
	logPath := filepath.Join(platform.DataDir(), "meridian.log")
	if fi, err := os.Stat(logPath); err == nil && fi.Size() > 4<<20 {
		_ = os.Rename(logPath, logPath+".old")
	}
	if f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err == nil {
		log.SetOutput(f)
	} else {
		log.SetOutput(io.Discard)
	}
	if err := svc.Run(serviceName, service{}); err != nil {
		log.Printf("service failed: %v", err)
	}
}

func requireAdmin() error {
	if !windows.GetCurrentProcessToken().IsElevated() {
		return errors.New("this needs administrator rights (right-click and choose \"Run as administrator\")")
	}
	return nil
}

// --- installation ---

func installDir() string {
	pf := os.Getenv("ProgramFiles")
	if pf == "" {
		pf = `C:\Program Files`
	}
	return filepath.Join(pf, "Meridian")
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	tmp := dst + ".new"
	if err := os.WriteFile(tmp, data, 0o755); err != nil {
		return err
	}
	_ = os.Remove(dst)
	return os.Rename(tmp, dst)
}

func installService() error {
	if err := requireAdmin(); err != nil {
		return err
	}
	self, err := os.Executable()
	if err != nil {
		return err
	}
	dir := installDir()
	target := filepath.Join(dir, "Meridian.exe")
	// Run the service from Program Files, which only administrators can
	// change; a copy in Downloads could be replaced by any program.
	if !strings.EqualFold(filepath.Clean(self), filepath.Clean(target)) {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
		stopAndDelete()
		if err := copyFile(self, target); err != nil {
			return fmt.Errorf("copying Meridian to %s: %w", dir, err)
		}
		if src := filepath.Join(filepath.Dir(self), wintunDLL); fileExists(src) {
			if err := copyFile(src, filepath.Join(dir, wintunDLL)); err != nil {
				return fmt.Errorf("copying %s: %w", wintunDLL, err)
			}
		}
	}
	if !fileExists(filepath.Join(dir, wintunDLL)) {
		fmt.Println("Downloading the Wintun driver from wintun.net…")
		if err := fetchWintun(dir); err != nil {
			return fmt.Errorf("%s is missing and could not be downloaded (%v); put it in the same folder as Meridian.exe", wintunDLL, err)
		}
	}
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	stopAndDelete()
	s, err := m.CreateService(serviceName, target, mgr.Config{
		ServiceType:  windows.SERVICE_WIN32_OWN_PROCESS,
		StartType:    mgr.StartAutomatic,
		ErrorControl: mgr.ErrorNormal,
		DisplayName:  "Meridian VPN",
		Description:  "Runs Meridian VPN connections, the ad blocker and the kill switch.",
		// The kill switch firewall recognises the service by its SID.
		SidType: windows.SERVICE_SID_TYPE_UNRESTRICTED,
	})
	if err != nil {
		return fmt.Errorf("creating the service: %w", err)
	}
	defer s.Close()
	_ = s.SetRecoveryActions([]mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 2 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 5 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 30 * time.Second},
	}, 86400)
	if err := s.Start(); err != nil {
		return fmt.Errorf("starting the service: %w", err)
	}
	fmt.Println("Meridian service installed and started.")
	return nil
}

// fetchWintun downloads the official Wintun release, checks it against the
// pinned SHA-256 and installs the DLL for this architecture into dir.
func fetchWintun(dir string) error {
	data, err := wintun.Download(nil, wintun.URL)
	if err != nil {
		return err
	}
	dll, license, err := wintun.Extract(data, wintun.SHA256, runtime.GOARCH)
	if err != nil {
		return err
	}
	if len(license) > 0 {
		_ = os.WriteFile(filepath.Join(dir, "wintun-LICENSE.txt"), license, 0o644)
	}
	return os.WriteFile(filepath.Join(dir, wintunDLL), dll, 0o644)
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// stopAndDelete removes an existing service, waiting until it is gone.
func stopAndDelete() {
	m, err := mgr.Connect()
	if err != nil {
		return
	}
	defer m.Disconnect()
	s, err := m.OpenService(serviceName)
	if err != nil {
		return
	}
	_, _ = s.Control(svc.Stop)
	for i := 0; i < 50; i++ {
		if st, err := s.Query(); err != nil || st.State == svc.Stopped {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	_ = s.Delete()
	s.Close()
	for i := 0; i < 50; i++ {
		s2, err := m.OpenService(serviceName)
		if err != nil {
			return
		}
		s2.Close()
		time.Sleep(200 * time.Millisecond)
	}
}

func uninstallService() error {
	if err := requireAdmin(); err != nil {
		return err
	}
	stopAndDelete()
	fmt.Println("Meridian service removed. Saved locations stay in " + platform.DataDir() + " until you delete that folder.")
	return nil
}

func controlService(start bool) error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(serviceName)
	if err != nil {
		return errors.New("the Meridian service is not installed")
	}
	defer s.Close()
	if start {
		return s.Start()
	}
	_, err = s.Control(svc.Stop)
	return err
}

func startService() error { return controlService(true) }
func stopService() error  { return controlService(false) }

func serviceInstalled() bool {
	h, err := windows.OpenSCManager(nil, nil, windows.SC_MANAGER_CONNECT)
	if err != nil {
		return false
	}
	defer windows.CloseServiceHandle(h)
	name, _ := windows.UTF16PtrFromString(serviceName)
	s, err := windows.OpenService(h, name, windows.SERVICE_QUERY_STATUS)
	if err != nil {
		return false
	}
	windows.CloseServiceHandle(s)
	return true
}

// --- elevation ---

type shellExecuteInfo struct {
	cbSize       uint32
	fMask        uint32
	hwnd         windows.HWND
	lpVerb       *uint16
	lpFile       *uint16
	lpParameters *uint16
	lpDirectory  *uint16
	nShow        int32
	hInstApp     windows.Handle
	lpIDList     uintptr
	lpClass      *uint16
	hkeyClass    windows.Handle
	dwHotKey     uint32
	hIcon        windows.Handle
	hProcess     windows.Handle
}

// runElevated starts this program with administrator rights (showing the
// UAC prompt) and waits for it to finish.
func runElevated(args string) error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	verb, _ := windows.UTF16PtrFromString("runas")
	file, _ := windows.UTF16PtrFromString(self)
	params, _ := windows.UTF16PtrFromString(args)
	info := shellExecuteInfo{fMask: seeNoClose | seeNoAsync, lpVerb: verb, lpFile: file, lpParameters: params, nShow: windows.SW_HIDE}
	info.cbSize = uint32(unsafe.Sizeof(info))
	if r, _, e := procShellExecEx.Call(uintptr(unsafe.Pointer(&info))); r == 0 {
		if errors.Is(e, windows.ERROR_CANCELLED) {
			return errors.New("Meridian needs administrator approval once to install its VPN service")
		}
		return fmt.Errorf("could not start the installer: %v", e)
	}
	defer windows.CloseHandle(info.hProcess)
	if _, err := windows.WaitForSingleObject(info.hProcess, 5*60*1000); err != nil {
		return err
	}
	var code uint32
	if err := windows.GetExitCodeProcess(info.hProcess, &code); err == nil && code != 0 {
		return errors.New("installing the VPN service failed; see the Windows event log")
	}
	return nil
}

func installServiceElevated() error {
	if windows.GetCurrentProcessToken().IsElevated() {
		return installService()
	}
	return runElevated("service install")
}

func startServiceAsUser() error {
	if err := startService(); err == nil {
		return nil
	}
	return runElevated("service start")
}

// --- the window ---

func launchApp() error {
	if hwnd := findWindow(windowTitle); hwnd != 0 {
		procShowWindow.Call(hwnd, 9) // SW_RESTORE
		procSetFG.Call(hwnd)
		return nil
	}
	info, err := ensureService()
	if err != nil {
		return err
	}
	return openWindow(info.URL())
}

func findWindow(title string) uintptr {
	t, _ := syscall.UTF16PtrFromString(title)
	h, _, _ := procFindWindow.Call(0, uintptr(unsafe.Pointer(t)))
	return h
}

func openWindow(url string) error {
	dataPath := filepath.Join(os.Getenv("LocalAppData"), "Meridian", "WebView2")
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  dataPath,
		WindowOptions: webview2.WindowOptions{
			Title:  windowTitle,
			Width:  1180,
			Height: 800,
			Center: true,
		},
	})
	if w == nil {
		// No WebView2 runtime: use Edge or the default browser instead.
		return openAppWindow(url)
	}
	defer w.Destroy()
	setWindowIcon(uintptr(w.Window()))
	w.SetSize(960, 640, webview2.HintMin)
	w.Navigate(url)
	w.Run()
	return nil
}

// setWindowIcon gives the window and taskbar button the app icon.
func setWindowIcon(hwnd uintptr) {
	icon := func(png []byte, size int) uintptr {
		if len(png) == 0 || procCreateIcon.Find() != nil {
			return 0
		}
		h, _, _ := procCreateIcon.Call(uintptr(unsafe.Pointer(&png[0])), uintptr(len(png)), 1, 0x00030000, uintptr(size), uintptr(size), 0)
		return h
	}
	const wmSetIcon = 0x0080
	if big := icon(assets.Icon256PNG, 256); big != 0 {
		procSendMessage.Call(hwnd, wmSetIcon, 1, big)
	}
	if small := icon(assets.Icon32PNG, 32); small != 0 {
		procSendMessage.Call(hwnd, wmSetIcon, 0, small)
	}
}

func openDefaultBrowser(url string) error {
	verb, _ := windows.UTF16PtrFromString("open")
	u, _ := windows.UTF16PtrFromString(url)
	return windows.ShellExecute(0, verb, u, nil, nil, windows.SW_SHOWNORMAL)
}

func showErrorDialog(err error) {
	if isWindowsService() {
		return
	}
	text, _ := windows.UTF16PtrFromString(err.Error())
	title, _ := windows.UTF16PtrFromString("Meridian")
	_, _ = windows.MessageBox(0, text, title, windows.MB_ICONERROR|windows.MB_OK)
}
