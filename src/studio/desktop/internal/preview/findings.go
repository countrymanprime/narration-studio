package preview

// This file excludes or ranks down candidates that overlap an open finding by
// paragraph (see docs/architecture/preview-suggestion.md), so the suggestion
// never quietly points at a stretch the other tools already flagged.

// FindingCategory and FindingSeverity mirror the subset of internal/findings'
// Category and Severity values the gate and the score use. This package takes
// only the fields it needs to gate and explain a candidate, rather than
// importing that package's full Finding record and its storage concerns (a
// small read-only interface; the host binding is the adapter that reads the
// real store and builds these).
type FindingCategory string

const (
	FindingTranscriptDiscrepancy FindingCategory = "transcript_discrepancy"
	FindingPickup                FindingCategory = "pickup"
	FindingDuplicateRead         FindingCategory = "duplicate_read"
	FindingPronunciation         FindingCategory = "pronunciation"
	FindingAudioQuality          FindingCategory = "audio_quality"
)

type FindingSeverity string

const (
	FindingInfo    FindingSeverity = "info"
	FindingWarning FindingSeverity = "warning"
	FindingError   FindingSeverity = "error"
)

// hardGateCategories is the set that gates a Sample candidate: at severity
// warning or above, one of these excludes a Sample candidate outright rather
// than only lowering its rank. Every other category (and any of these below
// warning) only ranks down and is listed.
var hardGateCategories = map[FindingCategory]bool{
	FindingTranscriptDiscrepancy: true,
	FindingPickup:                true,
	FindingDuplicateRead:         true,
	FindingPronunciation:         true,
	FindingAudioQuality:          true,
}

// OpenFinding is one open (unreviewed, accepted or deferred; a dismissed
// finding is never passed in at all: the caller drops it before this package
// sees it) finding this package reads to gate or score a candidate. ParagraphID
// is "" when the finding carries no paragraph anchor (the store's
// Manuscript.Span was nil): this package can never safely attribute it to one
// window, so it always becomes a chapter-level warning on every candidate in
// that chapter instead of a silent pass.
type OpenFinding struct {
	ID          string
	ChapterID   string
	ParagraphID string
	Category    FindingCategory
	Severity    FindingSeverity
	// Reason is a short human string from the finding's own evidence, shown
	// in parentheses after the category name; "" when the caller has none.
	Reason string
}

// isHard reports whether f is a hard-gate category at severity warning or
// above (an info-severity finding in a hard-gate category still only ranks
// down, never excludes).
func (f OpenFinding) isHard() bool {
	return hardGateCategories[f.Category] && f.Severity != FindingInfo
}

func findingsByChapter(all []OpenFinding) map[string][]OpenFinding {
	if len(all) == 0 {
		return nil
	}
	byChapter := map[string][]OpenFinding{}
	for _, f := range all {
		byChapter[f.ChapterID] = append(byChapter[f.ChapterID], f)
	}
	return byChapter
}

// windowFindings is one window's open findings, split by whether this
// package can attribute them to a paragraph inside the window.
type windowFindings struct {
	// anchored are findings whose ParagraphID names a paragraph inside this
	// specific window.
	anchored []OpenFinding
	// chapterLevel are findings with no paragraph anchor at all: relevant to
	// every window in the chapter equally, since there is no narrower claim
	// this package can honestly make about them.
	chapterLevel []OpenFinding
}

// splitFindings buckets chapterFindings against one window's paragraph ids.
// A finding anchored to a paragraph outside this window (elsewhere in the
// same chapter) is neither anchored nor chapterLevel here: it says nothing
// about this particular window and is left for whichever window does
// contain it.
func splitFindings(chapterFindings []OpenFinding, windowParagraphIDs []string) windowFindings {
	inWindow := make(map[string]bool, len(windowParagraphIDs))
	for _, id := range windowParagraphIDs {
		inWindow[id] = true
	}
	var result windowFindings
	for _, f := range chapterFindings {
		switch {
		case f.ParagraphID == "":
			result.chapterLevel = append(result.chapterLevel, f)
		case inWindow[f.ParagraphID]:
			result.anchored = append(result.anchored, f)
		}
	}
	return result
}

// hasHard reports whether any anchored finding is hard-gated (the Sample
// exclusion looks only at anchored findings: a chapter-level finding with no
// paragraph anchor can never be pinned to one window, so it warns on every
// candidate in the chapter but excludes none of them).
func (wf windowFindings) hasHard() bool {
	for _, f := range wf.anchored {
		if f.isHard() {
			return true
		}
	}
	return false
}

// every returns wf's anchored and chapter-level findings together, anchored
// first, for scoring and evidence text that treats both alike.
func (wf windowFindings) every() []OpenFinding {
	if len(wf.anchored) == 0 && len(wf.chapterLevel) == 0 {
		return nil
	}
	all := make([]OpenFinding, 0, len(wf.anchored)+len(wf.chapterLevel))
	all = append(all, wf.anchored...)
	all = append(all, wf.chapterLevel...)
	return all
}

// findingsPenalty is the rank-down term: every open finding lowers a
// candidate's score, a hard-gate category at warning or above more than any
// other finding. This runs for both presets; only the hard-gate exclusion above
// (Sample only) differs by preset.
func findingsPenalty(wf windowFindings) float64 {
	penalty := 0.0
	for _, f := range wf.every() {
		if f.isHard() {
			penalty += 0.5
		} else {
			penalty += 0.2
		}
	}
	return penalty
}

// findingsWarnings renders wf as the candidate's evidence text (the evidence
// lists open findings per candidate). An open finding is always a concern,
// never a positive reason, so every one becomes a warning - shown with an icon
// by the existing Preview panel, the same "text plus icon, never colour alone"
// states the panel already has.
func findingsWarnings(wf windowFindings) []string {
	var warnings []string
	for _, f := range wf.anchored {
		warnings = append(warnings, "Open "+string(f.Category)+" finding in this range"+reasonSuffix(f.Reason)+".")
	}
	for _, f := range wf.chapterLevel {
		warnings = append(warnings, "Open "+string(f.Category)+" finding elsewhere in this chapter, not anchored to a paragraph"+reasonSuffix(f.Reason)+".")
	}
	return warnings
}

func reasonSuffix(reason string) string {
	if reason == "" {
		return ""
	}
	return " (" + reason + ")"
}

// attachFindings annotates candidate with chapterFindings' evidence and scoring
// penalty (findingsPenalty, folded into score() by features.go), and returns
// the split used to decide the caller's own preset-specific hard-gate exclusion
// (Sample only: SpotCheck never excludes, only ranks down, so that decision
// stays with the caller, not here).
func attachFindings(candidate Candidate, chapterFindings []OpenFinding) (Candidate, windowFindings) {
	wf := splitFindings(chapterFindings, candidate.ParagraphIDs)
	candidate.Warnings = append(candidate.Warnings, findingsWarnings(wf)...)
	candidate.findingsPenalty = findingsPenalty(wf)
	return candidate, wf
}
