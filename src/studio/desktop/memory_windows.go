//go:build windows

package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// memoryStatusEx is Win32's MEMORYSTATUSEX.
type memoryStatusEx struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

var procGlobalMemoryStatusEx = windows.NewLazySystemDLL("kernel32.dll").NewProc("GlobalMemoryStatusEx")

// platformFreeMemoryMB reads the physical memory free now (GlobalMemoryStatusEx), in MB; 0 when it cannot be read.
func platformFreeMemoryMB() int {
	status := memoryStatusEx{Length: uint32(unsafe.Sizeof(memoryStatusEx{}))}
	if ok, _, _ := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&status))); ok == 0 { //nolint:gosec // G103: the Win32 call fills a struct that outlives it
		return 0
	}
	return int(status.AvailPhys >> 20) //nolint:gosec // G115: a computer's memory in MB fits an int
}
