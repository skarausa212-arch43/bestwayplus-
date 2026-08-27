//go:build !windows && !darwin

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// On Linux the launcher is started from a terminal that is already visible, so
// the children just inherit it.
func runSetup(root, node, npm string) error {
	install := exec.Command(npm, "install", "--no-audit", "--no-fund")
	install.Dir, install.Stdout, install.Stderr = root, os.Stdout, os.Stderr
	if err := install.Run(); err != nil {
		return fmt.Errorf("npm install: %v", err)
	}

	browsers := exec.Command(node,
		filepath.Join("node_modules", "playwright", "cli.js"), "install", "chromium")
	browsers.Dir, browsers.Stdout, browsers.Stderr = root, os.Stdout, os.Stderr
	if err := browsers.Run(); err != nil {
		return fmt.Errorf("установка Chromium: %v", err)
	}
	return nil
}
