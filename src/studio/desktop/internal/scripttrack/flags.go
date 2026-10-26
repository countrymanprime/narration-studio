package scripttrack

import (
	"slices"
	"strings"

	"desktop/internal/compare"
)

// Suspected reading errors (flags.py): once a segment closes, what did not line up with the script is reported as
// flag events after the tracker's positions. Every flag is only suspected, so the rules favour precision over recall;
// docs/architecture/manuscript-teleprompter.md (Flags) gives them in full.

// The flag rules' limits, flags.py's constants.
const (
	SegmentHeadWords     = 2 // a gap with a heard word among a segment's first words is never judged
	MaxMisreadHeardWords = 3 // a longer unplaceable run is not called a misread
	MinRestartWords      = 3 // engines duplicate a word or two on their own
)

// engineDroppedWords are short words engines leave out on their own; one of these missing alone is not skipped.
var engineDroppedWords = map[string]bool{"a": true, "an": true, "the": true, "and": true, "of": true}

// Flag is a suspected discrepancy in tracker positions; Start == End for an extra.
type Flag struct {
	Kind       string
	Start, End int
	Heard      []string
}

// FlagEvent is a `flag` event: Kind is "misread", "skipped", "extra" or "restart", Start and End are ScriptWords
// indices, Heard the heard words joined, and ID counts a session's flags from 1.
type FlagEvent struct {
	ID         int
	Kind       string
	Start, End int
	Heard      string
}

type gap struct {
	s1, s2              int
	heard, heardRaw     []string
	beforeRaw, afterRaw string
	echo                bool
}

func sameKey(heard, written string) bool {
	key := compare.SpokenKey(heard)
	return key != "" && key == compare.SpokenKey(written)
}

// soundsLike is _sounds_like: the same spoken key, or a key within the tracker's spelling tolerance.
func soundsLike(heard, written string) bool {
	heardKey, writtenKey := compare.SpokenKey(heard), compare.SpokenKey(written)
	return heardKey != "" && WordsMatch(heardKey, writtenKey)
}

// saidRight is _said_right: the gap's heard words are the written words between its matches said right, also
// counting a neighbour match the engine split a written word across.
func saidRight(g gap, written []string) bool {
	run := strings.Join(g.heardRaw, " ")
	between := strings.Join(written[g.s1+1:g.s2], " ")
	return soundsLike(run, between) ||
		sameKey(g.beforeRaw+" "+run, written[g.s1]+" "+between) ||
		sameKey(run+" "+g.afterRaw, between+" "+written[g.s2])
}

func jumpFlag(reading *SegmentReading, matches []int) *Flag {
	location := reading.Location
	if location.Jump == "skip" && location.Skipped != nil {
		if len(matches) > 0 && matches[0] == None {
			return nil
		}
		return &Flag{"skipped", location.Skipped.From, location.Skipped.To, nil}
	}
	if location.Jump == "restart" && location.First != None && location.First < reading.Anchor {
		end := min(reading.Anchor, location.Read)
		heard := []string{}
		for k, match := range matches {
			if match != None && match < end {
				heard = append(heard, reading.HeardRaw[k])
			}
		}
		return &Flag{"restart", location.First, end, heard}
	}
	return nil
}

func misread(g gap, written []string) *Flag {
	if len(g.heard) > MaxMisreadHeardWords || saidRight(g, written) {
		return nil
	}
	return &Flag{"misread", g.s1 + 1, g.s2, g.heardRaw}
}

func skipped(g gap, script []string) *Flag {
	if g.s2-g.s1 == 2 && engineDroppedWords[script[g.s1+1]] {
		return nil
	}
	return &Flag{"skipped", g.s1 + 1, g.s2, nil}
}

// repeatLength is _repeat_length: how many script words ending at s1 the spoken run repeats (0 if none).
func repeatLength(spoken, script []string, s1 int) int {
	count := len(spoken)
	if count > s1+1 {
		return 0
	}
	for offset, word := range spoken {
		if !WordsMatch(word, script[s1-count+1+offset]) {
			return 0
		}
	}
	return count
}

func extraOrRestart(g gap, script, written []string) *Flag {
	spoken := []string{}
	for _, word := range g.heard {
		if !compare.IsFiller(word) {
			spoken = append(spoken, word)
		}
	}
	if len(spoken) == 0 || g.echo {
		return nil
	}
	if repeated := repeatLength(spoken, script, g.s1); repeated > 0 {
		if repeated >= MinRestartWords {
			return &Flag{"restart", g.s1 - repeated + 1, g.s1 + 1, g.heardRaw}
		}
		return nil
	}
	if saidRight(g, written) {
		return nil
	}
	return &Flag{"extra", g.s2, g.s2, g.heardRaw}
}

func gapFlag(g gap, script, written []string) *Flag {
	if g.s2 > g.s1+1 {
		if len(g.heard) > 0 {
			return misread(g, written)
		}
		return skipped(g, script)
	}
	if len(g.heard) > 0 {
		return extraOrRestart(g, script, written)
	}
	return nil
}

// echoes is _echoes: the heard word after matched starts before matched ended. Times are advisory, so they only ever
// withhold a flag.
func echoes(times []*Times, matched int) bool {
	if matched+1 >= len(times) || times[matched] == nil || times[matched+1] == nil {
		return false
	}
	return times[matched+1].Start.Value() < times[matched].End.Value()
}

// SegmentFlags is segment_flags: the suspected discrepancies in one closed segment. script is the tracker's
// normalized script and written the same words as written, both by tracker position.
func SegmentFlags(reading *SegmentReading, script, written []string) []Flag {
	matches := Align(reading.Heard, script, reading.Location.Start)
	found := []*Flag{jumpFlag(reading, matches)}
	type pair struct{ heard, match int }
	pairs := []pair{}
	for heard, match := range matches {
		if match != None {
			pairs = append(pairs, pair{heard, match})
		}
	}
	for k := 1; k < len(pairs); k++ {
		h1, s1, h2, s2 := pairs[k-1].heard, pairs[k-1].match, pairs[k].heard, pairs[k].match
		if h1+1 < SegmentHeadWords {
			continue
		}
		g := gap{s1, s2, reading.Heard[h1+1 : h2], reading.HeardRaw[h1+1 : h2], reading.HeardRaw[h1], reading.HeardRaw[h2], echoes(reading.HeardTimes, h1)}
		found = append(found, gapFlag(g, script, written))
	}
	flags := []Flag{}
	for _, flag := range found {
		if flag != nil {
			flags = append(flags, *flag)
		}
	}
	// sorted(key=(start, end)) is stable, so equal spans keep the order they were found in.
	slices.SortStableFunc(flags, func(a, b Flag) int {
		if a.Start != b.Start {
			return a.Start - b.Start
		}
		return a.End - b.End
	})
	return flags
}

// FlaggingTracker is FlaggingTracker: a Tracker that also reports the flag events each closed segment raises.
type FlaggingTracker struct {
	*Tracker
	heading int
	written []string
	nextID  int
}

// NewFlagging is FlaggingTracker(tokens, heading): heading is how many tokens open the script as the chapter
// heading (0 for the credits).
func NewFlagging(tokens []string, heading int) *FlaggingTracker {
	tracker := New(tokens)
	written := make([]string, len(tracker.script))
	for position := range written {
		written[position] = tokens[tracker.OriginalIndex(position)]
	}
	return &FlaggingTracker{Tracker: tracker, heading: heading, written: written, nextID: 1}
}

// Feed is feed: the event's positions, then the flags of the segment it closed (none in the heading).
func (f *FlaggingTracker) Feed(event Event, now float64) ([]Position, []FlagEvent) {
	positions := f.Tracker.Feed(event, now)
	reading := f.TakeClosedSegment()
	if reading == nil {
		return positions, nil
	}
	kept := []FlagEvent{}
	for _, flag := range SegmentFlags(reading, f.script, f.written) {
		event := f.event(flag)
		if f.inHeading(event) {
			continue
		}
		event.ID = f.nextID
		f.nextID++
		kept = append(kept, event)
	}
	return positions, kept
}

// inHeading is _in_heading: a flag in the heading, an extra before the chapter's first word, or a restart that
// starts in the heading.
func (f *FlaggingTracker) inHeading(event FlagEvent) bool {
	switch event.Kind {
	case "extra":
		return event.Start <= f.heading
	case "restart":
		return event.Start < f.heading
	}
	return event.End <= f.heading
}

func (f *FlaggingTracker) event(flag Flag) FlagEvent {
	start := f.OriginalIndex(flag.Start)
	end := start
	if flag.Start != flag.End {
		end = f.OriginalIndex(flag.End-1) + 1
	}
	return FlagEvent{Kind: flag.Kind, Start: start, End: end, Heard: strings.Join(flag.Heard, " ")}
}
