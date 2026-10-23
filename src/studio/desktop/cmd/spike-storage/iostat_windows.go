//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

var (
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	psapi            = syscall.NewLazyDLL("psapi.dll")
	getIoCounters    = kernel32.NewProc("GetProcessIoCounters")
	getCurrentProc   = kernel32.NewProc("GetCurrentProcess")
	getProcessMemory = psapi.NewProc("GetProcessMemoryInfo")
)

type ioCounters struct{ ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes uint64 }

func procWrite() int64 {
	h, _, _ := getCurrentProc.Call()
	var c ioCounters
	if r, _, _ := getIoCounters.Call(h, uintptr(unsafe.Pointer(&c))); r == 0 {
		return 0
	}
	return int64(c.WriteBytes)
}

type memCounters struct {
	CB                         uint32
	PageFaultCount             uint32
	PeakWorkingSetSize         uintptr
	WorkingSetSize             uintptr
	QuotaPeakPagedPoolUsage    uintptr
	QuotaPagedPoolUsage        uintptr
	QuotaPeakNonPagedPoolUsage uintptr
	QuotaNonPagedPoolUsage     uintptr
	PagefileUsage              uintptr
	PeakPagefileUsage          uintptr
}

func procMem() (rssMB, peakMB float64) {
	h, _, _ := getCurrentProc.Call()
	m := memCounters{CB: uint32(unsafe.Sizeof(memCounters{}))}
	if r, _, _ := getProcessMemory.Call(h, uintptr(unsafe.Pointer(&m)), uintptr(m.CB)); r == 0 {
		return 0, 0
	}
	return float64(m.WorkingSetSize) / 1048576, float64(m.PeakWorkingSetSize) / 1048576
}
