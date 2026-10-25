package compare

import (
	"fmt"
	"strings"
)

// inRanges reports whether r is in one of the sorted, inclusive ranges rs.
func inRanges(r rune, rs [][2]rune) bool {
	lo, hi := 0, len(rs)
	for lo < hi {
		m := int(uint(lo+hi) >> 1)
		switch {
		case r < rs[m][0]:
			hi = m
		case r > rs[m][1]:
			lo = m + 1
		default:
			return true
		}
	}
	return false
}

// IsPySpace is Python's str.isspace for one code point, what str.split(),
// str.strip() and the re module's \s use. Unlike unicode.IsSpace it counts
// U+001C to U+001F (the information separators) as space.
func IsPySpace(r rune) bool {
	if r < 0x80 {
		return r == ' ' || r >= '\t' && r <= '\r' || r >= 0x1c && r <= 0x1f
	}
	return inRanges(r, pySpaceRanges)
}

// IsPyWord is whether r matches re's \w in a Python str pattern: a letter,
// a digit or an underscore in Python 3.12's Unicode, which unicode.IsLetter's
// newer tables do not match.
func IsPyWord(r rune) bool {
	if r < 0x80 {
		return r == '_' || r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z'
	}
	return inRanges(r, pyWordRanges)
}

// PySplit is Python's str.split() with no separator.
func PySplit(s string) []string { return strings.FieldsFunc(s, IsPySpace) }

// PyStrip is Python's str.strip() with no argument.
func PyStrip(s string) string { return strings.TrimFunc(s, IsPySpace) }

// isPyLineBreak is a line boundary of Python's str.splitlines.
func isPyLineBreak(r rune) bool {
	switch r {
	case '\n', '\r', '\v', '\f', 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029:
		return true
	}
	return false
}

// PySplitLines is Python's str.splitlines(): "\r\n" is one boundary, and a
// trailing boundary adds no empty line.
func PySplitLines(s string) []string {
	lines := []string{}
	runes := []rune(s)
	start := 0
	for i := 0; i < len(runes); i++ {
		if !isPyLineBreak(runes[i]) {
			continue
		}
		lines = append(lines, string(runes[start:i]))
		if runes[i] == '\r' && i+1 < len(runes) && runes[i+1] == '\n' {
			i++
		}
		start = i + 1
	}
	if start < len(runes) {
		lines = append(lines, string(runes[start:]))
	}
	return lines
}

// PyPrefix is Python's s[:n]: the first n code points.
func PyPrefix(s string, n int) string {
	count := 0
	for i := range s {
		if count == n {
			return s[:i]
		}
		count++
	}
	return s
}

// PyLower is Python 3.12's str.lower: its full lowercase mapping
// (pyLowerMap, so U+0130 becomes "i̇") and the final-sigma rule (a capital
// sigma that ends a word lowercases to ς), all from Python's own tables.
func PyLower(s string) string {
	runes := []rune(s)
	var out strings.Builder
	out.Grow(len(s))
	for i, r := range runes {
		switch {
		case r < 0x80:
			if r >= 'A' && r <= 'Z' {
				r += 'a' - 'A'
			}
			out.WriteRune(r)
		case r == 'Σ':
			if finalSigma(runes, i) {
				out.WriteRune('ς')
			} else {
				out.WriteRune('σ')
			}
		default:
			if lower, ok := pyLowerMap[r]; ok {
				out.WriteString(lower)
			} else {
				out.WriteRune(r)
			}
		}
	}
	return out.String()
}

// finalSigma is CPython's handle_capital_sigma: a cased letter comes before
// position i and none after it, skipping case-ignorable runes both ways.
func finalSigma(runes []rune, i int) bool {
	j := i - 1
	for j >= 0 && inRanges(runes[j], pyIgnorableRanges) {
		j--
	}
	if j < 0 || !inRanges(runes[j], pyCasedRanges) {
		return false
	}
	k := i + 1
	for k < len(runes) && inRanges(runes[k], pyIgnorableRanges) {
		k++
	}
	return k == len(runes) || !inRanges(runes[k], pyCasedRanges)
}

// PyCasefold is Python 3.12's str.casefold: its full case folding (pyCasefoldMap, so "ß" becomes "ss"), from Python's
// own tables. Unlike str.lower it has no final-sigma rule.
func PyCasefold(s string) string {
	var out strings.Builder
	out.Grow(len(s))
	for _, r := range s {
		if folded, ok := pyCasefoldMap[r]; ok {
			out.WriteString(folded)
		} else {
			out.WriteRune(r)
		}
	}
	return out.String()
}

// IsPyPrintable is Python 3.12's str.isprintable for one code point: what repr leaves unescaped.
func IsPyPrintable(r rune) bool {
	if r < 0x80 {
		return r >= ' ' && r < 0x7f
	}
	return inRanges(r, pyPrintableRanges)
}

// PyRepr is Python's repr of a str: single quotes unless the text holds a single quote and no double one, a
// backslash before the quote and the backslash, \t \n \r, and \xhh, \uhhhh or \Uhhhhhhhh for what is not printable.
func PyRepr(s string) string {
	quote := '\''
	if strings.ContainsRune(s, '\'') && !strings.ContainsRune(s, '"') {
		quote = '"'
	}
	var out strings.Builder
	out.WriteRune(quote)
	for _, r := range s {
		switch {
		case r == quote || r == '\\':
			out.WriteByte('\\')
			out.WriteRune(r)
		case r == '\t':
			out.WriteString(`\t`)
		case r == '\n':
			out.WriteString(`\n`)
		case r == '\r':
			out.WriteString(`\r`)
		case IsPyPrintable(r):
			out.WriteRune(r)
		case r <= 0xff:
			fmt.Fprintf(&out, `\x%02x`, r)
		case r <= 0xffff:
			fmt.Fprintf(&out, `\u%04x`, r)
		default:
			fmt.Fprintf(&out, `\U%08x`, r)
		}
	}
	out.WriteRune(quote)
	return out.String()
}
