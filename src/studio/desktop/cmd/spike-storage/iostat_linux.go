//go:build linux

package main

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// procWrite is the bytes the process has asked the kernel to write (wchar), which counts the temp file, the WAL and the
// database pages alike.
func procWrite() int64 {
	f, err := os.Open("/proc/self/io")
	if err != nil {
		return 0
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		if v, ok := strings.CutPrefix(s.Text(), "wchar: "); ok {
			n, _ := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
			return n
		}
	}
	return 0
}

func procMem() (rssMB, peakMB float64) {
	b, err := os.ReadFile("/proc/self/status")
	if err != nil {
		return 0, 0
	}
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		if len(f) >= 2 {
			kb, _ := strconv.ParseFloat(f[1], 64)
			switch f[0] {
			case "VmRSS:":
				rssMB = kb / 1024
			case "VmHWM:":
				peakMB = kb / 1024
			}
		}
	}
	return
}
