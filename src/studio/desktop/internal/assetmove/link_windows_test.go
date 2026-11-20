//go:build windows

package assetmove

import (
	"os"
	"os/exec"
	"testing"
)

// makeLink makes link point at the folder target. A symbolic link needs a privilege on Windows, so this makes a junction, which needs none and
// is the other kind of link a folder can hold there. Go reports a junction as an entry that is neither a file nor a folder, as it does a
// symbolic link, which is what the move refuses (#3630). It fails the test, not skips, if the link cannot be made.
func makeLink(t *testing.T, link, target string) {
	t.Helper()
	if out, err := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput(); err != nil {
		t.Fatalf("could not make a junction %s -> %s: %v: %s", link, target, err, out)
	}
	if _, err := os.Lstat(link); err != nil {
		t.Fatal(err)
	}
}
