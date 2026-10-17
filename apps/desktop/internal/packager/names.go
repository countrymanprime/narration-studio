package packager

import (
	"strings"
	"unicode/utf16"
)

// NameUnits is s's length in UTF-16 code units, the unit Windows counts a path segment in (an emoji is two).
func NameUnits(s string) int { return len(utf16.Encode([]rune(s))) }

// IsReservedDeviceName reports whether Windows reads name as a device (CON, PRN, AUX, NUL, COM and LPT 1-9 with their
// superscript digits, CONIN$, CONOUT$): in any case, with trailing spaces, and with any extension, so "nul.txt" is NUL too.
func IsReservedDeviceName(name string) bool {
	stem, _, _ := strings.Cut(name, ".")
	stem = strings.ToUpper(strings.TrimRight(stem, " "))
	switch stem {
	case "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$":
		return true
	}
	runes := []rune(stem)
	if len(runes) == 4 && (string(runes[:3]) == "COM" || string(runes[:3]) == "LPT") {
		switch d := runes[3]; {
		case d >= '0' && d <= '9', d == '¹', d == '²', d == '³':
			return d != '0' // COM0 and LPT0 are ordinary names
		}
	}
	return false
}

// trimTrailing drops the dots and spaces Windows strips from the end of a name, so the name written is the name read back.
func trimTrailing(name string) string { return strings.TrimRight(name, ". ") }

// SafeSegment turns s into one path segment every platform accepts as a folder name: the characters Windows refuses in a
// segment, and control characters, become "_"; trailing dots and spaces go (Windows drops them, so "Foo." and "Foo"
// would be one folder); a device name gets "_" after its stem ("NUL.txt" becomes "NUL_.txt"); the result holds at most
// maxNameUnits UTF-16 units, cut between characters. A name with nothing left is "package". Chapter file names are
// refused, not rewritten (chapterFileName), because a narrator should recognise the name; a folder named after a
// profile has nobody to ask, so it is rewritten.
func SafeSegment(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Map(func(r rune) rune {
		if r < 0x20 || strings.ContainsRune(invalidTitleChars, r) {
			return '_'
		}
		return r
	}, s)
	s = trimTrailing(s)
	if s == "" {
		return "package"
	}
	if IsReservedDeviceName(s) {
		stem, rest, hasDot := strings.Cut(s, ".")
		s = strings.TrimRight(stem, " ") + "_"
		if hasDot {
			s += "." + rest
		}
	}
	s = trimTrailing(cutUnits(s, maxNameUnits))
	if s == "" {
		return "package"
	}
	return s
}

// cutUnits is the longest prefix of s that holds at most limit UTF-16 units and ends between characters.
func cutUnits(s string, limit int) string {
	units := 0
	for i, r := range s {
		n := 1
		if r >= 0x10000 {
			n = 2
		}
		if units+n > limit {
			return s[:i]
		}
		units += n
	}
	return s
}
