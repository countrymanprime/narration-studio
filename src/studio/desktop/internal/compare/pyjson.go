package compare

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// PyObject is a JSON object written the way Python's
// json.dumps(..., sort_keys=True, ensure_ascii=False) writes it. Values may be
// nil, bool, int, *int (nil is null), float64 (written with Python's float
// repr), *float64, string, *string, []any, PyObject or RawJSON.
type PyObject map[string]any

// RawJSON is JSON text written as it is, for a payload passed through.
type RawJSON string

// DumpPy is json.dumps(v, sort_keys=True, ensure_ascii=False); compact uses
// separators=(",", ":"), otherwise Python's default ", " and ": ".
func DumpPy(v any, compact bool) string {
	var sb strings.Builder
	item, key := ", ", ": "
	if compact {
		item, key = ",", ":"
	}
	dumpPy(&sb, v, item, key)
	return sb.String()
}

func dumpPy(sb *strings.Builder, v any, item, key string) {
	switch x := v.(type) {
	case nil:
		sb.WriteString("null")
	case bool:
		sb.WriteString(strconv.FormatBool(x))
	case int:
		sb.WriteString(strconv.Itoa(x))
	case *int:
		if x == nil {
			sb.WriteString("null")
		} else {
			sb.WriteString(strconv.Itoa(*x))
		}
	case float64:
		sb.WriteString(PyFloatRepr(x))
	case *float64:
		if x == nil {
			sb.WriteString("null")
		} else {
			sb.WriteString(PyFloatRepr(*x))
		}
	case string:
		writePyString(sb, x)
	case *string:
		if x == nil {
			sb.WriteString("null")
		} else {
			writePyString(sb, *x)
		}
	case RawJSON:
		sb.WriteString(string(x))
	case []any:
		sb.WriteByte('[')
		for k, element := range x {
			if k > 0 {
				sb.WriteString(item)
			}
			dumpPy(sb, element, item, key)
		}
		sb.WriteByte(']')
	case PyObject:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys) // UTF-8 byte order is code point order, Python's
		sb.WriteByte('{')
		for k, name := range keys {
			if k > 0 {
				sb.WriteString(item)
			}
			writePyString(sb, name)
			sb.WriteString(key)
			dumpPy(sb, x[name], item, key)
		}
		sb.WriteByte('}')
	default:
		panic(fmt.Sprintf("compare.DumpPy: unsupported %T", v))
	}
}

// writePyString is json's string encoder with ensure_ascii=False: only the
// quote, the backslash and control characters are escaped.
func writePyString(sb *strings.Builder, s string) {
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

// PyFloatRepr is Python's repr of a float: the shortest digits that round
// trip, in fixed notation for 1e-4 <= |x| < 1e16 with at least one digit after
// the point, and d.ddde±XX otherwise.
func PyFloatRepr(f float64) string {
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
	e := strconv.FormatFloat(f, 'e', -1, 64)
	sign := ""
	if e[0] == '-' {
		sign, e = "-", e[1:]
	}
	mantissa, exponentText, _ := strings.Cut(e, "e")
	exponent, _ := strconv.Atoi(exponentText)
	digits := strings.Replace(mantissa, ".", "", 1)
	if exponent < -4 || exponent >= 16 {
		m := digits[:1]
		if len(digits) > 1 {
			m += "." + digits[1:]
		}
		if exponent < 0 {
			return fmt.Sprintf("%s%se-%02d", sign, m, -exponent)
		}
		return fmt.Sprintf("%s%se+%02d", sign, m, exponent)
	}
	if exponent < 0 {
		return sign + "0." + strings.Repeat("0", -exponent-1) + digits
	}
	if len(digits) <= exponent+1 {
		return sign + digits + strings.Repeat("0", exponent+1-len(digits)) + ".0"
	}
	return sign + digits[:exponent+1] + "." + digits[exponent+1:]
}

// PyRound is Python's round(x, ndigits) for a float: the decimal correctly
// rounded half to even at ndigits places, read back as the nearest float.
func PyRound(x float64, ndigits int) float64 {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return x
	}
	rounded, err := strconv.ParseFloat(strconv.FormatFloat(x, 'f', ndigits, 64), 64)
	if err != nil {
		return x
	}
	if rounded == 0 {
		return math.Copysign(0, x)
	}
	return rounded
}

// PySum is Python 3.12's sum() over floats: Neumaier's compensated sum, with
// the compensation added once at the end. ok is false for no values, where
// Python's sum is the integer 0.
func PySum(values []float64) (total float64, ok bool) {
	if len(values) == 0 {
		return 0, false
	}
	total = values[0]
	compensation := 0.0
	for _, x := range values[1:] {
		t := total + x
		if math.Abs(total) >= math.Abs(x) {
			compensation += (total - t) + x
		} else {
			compensation += (x - t) + total
		}
		total = t
	}
	if compensation != 0 && !math.IsInf(compensation, 0) && !math.IsNaN(compensation) {
		total += compensation
	}
	return total, true
}
