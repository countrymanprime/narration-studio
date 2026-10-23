//go:build windows

package main

// A directory cannot be opened for sync on Windows; the rename is journaled by NTFS.
func syncDir(string) {}
