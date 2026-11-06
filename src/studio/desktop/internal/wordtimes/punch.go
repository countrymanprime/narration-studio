package wordtimes

// The punch target: where a passage the narrator is re-reading was recorded before, from the word-times table. It never estimates:
// a passage whose words the table cannot place is refused with a reason, and a passage nobody recorded is a continue, not a punch.

// Punch outcomes.
const (
	PunchFound         = "found"          // Track, Start and End are set
	PunchNeverRecorded = "never_recorded" // the check heard none of the passage: record on, do not punch
	PunchRefused       = "refused"        // Reason says why
)

// Punch refusal reasons.
const (
	PunchNoWords       = "no_words"       // the range holds no word of the alignment
	PunchNotInProject  = "not_in_project" // a heard word's audio is cut, trimmed or muted in the project
	PunchSeveralVoices = "several_voices" // the passage was recorded on more than one track
)

// Punch is PunchTarget's answer. Start and End are project seconds; Track is the GUID of the track whose item plays the passage.
type Punch struct {
	Outcome string
	Reason  string
	Track   string
	Start   float64
	End     float64
}

// PunchTarget finds where words from..to (inclusive alignment token indexes) play now. itemTrack maps a live item's GUID to the track holding it.
// The span runs from the earliest start to the latest end of the passage's placed words; words the check never heard inside it do not change it.
func PunchTarget(table Table, itemTrack map[string]string, from, to int) Punch {
	if from < 0 || to < from {
		return Punch{Outcome: PunchRefused, Reason: PunchNoWords}
	}
	var out Punch
	seen := 0
	for _, row := range table.Rows {
		if row.Index < from || row.Index > to {
			continue
		}
		seen++
		switch row.State {
		case NotHeard:
			continue
		case NotInProject:
			return Punch{Outcome: PunchRefused, Reason: PunchNotInProject}
		}
		track := itemTrack[row.ItemGUID]
		if track == "" {
			return Punch{Outcome: PunchRefused, Reason: PunchNotInProject}
		}
		if out.Track == "" {
			out = Punch{Outcome: PunchFound, Track: track, Start: row.Start, End: row.End}
			continue
		}
		if track != out.Track {
			return Punch{Outcome: PunchRefused, Reason: PunchSeveralVoices}
		}
		out.Start, out.End = min(out.Start, row.Start), max(out.End, row.End)
	}
	switch {
	case seen == 0:
		return Punch{Outcome: PunchRefused, Reason: PunchNoWords}
	case out.Track == "":
		return Punch{Outcome: PunchNeverRecorded}
	}
	return out
}
