//go:build !windows

package daw

// IsRunning is false off Windows: the DAW launcher and its detection are Windows-only for now (ADR 0412).
func IsRunning(string) bool { return false }
