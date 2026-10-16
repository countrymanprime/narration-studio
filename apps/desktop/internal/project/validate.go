package project

import (
	"fmt"
	"strings"
	"unicode/utf16"
)

// maxNameUnits is the longest a single folder name can be on Windows: 255 UTF-16 code units. A longer name fails at
// MkdirAll; refusing it here says why before anything is created.
const maxNameUnits = 255

// invalidNameChars are characters Windows refuses in a file or path segment name (control characters 0-31
// are checked separately below), plus the two path separators, so a name can never smuggle in a path
// segment of its own.
const invalidNameChars = `<>:"/\|?*`

// reservedNames are the Windows device names: reserved at any case and whether or not a name carries an
// extension after them.
var reservedNames = map[string]bool{
	"CON": true, "PRN": true, "AUX": true, "NUL": true,
	"COM1": true, "COM2": true, "COM3": true, "COM4": true, "COM5": true, "COM6": true, "COM7": true, "COM8": true, "COM9": true,
	"LPT1": true, "LPT2": true, "LPT3": true, "LPT4": true, "LPT5": true, "LPT6": true, "LPT7": true, "LPT8": true, "LPT9": true,
}

// ValidateName reports whether name can be used as a new project's folder name: non-empty once trimmed of
// surrounding whitespace, not "." or "..", free of characters and control bytes Windows refuses in a path
// segment, and not a Windows reserved device name (case-insensitive, ignoring any extension). It does not
// check for a collision on disk or that a parent directory exists: those depend on where the project is
// being created and are the caller's job.
func ValidateName(name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return fmt.Errorf("a project name is required")
	}
	if trimmed == "." || trimmed == ".." {
		return fmt.Errorf("%q is not a valid project name", trimmed)
	}
	if strings.ContainsAny(trimmed, invalidNameChars) {
		return fmt.Errorf("a project name cannot contain any of %s", invalidNameChars)
	}
	for _, r := range trimmed {
		if r < 0x20 {
			return fmt.Errorf("a project name cannot contain control characters")
		}
	}
	// Win32 drops a trailing dot from a name, so "Book." would be created as "Book" while every path the app kept said "Book.".
	if strings.HasSuffix(trimmed, ".") {
		return fmt.Errorf("a project name cannot end with a period")
	}
	if len(utf16.Encode([]rune(trimmed))) > maxNameUnits {
		return fmt.Errorf("a project name can be at most %d characters", maxNameUnits)
	}
	base := trimmed
	if dot := strings.IndexByte(base, '.'); dot >= 0 {
		base = base[:dot]
	}
	// "CON .txt" is still the CON device: Windows ignores the spaces before the extension.
	if reservedNames[strings.ToUpper(strings.TrimRight(base, " "))] {
		return fmt.Errorf("%q is a reserved name and cannot be used", trimmed)
	}
	return nil
}
