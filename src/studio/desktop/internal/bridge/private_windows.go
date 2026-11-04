//go:build windows

package bridge

import (
	"fmt"

	"golang.org/x/sys/windows"
)

// restrictToCurrentUser replaces dir's access list with one entry: full control for the current user's SID, inherited by every
// file and folder made inside it later. The list is "protected" so the parent folder's entries (often Users or Everyone read) stop
// flowing in. os.WriteFile's 0o600 means nothing on Windows (Go only maps it to the read-only attribute), so this call is the whole
// of the folder's access control (threat-model row 4d, issue #240). REAPER runs as the same user, so it keeps its access.
func restrictToCurrentUser(dir string) error {
	user, err := currentUserSID()
	if err != nil {
		return err
	}
	access := []windows.EXPLICIT_ACCESS{{
		AccessPermissions: windows.GENERIC_ALL,
		AccessMode:        windows.SET_ACCESS,
		Inheritance:       windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT,
		Trustee: windows.TRUSTEE{
			TrusteeForm:  windows.TRUSTEE_IS_SID,
			TrusteeType:  windows.TRUSTEE_IS_USER,
			TrusteeValue: windows.TrusteeValueFromSID(user),
		},
	}}
	acl, err := windows.ACLFromEntries(access, nil)
	if err != nil {
		return fmt.Errorf("could not build the access list: %w", err)
	}
	info := windows.SECURITY_INFORMATION(windows.DACL_SECURITY_INFORMATION | windows.PROTECTED_DACL_SECURITY_INFORMATION)
	if err := windows.SetNamedSecurityInfo(dir, windows.SE_FILE_OBJECT, info, nil, nil, acl, nil); err != nil {
		return fmt.Errorf("could not restrict %s to the current user: %w", dir, err)
	}
	return nil
}

func currentUserSID() (*windows.SID, error) {
	token := windows.GetCurrentProcessToken()
	user, err := token.GetTokenUser()
	if err != nil {
		return nil, fmt.Errorf("could not read the current user: %w", err)
	}
	return user.User.Sid, nil
}
