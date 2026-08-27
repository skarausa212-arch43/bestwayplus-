//go:build darwin

package main

import (
	"os/exec"
	"strings"
)

/**
 * A double-clicked .app has no visible stderr, so an error printed there is an
 * error nobody sees. osascript puts it in front of the user instead.
 */
func notify(title, text string) {
	esc := func(s string) string {
		return strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`)
	}
	script := `display dialog "` + esc(text) + `" with title "` + esc(title) +
		`" buttons {"OK"} default button "OK" with icon stop`
	if err := exec.Command("osascript", "-e", script).Run(); err != nil {
		// osascript can be refused in odd environments; the log is the fallback.
		exec.Command("logger", "-t", "AndroidEmulator", text).Run()
	}
}
