package scripttrack

// CheckedWord is one word of a segment as the trailing confirmation pass heard it (the sidecar's `segment_check` event), in
// the live engine's stream time.
type CheckedWord struct {
	Word       string
	Start, End float64
}

// Flag states a check settles.
const (
	FlagConfirmed = "confirmed" // the second engine found the same discrepancy
	FlagCleared   = "cleared"   // the second engine read the script there, so the live engine most likely misheard
)

// FlagCheck is the verdict on one flag the segment raised, by the id its `flag` event carried.
type FlagCheck struct {
	ID    int
	State string
}

// maxCheckedSegments is how many closed segments with flags are kept for a late check: a check arrives seconds after its
// segment ends, never minutes.
const maxCheckedSegments = 32

// pendingCheck is a closed segment's reading and the flags it raised, kept until its check arrives.
type pendingCheck struct {
	segment float64
	reading *SegmentReading
	flags   []flaggedEvent
}

type flaggedEvent struct {
	FlagEvent
}

// remember keeps a flagged segment for its check, forgetting the oldest beyond maxCheckedSegments.
func (f *FlaggingTracker) remember(reading *SegmentReading, raised []FlagEvent) {
	if len(raised) == 0 {
		return
	}
	pending := pendingCheck{segment: reading.Segment, reading: reading}
	for _, flag := range raised {
		pending.flags = append(pending.flags, flaggedEvent{flag})
	}
	f.checks = append(f.checks, pending)
	if len(f.checks) > maxCheckedSegments {
		f.checks = f.checks[len(f.checks)-maxCheckedSegments:]
	}
}

// Check settles the flags of a closed segment from the words a second engine heard in its audio. The words are read against
// the same script position the live reading started from, with the same rules, and a flag the live reading raised is
// confirmed when the check raises one of its kind over the same words, cleared when it does not. A check with no words says
// nothing about the flag; an unknown segment, or one already checked, is ignored.
func (f *FlaggingTracker) Check(segment float64, words []CheckedWord) []FlagCheck {
	at := -1
	for i, pending := range f.checks {
		if pending.segment == segment {
			at = i
		}
	}
	if at < 0 {
		return nil
	}
	pending := f.checks[at]
	f.checks = append(f.checks[:at:at], f.checks[at+1:]...)
	reading := checkedReading(f.Tracker, pending.reading, words)
	if reading == nil {
		return nil
	}
	again := []FlagEvent{}
	for _, flag := range SegmentFlags(reading, f.script, f.written) {
		event := f.event(flag)
		if !f.inHeading(event) {
			again = append(again, event)
		}
	}
	checks := make([]FlagCheck, 0, len(pending.flags))
	for _, live := range pending.flags {
		state := FlagCleared
		for _, flag := range again {
			if sameDiscrepancy(live.FlagEvent, flag) {
				state = FlagConfirmed
			}
		}
		checks = append(checks, FlagCheck{ID: live.ID, State: state})
	}
	return checks
}

// sameDiscrepancy is whether a check's flag is the live one again: the same kind over words that overlap, or at the same
// place for an extra (which covers no words).
func sameDiscrepancy(live, again FlagEvent) bool {
	if live.Kind != again.Kind {
		return false
	}
	if live.Start == live.End || again.Start == again.End {
		return live.Start == again.Start
	}
	return live.Start < again.End && again.Start < live.End
}

// checkedReading is the second engine's words as a closed segment, located from the live reading's own anchor, or nil when
// it heard no words.
func checkedReading(t *Tracker, live *SegmentReading, words []CheckedWord) *SegmentReading {
	reading := &SegmentReading{Segment: live.Segment, Anchor: live.Anchor}
	for _, w := range words {
		normal := NormalizeWord(w.Word)
		if normal == "" {
			continue
		}
		reading.Heard = append(reading.Heard, normal)
		reading.HeardRaw = append(reading.HeardRaw, w.Word)
		reading.HeardTimes = append(reading.HeardTimes, &Times{Num{Kind: 'f', Float: w.Start}, Num{Kind: 'f', Float: w.End}})
	}
	if len(reading.Heard) == 0 {
		return nil
	}
	reading.Location = t.locate(reading.Heard, t.script, live.Anchor)
	return reading
}
