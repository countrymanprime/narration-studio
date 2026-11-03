//go:build windows

package bridge

import (
	"os"
	"path/filepath"
	"testing"
	"unsafe"

	"golang.org/x/sys/windows"
)

// TestNewLimitsTheSessionFolderToTheCurrentUser reads the folder's access list back: one allow entry, for the current user,
// protected from the parent's inheritance, and inherited by the command files made inside it.
func TestNewLimitsTheSessionFolderToTheCurrentUser(t *testing.T) {
	session := filepath.Join(t.TempDir(), "session")
	client, err := New(session)
	if err != nil {
		t.Fatal(err)
	}
	user, err := currentUserSID()
	if err != nil {
		t.Fatal(err)
	}
	assertOnlyUser := func(path string) {
		t.Helper()
		descriptor, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION)
		if err != nil {
			t.Fatal(err)
		}
		control, _, err := descriptor.Control()
		if err != nil {
			t.Fatal(err)
		}
		if control&windows.SE_DACL_PROTECTED == 0 {
			t.Fatalf("%s still inherits entries from its parent", path)
		}
		acl, _, err := descriptor.DACL()
		if err != nil || acl == nil {
			t.Fatalf("%s has no access list: %v", path, err)
		}
		// Windows may split one inheritable entry into a container entry and an inherit-only one, so the count is not pinned: what matters
		// is that there is at least one and every one of them names the current user.
		if acl.AceCount == 0 {
			t.Fatalf("%s has an empty access list", path)
		}
		for index := uint32(0); index < uint32(acl.AceCount); index++ {
			var ace *windows.ACCESS_ALLOWED_ACE
			if err := windows.GetAce(acl, index, &ace); err != nil {
				t.Fatal(err)
			}
			if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE {
				t.Fatalf("%s entry %d is not an allow entry", path, index)
			}
			sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart)) //nolint:gosec // G103: the SID sits inline at SidStart
			if !windows.EqualSid(sid, user) {
				t.Fatalf("%s entry %d grants access to someone other than the current user", path, index)
			}
		}
	}
	assertOnlyUser(session)
	assertOnlyUser(filepath.Join(session, "commands"))
	target, err := client.Send("ping", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(target); err != nil {
		t.Fatal(err)
	}
	assertOnlyUser(target)
}
