//go:build !windows

package assetmove

import (
	"os"
	"testing"
)

// makeLink makes link point at the folder target (a symbolic link; Windows makes a junction, see link_windows_test.go).
func makeLink(t *testing.T, link, target string) {
	t.Helper()
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
}
