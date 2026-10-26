// Package boothreplay replays recorded live-ASR output through the Booth's script tracker and its flags, offline, as
// the sidecar's replay.py did: no microphone, model or UI. Its input is either the tracker calls the sidecar's tools
// print (`replay.py --calls`, `record_mock_stream.py --calls`: a `tick` at a time, a `feed` of an engine event at a
// time) or the NDJSON a live session printed, whose engine events it replays. It reports how the cursor behaved and
// what was flagged (Summary, TimelineLines) and writes the browser mock's recording (MockRecording).
//
// It is held to replay.py's own reports by tests/fixtures/booth-parity (replay-cases and mock-calls).
package boothreplay

import (
	"encoding/json"
	"fmt"
	"strings"

	"desktop/internal/compare"
	"desktop/internal/scripttrack"
)

// FlagKinds are the flag kinds in the order the reports list them (the deleted flags.py's FLAG_KINDS).
var FlagKinds = []string{"misread", "extra", "skipped", "restart"}

// Call is one tracker call: a tick at T, or a feed of Event at T.
type Call struct {
	Tick  bool
	T     scripttrack.Num
	Event json.RawMessage
}

// ParseCalls reads tracker calls, one JSON object a line ({"tick": t} or {"feed": event, "t": t}), and the tokens of a
// leading {"tokens": [...]} line (nil when there is none). Blank lines are skipped.
func ParseCalls(text string) ([]Call, []string, error) {
	calls := []Call{}
	var tokens []string
	for number, line := range strings.Split(text, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &fields); err != nil {
			return nil, nil, fmt.Errorf("line %d is not a JSON object: %w", number+1, err)
		}
		if raw, ok := fields["tokens"]; ok {
			if err := json.Unmarshal(raw, &tokens); err != nil {
				return nil, nil, fmt.Errorf("line %d: tokens: %w", number+1, err)
			}
			continue
		}
		if raw, ok := fields["tick"]; ok {
			t, isNumber := scripttrack.ParseNum(raw)
			if !isNumber {
				return nil, nil, fmt.Errorf("line %d: a tick needs a number", number+1)
			}
			calls = append(calls, Call{Tick: true, T: t})
			continue
		}
		t, isNumber := scripttrack.ParseNum(fields["t"])
		if fields["feed"] == nil || !isNumber {
			return nil, nil, fmt.Errorf("line %d is neither a tick nor a feed", number+1)
		}
		calls = append(calls, Call{T: t, Event: fields["feed"]})
	}
	return calls, tokens, nil
}

// StreamCalls is replay.py's tracker_calls over stream_events: the engine events of a printed live_asr.py session,
// each timed by the newest word time seen so far (a session prints no wall clock; engine times are advisory, but only
// order and pauses matter here), a tick then a feed at that time.
func StreamCalls(text string) ([]Call, error) {
	calls := []Call{}
	clock := scripttrack.Num{Kind: 'f'}
	for number, line := range strings.Split(text, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var event struct {
			Type  string                       `json:"type"`
			Words []map[string]json.RawMessage `json:"words"`
			End   json.RawMessage              `json:"end"`
		}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			return nil, fmt.Errorf("line %d is not a JSON object: %w", number+1, err)
		}
		if event.Type != "partial" && event.Type != "word" && event.Type != "segment_end" {
			continue
		}
		// max([clock, *ends]): the first of the largest, as Python's max keeps it.
		ends := []json.RawMessage{}
		if event.Type == "partial" {
			for _, word := range event.Words {
				ends = append(ends, word["end"])
			}
		} else if event.End != nil {
			ends = append(ends, event.End)
		}
		for _, raw := range ends {
			if end, ok := scripttrack.ParseNum(raw); ok && end.Value() > clock.Value() {
				clock = end
			}
		}
		calls = append(calls, Call{Tick: true, T: clock}, Call{T: clock, Event: json.RawMessage(line)})
	}
	return calls, nil
}

// Timed is one position or flag event and the time it came out.
type Timed struct {
	T        scripttrack.Num
	Position *scripttrack.Position
	Flag     *scripttrack.FlagEvent
}

// Run makes the calls on a fresh FlaggingTracker over tokens, as replay.py's track_events does: the events in order with
// their times, and how many confirmed words were fed.
func Run(calls []Call, tokens []string) ([]Timed, int, error) {
	tracker := scripttrack.NewFlagging(tokens, 0)
	timeline := []Timed{}
	heard := 0
	for _, call := range calls {
		if call.Tick {
			for _, position := range tracker.Tick(call.T.Value()) {
				timeline = append(timeline, Timed{T: call.T, Position: &position})
			}
			continue
		}
		event, err := scripttrack.ParseEvent(call.Event)
		if err != nil {
			return nil, 0, err
		}
		if event.Type == "word" {
			heard++
		}
		positions, flags := tracker.Feed(event, call.T.Value())
		for _, position := range positions {
			timeline = append(timeline, Timed{T: call.T, Position: &position})
		}
		for _, flag := range flags {
			timeline = append(timeline, Timed{T: call.T, Flag: &flag})
		}
	}
	return timeline, heard, nil
}

// Event is the position or flag event as the sidecar printed it, in its own key order.
func (t Timed) Event() compare.PyOrdered {
	if t.Flag != nil {
		f := t.Flag
		return compare.PyOrdered{{Key: "type", Value: "flag"}, {Key: "id", Value: f.ID}, {Key: "kind", Value: f.Kind}, {Key: "start", Value: f.Start}, {Key: "end", Value: f.End}, {Key: "heard", Value: f.Heard}}
	}
	p := t.Position
	return compare.PyOrdered{{Key: "type", Value: "position"}, {Key: "read", Value: p.Read}, {Key: "committed", Value: p.Committed}, {Key: "status", Value: p.Status}, {Key: "jump", Value: jumpValue(p)}, {Key: "skipped", Value: skippedValue(p)}}
}

func jumpValue(p *scripttrack.Position) any {
	if p.Jump == "" {
		return nil
	}
	return p.Jump
}

func skippedValue(p *scripttrack.Position) any {
	if p.Skipped == nil {
		return nil
	}
	return []any{p.Skipped.From, p.Skipped.To}
}

// num is a Python number for the report's arithmetic: an int stays an int until a float meets it.
func num(n scripttrack.Num) any {
	if n.Kind == 'f' {
		return n.Float
	}
	return compare.RawJSON(n.Python())
}

func sub(a, b scripttrack.Num) scripttrack.Num {
	if a.Kind != 'f' && b.Kind != 'f' {
		return scripttrack.Num{Kind: 'i', Int: a.Int - b.Int}
	}
	return scripttrack.Num{Kind: 'f', Float: a.Value() - b.Value()}
}

// round is Python's round(x, ndigits): an int is returned as it is.
func round(n scripttrack.Num, ndigits int) scripttrack.Num {
	if n.Kind != 'f' {
		return scripttrack.Num{Kind: 'i', Int: n.Int}
	}
	return scripttrack.Num{Kind: 'f', Float: compare.PyRound(n.Float, ndigits)}
}

// firstReach is _first_reach: the time each level of read (or committed) was first reached.
func firstReach(positions []Timed, committed bool) map[int]scripttrack.Num {
	reached := map[int]scripttrack.Num{}
	highest := 0
	for _, timed := range positions {
		value := timed.Position.Read
		if committed {
			value = timed.Position.Committed
		}
		for level := highest + 1; level <= value; level++ {
			reached[level] = timed.T
		}
		highest = max(highest, value)
	}
	return reached
}

// percentile is _percentile: the value at int(fraction * (n - 1)) of the sorted values, rounded to 3, or nil.
func percentile(values []scripttrack.Num, fraction float64) any {
	if len(values) == 0 {
		return nil
	}
	ordered := append([]scripttrack.Num(nil), values...)
	sortNums(ordered)
	return num(round(ordered[int(fraction*float64(len(ordered)-1))], 3))
}

// sortNums is sorted(): a stable sort by value.
func sortNums(values []scripttrack.Num) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j].Value() < values[j-1].Value(); j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

// pyDivRound is round(a / b, ndigits) for two ints.
func pyDivRound(a, b, ndigits int) float64 {
	return compare.PyRound(float64(a)/float64(b), ndigits)
}

func summarizeFlags(flags []*scripttrack.FlagEvent, heardWords int, tokens []string) compare.PyOrdered {
	byKind, per100 := compare.PyOrdered{}, compare.PyOrdered{}
	for _, kind := range FlagKinds {
		count := 0
		for _, flag := range flags {
			if flag.Kind == kind {
				count++
			}
		}
		byKind = append(byKind, compare.PyField{Key: kind, Value: count})
		var rate any
		if heardWords > 0 {
			rate = pyDivRound(100*count, heardWords, 2)
		}
		per100 = append(per100, compare.PyField{Key: kind, Value: rate})
	}
	list := []any{}
	for _, flag := range flags {
		script := strings.Join(slice(tokens, flag.Start, flag.End), " ")
		if script == "" {
			next := strings.Join(slice(tokens, flag.Start, flag.Start+1), " ")
			if next == "" {
				next = "the end"
			}
			script = "(before " + next + ")"
		}
		list = append(list, compare.PyOrdered{{Key: "kind", Value: flag.Kind}, {Key: "start", Value: flag.Start}, {Key: "end", Value: flag.End}, {Key: "script", Value: script}, {Key: "heard", Value: flag.Heard}})
	}
	return compare.PyOrdered{{Key: "heard_words", Value: heardWords}, {Key: "total", Value: len(flags)}, {Key: "by_kind", Value: byKind}, {Key: "per_100_heard_words", Value: per100}, {Key: "list", Value: list}}
}

// slice is Python's tokens[from:to] for non-negative bounds.
func slice(tokens []string, from, to int) []string {
	from, to = min(from, len(tokens)), min(to, len(tokens))
	if from >= to {
		return nil
	}
	return tokens[from:to]
}

// Summary is summarize_timeline: how the cursor behaved and what was flagged, in replay.py's key order.
func Summary(timeline []Timed, tokens []string, heardWords int) compare.PyOrdered {
	positions, flags := []Timed{}, []*scripttrack.FlagEvent{}
	for _, timed := range timeline {
		if timed.Position != nil {
			positions = append(positions, timed)
		} else {
			flags = append(flags, timed.Flag)
		}
	}
	displayed, committed := firstReach(positions, false), firstReach(positions, true)
	leads := []scripttrack.Num{}
	for level := 1; level <= len(committed); level++ {
		if at, ok := committed[level]; ok {
			if shown, seen := displayed[level]; seen {
				leads = append(leads, sub(at, shown))
			}
		}
	}
	finalRead, backward, waiting := 0, 0, 0
	jumps := []any{}
	for k, timed := range positions {
		p := timed.Position
		finalRead = p.Read
		if k > 0 && p.Read < positions[k-1].Position.Read {
			backward++
		}
		if p.Status == "waiting" {
			waiting++
		}
		if p.Jump != "" {
			jumps = append(jumps, compare.PyOrdered{{Key: "at", Value: num(round(timed.T, 3))}, {Key: "jump", Value: p.Jump}, {Key: "read", Value: p.Read}, {Key: "skipped", Value: skippedValue(p)}})
		}
	}
	var coverage any
	if len(tokens) > 0 {
		coverage = pyDivRound(finalRead, len(tokens), 3)
	}
	return compare.PyOrdered{
		{Key: "script_tokens", Value: len(tokens)},
		{Key: "final_read", Value: finalRead},
		{Key: "coverage", Value: coverage},
		{Key: "position_events", Value: len(positions)},
		{Key: "backward_moves", Value: backward},
		{Key: "jumps", Value: jumps},
		{Key: "waiting_events", Value: waiting},
		{Key: "speculation_lead_seconds", Value: compare.PyOrdered{
			{Key: "median", Value: percentile(leads, 0.5)}, {Key: "p90", Value: percentile(leads, 0.9)},
			{Key: "max", Value: percentile(leads, 1.0)}, {Key: "words", Value: len(leads)},
		}},
		{Key: "flags", Value: summarizeFlags(flags, heardWords, tokens)},
	}
}

// TimelineLines is replay.py's --timeline: one line per position and flag event.
func TimelineLines(timeline []Timed, tokens []string) []string {
	lines := make([]string, 0, len(timeline))
	for _, timed := range timeline {
		wall := timed.T.Value()
		if f := timed.Flag; f != nil {
			lines = append(lines, fmt.Sprintf("[%7.2fs] FLAG %-8s %d-%d script=%s heard=%s", wall, f.Kind, f.Start, f.End,
				compare.PyRepr(strings.Join(slice(tokens, f.Start, f.End), " ")), compare.PyRepr(f.Heard)))
			continue
		}
		p := timed.Position
		upcoming := "(end)"
		if p.Read < len(tokens) {
			upcoming = tokens[p.Read]
		}
		note := ""
		if p.Jump != "" {
			note = "  " + strings.ToUpper(p.Jump)
		}
		lines = append(lines, fmt.Sprintf("[%7.2fs] read=%4d committed=%4d %-9s next=%s%s", wall, p.Read, p.Committed, p.Status, compare.PyRepr(upcoming), note))
	}
	return lines
}

// MockRecording is record_mock_stream.py's file: the token count and every event with its time rounded to 0.01, as
// json.dumps writes it with separators (",", ":").
func MockRecording(timeline []Timed, tokens []string) string {
	events := make([]any, len(timeline))
	for k, timed := range timeline {
		events[k] = compare.PyOrdered{{Key: "t", Value: num(round(timed.T, 2))}, {Key: "event", Value: timed.Event()}}
	}
	return Dumps(compare.PyOrdered{{Key: "tokens", Value: len(tokens)}, {Key: "events", Value: events}}, -1) + "\n"
}

// MockStats is the line record_mock_stream.py prints after writing the file.
func MockStats(timeline []Timed, tokens []string) string {
	positions := []*scripttrack.Position{}
	jumps, flags := []any{}, []any{}
	waiting := 0
	for _, timed := range timeline {
		t := num(round(timed.T, 2))
		if p := timed.Position; p != nil {
			positions = append(positions, p)
			if p.Status == "waiting" {
				waiting++
			}
			if p.Jump != "" {
				jumps = append(jumps, []any{t, p.Jump})
			}
		} else {
			f := timed.Flag
			flags = append(flags, []any{t, f.Kind, f.Start, f.End, f.Heard})
		}
	}
	backward := 0
	for k := 1; k < len(positions); k++ {
		if positions[k].Read < positions[k-1].Read {
			backward++
		}
	}
	var finalRead, finalStatus any
	if n := len(positions); n > 0 {
		finalRead, finalStatus = positions[n-1].Read, positions[n-1].Status
	}
	return Dumps(compare.PyOrdered{
		{Key: "tokens", Value: len(tokens)}, {Key: "events", Value: len(timeline)}, {Key: "final_read", Value: finalRead},
		{Key: "final_status", Value: finalStatus}, {Key: "backward_moves", Value: backward}, {Key: "jumps", Value: jumps},
		{Key: "flags", Value: flags}, {Key: "waiting_events", Value: waiting},
	}, 0)
}

// Dumps is json.dumps(v) with ensure_ascii on, in v's own key order: indent > 0 indents by that many spaces, 0 uses the
// default separators (", ", ": ") on one line, and -1 the compact ones (",", ":").
func Dumps(v any, indent int) string {
	var sb strings.Builder
	dump(&sb, v, indent, 0)
	return sb.String()
}

func dump(sb *strings.Builder, v any, indent, depth int) {
	item, key := ", ", ": "
	if indent < 0 {
		item, key = ",", ":"
	}
	newline := func(level int) {
		if indent > 0 {
			sb.WriteString("\n" + strings.Repeat(" ", indent*level))
		}
	}
	if indent > 0 {
		item = ","
	}
	switch x := v.(type) {
	case nil:
		sb.WriteString("null")
	case bool:
		fmt.Fprint(sb, x)
	case int:
		fmt.Fprint(sb, x)
	case float64:
		sb.WriteString(compare.PyFloatRepr(x))
	case compare.RawJSON:
		sb.WriteString(string(x))
	case string:
		writeASCII(sb, x)
	case []any:
		if len(x) == 0 {
			sb.WriteString("[]")
			return
		}
		sb.WriteByte('[')
		for k, element := range x {
			if k > 0 {
				sb.WriteString(item)
			}
			newline(depth + 1)
			dump(sb, element, indent, depth+1)
		}
		newline(depth)
		sb.WriteByte(']')
	case compare.PyOrdered:
		if len(x) == 0 {
			sb.WriteString("{}")
			return
		}
		sb.WriteByte('{')
		for k, field := range x {
			if k > 0 {
				sb.WriteString(item)
			}
			newline(depth + 1)
			writeASCII(sb, field.Key)
			sb.WriteString(key)
			dump(sb, field.Value, indent, depth+1)
		}
		newline(depth)
		sb.WriteByte('}')
	default:
		panic(fmt.Sprintf("boothreplay.Dumps: unsupported %T", v))
	}
}

// writeASCII is json's string encoder with ensure_ascii on: every code point past 0x7f as \uXXXX, a surrogate pair
// past 0xffff.
func writeASCII(sb *strings.Builder, s string) {
	sb.WriteByte('"')
	for _, r := range s {
		switch {
		case r == '"':
			sb.WriteString(`\"`)
		case r == '\\':
			sb.WriteString(`\\`)
		case r == '\n':
			sb.WriteString(`\n`)
		case r == '\r':
			sb.WriteString(`\r`)
		case r == '\t':
			sb.WriteString(`\t`)
		case r == '\b':
			sb.WriteString(`\b`)
		case r == '\f':
			sb.WriteString(`\f`)
		case r < 0x20 || r > 0x7e && r <= 0xffff:
			fmt.Fprintf(sb, `\u%04x`, r)
		case r > 0xffff:
			r -= 0x10000
			fmt.Fprintf(sb, `\u%04x\u%04x`, 0xd800+(r>>10), 0xdc00+(r&0x3ff))
		default:
			sb.WriteRune(r)
		}
	}
	sb.WriteByte('"')
}
