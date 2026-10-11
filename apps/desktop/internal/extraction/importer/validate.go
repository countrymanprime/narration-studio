package importer

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
)

// fields is the loosely typed content of one row before it is checked: strings from CSV, decoded JSON values from JSON.
type fields map[string]any

// splitList splits a list cell on semicolons and bars.
func splitList(s string) []string {
	var out []string
	for _, p := range strings.FieldsFunc(s, func(r rune) bool { return r == ';' || r == '|' }) {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func reqText(f fields, name string) (string, string) {
	switch v := f[name].(type) {
	case nil:
		return "", name + " is required"
	case string:
		if v = strings.TrimSpace(v); v != "" {
			return v, ""
		}
		return "", name + " is required"
	}
	return "", name + " must be text"
}

func optText(f fields, name string) (string, string) {
	switch v := f[name].(type) {
	case nil:
		return "", ""
	case string:
		return strings.TrimSpace(v), ""
	}
	return "", name + " must be text"
}

func listOf(f fields, name string) ([]string, string) {
	switch v := f[name].(type) {
	case nil:
		return nil, ""
	case string:
		return splitList(v), ""
	case []any:
		var out []string
		for _, x := range v {
			s, ok := x.(string)
			if s = strings.TrimSpace(s); !ok || s == "" {
				return nil, name + " must be a list of text"
			}
			out = append(out, s)
		}
		return out, ""
	}
	return nil, name + " must be a list"
}

// confidenceOf reads 0..1, or "85%", or nothing (nil). Anything else is an error.
func confidenceOf(v any) (*float64, string) {
	var n float64
	var err error
	switch x := v.(type) {
	case nil:
		return nil, ""
	case string:
		t := strings.TrimSpace(x)
		switch {
		case t == "":
			return nil, ""
		case strings.HasSuffix(t, "%"):
			n, err = strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(t, "%")), 64)
			n /= 100
		default:
			n, err = strconv.ParseFloat(t, 64)
		}
	case json.Number:
		n, err = x.Float64()
	case float64:
		n = x
	default:
		err = fmt.Errorf("not a number")
	}
	if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || n < 0 || n > 1 {
		shown, _ := json.Marshal(v)
		return nil, fmt.Sprintf("confidence must be a number from 0 to 1 (%s is not)", shown)
	}
	return &n, ""
}

// build checks a row against its record type, in the order of the format's columns, and reports the first problem.
func build(rec Record, f fields) (Item, string) {
	it := Item{Record: rec}
	var msg string
	req := func(dst *string, name string) bool {
		*dst, msg = reqText(f, name)
		return msg == ""
	}
	opt := func(dst *string, name string) bool {
		*dst, msg = optText(f, name)
		return msg == ""
	}
	list := func(dst *[]string, name string) bool {
		*dst, msg = listOf(f, name)
		return msg == ""
	}
	conf := func() bool {
		it.Confidence, msg = confidenceOf(f["confidence"])
		return msg == ""
	}
	var ok bool
	switch rec {
	case RecordEntry:
		ok = req(&it.Name, "name") && opt(&it.Type, "type") && list(&it.Aliases, "aliases") && opt(&it.Description, "description") && list(&it.AppearsIn, "appears_in") && conf()
	case RecordProperty:
		ok = req(&it.Entry, "name") && req(&it.Key, "key") && req(&it.Value, "value") && opt(&it.Evidence, "evidence") && opt(&it.Chapter, "chapter") && opt(&it.Paragraph, "paragraph") && conf()
	case RecordRelationship:
		ok = req(&it.Entry, "name") && req(&it.To, "to") && req(&it.Relation, "relation") && conf()
	case RecordClaim:
		var kind string
		ok = req(&it.Entry, "name") && req(&kind, "kind")
		if ok {
			switch k := extraction.ClaimKind(strings.ToLower(kind)); k {
			case extraction.ClaimTalk, extraction.ClaimAct, extraction.ClaimKnow:
				it.Claim = k
			default:
				ok, msg = false, "kind must be talk, act or know"
			}
		}
		ok = ok && req(&it.Text, "text") && opt(&it.Evidence, "evidence") && opt(&it.Chapter, "chapter") && opt(&it.Paragraph, "paragraph") && conf()
	case RecordSpeaker:
		ok = req(&it.Quote, "quote") && req(&it.Speaker, "speaker") && opt(&it.Paragraph, "paragraph") && conf()
	}
	if !ok {
		return Item{}, msg
	}
	return it, ""
}
