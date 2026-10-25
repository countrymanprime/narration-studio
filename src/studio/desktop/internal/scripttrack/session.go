package scripttrack

import (
	"bytes"
	"encoding/json"
	"strconv"

	"desktop/internal/compare"
)

// Num is a JSON number as Python's json module holds it: an int, a float, or
// a bool (which Python counts as an int). It is written back as Python writes
// it.
type Num struct {
	Kind  byte // 'i', 'f' or 'b'
	Int   int64
	Float float64
}

// Value is the number as a float, as Python's arithmetic and comparisons
// treat an int or a bool beside a float.
func (n Num) Value() float64 {
	if n.Kind == 'f' {
		return n.Float
	}
	return float64(n.Int)
}

// MarshalJSON writes the number as json.dumps writes it.
func (n Num) MarshalJSON() ([]byte, error) { return []byte(n.Python()), nil }

// Python is the number as json.dumps writes it.
func (n Num) Python() string {
	switch n.Kind {
	case 'f':
		return compare.PyFloatRepr(n.Float)
	case 'b':
		if n.Int != 0 {
			return "true"
		}
		return "false"
	}
	return strconv.FormatInt(n.Int, 10)
}

// ParseNum reads a JSON value as a number the way isinstance(value, int |
// float) sees it: false for a missing value, null, a string, a list or an
// object.
func ParseNum(raw json.RawMessage) (Num, bool) {
	text := string(bytes.TrimSpace(raw))
	switch {
	case text == "true":
		return Num{Kind: 'b', Int: 1}, true
	case text == "false":
		return Num{Kind: 'b'}, true
	case text == "" || text == "null" || text[0] == '"' || text[0] == '[' || text[0] == '{':
		return Num{}, false
	case bytes.ContainsAny([]byte(text), ".eE"):
		f, err := strconv.ParseFloat(text, 64)
		return Num{Kind: 'f', Float: f}, err == nil
	}
	i, err := strconv.ParseInt(text, 10, 64)
	return Num{Kind: 'i', Int: i}, err == nil
}

// Times is a confirmed word's engine (start, end). Advisory: good for telling
// one stretch of audio from a later one, never for ordering words.
type Times struct{ Start, End Num }

// Event is one engine event the tracker reads: a "partial" (Words, the
// hypothesis so far), a "word" (one confirmed Word, with its Times when the
// engine gave both as numbers) or a "segment_end". Any other Type is ignored.
type Event struct {
	Type    string
	Segment float64
	Words   []string
	Word    string
	Times   *Times
}

// ParseEvent reads an engine event line as the tracker uses it.
func ParseEvent(raw json.RawMessage) (Event, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return Event{}, err
	}
	var event Event
	if typ, ok := fields["type"]; ok {
		_ = json.Unmarshal(typ, &event.Type)
	}
	if segment, ok := ParseNum(fields["segment"]); ok {
		event.Segment = segment.Value()
	}
	if words, ok := fields["words"]; ok {
		var list []struct {
			Word string `json:"word"`
		}
		if err := json.Unmarshal(words, &list); err != nil {
			return Event{}, err
		}
		for _, w := range list {
			event.Words = append(event.Words, w.Word)
		}
	}
	if word, ok := fields["word"]; ok {
		_ = json.Unmarshal(word, &event.Word)
	}
	start, okStart := ParseNum(fields["start"])
	end, okEnd := ParseNum(fields["end"])
	if okStart && okEnd {
		event.Times = &Times{start, end}
	}
	return event, nil
}

// Position is a `position` event: Read and Committed are script_words
// indices; Status is "listening", "waiting" or "done"; Jump is "", "restart"
// or "skip"; Skipped is the span a skip stepped over, or nil.
type Position struct {
	Read, Committed int
	Status          string
	Jump            string
	Skipped         *Span
}

// SegmentReading is one closed segment as the tracker judged it: the
// confirmed words (normalized, and as the engine wrote them), the anchor it
// was read from, where those words were located (in tracker positions, see
// Tracker.OriginalIndex) and each word's Times (nil where the event had none).
type SegmentReading struct {
	Heard, HeardRaw []string
	Anchor          int
	Location        Location
	HeardTimes      []*Times
}

type state struct {
	read, committed int
	status          string
}

type pendingJump struct {
	kind    string
	skipped *Span
}

// Tracker is ScriptTracker: a stateful follower of one narrator through one
// script. Feed it engine events with their arrival time (seconds on any
// consistent clock); it returns the position events (0 or 1) each caused.
type Tracker struct {
	tokenCount     int
	original       []int
	script         []string
	anchor         int
	committed      int
	display        int
	inSegment      bool
	segment        float64
	confirmed      []string
	confirmedRaw   []string
	confirmedTimes []*Times
	confirmedAt    *Location
	closed         *SegmentReading
	jumpReported   bool
	pending        *pendingJump
	hasProgress    bool
	progressAt     float64
	emitted        state
}

// New is ScriptTracker(tokens): punctuation-only tokens carry no tracker
// position of their own.
func New(tokens []string) *Tracker {
	t := &Tracker{tokenCount: len(tokens), emitted: state{0, 0, "listening"}}
	for index, token := range tokens {
		if word := NormalizeWord(token); word != "" {
			t.original = append(t.original, index)
			t.script = append(t.script, word)
		}
	}
	return t
}

func heardWords(words []string) []string {
	out := make([]string, 0, len(words))
	for _, w := range words {
		if n := NormalizeWord(w); n != "" {
			out = append(out, n)
		}
	}
	return out
}

// Feed is feed: the position events the engine event caused at time now.
func (t *Tracker) Feed(event Event, now float64) []Position {
	switch event.Type {
	case "partial":
		t.enterSegment(event.Segment)
		t.moveDisplay(Locate(heardWords(event.Words), t.script, t.anchor), now)
	case "word":
		t.onConfirmedWord(event, now)
	case "segment_end":
		t.onSegmentEnd()
	default:
		return nil
	}
	return t.emit(now)
}

// Tick is tick: a status change time alone caused (the pause timeout).
func (t *Tracker) Tick(now float64) []Position { return t.emit(now) }

// Words is the normalized script the tracker aligns against, by tracker position.
func (t *Tracker) Words() []string { return t.script }

// TakeClosedSegment is take_closed_segment: the segment the last segment_end
// closed, once (nil if it held no confirmed words, or it was already taken or
// discarded by a seek).
func (t *Tracker) TakeClosedSegment() *SegmentReading {
	closed := t.closed
	t.closed = nil
	return closed
}

// OriginalIndex is a tracker position as a ScriptWords index (the space read,
// committed and a flag's span are reported in).
func (t *Tracker) OriginalIndex(position int) int {
	if position < len(t.original) {
		return t.original[position]
	}
	return t.tokenCount
}

func (t *Tracker) clearConfirmed() {
	t.confirmed, t.confirmedRaw, t.confirmedTimes, t.confirmedAt = nil, nil, nil, nil
}

func (t *Tracker) enterSegment(segment float64) {
	if !t.inSegment || segment != t.segment {
		t.inSegment, t.segment = true, segment
		t.clearConfirmed()
		t.jumpReported = false
	}
}

func (t *Tracker) onConfirmedWord(event Event, now float64) {
	t.enterSegment(event.Segment)
	word := NormalizeWord(event.Word)
	if word == "" {
		return
	}
	t.confirmed = append(t.confirmed, word)
	t.confirmedRaw = append(t.confirmedRaw, event.Word)
	t.confirmedTimes = append(t.confirmedTimes, event.Times)
	location := Locate(t.confirmed, t.script, t.anchor)
	t.confirmedAt = &location
	t.committed = location.Read
	t.moveDisplay(location, now)
}

func (t *Tracker) onSegmentEnd() {
	if !t.inSegment {
		return
	}
	if t.confirmedAt != nil {
		t.closed = &SegmentReading{
			Heard: t.confirmed, HeardRaw: t.confirmedRaw, Anchor: t.anchor, Location: *t.confirmedAt, HeardTimes: t.confirmedTimes,
		}
	}
	t.anchor = t.committed
	t.display = t.committed
	t.inSegment = false
	t.clearConfirmed()
}

// scriptIndex maps a ScriptWords index to the nearest tracker position at or
// after it: a punctuation-only token has none, so a seek onto one moves to the
// next real word.
func (t *Tracker) scriptIndex(original int) int {
	for position, source := range t.original {
		if source >= original {
			return position
		}
	}
	return len(t.script)
}

// ResetTo is reset_to: jump straight to ScriptWords index word (clamped), as
// a narrator's seek does, reported as a "restart" jump so the reader's
// one-word-back convention follows a seek either way.
func (t *Tracker) ResetTo(word int, now float64) []Position {
	position := t.scriptIndex(max(0, min(word, t.tokenCount)))
	t.anchor, t.committed, t.display = position, position, position
	t.inSegment = false
	t.clearConfirmed()
	t.closed = nil
	t.jumpReported = true
	t.pending = &pendingJump{"restart", nil}
	t.hasProgress, t.progressAt = true, now
	return t.emit(now)
}

func (t *Tracker) moveDisplay(location Location, now float64) {
	firstSightOfJump := location.Jump != "" && !t.jumpReported
	target := max(t.display, location.Read)
	if firstSightOfJump {
		target = location.Read
		t.jumpReported = true
		t.pending = &pendingJump{location.Jump, t.originalSpan(location.Skipped)}
		t.hasProgress, t.progressAt = true, now
	} else if target > t.display {
		t.hasProgress, t.progressAt = true, now
	}
	t.display = target
}

func (t *Tracker) originalSpan(span *Span) *Span {
	if span == nil {
		return nil
	}
	return &Span{t.OriginalIndex(span.From), t.OriginalIndex(span.To)}
}

func (t *Tracker) status(now float64) string {
	if len(t.script) > 0 && t.display >= len(t.script) {
		return "done"
	}
	if t.hasProgress && now-t.progressAt > WaitSeconds {
		return "waiting"
	}
	return "listening"
}

func (t *Tracker) emit(now float64) []Position {
	current := state{t.OriginalIndex(t.display), t.OriginalIndex(t.committed), t.status(now)}
	jump := t.pending
	t.pending = nil
	if current == t.emitted && jump == nil {
		return nil
	}
	t.emitted = current
	position := Position{Read: current.read, Committed: current.committed, Status: current.status}
	if jump != nil {
		position.Jump, position.Skipped = jump.kind, jump.skipped
	}
	return []Position{position}
}
