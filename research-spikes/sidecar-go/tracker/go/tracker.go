package main

import (
	"strings"
	"unicode/utf8"
)

// Port of sidecars/manuscript-teleprompter/core/script_tracker.py.

const (
	maxSkip        = 2
	backWords      = 40
	aheadWords     = 30
	minJumpMatches = 3
	jumpMargin     = 2
	waitSeconds    = 1.5
	fuzzyMinLength = 4
	fuzzyRatio     = 0.8
)

var useNative bool // -native: Go's own strings.ToLower / unicode classes (to count divergence)

func normalizeWord(w string) string {
	if useNative {
		return nativeNormalize(w)
	}
	low := pyLower(w)
	var b strings.Builder
	b.Grow(len(low))
	for _, r := range low {
		if r == '\'' || isPyWord(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func scriptWords(text string) []string { return pySplit(text) }

type pair struct{ a, b string }

// matchCache stands in for @lru_cache(maxsize=65536); eviction is not observable.
var matchCache = make(map[pair]bool, 1024)

func wordsMatch(heard, script string) bool {
	if heard == script {
		return true
	}
	if utf8.RuneCountInString(heard) < fuzzyMinLength || utf8.RuneCountInString(script) < fuzzyMinLength {
		return false
	}
	k := pair{heard, script}
	if v, ok := matchCache[k]; ok {
		return v
	}
	v := seqRatio([]rune(heard), []rune(script)) >= fuzzyRatio
	if len(matchCache) >= 65536 {
		clear(matchCache)
	}
	matchCache[k] = v
	return v
}

// Alignment: First == -1 stands for None.
type Alignment struct{ Read, Matched, First int }

func advance(heard, script []string, start int) Alignment {
	position, matched, first := start, 0, -1
	for _, word := range heard {
		for skip := 0; skip <= maxSkip; skip++ {
			index := position + skip
			if index >= len(script) {
				break
			}
			if wordsMatch(word, script[index]) {
				if first == -1 {
					first = index
				}
				position, matched = index+1, matched+1
				break
			}
		}
	}
	return Alignment{position, matched, first}
}

func align(heard, script []string, start int) []int {
	position := start
	matches := make([]int, 0, len(heard))
	for _, word := range heard {
		match := -1
		for skip := 0; skip <= maxSkip; skip++ {
			index := position + skip
			if index >= len(script) {
				break
			}
			if wordsMatch(word, script[index]) {
				match, position = index, index+1
				break
			}
		}
		matches = append(matches, match)
	}
	return matches
}

type Span struct{ A, B int }

// Location: Jump "" is None, Skipped nil is None, First -1 is None.
type Location struct {
	Read, Matched int
	Jump          string
	Skipped       *Span
	Start, First  int
}

func absInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func locate(heard, script []string, anchor int) Location {
	near := advance(heard, script, anchor)
	if len(heard) < minJumpMatches {
		return Location{near.Read, near.Matched, "", nil, anchor, near.First}
	}
	haveBest, bestK0, bestK1, bestStart := false, 0, 0, anchor
	var best Alignment
	lo, hi := max(0, anchor-backWords), min(len(script), anchor+aheadWords)
	for start := lo; start < hi; start++ {
		if anchor <= start && start <= anchor+maxSkip {
			continue
		}
		c := advance(heard, script, start)
		if c.Matched < minJumpMatches || c.Matched < near.Matched+jumpMargin {
			continue
		}
		k0, k1 := c.Matched, -absInt(start-anchor)
		if !haveBest || k0 > bestK0 || (k0 == bestK0 && k1 > bestK1) {
			haveBest, bestK0, bestK1, bestStart, best = true, k0, k1, start, c
		}
	}
	if !haveBest {
		return Location{near.Read, near.Matched, "", nil, anchor, near.First}
	}
	if bestStart < anchor {
		return Location{best.Read, best.Matched, "restart", nil, bestStart, best.First}
	}
	var skipped *Span
	if best.First != -1 && best.First > anchor {
		skipped = &Span{anchor, best.First}
	}
	return Location{best.Read, best.Matched, "skip", skipped, bestStart, best.First}
}

// PyNum is a JSON number/bool as Python's json module would hold it (int, float or bool).
type PyNum struct {
	Kind byte // 'i', 'f', 'b'
	I    int64
	F    float64
}

func (n PyNum) Float() float64 {
	if n.Kind == 'f' {
		return n.F
	}
	return float64(n.I)
}

type TimePair struct {
	Start, End PyNum
}

type SegmentReading struct {
	Heard, HeardRaw []string
	Anchor          int
	Location        Location
	HeardTimes      []*TimePair
}

type WordEv struct {
	Word string `json:"word"`
}

type Event struct {
	Type    string
	Segment float64
	Words   []string // the "word" field of each partial word
	Word    string
	Times   *TimePair // nil unless both start and end are int|float|bool
}

type Position struct {
	Read, Committed int
	Status          string
	Jump            string
	Skipped         *Span
}

type pendingJump struct {
	kind    string
	skipped *Span
}

type emitted struct {
	read, committed int
	status          string
}

type ScriptTracker struct {
	tokenCount     int
	original       []int
	script         []string
	anchor         int
	committed      int
	display        int
	hasSegment     bool
	segment        float64
	confirmed      []string
	confirmedRaw   []string
	confirmedTimes []*TimePair
	confirmedAt    *Location
	closed         *SegmentReading
	jumpReported   bool
	pending        *pendingJump
	hasProgress    bool
	progressAt     float64
	emitted        emitted
}

func NewScriptTracker(tokens []string) *ScriptTracker {
	t := &ScriptTracker{tokenCount: len(tokens), emitted: emitted{0, 0, "listening"}}
	for i, tok := range tokens {
		if w := normalizeWord(tok); w != "" {
			t.original = append(t.original, i)
			t.script = append(t.script, w)
		}
	}
	return t
}

func heardWords(words []string) []string {
	out := make([]string, 0, len(words))
	for _, w := range words {
		if n := normalizeWord(w); n != "" {
			out = append(out, n)
		}
	}
	return out
}

func (t *ScriptTracker) Feed(ev *Event, now float64) []Position {
	switch ev.Type {
	case "partial":
		t.enterSegment(ev.Segment)
		t.moveDisplay(locate(heardWords(ev.Words), t.script, t.anchor), now)
	case "word":
		t.onConfirmedWord(ev, now)
	case "segment_end":
		t.onSegmentEnd()
	default:
		return nil
	}
	return t.emit(now)
}

func (t *ScriptTracker) Tick(now float64) []Position { return t.emit(now) }

func (t *ScriptTracker) Words() []string { return t.script }

func (t *ScriptTracker) TakeClosedSegment() *SegmentReading {
	c := t.closed
	t.closed = nil
	return c
}

func (t *ScriptTracker) OriginalIndex(position int) int {
	if position < len(t.original) {
		return t.original[position]
	}
	return t.tokenCount
}

func (t *ScriptTracker) clearConfirmed() {
	t.confirmed, t.confirmedRaw, t.confirmedTimes, t.confirmedAt = nil, nil, nil, nil
}

func (t *ScriptTracker) enterSegment(segment float64) {
	if !t.hasSegment || segment != t.segment {
		t.hasSegment, t.segment = true, segment
		t.clearConfirmed()
		t.jumpReported = false
	}
}

func (t *ScriptTracker) onConfirmedWord(ev *Event, now float64) {
	t.enterSegment(ev.Segment)
	word := normalizeWord(ev.Word)
	if word == "" {
		return
	}
	t.confirmed = append(t.confirmed, word)
	t.confirmedRaw = append(t.confirmedRaw, ev.Word)
	t.confirmedTimes = append(t.confirmedTimes, ev.Times)
	loc := locate(t.confirmed, t.script, t.anchor)
	t.confirmedAt = &loc
	t.committed = loc.Read
	t.moveDisplay(loc, now)
}

func (t *ScriptTracker) onSegmentEnd() {
	if !t.hasSegment {
		return
	}
	if t.confirmedAt != nil {
		t.closed = &SegmentReading{
			Heard: append([]string(nil), t.confirmed...), HeardRaw: append([]string(nil), t.confirmedRaw...),
			Anchor: t.anchor, Location: *t.confirmedAt, HeardTimes: append([]*TimePair(nil), t.confirmedTimes...),
		}
	}
	t.anchor = t.committed
	t.display = t.committed
	t.hasSegment = false
	t.clearConfirmed()
}

func (t *ScriptTracker) scriptIndex(original int) int {
	for position, source := range t.original {
		if source >= original {
			return position
		}
	}
	return len(t.script)
}

func (t *ScriptTracker) ResetTo(word int, now float64) []Position {
	clamped := max(0, min(word, t.tokenCount))
	position := t.scriptIndex(clamped)
	t.anchor, t.committed, t.display = position, position, position
	t.hasSegment = false
	t.clearConfirmed()
	t.closed = nil
	t.jumpReported = true
	t.pending = &pendingJump{"restart", nil}
	t.hasProgress, t.progressAt = true, now
	return t.emit(now)
}

func (t *ScriptTracker) moveDisplay(loc Location, now float64) {
	firstSight := loc.Jump != "" && !t.jumpReported
	target := max(t.display, loc.Read)
	if firstSight {
		target = loc.Read
		t.jumpReported = true
		t.pending = &pendingJump{loc.Jump, t.originalSpan(loc.Skipped)}
		t.hasProgress, t.progressAt = true, now
	} else if target > t.display {
		t.hasProgress, t.progressAt = true, now
	}
	t.display = target
}

func (t *ScriptTracker) originalSpan(s *Span) *Span {
	if s == nil {
		return nil
	}
	return &Span{t.OriginalIndex(s.A), t.OriginalIndex(s.B)}
}

func (t *ScriptTracker) status(now float64) string {
	if len(t.script) > 0 && t.display >= len(t.script) {
		return "done"
	}
	if t.hasProgress && now-t.progressAt > waitSeconds {
		return "waiting"
	}
	return "listening"
}

func (t *ScriptTracker) emit(now float64) []Position {
	state := emitted{t.OriginalIndex(t.display), t.OriginalIndex(t.committed), t.status(now)}
	jump := t.pending
	t.pending = nil
	if state == t.emitted && jump == nil {
		return nil
	}
	t.emitted = state
	p := Position{Read: state.read, Committed: state.committed, Status: state.status}
	if jump != nil {
		p.Jump, p.Skipped = jump.kind, jump.skipped
	}
	return []Position{p}
}
