package trace

import "math"

// UIArea is the only area a page may write to.
const UIArea = "ui"

// maxPageInt bounds a number from the page, so a count or a duration cannot be used to carry a large value.
const maxPageInt = 1 << 40

// errorClasses are the classes ErrorClass can answer, which a page may name for an err field.
var errorClasses = map[string]bool{
	"none": true, "timeout": true, "canceled": true, "not_found": true, "permission": true, "exists": true, "eof": true, "closed": true, "other": true,
}

// EmitFromPage writes one record the page sent: its event must be registered in the page's area, and each field is checked against the
// same definition a host record is. A field the definition does not list, or a value of the wrong shape, is dropped and counted. It
// reports whether the event was written. A path field is never accepted from the page, which cannot be trusted to have left the raw path
// out, and a text is accepted only as its size.
func (t *Tracer) EmitFromPage(area, name string, fields map[string]any) bool {
	if t == nil {
		return false
	}
	registryMu.Lock()
	event := registry[area+"."+name]
	registryMu.Unlock()
	if event == nil || area != UIArea {
		t.mu.Lock()
		t.dropped++
		t.mu.Unlock()
		return false
	}
	var values []Value
	rejected := int64(0)
	for key, raw := range fields {
		def, ok := event.fields[key]
		if !ok {
			rejected++
			continue
		}
		value, ok := pageValue(def, raw)
		if !ok {
			rejected++
			continue
		}
		values = append(values, value)
	}
	if rejected > 0 {
		t.mu.Lock()
		t.dropped += rejected
		t.mu.Unlock()
	}
	t.Emit(event, values...)
	return true
}

func pageValue(def FieldDef, raw any) (Value, bool) {
	switch def.kind {
	case KindEnum:
		text, ok := raw.(string)
		return EnumValue(def.name, text), ok
	case KindID:
		text, ok := raw.(string)
		return IDValue(def.name, text), ok
	case KindBool:
		flag, ok := raw.(bool)
		return BoolValue(def.name, flag), ok
	case KindInt:
		number, ok := pageNumber(raw)
		return IntValue(def.name, number), ok
	case KindDuration:
		number, ok := pageNumber(raw)
		return Value{name: def.name, kind: KindDuration, n: number}, ok
	case KindLen:
		number, ok := pageNumber(raw)
		return Value{name: def.name, kind: KindLen, s: lengthBucketOf(int(number))}, ok
	case KindErr:
		text, ok := raw.(string)
		return Value{name: def.name, kind: KindErr, s: text}, ok && errorClasses[text]
	}
	return Value{}, false
}

func pageNumber(raw any) (int64, bool) {
	number, ok := raw.(float64)
	if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < -maxPageInt || number > maxPageInt {
		return 0, false
	}
	return int64(number), true
}
