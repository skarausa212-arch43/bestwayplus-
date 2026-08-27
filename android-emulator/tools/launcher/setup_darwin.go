//go:build darwin

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

/**
 * macOS has no "give this child its own console", so the setup runs as a shell
 * script inside Terminal.app. `open` returns as soon as Terminal is asked to
 * start, which would let the launcher race ahead, so the script writes a marker
 * on the way out and we wait for that instead.
 *
 * Terminal is used rather than a silent install because this step moves ~150 MB
 * and takes minutes: an app bouncing in the Dock with nothing to show is
 * indistinguishable from one that has hung.
 */
func runSetup(root, node, npm string) error {
	marker := filepath.Join(os.TempDir(), fmt.Sprintf("andro-setup-%d.done", os.Getpid()))
	script := filepath.Join(os.TempDir(), fmt.Sprintf("andro-setup-%d.sh", os.Getpid()))
	defer os.Remove(script)
	defer os.Remove(marker)

	body := fmt.Sprintf(`#!/bin/bash
cd %q || exit 1
echo "Первичная установка эмулятора Android-устройств."
echo "Это делается один раз и занимает несколько минут."
echo
%q install --no-audit --no-fund || { echo "ОШИБКА: npm install"; echo fail > %q; exit 1; }
echo
echo "Скачиваю Chromium…"
%q node_modules/playwright/cli.js install chromium || { echo "ОШИБКА: Chromium"; echo fail > %q; exit 1; }
echo
echo "Готово. Окно можно закрыть."
echo ok > %q
`, root, npm, marker, node, marker, marker)

	if err := os.WriteFile(script, []byte(body), 0o755); err != nil {
		return fmt.Errorf("не удалось подготовить установку: %v", err)
	}
	if err := exec.Command("open", "-a", "Terminal", script).Run(); err != nil {
		return fmt.Errorf("не удалось открыть Терминал: %v", err)
	}

	// Generous: a slow connection downloading Chromium is the normal case here.
	deadline := time.Now().Add(30 * time.Minute)
	for time.Now().Before(deadline) {
		if data, err := os.ReadFile(marker); err == nil && len(data) > 0 {
			// HasPrefix, not data[:2]: the file can be read mid-write, and
			// slicing a one-byte read would panic instead of retrying.
			if strings.HasPrefix(string(data), "ok") {
				return nil
			}
			if strings.HasPrefix(string(data), "fail") {
				return fmt.Errorf("установка завершилась с ошибкой — смотрите окно Терминала")
			}
		}
		time.Sleep(time.Second)
	}
	return fmt.Errorf("установка не завершилась за 30 минут")
}
