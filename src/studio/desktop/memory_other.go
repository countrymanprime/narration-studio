//go:build !windows

package main

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// platformFreeMemoryMB reads MemAvailable from /proc/meminfo, in MB; 0 when there is none (the app runs on Windows, D74;
// this keeps the plan the same on the Linux runners that host the platform-neutral checks).
func platformFreeMemoryMB() int {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0
	}
	defer func() { _ = file.Close() }()
	return memAvailableMB(bufio.NewScanner(file))
}

// memAvailableMB is the MemAvailable line's kB as MB, or 0.
func memAvailableMB(lines *bufio.Scanner) int {
	for lines.Scan() {
		name, rest, found := strings.Cut(lines.Text(), ":")
		if !found || name != "MemAvailable" {
			continue
		}
		kb, err := strconv.Atoi(strings.TrimSuffix(strings.TrimSpace(rest), " kB"))
		if err != nil || kb < 0 {
			return 0
		}
		return kb / 1024
	}
	return 0
}
