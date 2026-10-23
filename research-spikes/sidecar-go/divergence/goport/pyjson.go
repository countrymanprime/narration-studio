package main

// json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")) and Python's
// float repr / round(x, n).

import (
	"math"
	"sort"
	"strconv"
	"strings"
)

type Obj map[string]any

type PyFloat float64

// pyRound is round(x, nd): correctly rounded half-even on the exact binary value (CPython's
// _Py_dg_dtoa mode 3 then strtod); Go's 'f' formatting goes through the exact big-decimal path
// with the same half-even tie rule, and ParseFloat is correctly rounded.
func pyRound(x float64, nd int) float64 {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return x
	}
	v, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'f', nd, 64), 64)
	return v
}

// pyRepr is float.__repr__: shortest round-trip digits, scientific when the decimal exponent
// is < -4 or >= 16, otherwise fixed with ".0" for an integral value.
func pyRepr(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	}
	s := strconv.FormatFloat(f, 'e', -1, 64) // [-]d[.ddd]e±XX
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	epos := strings.IndexByte(s, 'e')
	mant, exp := s[:epos], s[epos+1:]
	e, _ := strconv.Atoi(exp)
	digits := strings.Replace(mant, ".", "", 1)
	var out string
	if e < -4 || e >= 16 {
		m := digits[:1]
		if len(digits) > 1 {
			m += "." + digits[1:]
		}
		sign := "+"
		if e < 0 {
			sign = "-"
			e = -e
		}
		es := strconv.Itoa(e)
		if len(es) < 2 {
			es = "0" + es
		}
		out = m + "e" + sign + es
	} else {
		decpt := e + 1
		switch {
		case decpt <= 0:
			out = "0." + strings.Repeat("0", -decpt) + digits
		case decpt >= len(digits):
			out = digits + strings.Repeat("0", decpt-len(digits)) + ".0"
		default:
			out = digits[:decpt] + "." + digits[decpt:]
		}
	}
	if neg {
		out = "-" + out
	}
	return out
}

func writeString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		default:
			if r < 0x20 {
				b.WriteString(`\u00`)
				const hx = "0123456789abcdef"
				b.WriteByte(hx[r>>4])
				b.WriteByte(hx[r&15])
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
}

func dump(b *strings.Builder, v any) {
	switch x := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if x {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case int:
		b.WriteString(strconv.Itoa(x))
	case PyFloat:
		b.WriteString(pyRepr(float64(x)))
	case float64:
		b.WriteString(pyRepr(x))
	case string:
		writeString(b, x)
	case []any:
		b.WriteByte('[')
		for i, e := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			dump(b, e)
		}
		b.WriteByte(']')
	case Obj:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys) // byte order of UTF-8 == code point order (Python's str sort)
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			writeString(b, k)
			b.WriteByte(':')
			dump(b, x[k])
		}
		b.WriteByte('}')
	default:
		panic("unsupported json value")
	}
}

func Dumps(v any) string {
	var b strings.Builder
	dump(&b, v)
	return b.String()
}
