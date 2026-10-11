package importer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"sort"
)

// tooLong walks decoded JSON for a string longer than the field cap.
func tooLong(v any) bool {
	switch x := v.(type) {
	case string:
		return len(x) > MaxFieldBytes
	case []any:
		for _, e := range x {
			if tooLong(e) {
				return true
			}
		}
	case map[string]any:
		for k, e := range x {
			if len(k) > MaxFieldBytes || tooLong(e) {
				return true
			}
		}
	}
	return false
}

// text turns a scalar into the text a cell would hold; a list or object is left for the row check to refuse.
func text(v any) any {
	switch x := v.(type) {
	case json.Number:
		return x.String()
	case bool:
		return fmt.Sprint(x)
	}
	return v
}

type jsonBuilder struct {
	out Result
	row int
}

func (b *jsonBuilder) at() int { b.row++; return b.row }

func (b *jsonBuilder) fail(where, reason string) {
	b.out.Errors = append(b.out.Errors, RowError{Row: b.at(), Where: where, Reason: reason})
}

func (b *jsonBuilder) add(rec Record, f fields, where string) {
	row := b.at()
	it, msg := build(rec, f)
	if msg != "" {
		b.out.Errors = append(b.out.Errors, RowError{Row: row, Where: where, Reason: msg})
		return
	}
	b.out.Rows = append(b.out.Rows, Row{Row: row, Where: where, Item: it})
}

func parseJSON(s string) Result {
	dec := json.NewDecoder(bytes.NewReader([]byte(s)))
	dec.UseNumber()
	var data any
	err := dec.Decode(&data)
	if err == nil {
		if _, more := dec.Token(); more != io.EOF {
			err = fmt.Errorf("unexpected text after the end of the data")
		}
	}
	if err != nil {
		return refuse(FormatJSON, "Not valid JSON: "+err.Error())
	}
	if tooLong(data) {
		return refuse(FormatJSON, fmt.Sprintf("A value in the file is over the %d KB limit for one field.", MaxFieldBytes/1024))
	}
	root, isMap := data.(map[string]any)
	if list, isList := data.([]any); isList {
		root, isMap = map[string]any{"entries": list}, true
	}
	_, hasEntries := root["entries"]
	_, hasSpeakers := root["speakers"]
	if !isMap || (!hasEntries && !hasSpeakers) {
		return refuse(FormatJSON, "Expected an object with “entries” and/or “speakers”.")
	}
	b := &jsonBuilder{out: Result{Format: FormatJSON}}
	if entries, ok := root["entries"]; ok && entries != nil {
		list, isList := entries.([]any)
		if !isList {
			b.fail("entries", "“entries” must be a list.")
		}
		for i, e := range list {
			b.entry(i, e)
		}
	}
	if speakers, ok := root["speakers"]; ok && speakers != nil {
		list, isList := speakers.([]any)
		if !isList {
			b.fail("speakers", "“speakers” must be a list.")
		}
		for i, s := range list {
			where := fmt.Sprintf("speakers[%d]", i)
			m, ok := s.(map[string]any)
			if !ok {
				b.fail(where, "A speaker must be an object.")
				continue
			}
			b.add(RecordSpeaker, fields{"quote": m["quote"], "speaker": m["speaker"], "paragraph": m["paragraph"], "confidence": m["confidence"]}, where)
		}
	}
	if b.row > MaxRows {
		return refuse(FormatJSON, fmt.Sprintf("The file has more than %d rows.", MaxRows))
	}
	if b.row == 0 {
		return refuse(FormatJSON, "Nothing to import.")
	}
	return b.out
}

func (b *jsonBuilder) entry(i int, v any) {
	where := fmt.Sprintf("entries[%d]", i)
	e, ok := v.(map[string]any)
	if !ok {
		b.fail(where, "An entry must be an object.")
		return
	}
	b.add(RecordEntry, fields{"name": e["name"], "type": e["type"], "aliases": e["aliases"], "description": e["description"], "appears_in": e["appears_in"], "confidence": e["confidence"]}, where)

	var props []any
	switch p := e["properties"].(type) {
	case nil:
	case []any:
		props = p
	case map[string]any:
		for k, val := range p {
			props = append(props, map[string]any{"key": k, "value": val})
		}
		sortProps(props)
	default:
		b.fail(where+".properties", "properties must be a list or an object of key: value.")
	}
	for j, pv := range props {
		w := fmt.Sprintf("%s.properties[%d]", where, j)
		p, ok := pv.(map[string]any)
		if !ok {
			b.fail(w, "A property must be an object.")
			continue
		}
		conf, has := p["confidence"]
		if !has {
			conf = e["confidence"]
		}
		b.add(RecordProperty, fields{"name": e["name"], "key": p["key"], "value": text(p["value"]), "evidence": p["evidence"], "chapter": text(p["chapter"]), "paragraph": p["paragraph"], "confidence": conf}, w)
	}
	b.nested(where, "relationships", e, func(x map[string]any) (Record, fields) {
		return RecordRelationship, fields{"name": e["name"], "to": x["to"], "relation": x["relation"], "confidence": x["confidence"]}
	})
	b.nested(where, "claims", e, func(x map[string]any) (Record, fields) {
		return RecordClaim, fields{"name": e["name"], "kind": x["kind"], "text": x["text"], "evidence": x["evidence"], "chapter": text(x["chapter"]), "paragraph": x["paragraph"], "confidence": x["confidence"]}
	})
}

func (b *jsonBuilder) nested(where, field string, e map[string]any, fn func(map[string]any) (Record, fields)) {
	v, ok := e[field]
	if !ok || v == nil {
		return
	}
	list, ok := v.([]any)
	if !ok {
		b.fail(where+"."+field, field+" must be a list.")
		return
	}
	for j, x := range list {
		w := fmt.Sprintf("%s.%s[%d]", where, field, j)
		m, ok := x.(map[string]any)
		if !ok {
			b.fail(w, "Must be an object.")
			continue
		}
		rec, f := fn(m)
		b.add(rec, f, w)
	}
}

// sortProps orders the pairs of a key: value property map by key, since a Go map has no order and the rows must be stable.
func sortProps(props []any) {
	sort.Slice(props, func(a, b int) bool {
		return props[a].(map[string]any)["key"].(string) < props[b].(map[string]any)["key"].(string)
	})
}
