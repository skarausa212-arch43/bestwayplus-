//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"syscall"
)

// CREATE_NEW_CONSOLE. The launcher itself is windowless, so a child that needs
// to show progress must be given a console of its own.
const createNewConsole = 0x00000010

func visible(cmd *exec.Cmd) *exec.Cmd {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNewConsole}
	return cmd
}

// runSetup installs the Node dependencies and the browser, where the user can
// watch it happen.
func runSetup(root, node, npm string) error {
	install := visible(exec.Command(npm, "install", "--no-audit", "--no-fund"))
	install.Dir = root
	if err := install.Run(); err != nil {
		return fmt.Errorf("npm install: %v", err)
	}

	browsers := visible(exec.Command(node,
		filepath.Join("node_modules", "playwright", "cli.js"), "install", "chromium"))
	browsers.Dir = root
	if err := browsers.Run(); err != nil {
		return fmt.Errorf("установка Chromium: %v", err)
	}
	return nil
}
