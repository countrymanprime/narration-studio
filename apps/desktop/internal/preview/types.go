// Package preview is the proofing preview's pure window engine (see
// docs/architecture/preview-suggestion.md): up to three ranked five-minute
// candidates from the imported manuscript, each a run of whole consecutive
// paragraphs within one chapter, scored on deterministic, explainable text
// features - boundary quality, a narration-and-dialogue mix, entity variety,
// hard-word density and position. It has no I/O and no clock: the host binding
// supplies the chapters, paragraphs and settings as plain values, read from the
// manuscript and guide services. Findings and audio evidence compose onto the
// candidates in findings.go and audiochecked.go.
package preview

// ContentKind mirrors the manuscript's own chapter content kinds
// (apps/ui/src/api/contracts/manuscript.ts). A chapter imported before
// structural classification has no kind at all, and a missing kind is treated
// as narration.
type ContentKind string

const (
	ContentNarration ContentKind = "narration"
	ContentOpening   ContentKind = "opening"
	ContentReference ContentKind = "reference"
)

// Chapter is one manuscript chapter, as much as the window engine needs of it.
// Order is the chapter's position in the book (0-based), used for the
// ending-exclusion setting and as this package's own tie-break key (ties are
// broken by chapter, then paragraph index).
type Chapter struct {
	ID          string
	Title       string
	ContentKind ContentKind
	Order       int
}

// Paragraph is one paragraph of one chapter. Index is the paragraph's
// 0-based position within its own chapter (not the whole book), the
// engine's other tie-break key. EntityIDs are the Story Bible entities the
// paragraph mentions.
type Paragraph struct {
	ID        string
	ChapterID string
	Index     int
	Text      string
	EntityIDs []string
}

// Preset selects the two weight sets: Sample favours a clean, varied, shareable
// excerpt; SpotCheck favours a passage worth a second look. The engine is
// text-only, so the two presets score identically until audio evidence exists
// to pull them apart; the weights are already separate constants
// (presetWeights) so that change touches no ranking logic here.
type Preset string

const (
	PresetSample    Preset = "sample"
	PresetSpotCheck Preset = "spot_check"
)

// WordsPerFinishedHour is the app's existing fixed pace estimate
// (apps/ui/src/state.ts's WORDS_PER_FINISHED_HOUR), reused here so this
// engine's length model agrees with Home's own "Est. proof time". It is an
// assumption to calibrate once real durations exist.
const WordsPerFinishedHour = 9300

// Settings are the narrator's target length, tolerance, preset and optional
// ending exclusion (no shipped default beyond what DefaultSettings states).
type Settings struct {
	TargetSeconds float64
	// ToleranceFraction is how far a candidate's estimated length may sit
	// from TargetSeconds and still count as "on target" (a fraction of
	// TargetSeconds, e.g. 0.1 for +/-10%).
	ToleranceFraction float64
	Preset            Preset
	// ExcludeEndingFraction, when above 0, drops the last this-much share of
	// the book's chapters (by Order) from eligibility, so a candidate never
	// spoils the ending (off by default).
	ExcludeEndingFraction float64
}

// DefaultSettings is 5:00 target, 10% tolerance, the Sample preset, ending
// exclusion off.
func DefaultSettings() Settings {
	return Settings{TargetSeconds: 300, ToleranceFraction: 0.1, Preset: PresetSample}
}

// Input is everything Suggest reads. HardWords is optional (nil is "none
// known"): the lower-cased words a caller (from the guide's vocabulary
// candidates) considers hard; every occurrence in a window's text counts toward
// its hard-word density feature. OpenFindings is optional (nil or empty is
// "none known", read the same as "no evidence either way", never as "this
// chapter is clean"): the open findings from the findings store, already
// resolved to plain values by the caller (the host binding), so the engine
// itself still does no I/O of its own reading them.
type Input struct {
	Chapters     []Chapter
	Paragraphs   []Paragraph
	HardWords    map[string]bool
	OpenFindings []OpenFinding
	// AudioEvidence is optional (nil is "no chapter has audio evidence yet", read the same tri-state way as a missing
	// key inside it): the per-chapter audio-checked inputs, keyed by chapter id, already resolved to plain values by
	// the caller (the host binding, composing recording coverage, the paragraph mapper and, per ADR 0327, windowed
	// audio-quality findings once a chapter can have them).
	AudioEvidence map[string]ChapterAudioEvidence
	Settings      Settings
}

// Outcome names a manuscript-wide state with no ranked candidates to show,
// distinct from a normal empty Candidates list (never conflated with it: an
// empty list with OutcomeOK would read as "nothing eligible" for the wrong
// reason).
type Outcome string

const (
	// OutcomeOK: at least one candidate exists; Result.Candidates holds it or them.
	OutcomeOK Outcome = "ok"
	// OutcomeNoManuscript: no chapters at all.
	OutcomeNoManuscript Outcome = "no_manuscript"
	// OutcomeNothingEligible means chapters exist, but none is eligible content
	// or none has a single paragraph.
	OutcomeNothingEligible Outcome = "nothing_eligible"
)

// Candidate is one suggested window: a contiguous run of whole paragraphs
// inside exactly one chapter, never crossing a chapter boundary.
type Candidate struct {
	ChapterID        string
	ChapterTitle     string
	ParagraphIDs     []string
	WordCount        int
	EstimatedSeconds float64
	// Shorter is true when even this chapter's every eligible paragraph
	// together falls short of the target's lower tolerance bound: the
	// candidate is the whole chapter, honestly labelled rather than padded
	// or hidden (Success Metrics: "a named state").
	Shorter  bool
	Reasons  []string
	Warnings []string

	// features holds this candidate's raw, unrounded scoring inputs, computed once when the candidate was built, so
	// score() never re-reads paragraph text and a caller outside this package never sees a raw, unexplained number (the
	// "no single readiness score" stance of apps/desktop/internal/stages - a candidate's Reasons are the explanation;
	// this field is ranking machinery only).
	features candidateFeatures
	// findingsPenalty is the rank-down term for open findings (attachFindings), folded into score() so a chapter whose
	// only candidate carries open findings ranks below a clean one both when Suggest picks one window per chapter and
	// when it picks the top three chapters overall - the same "rank down" rule applied consistently, not just at
	// window-selection time.
	findingsPenalty float64
	// audioChecked is the audio-checked label (attachAudioChecked), kept private like features and findingsPenalty: the
	// wire-facing evidence is the Reasons/Warnings text this package already appends, and this field lets this
	// package's own tests assert the label directly.
	audioChecked bool
}

// candidateFeatures are one candidate's named, explainable text features,
// which give each candidate its reasons and warnings.
type candidateFeatures struct {
	// dialogueShare is the fraction of the window's paragraphs the quote heuristic reads as dialogue; a value inside a
	// preferred band scores best (a monologue and an all-dialogue transcript both score lower).
	dialogueShare float64
	// distinctEntities is the count of distinct Story Bible entities mentioned across the window.
	distinctEntities int
	// hardWordDensity is hard words found over total words (0 when HardWords is nil: no evidence either way).
	hardWordDensity float64
}

// Result is Suggest's answer: either a manuscript-wide Outcome with no
// candidates, or OutcomeOK with up to three, one per chapter, ranked highest
// score first, ties broken by chapter Order then the window's first paragraph
// Index.
type Result struct {
	Outcome    Outcome
	Candidates []Candidate
}
