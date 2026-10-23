//go:build !linux && !windows

package main

func procWrite() int64                 { return 0 }
func procMem() (rssMB, peakMB float64) { return 0, 0 }
