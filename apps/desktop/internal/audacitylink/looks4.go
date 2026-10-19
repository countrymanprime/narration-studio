package audacitylink

import (
	"path/filepath"
	"regexp"
	"strings"
)

// audacity4Path matches an install folder or program name that says Audacity 4: "Audacity 4", "Audacity-4.0", "audacity4".
var audacity4Path = regexp.MustCompile(`(?i)audacity[ _-]?4(\.|\b|$)`)

// LooksLikeAudacity4 reports whether the program at exePath is installed as Audacity 4, going by its folder and file name. This is
// a hint for the sentence the narrator reads: Audacity 4 has no pipe to ask, and Audacity 3's installer uses "Audacity" alone.
func LooksLikeAudacity4(exePath string) bool {
	if exePath == "" {
		return false
	}
	clean := filepath.ToSlash(exePath)
	for _, part := range strings.Split(clean, "/") {
		if audacity4Path.MatchString(part) {
			return true
		}
	}
	return false
}
