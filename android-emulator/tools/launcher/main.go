// Command launcher is the double-clickable front door on Windows.
//
// It is not a browser wrapper in the Electron sense — there is no second copy
// of Chromium here. It performs first-run setup if needed, starts the Node
// control panel, waits for it to answer, and opens an already-installed
// Chromium-based browser in --app mode, which gives a plain window with no
// address bar and no tabs. Closing that window stops the server.
//
// Built with -H windowsgui so a double click shows no console. Everything that
// can fail therefore has to report itself: failures pop a message box carrying
// the server's own output, because a silent exit is the worst possible outcome
// for something launched by double click.
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

// npm ships beside node, which matters because PATH may not carry it.
func findNpm(node string) (string, error) {
	name := "npm"
	if runtime.GOOS == "windows" {
		name = "npm.cmd"
	}
	beside := filepath.Join(filepath.Dir(node), name)
	if st, err := os.Stat(beside); err == nil && !st.IsDir() {
		return beside, nil
	}
	if p, err := exec.LookPath(name); err == nil {
		return p, nil
	}
	return "", fmt.Errorf("npm не найден рядом с %s и в PATH", node)
}

/**
 * First run: install the Node dependencies and the browser Playwright needs.
 *
 * This is the step whose absence looked like a broken app — an archive without
 * node_modules is a source tree, not an install, and Node exits immediately.
 * It runs in its own visible console because it takes minutes and downloads
 * ~150 MB; a windowless app sitting silently for that long is indistinguishable
 * from one that has hung.
 */
func ensureDeps(root, node string) error {
	marker := filepath.Join(root, "node_modules", "playwright", "cli.js")
	if _, err := os.Stat(marker); err == nil {
		return nil
	}

	npm, err := findNpm(node)
	if err != nil {
		return fmt.Errorf(
			"нужна первичная установка, но %v.\n\n"+
				"Откройте cmd в папке проекта и выполните:\n  npm install\n"+
				"  node node_modules\\playwright\\cli.js install chromium", err)
	}

	install := exec.Command(npm, "install", "--no-audit", "--no-fund")
	install.Dir = root
	inNewConsole(install)
	if err := install.Run(); err != nil {
		return fmt.Errorf(
			"не удалось установить зависимости (npm install): %v\n\n"+
				"Попробуйте вручную в cmd из папки:\n%s", err, root)
	}

	// Playwright's own CLI rather than npx: npx asks "Ok to proceed?" when the
	// package is not yet present, and there is nobody at a prompt here.
	browsers := exec.Command(node, filepath.Join("node_modules", "playwright", "cli.js"),
		"install", "chromium")
	browsers.Dir = root
	inNewConsole(browsers)
	if err := browsers.Run(); err != nil {
		return fmt.Errorf(
			"не удалось скачать Chromium: %v\n\n"+
				"Попробуйте вручную в cmd из папки:\n%s\n  node node_modules\\playwright\\cli.js install chromium",
			err, root)
	}
	return nil
}

/**
 * Any Chromium-based browser will do; the panel is ordinary HTML. Playwright's
 * own Chromium is tried first because the project just installed it, so it is
 * guaranteed present and a known version.
 */
func findBrowser(root string) string {
	var candidates []string

	// The copy Playwright downloaded for this project, wherever it put it.
	for _, base := range []string{os.Getenv("PLAYWRIGHT_BROWSERS_PATH"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "ms-playwright"),
		filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local", "ms-playwright")} {
		if base == "" {
			continue
		}
		for _, pat := range []string{
			filepath.Join(base, "chromium-*", "chrome-win", "chrome.exe"),
			filepath.Join(base, "chromium-*", "chrome-linux", "chrome"),
		} {
			m, _ := filepath.Glob(pat)
			candidates = append(candidates, m...)
		}
	}

	if runtime.GOOS == "windows" {
		local := os.Getenv("LOCALAPPDATA")
		candidates = append(candidates,
			filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(local, "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"),
		)
	} else {
		home, _ := os.UserHomeDir()
		for _, pat := range []string{
			filepath.Join(home, ".cache", "ms-playwright", "chromium*", "chrome-linux", "chrome"),
			"/opt/pw-browsers/chromium*/chrome-linux/chrome",
		} {
			m, _ := filepath.Glob(pat)
			candidates = append(candidates, m...)
		}
		candidates = append(candidates,
			"/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
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

/** The last few lines of the server's log, for a message box. */
func logTail(path string, lines int) string {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return ""
	}
	all := strings.Split(strings.TrimRight(string(data), "\r\n"), "\n")
	if len(all) > lines {
		all = all[len(all)-lines:]
	}
	return strings.TrimSpace(strings.Join(all, "\n"))
}

/**
 * Waits for the panel, but gives up the moment the server process dies rather
 * than burning the whole timeout on a process that is already gone — which is
 * exactly what a missing dependency looks like.
 */
func waitForServer(url string, exited <-chan error, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 2 * time.Second}
	for time.Now().Before(deadline) {
		select {
		case err := <-exited:
			return fmt.Errorf("сервер завершился, не начав слушать (%v)", err)
		default:
		}
		resp, err := client.Get(url + "api/config")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return nil
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("панель не ответила за %s", timeout)
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
	if err := ensureDeps(root, node); err != nil {
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
	// With no console there is nowhere for the server's output to go, so it
	// lands in panel.log — and in the error box below, when something fails.
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

	exited := make(chan error, 1)
	go func() { exited <- server.Wait() }()

	if err := waitForServer(url, exited, 90*time.Second); err != nil {
		msg := fmt.Sprintf("%v.", err)
		if tail := logTail(logPath, 12); tail != "" {
			msg += "\n\nЧто сказал сервер:\n" + tail
		}
		return fmt.Errorf("%s\n\nПолный лог:\n%s", msg, logPath)
	}

	browser := findBrowser(root)
	if browser == "" {
		return fmt.Errorf(
			"не нашёл Chrome, Edge или Chromium.\n\n"+
				"Панель уже работает — откройте в любом браузере:\n%s\n\n"+
				"Она закроется, когда вы нажмёте OK.", url)
	}

	// A private profile directory keeps the panel out of the user's own browser
	// session, and --app strips the tab strip and address bar, so the result is
	// a window rather than a browsing session.
	args := []string{
		"--app=" + url,
		"--user-data-dir=" + filepath.Join(os.TempDir(), "andro-panel-profile"),
		"--window-size=1500,950",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-features=Translate,MediaRouter",
	}
	win := exec.Command(browser, args...)
	if err := win.Start(); err != nil {
		return fmt.Errorf("не удалось открыть окно (%s): %v", browser, err)
	}

	// The window owns the lifetime: closing it takes down the panel and every
	// device under it, rather than leaving them running invisibly.
	_ = win.Wait()
	return nil
}

func main() {
	if err := run(); err != nil {
		notify("Эмулятор Android-устройств", err.Error())
		os.Exit(1)
	}
}
