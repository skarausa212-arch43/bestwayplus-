//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// CREATE_NEW_CONSOLE. The launcher itself is windowless, so a child that needs
// to show progress has to be given a console of its own.
const createNewConsole = 0x00000010

func inNewConsole(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNewConsole}
}
