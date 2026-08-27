//go:build !windows

package main

import (
	"fmt"
	"os"
)

// Everywhere else the launcher runs from a terminal, so stderr is visible.
func notify(title, text string) {
	fmt.Fprintf(os.Stderr, "%s\n\n%s\n", title, text)
}
