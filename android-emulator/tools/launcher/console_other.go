//go:build !windows

package main

import (
	"os"
	"os/exec"
)

// Elsewhere the launcher runs from a terminal that is already visible, so the
// child just inherits it.
func inNewConsole(cmd *exec.Cmd) {
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
}
