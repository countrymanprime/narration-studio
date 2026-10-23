// json.dumps(obj, sort_keys=True, ensure_ascii=False) with the default ", " / ": " separators.
package main

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

type obj = map[string]any

// pyFloatRepr is Python's float repr: shortest round-trip digits, fixed notation for
// 1e-4 <= |x| < 1e16 with at least one fractional digit, otherwise d.ddde±XX.
func pyFloatRepr(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case f == 0:
		if math.Signbit(f) {
			return "-0.0"
		}
		return "0.0"
	}
	e := strconv.FormatFloat(f, 'e', -1, 64) // e.g. -1.2345e+06
	sign := ""
	if e[0] == '-' {
		sign, e = "-", e[1:]
	}
	mant, expS, _ := strings.Cut(e, "e")
	exp, _ := strconv.Atoi(expS)
	digits := strings.Replace(mant, ".", "", 1)
	if exp < -4 || exp >= 16 {
		m := digits[:1]
		if len(digits) > 1 {
			m += "." + digits[1:]
		}
		es := fmt.Sprintf("%02d", abs(exp))
		if exp < 0 {
			return sign + m + "e-" + es
		}
		return sign + m + "e+" + es
	}
	if exp < 0 {
		return sign + "0." + strings.Repeat("0", -exp-1) + digits
	}
	if len(digits) <= exp+1 {
		return sign + digits + strings.Repeat("0", exp+1-len(digits)) + ".0"
	}
	return sign + digits[:exp+1] + "." + digits[exp+1:]
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func pyString(sb *strings.Builder, s string) {
	sb.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			sb.WriteString(`\"`)
		case '\\':
			sb.WriteString(`\\`)
		case '\n':
			sb.WriteString(`\n`)
		case '\r':
			sb.WriteString(`\r`)
		case '\t':
			sb.WriteString(`\t`)
		case '\b':
			sb.WriteString(`\b`)
		case '\f':
			sb.WriteString(`\f`)
		default:
			if r < 0x20 {
				fmt.Fprintf(sb, `\u%04x`, r)
			} else {
				sb.WriteRune(r)
			}
		}
	}
	sb.WriteByte('"')
}

func pyDump(sb *strings.Builder, v any) {
	switch x := v.(type) {
	case nil:
		sb.WriteString("null")
	case bool:
		if x {
			sb.WriteString("true")
		} else {
			sb.WriteString("false")
		}
	case int:
		sb.WriteString(strconv.Itoa(x))
	case *int:
		if x == nil {
			sb.WriteString("null")
		} else {
			sb.WriteString(strconv.Itoa(*x))
		}
	case float64:
		sb.WriteString(pyFloatRepr(x))
	case string:
		pyString(sb, x)
	case []any:
		sb.WriteByte('[')
		for k, e := range x {
			if k > 0 {
				sb.WriteString(", ")
			}
			pyDump(sb, e)
		}
		sb.WriteByte(']')
	case obj:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys) // Python sorts str keys by code point; Go by UTF-8 bytes: same order.
		sb.WriteByte('{')
		for k, key := range keys {
			if k > 0 {
				sb.WriteString(", ")
			}
			pyString(sb, key)
			sb.WriteString(": ")
			pyDump(sb, x[key])
		}
		sb.WriteByte('}')
	default:
		panic(fmt.Sprintf("pyDump: %T", v))
	}
}
