package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"meridian/internal/daemon"
)

// serviceReady returns the running service's info if its API answers.
func serviceReady() (daemon.UIInfo, bool) {
	info, err := daemon.ReadUIInfo(runDirFromEnv())
	if err != nil || info.Port == 0 {
		return info, false
	}
	req, _ := http.NewRequest("GET", fmt.Sprintf("http://127.0.0.1:%d/api/meta", info.Port), nil)
	req.Header.Set("Authorization", "Bearer "+info.Token)
	c := &http.Client{Timeout: 2 * time.Second, Transport: &http.Transport{Proxy: nil}}
	resp, err := c.Do(req)
	if err != nil {
		return info, false
	}
	resp.Body.Close()
	return info, resp.StatusCode == 200
}

func waitForService(d time.Duration) (daemon.UIInfo, error) {
	deadline := time.Now().Add(d)
	for {
		if info, ok := serviceReady(); ok {
			return info, nil
		}
		if time.Now().After(deadline) {
			return daemon.UIInfo{}, errors.New("the Meridian service did not start; see the service log for details")
		}
		time.Sleep(300 * time.Millisecond)
	}
}

// ensureService starts (installing if needed) the background service.
func ensureService() (daemon.UIInfo, error) {
	if info, ok := serviceReady(); ok {
		return info, nil
	}
	if serviceInstalled() {
		_ = startServiceAsUser()
		if info, err := waitForService(8 * time.Second); err == nil {
			return info, nil
		}
	}
	if err := installServiceElevated(); err != nil {
		return daemon.UIInfo{}, err
	}
	return waitForService(30 * time.Second)
}

// appBrowsers are Chromium-based browsers that can show a page as an app
// window without tabs or an address bar.
func appBrowsers() []string {
	switch runtime.GOOS {
	case "darwin":
		return []string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Vivaldi.app/Contents/MacOS/Vivaldi",
		}
	case "windows":
		pf, pf86, local := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LocalAppData")
		return []string{
			filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`),
			filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`),
			filepath.Join(pf, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(local, `Google\Chrome\Application\chrome.exe`),
		}
	default:
		var out []string
		for _, name := range []string{"google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable", "brave-browser", "vivaldi"} {
			if p, err := exec.LookPath(name); err == nil {
				out = append(out, p)
			}
		}
		return out
	}
}

func userConfigDir() string {
	if d, err := os.UserConfigDir(); err == nil {
		return filepath.Join(d, "Meridian")
	}
	return filepath.Join(os.TempDir(), "meridian")
}

// openAppWindow shows url in a browser app window, falling back to the
// default browser.
func openAppWindow(url string) error {
	for _, b := range appBrowsers() {
		if _, err := os.Stat(b); err != nil {
			continue
		}
		profile := filepath.Join(userConfigDir(), "window")
		_ = os.MkdirAll(profile, 0o700)
		cmd := exec.Command(b, "--app="+url, "--user-data-dir="+profile, "--no-first-run",
			"--no-default-browser-check", "--window-size=1180,800", "--class=Meridian")
		if err := cmd.Start(); err == nil {
			go cmd.Wait()
			return nil
		}
	}
	return openDefaultBrowser(url)
}
