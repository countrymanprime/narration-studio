//go:build !windows

package bridge

import "os"

// restrictToCurrentUser makes dir readable and writable by its owner alone. On Unix the mode bits are the access control, so
// 0o700 on the folder keeps every other account out of the commands and the events inside it.
func restrictToCurrentUser(dir string) error {
	return os.Chmod(dir, 0o700) //nolint:gosec // G302: dir is a folder; 0o600 would drop its execute bit and lock the owner out, and 0o700 is the tightest mode a folder can use
}
