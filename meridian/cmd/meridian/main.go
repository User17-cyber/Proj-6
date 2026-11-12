// Command meridian is the Meridian VPN app, its background service and a
// small command-line client, all in one binary.
//
//	meridian                     open the app (starting the service if needed)
//	meridian service run         run the background service (as root/SYSTEM)
//	meridian service install     install and start the service
//	meridian service uninstall   stop and remove the service
//	meridian status              show the connection
//	meridian connect [location]  connect (by name, country code or ID)
//	meridian disconnect          disconnect
//	meridian import FILE...      import WireGuard .conf files
//	meridian locations           list saved locations
//	meridian url                 print the app address (for a browser)
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"meridian/internal/daemon"
	"meridian/internal/platform"
	"meridian/internal/ui"
)

// version is set at build time with -ldflags "-X main.version=1.2.3".
var version = "dev"

func main() {
	log.SetFlags(log.LstdFlags)
	args := os.Args[1:]
	if isWindowsService() {
		runWindowsService()
		return
	}
	if len(args) == 0 {
		if err := launchApp(); err != nil {
			fatal(err)
		}
		return
	}
	var err error
	switch args[0] {
	case "service":
		err = serviceCmd(args[1:])
	case "status":
		err = cliStatus(args[1:])
	case "connect":
		err = cliConnect(args[1:])
	case "disconnect":
		err = cliDisconnect(args[1:])
	case "import":
		err = cliImport(args[1:])
	case "locations", "ls":
		err = cliLocations(args[1:])
	case "url":
		err = cliURL(args[1:])
	case "version", "--version", "-v":
		fmt.Println("Meridian", version)
	case "help", "--help", "-h":
		usage()
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		fatal(err)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `Meridian VPN `+version+`

Usage:
  meridian                     open the app
  meridian status              show the connection
  meridian connect [location]  connect (name, country code or ID)
  meridian disconnect          disconnect
  meridian import FILE...      import WireGuard .conf files
  meridian locations           list saved locations
  meridian url                 print the app address for a browser
  meridian service install     install the background service (admin)
  meridian service uninstall   remove the background service (admin)
  meridian service run         run the service in the foreground (admin)
`)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "meridian:", err)
	showErrorDialog(err)
	os.Exit(1)
}

func serviceCmd(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: meridian service run|install|uninstall|start|stop")
	}
	switch args[0] {
	case "run":
		return serviceRun(args[1:])
	case "install":
		return installService()
	case "uninstall":
		return uninstallService()
	case "start":
		return startService()
	case "stop":
		return stopService()
	}
	return fmt.Errorf("unknown service command %q", args[0])
}

type serviceFlags struct {
	dataDir, runDir, listen string
}

func parseServiceFlags(args []string) (serviceFlags, error) {
	fs := flag.NewFlagSet("service run", flag.ContinueOnError)
	var f serviceFlags
	fs.StringVar(&f.dataDir, "data-dir", platform.DataDir(), "folder for locations, settings and lists")
	fs.StringVar(&f.runDir, "run-dir", platform.RunDir(), "folder for the app's connection file (ui.json)")
	fs.StringVar(&f.listen, "listen", daemon.DefaultListen, "address of the local API")
	err := fs.Parse(args)
	return f, err
}

func serviceRun(args []string) error {
	f, err := parseServiceFlags(args)
	if err != nil {
		return err
	}
	if err := requireAdmin(); err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return runDaemon(ctx, f)
}

func runDaemon(ctx context.Context, f serviceFlags) error {
	return daemon.Run(ctx, daemon.Options{
		DataDir: f.dataDir,
		RunDir:  f.runDir,
		Listen:  f.listen,
		Version: version,
		UI:      ui.FS(),
		Logf:    log.Printf,
	})
}
