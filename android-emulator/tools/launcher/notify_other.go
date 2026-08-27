//go:build !windows && !darwin

package main

import (
	"fmt"
	"os"
)

// On Linux the launcher runs from a terminal, so stderr is visible.
func notify(title, text string) {
	fmt.Fprintf(os.Stderr, "%s\n\n%s\n", title, text)
}
