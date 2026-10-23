package main

import (
	"strings"
	"unicode"
)

// Python str semantics the tracker depends on, from tables generated out of CPython's own
// Unicode database (unitables_gen.go): Go's unicode package is a different Unicode version.

func inRanges(r rune, rs [][2]rune) bool {
	lo, hi := 0, len(rs)
	for lo < hi {
		m := (lo + hi) / 2
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

// isPyWord reports whether r matches Python's re `\w` (Unicode str pattern).
func isPyWord(r rune) bool {
	if r < 0x80 {
		return r == '_' || ('0' <= r && r <= '9') || ('a' <= r && r <= 'z') || ('A' <= r && r <= 'Z')
	}
	return inRanges(r, pyWordRanges)
}

func isPySpace(r rune) bool {
	if r < 0x80 {
		return r == ' ' || ('\t' <= r && r <= '\r') || (0x1c <= r && r <= 0x1f)
	}
	return inRanges(r, pySpaceRanges)
}

// pyLower is str.lower(): full lowercase mapping plus the Final_Sigma context for U+03A3.
func pyLower(s string) string {
	ascii := true
	for i := 0; i < len(s); i++ {
		if s[i] >= 0x80 {
			ascii = false
			break
		}
	}
	if ascii {
		return asciiLower(s)
	}
	rs := []rune(s)
	var b strings.Builder
	b.Grow(len(s))
	for i, r := range rs {
		switch {
		case r < 0x80:
			if 'A' <= r && r <= 'Z' {
				r += 32
			}
			b.WriteRune(r)
		case r == 0x3A3:
			b.WriteRune(capitalSigma(rs, i))
		default:
			if m, ok := pyLowerMap[r]; ok {
				b.WriteString(m)
			} else {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}

func asciiLower(s string) string {
	for i := 0; i < len(s); i++ {
		if 'A' <= s[i] && s[i] <= 'Z' {
			b := []byte(s)
			for j := i; j < len(b); j++ {
				if 'A' <= b[j] && b[j] <= 'Z' {
					b[j] += 32
				}
			}
			return string(b)
		}
	}
	return s
}

// capitalSigma mirrors CPython's handle_capital_sigma.
func capitalSigma(rs []rune, i int) rune {
	j := i - 1
	var c rune
	for ; j >= 0; j-- {
		c = rs[j]
		if !inRanges(c, pyIgnorableRanges) {
			break
		}
	}
	final := j >= 0 && inRanges(c, pyCasedRanges)
	if final && i+1 < len(rs) {
		j = i + 1
		for ; j < len(rs); j++ {
			c = rs[j]
			if !inRanges(c, pyIgnorableRanges) {
				break
			}
		}
		final = j == len(rs) || !inRanges(c, pyCasedRanges)
	}
	if final {
		return 0x3C2
	}
	return 0x3C3
}

// pySplit is str.split() with no separator.
func pySplit(s string) []string {
	return strings.FieldsFunc(s, isPySpace)
}

// nativeNormalize is the "obvious" Go port, kept only to count how far it is from Python.
func nativeNormalize(w string) string {
	return strings.Map(func(r rune) rune {
		if r == '\'' || r == '_' || unicode.IsLetter(r) || unicode.IsNumber(r) {
			return r
		}
		return -1
	}, strings.ToLower(w))
}
