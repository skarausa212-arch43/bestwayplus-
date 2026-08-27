// Command launcher is the double-clickable front door on Windows.
//
// It is not a browser wrapper in the Electron sense — there is no second copy
// of Chromium here. It starts the Node control panel, waits for it to answer,
// and opens an existing Chromium-based browser in --app mode, which gives a
// plain window with no address bar, no tabs and its own taskbar entry. Closing
// that window stops the server.
//
// Built with -H windowsgui so a double click shows no console. Anything that
// goes wrong therefore has to reach the user some other way, so failures pop a
// message box rather than vanishing into a closed terminal.
package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// projectRoot finds the android-emulator directory relative to the executable,
// so the exe works wherever the folder is moved as long as it stays inside it.
func projectRoot() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exe)
	for i := 0; i < 6; i++ {
		if _, err := os.Stat(filepath.Join(dir, "bin", "cli.js")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf(
		"не нашёл bin\\cli.js рядом с %s.\n\n"+
			"Положите этот .exe внутрь папки android-emulator (или в её подпапку) и запустите снова.",
		filepath.Dir(exe))
}

// findNode prefers PATH, then the standard installer locations, because a
// double-clicked exe does not always inherit a shell's PATH.
func findNode() (string, error) {
	if p, err := exec.LookPath("node"); err == nil {
		return p, nil
	}
	var candidates []string
	if runtime.GOOS == "windows" {
		candidates = []string{
			filepath.Join(os.Getenv("ProgramFiles"), "nodejs", "node.exe"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "nodejs", "node.exe"),
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "nodejs", "node.exe"),
			filepath.Join(os.Getenv("APPDATA"), "npm", "node.exe"),
		}
	} else {
		candidates = []string{"/usr/local/bin/node", "/usr/bin/node", "/opt/homebrew/bin/node"}
	}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf(
		"Node.js не найден.\n\nУстановите его с https://nodejs.org (нужна версия 20 или новее) и запустите снова.")
}

/**
 * Any Chromium-based browser will do; the panel is ordinary HTML. Playwright's
 * own Chromium is tried first because the project already installed it, so it
 * is guaranteed present and a known version.
 */
func findBrowser() string {
	var candidates []string

	if runtime.GOOS == "windows" {
		local := os.Getenv("LOCALAPPDATA")
		if local != "" {
			// ms-playwright/chromium-<build>/chrome-win/chrome.exe
			matches, _ := filepath.Glob(filepath.Join(local, "ms-playwright", "chromium-*", "chrome-win", "chrome.exe"))
			candidates = append(candidates, matches...)
		}
		candidates = append(candidates,
			filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(local, "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"),
		)
	} else {
		home, _ := os.UserHomeDir()
		for _, pattern := range []string{
			filepath.Join(home, ".cache", "ms-playwright", "chromium*", "chrome-linux", "chrome"),
			filepath.Join(home, "Library", "Caches", "ms-playwright", "chromium*", "chrome-mac*", "Chromium.app", "Contents", "MacOS", "Chromium"),
			"/opt/pw-browsers/chromium*/chrome-linux/chrome",
		} {
			matches, _ := filepath.Glob(pattern)
			candidates = append(candidates, matches...)
		}
		candidates = append(candidates,
			"/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		)
	}

	for _, c := range candidates {
		if c == "" {
			continue
		}
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func waitForServer(url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 2 * time.Second}
	var last error
	for time.Now().Before(deadline) {
		resp, err := client.Get(url + "api/config")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return nil
			}
			last = fmt.Errorf("сервер ответил %s", resp.Status)
		} else {
			last = err
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("панель не поднялась за %s: %v", timeout, last)
}

func run() error {
	root, err := projectRoot()
	if err != nil {
		return err
	}
	node, err := findNode()
	if err != nil {
		return err
	}
	port, err := freePort()
	if err != nil {
		return err
	}
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)

	logPath := filepath.Join(root, "panel.log")
	logFile, err := os.Create(logPath)
	if err != nil {
		return fmt.Errorf("не удалось создать %s: %v", logPath, err)
	}
	defer logFile.Close()

	server := exec.Command(node, filepath.Join("bin", "cli.js"), "gui", "--port", fmt.Sprint(port))
	server.Dir = root
	// Without a console there is nowhere for stdout to go, so the server's
	// output lands in panel.log — the only breadcrumb when something fails.
	server.Stdout = logFile
	server.Stderr = logFile
	if err := server.Start(); err != nil {
		return fmt.Errorf("не удалось запустить сервер: %v", err)
	}
	defer func() {
		if server.Process != nil {
			_ = server.Process.Kill()
		}
	}()

	if err := waitForServer(url, 60*time.Second); err != nil {
		return fmt.Errorf("%v\n\nПодробности в файле:\n%s", err, logPath)
	}

	browser := findBrowser()
	if browser == "" {
		return fmt.Errorf(
			"не нашёл Chrome, Edge или Chromium.\n\n"+
				"Панель уже работает — откройте в любом браузере:\n%s\n\n"+
				"Окно закроется, когда вы нажмёте OK.", url)
	}

	// A private profile directory keeps the panel out of the user's own browser
	// session, and --app strips the tab strip and address bar so the result is
	// a window rather than a browsing session.
	profileDir := filepath.Join(os.TempDir(), "andro-panel-profile")
	args := []string{
		"--app=" + url,
		"--user-data-dir=" + profileDir,
		"--window-size=1500,950",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-features=Translate,MediaRouter",
	}
	win := exec.Command(browser, args...)
	if err := win.Start(); err != nil {
		return fmt.Errorf("не удалось открыть окно (%s): %v", browser, err)
	}

	// The window owns the lifetime: when the user closes it, the panel and every
	// device it started go down with it, rather than lingering invisibly.
	_ = win.Wait()
	return nil
}

func main() {
	if err := run(); err != nil {
		notify("Эмулятор Android-устройств", err.Error())
		os.Exit(1)
	}
}

func init() {
	// Keep paths tidy when the exe is launched from a mapped drive or UNC path.
	if wd, err := os.Getwd(); err == nil && strings.HasPrefix(wd, `\\`) {
		_ = os.Chdir(os.TempDir())
	}
}
