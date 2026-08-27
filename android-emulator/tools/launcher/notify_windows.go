//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// notify shows a native message box. With -H windowsgui there is no console,
// so this is the only way an error reaches the person who double-clicked.
func notify(title, text string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBoxW := user32.NewProc("MessageBoxW")
	const mbIconError = 0x00000010
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(title)
	messageBoxW.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), mbIconError)
}
