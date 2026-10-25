package guide

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

// fingerprint is manuscript_guide.py _fingerprint: the SHA-256 of pythonJSON(value). A merge stores one of how it left each entry it
// changed, and an unmerge refuses when the entry's fingerprint is not that one, so the two implementations must write the same bytes.
func fingerprint(value any) string {
	sum := sha256.Sum256([]byte(pythonJSON(value)))
	return hex.EncodeToString(sum[:])
}

// pythonJSON is Python's json.dumps(value, sort_keys=True, ensure_ascii=False) with its default separators (", " and ": "): keys in
// code point order, no indent, non-ASCII text as itself, and numbers the way Python prints what it parsed. A number is a json.Number (the
// text the file holds), which prints as Python's int or float would: 1e5 is 100000.0, 1.50 is 1.5, -0 is 0.
func pythonJSON(value any) string {
	var out strings.Builder
	writePythonJSON(&out, value)
	return out.String()
}

func writePythonJSON(out *strings.Builder, value any) {
	switch v := value.(type) {
	case nil:
		out.WriteString("null")
	case bool:
		out.WriteString(strconv.FormatBool(v))
	case string:
		writePythonString(out, v)
	case json.Number:
		out.WriteString(pythonNumber(v))
	case int:
		out.WriteString(strconv.Itoa(v))
	case float64:
		out.WriteString(pythonFloat(v))
	case []any:
		out.WriteByte('[')
		for index, item := range v {
			if index > 0 {
				out.WriteString(", ")
			}
			writePythonJSON(out, item)
		}
		out.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(v))
		for key := range v {
			keys = append(keys, key)
		}
		// Python sorts str keys by code point, which is the order of their UTF-8 bytes.
		slices.Sort(keys)
		out.WriteByte('{')
		for index, key := range keys {
			if index > 0 {
				out.WriteString(", ")
			}
			writePythonString(out, key)
			out.WriteString(": ")
			writePythonJSON(out, v[key])
		}
		out.WriteByte('}')
	default:
		// A value a Go caller built with another type ([]string, int64): print what encoding/json would make of it.
		encoded, err := json.Marshal(v)
		if err != nil {
			panic(fmt.Sprintf("pythonJSON: %T cannot be encoded: %v", value, err))
		}
		decoder := json.NewDecoder(bytes.NewReader(encoded))
		decoder.UseNumber()
		var decoded any
		if err := decoder.Decode(&decoded); err != nil {
			panic(fmt.Sprintf("pythonJSON: %T cannot be decoded: %v", value, err))
		}
		writePythonJSON(out, decoded)
	}
}

// writePythonString quotes text as json.dumps does with ensure_ascii off: only the quote, the backslash and the control characters
// below U+0020 are escaped (\b \f \n \r \t by letter, the rest as \u00xx). U+007F, U+2028 and U+2029 stay as they are.
func writePythonString(out *strings.Builder, text string) {
	out.WriteByte('"')
	for _, r := range text {
		switch r {
		case '"':
			out.WriteString(`\"`)
		case '\\':
			out.WriteString(`\\`)
		case '\b':
			out.WriteString(`\b`)
		case '\f':
			out.WriteString(`\f`)
		case '\n':
			out.WriteString(`\n`)
		case '\r':
			out.WriteString(`\r`)
		case '\t':
			out.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(out, `\u%04x`, r)
			} else {
				out.WriteRune(r)
			}
		}
	}
	out.WriteByte('"')
}

// pythonNumber prints a JSON number as Python prints the int or float json.loads makes of it.
func pythonNumber(number json.Number) string {
	text := number.String()
	if !strings.ContainsAny(text, ".eE") {
		if whole, ok := new(big.Int).SetString(text, 10); ok {
			return whole.String()
		}
	}
	f, _ := strconv.ParseFloat(text, 64) // out of range gives ±Inf, which Python parses to as well
	return pythonFloat(f)
}

// pythonFloat is Python's repr of a float (and json.dumps of it): the shortest digits that read back the same, in fixed notation when the
// decimal point falls in -4 < point <= 16 and with an exponent of at least two digits otherwise.
func pythonFloat(f float64) string {
	switch {
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case math.IsNaN(f):
		return "NaN"
	case f == 0:
		if math.Signbit(f) {
			return "-0.0"
		}
		return "0.0"
	}
	sign := ""
	if f < 0 {
		sign, f = "-", -f
	}
	scientific := strconv.FormatFloat(f, 'e', -1, 64) // d.ddde±XX
	mantissa, exponentText, _ := strings.Cut(scientific, "e")
	exponent, _ := strconv.Atoi(exponentText)
	digits := strings.Replace(mantissa, ".", "", 1)
	point := exponent + 1
	if point > -4 && point <= 16 {
		switch {
		case point <= 0:
			return sign + "0." + strings.Repeat("0", -point) + digits
		case len(digits) <= point:
			return sign + digits + strings.Repeat("0", point-len(digits)) + ".0"
		}
		return sign + digits[:point] + "." + digits[point:]
	}
	text := digits[:1]
	if len(digits) > 1 {
		text += "." + digits[1:]
	}
	exponentSign := "+"
	if exponent < 0 {
		exponentSign, exponent = "-", -exponent
	}
	return fmt.Sprintf("%s%se%s%02d", sign, text, exponentSign, exponent)
}

// pythonLower is Python's str.lower(), which differs from strings.ToLower in two places: U+0130 lower-cases to "i" and a combining dot,
// and a capital sigma at the end of a word lower-cases to the final sigma (ς), not σ. The word-end test is Unicode's Final_Sigma
// condition: a cased letter before it (skipping case-ignorable characters) and none after.
func pythonLower(text string) string {
	if !strings.ContainsAny(text, "İΣ") {
		return strings.ToLower(text)
	}
	runes := []rune(text)
	var out strings.Builder
	for index, r := range runes {
		switch {
		case r == 0x130:
			out.WriteString("i̇")
		case r == 0x3a3 && finalSigma(runes, index):
			out.WriteRune('ς')
		default:
			out.WriteRune(unicode.ToLower(r))
		}
	}
	return out.String()
}

func finalSigma(runes []rune, index int) bool {
	before := false
	for i := index - 1; i >= 0; i-- {
		if caseIgnorable(runes[i]) {
			continue
		}
		before = cased(runes[i])
		break
	}
	if !before {
		return false
	}
	for i := index + 1; i < len(runes); i++ {
		if caseIgnorable(runes[i]) {
			continue
		}
		return !cased(runes[i])
	}
	return true
}

func cased(r rune) bool { return unicode.IsUpper(r) || unicode.IsLower(r) || unicode.IsTitle(r) }

// caseIgnorable is Unicode's Case_Ignorable: the marks, format characters, modifier letters and symbols, and the dozen punctuation marks
// that sit inside a word (the apostrophes, the full stop, the colon, the middle dot).
func caseIgnorable(r rune) bool {
	if unicode.In(r, unicode.Mn, unicode.Me, unicode.Cf, unicode.Lm, unicode.Sk) {
		return true
	}
	switch r {
	case '\'', '.', ':', '^', '`', 0xa8, 0xad, 0xaf, 0xb4, 0xb7, 0xb8, 0x2018, 0x2019, 0x2024, 0x2027, 0xfe13, 0xfe52, 0xfe55, 0xff07, 0xff0e, 0xff1a:
		return true
	}
	return false
}

// pyDumps is Python's json.dumps(value, ensure_ascii=False, indent=2) of a value pyLoads read (or one built of the same types, with
// Go ints for Python ints): keys in the order the object holds them, ", " never used (the item separator is "," at a line end), non-ASCII
// text as itself, NaN and ±Infinity as Python writes them. manuscript_guide.py write_json wrote the Story Bible this way.
func pyDumps(value any) string {
	var out strings.Builder
	writePyIndented(&out, value, 0)
	return out.String()
}

func writePyIndented(out *strings.Builder, value any, level int) {
	switch v := value.(type) {
	case nil:
		out.WriteString("null")
	case bool:
		out.WriteString(strconv.FormatBool(v))
	case string:
		writePythonString(out, v)
	case int:
		out.WriteString(strconv.Itoa(v))
	case pyInt:
		out.WriteString(v.value.String())
	case pyFloat:
		out.WriteString(pythonFloat(float64(v)))
	case []any:
		if len(v) == 0 {
			out.WriteString("[]")
			return
		}
		out.WriteByte('[')
		for index, item := range v {
			if index > 0 {
				out.WriteByte(',')
			}
			pyNewline(out, level+1)
			writePyIndented(out, item, level+1)
		}
		pyNewline(out, level)
		out.WriteByte(']')
	case *pyObject:
		if len(v.keys) == 0 {
			out.WriteString("{}")
			return
		}
		out.WriteByte('{')
		for index, key := range v.keys {
			if index > 0 {
				out.WriteByte(',')
			}
			pyNewline(out, level+1)
			writePythonString(out, key)
			out.WriteString(": ")
			writePyIndented(out, v.values[key], level+1)
		}
		pyNewline(out, level)
		out.WriteByte('}')
	default:
		panic(fmt.Sprintf("pyDumps: %T is not a value pyLoads makes", value))
	}
}

func pyNewline(out *strings.Builder, level int) {
	out.WriteByte('\n')
	out.WriteString(strings.Repeat("  ", level))
}
