package guide

import (
	"errors"
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// This file reads JSON as Python's json.loads does, for the rules (rules.go), which must treat a file exactly as
// extraction_rules.py did. encoding/json differs from it in what the rules can see: it refuses NaN and Infinity, which json.loads
// takes; a Go map forgets the order of an object's keys, which Python keeps and the rules follow (absorbed_names); and it reads 1 and
// 1.0 alike, where Python keeps an int and a float, which hash and compare as Python numbers do (pyKey, pyEqual).

// pyObject is a JSON object with its keys in the order Python's dict holds them: where a key is written twice, the first place
// and the last value, as json.loads leaves it.
type pyObject struct {
	keys   []string
	values map[string]any
}

func (o *pyObject) get(key string) (any, bool) {
	value, ok := o.values[key]
	return value, ok
}

// pyInt is a JSON number written without a fraction or an exponent, which Python reads as an int of any size.
type pyInt struct{ value *big.Int }

// pyFloat is a JSON number Python reads as a float (a fraction, an exponent, NaN or ±Infinity).
type pyFloat float64

var errPyJSON = errors.New("not JSON that Python reads")

// pyLoads is json.loads(text): one value, with whitespace around it and nothing after. A decoded value is nil, a bool, a pyInt, a
// pyFloat, a string, a []any or a *pyObject. A lone surrogate escape (\ud800) reads as U+FFFD, which a Go string can hold and
// Python's str does not need to.
func pyLoads(text string) (any, error) {
	p := &pyParser{text: text}
	p.space()
	value, err := p.value(0)
	if err != nil {
		return nil, err
	}
	p.space()
	if p.at != len(p.text) {
		return nil, errPyJSON
	}
	return value, nil
}

// maxPyDepth bounds nesting, as Python's recursion limit does (a file nested deeper than that is an error there as well).
const maxPyDepth = 10000

type pyParser struct {
	text string
	at   int
}

func (p *pyParser) space() {
	for p.at < len(p.text) && strings.IndexByte(" \t\n\r", p.text[p.at]) >= 0 {
		p.at++
	}
}

func (p *pyParser) take(word string) bool {
	if strings.HasPrefix(p.text[p.at:], word) {
		p.at += len(word)
		return true
	}
	return false
}

func (p *pyParser) value(depth int) (any, error) {
	if depth > maxPyDepth || p.at >= len(p.text) {
		return nil, errPyJSON
	}
	switch c := p.text[p.at]; {
	case c == '{':
		return p.object(depth)
	case c == '[':
		return p.list(depth)
	case c == '"':
		return p.string()
	case p.take("null"):
		return nil, nil
	case p.take("true"):
		return true, nil
	case p.take("false"):
		return false, nil
	case p.take("NaN"):
		return pyFloat(math.NaN()), nil
	case p.take("Infinity"):
		return pyFloat(math.Inf(1)), nil
	case p.take("-Infinity"):
		return pyFloat(math.Inf(-1)), nil
	default:
		return p.number()
	}
}

func (p *pyParser) object(depth int) (any, error) {
	p.at++ // {
	object := &pyObject{values: map[string]any{}}
	p.space()
	if p.take("}") {
		return object, nil
	}
	for {
		if p.at >= len(p.text) || p.text[p.at] != '"' {
			return nil, errPyJSON
		}
		key, err := p.string()
		if err != nil {
			return nil, err
		}
		p.space()
		if !p.take(":") {
			return nil, errPyJSON
		}
		p.space()
		value, err := p.value(depth + 1)
		if err != nil {
			return nil, err
		}
		if _, seen := object.values[key]; !seen {
			object.keys = append(object.keys, key)
		}
		object.values[key] = value
		p.space()
		if p.take("}") {
			return object, nil
		}
		if !p.take(",") {
			return nil, errPyJSON
		}
		p.space()
	}
}

func (p *pyParser) list(depth int) (any, error) {
	p.at++ // [
	list := []any{}
	p.space()
	if p.take("]") {
		return list, nil
	}
	for {
		value, err := p.value(depth + 1)
		if err != nil {
			return nil, err
		}
		list = append(list, value)
		p.space()
		if p.take("]") {
			return list, nil
		}
		if !p.take(",") {
			return nil, errPyJSON
		}
		p.space()
	}
}

// string reads a string as json.loads with strict=True: no control character below U+0020 unescaped.
func (p *pyParser) string() (string, error) {
	p.at++ // "
	var out strings.Builder
	for {
		if p.at >= len(p.text) {
			return "", errPyJSON
		}
		c := p.text[p.at]
		switch {
		case c == '"':
			p.at++
			return out.String(), nil
		case c < 0x20:
			return "", errPyJSON
		case c != '\\':
			r, size := utf8.DecodeRuneInString(p.text[p.at:])
			out.WriteRune(r)
			p.at += size
			continue
		}
		p.at++
		if p.at >= len(p.text) {
			return "", errPyJSON
		}
		escape := p.text[p.at]
		p.at++
		switch escape {
		case '"', '\\', '/':
			out.WriteByte(escape)
		case 'b':
			out.WriteByte('\b')
		case 'f':
			out.WriteByte('\f')
		case 'n':
			out.WriteByte('\n')
		case 'r':
			out.WriteByte('\r')
		case 't':
			out.WriteByte('\t')
		case 'u':
			r, ok := p.hex4()
			if !ok {
				return "", errPyJSON
			}
			if utf16.IsSurrogate(r) && r < 0xdc00 && strings.HasPrefix(p.text[p.at:], `\u`) {
				save := p.at
				p.at += 2
				if low, ok := p.hex4(); ok && low >= 0xdc00 && low <= 0xdfff {
					out.WriteRune(utf16.DecodeRune(r, low))
					continue
				}
				p.at = save
			}
			out.WriteRune(r) // a lone surrogate is written as U+FFFD
		default:
			return "", errPyJSON
		}
	}
}

func (p *pyParser) hex4() (rune, bool) {
	if p.at+4 > len(p.text) {
		return 0, false
	}
	var value rune
	for _, c := range []byte(p.text[p.at : p.at+4]) {
		switch {
		case c >= '0' && c <= '9':
			value = value<<4 | rune(c-'0')
		case c >= 'a' && c <= 'f':
			value = value<<4 | rune(c-'a'+10)
		case c >= 'A' && c <= 'F':
			value = value<<4 | rune(c-'A'+10)
		default:
			return 0, false
		}
	}
	p.at += 4
	return value, true
}

// number reads json's number grammar: -?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?, an int when it has neither part after.
func (p *pyParser) number() (any, error) {
	start := p.at
	digits := func() int {
		from := p.at
		for p.at < len(p.text) && p.text[p.at] >= '0' && p.text[p.at] <= '9' {
			p.at++
		}
		return p.at - from
	}
	p.take("-")
	if p.take("0") {
		// json's int part is 0 or a digit run that does not start with 0; what follows a 0 is not part of this number.
	} else if digits() == 0 {
		return nil, errPyJSON
	}
	isFloat := false
	if p.at+1 < len(p.text) && p.text[p.at] == '.' && p.text[p.at+1] >= '0' && p.text[p.at+1] <= '9' {
		p.at++
		digits()
		isFloat = true
	}
	if p.at < len(p.text) && (p.text[p.at] == 'e' || p.text[p.at] == 'E') {
		save := p.at
		p.at++
		if !p.take("+") {
			p.take("-")
		}
		if digits() == 0 {
			p.at = save
		} else {
			isFloat = true
		}
	}
	text := p.text[start:p.at]
	if !isFloat {
		value, ok := new(big.Int).SetString(text, 10)
		if !ok {
			return nil, errPyJSON
		}
		return pyInt{value}, nil
	}
	value, err := strconv.ParseFloat(text, 64)
	if err != nil && !errors.Is(err, strconv.ErrRange) { // out of range is ±Inf or 0, as Python's float() gives
		return nil, errPyJSON
	}
	return pyFloat(value), nil
}

// pyTruthy is Python's truth test of a decoded value.
func pyTruthy(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case bool:
		return v
	case pyInt:
		return v.value.Sign() != 0
	case pyFloat:
		return v != 0
	case string:
		return v != ""
	case []any:
		return len(v) > 0
	case *pyObject:
		return len(v.keys) > 0
	}
	return true
}

// errUnhashable stands for Python's TypeError on a list or dict used as a dict key or set member.
var errUnhashable = errors.New("unhashable")

// nanKeys gives each NaN its own key: Python finds a NaN in a dict only by identity, and no two decoded NaNs are the same object.
var nanKeys int

// pyKey is the dict key a hashable value stands for: equal for values Python's == calls equal (1, 1.0 and true; 0 and false).
func pyKey(value any) (string, error) {
	switch v := value.(type) {
	case nil:
		return "N", nil
	case bool:
		if v {
			return "I1", nil
		}
		return "I0", nil
	case pyInt:
		return "I" + v.value.String(), nil
	case pyFloat:
		f := float64(v)
		switch {
		case math.IsNaN(f):
			nanKeys++
			return fmt.Sprintf("NaN%d", nanKeys), nil
		case math.IsInf(f, 0) || f != math.Trunc(f):
			return "F" + strconv.FormatFloat(f, 'g', -1, 64), nil
		}
		whole, _ := new(big.Float).SetFloat64(f).Int(nil)
		return "I" + whole.String(), nil
	case string:
		return "S" + v, nil
	}
	return "", errUnhashable
}

// pyNumber is a decoded bool or number as an exact value, for comparing an int with a float as Python does.
func pyNumber(value any) (*big.Float, bool) {
	switch v := value.(type) {
	case bool:
		if v {
			return big.NewFloat(1), true
		}
		return big.NewFloat(0), true
	case pyInt:
		return new(big.Float).SetPrec(uint(max(64, v.value.BitLen()))).SetInt(v.value), true
	case pyFloat:
		if math.IsNaN(float64(v)) {
			return nil, true
		}
		return new(big.Float).SetFloat64(float64(v)), true
	}
	return nil, false
}

// pyEqual is Python's == between two decoded values.
func pyEqual(a, b any) bool {
	if x, ok := pyNumber(a); ok {
		y, ok := pyNumber(b)
		return ok && x != nil && y != nil && x.Cmp(y) == 0
	}
	switch v := a.(type) {
	case nil:
		return b == nil
	case string:
		w, ok := b.(string)
		return ok && v == w
	case []any:
		w, ok := b.([]any)
		if !ok || len(v) != len(w) {
			return false
		}
		for i := range v {
			if !pyEqual(v[i], w[i]) {
				return false
			}
		}
		return true
	case *pyObject:
		w, ok := b.(*pyObject)
		if !ok || len(v.keys) != len(w.keys) {
			return false
		}
		for _, key := range v.keys {
			other, ok := w.values[key]
			if !ok || !pyEqual(v.values[key], other) {
				return false
			}
		}
		return true
	}
	return false
}

// errNotIterable stands for Python's TypeError on `for item in value` over a number, a bool or None.
var errNotIterable = errors.New("not iterable")

// pyIter is what `for item in value` walks: a list's items, an object's keys, a string's characters.
func pyIter(value any) ([]any, error) {
	switch v := value.(type) {
	case []any:
		return v, nil
	case *pyObject:
		items := make([]any, len(v.keys))
		for i, key := range v.keys {
			items[i] = key
		}
		return items, nil
	case string:
		items := []any{}
		for _, r := range v {
			items = append(items, string(r))
		}
		return items, nil
	}
	return nil, errNotIterable
}

// pyGet is value.get(key, fallback) when value is an object; any other value has no get, which is Python's AttributeError.
func pyGet(value any, key string, fallback any) (any, error) {
	object, ok := value.(*pyObject)
	if !ok {
		return nil, errNoGet
	}
	if found, ok := object.get(key); ok {
		return found, nil
	}
	return fallback, nil
}

var errNoGet = errors.New("has no attribute 'get'")
