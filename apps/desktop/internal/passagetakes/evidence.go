package passagetakes

import (
	"context"
	"math"
	"os"
	"sync"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/measure"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// Take evidence (ADR 0140, SNE-5a): for each candidate Resolve offers, the share of the passage's script words the take
// read as written, what its own source range measures, and where the passage's place in time came from. Every figure
// is a value or a sentence saying why there is none; nothing is defaulted, and nothing combines the figures.

// Where a take's place in the passage came from. Only ViaAligned is answered until the Booth's passage map exists:
// nothing here reads a map, so nothing may claim one.
const (
	ViaAligned = "aligned"
	ViaMap     = "map"
)

// The reasons this package gives for a figure it has no value for.
const (
	ReasonClarityNotMeasured = "Not measured"
	ReasonNoMeasurer         = "Takes are not measured on this computer."
	reasonNotAligned         = "This take was not aligned to the script, so its words were not matched. Run the recording check with it playing."
	reasonNoScriptWords      = "The passage has no script words to match."
	reasonNoBreathLevel      = "The take has too little speech to judge breaths against."
)

// Figure is one measurement: Value when it was made (OK), otherwise Reason. Exactly one of the two is set.
type Figure struct {
	OK     bool     `json:"ok"`
	Value  *float64 `json:"value,omitempty"`
	Reason string   `json:"reason,omitempty"`
}

func valueOf(v float64) Figure { return Figure{OK: true, Value: &v} }
func reasonOf(r string) Figure { return Figure{Reason: r} }
func figure(v *float64, why string) Figure {
	if v == nil || math.IsNaN(*v) || math.IsInf(*v, 0) {
		return reasonOf(why)
	}
	return valueOf(*v)
}

// tenths rounds a level to the 0.1 dB the page shows, so the same audio answers the same figure on every platform.
func tenths(f Figure) Figure {
	if f.OK {
		rounded := math.Round(*f.Value*10) / 10
		f.Value = &rounded
	}
	return f
}

// TakeMeasure is what one take's source range measures: the longest pause between speech (seconds), its RMS level and
// noise floor (dBFS), clarity (never measured here) and its breaths.
type TakeMeasure struct {
	Pause   Figure `json:"pause"`
	RMS     Figure `json:"rms"`
	NF      Figure `json:"nf"`
	Clarity Figure `json:"clarity"`
	Breaths Figure `json:"breaths"`
}

// unmeasured is a TakeMeasure whose every figure carries reason (clarity keeps its own).
func unmeasured(reason string) TakeMeasure {
	why := reasonOf(reason)
	return TakeMeasure{Pause: why, RMS: why, NF: why, Clarity: reasonOf(ReasonClarityNotMeasured), Breaths: why}
}

// TakeEvidence is one offered take's evidence. ID is the candidate's id, the one WorkspaceUseTake takes back.
type TakeEvidence struct {
	ID      string      `json:"id"`
	Matched Figure      `json:"matched"`
	Measure TakeMeasure `json:"measure"`
	Via     string      `json:"via"`
}

// EvidenceView is the WorkspaceTakeEvidence answer: the passage as Resolve snapped it and one entry per candidate, in
// the candidates' order. It holds ids and numbers only, never a file or a GUID.
type EvidenceView struct {
	ChapterID      string         `json:"chapterId"`
	FirstToken     int            `json:"firstToken"`
	LastToken      int            `json:"lastToken"`
	FirstParagraph int            `json:"firstParagraph"`
	LastParagraph  int            `json:"lastParagraph"`
	Message        string         `json:"message,omitempty"`
	Takes          []TakeEvidence `json:"takes"`
}

// Range is the part of a file a take plays, as a candidate names it.
type Range struct {
	File   string
	Kind   string
	Start  float64
	Length float64
}

// Measure reads one range's figures; it is how the audio is decoded.
type Measure func(Range) TakeMeasure

// Evidence answers the evidence of every candidate resolved offers, from the alignment and project it was resolved
// from. It reads only. measures may be nil (nothing is measured on this host): every figure then says so.
func Evidence(resolved Resolved, measures *MeasureCache) EvidenceView {
	in, alternates := resolved.input, resolved.View
	view := EvidenceView{
		ChapterID: alternates.ChapterID, FirstToken: alternates.FirstToken, LastToken: alternates.LastToken,
		FirstParagraph: alternates.FirstParagraph, LastParagraph: alternates.LastParagraph, Message: alternates.Message,
		Takes: make([]TakeEvidence, 0, len(alternates.Candidates)),
	}
	tokens := passageTokens(in.View, alternates)
	for _, candidate := range alternates.Candidates {
		evidence := TakeEvidence{ID: candidate.ID, Via: ViaAligned, Matched: matchedShare(in.View, tokens, candidate)}
		switch {
		case !candidate.Usable:
			evidence.Measure = unmeasured(candidate.Reason)
		case measures == nil:
			evidence.Measure = unmeasured(ReasonNoMeasurer)
		default:
			evidence.Measure = measures.Get(Range{
				File: candidate.SourceFile, Kind: sourceKind(in.Project, candidate), Start: candidate.SourceStart, Length: candidate.SourceLength,
			})
		}
		view.Takes = append(view.Takes, evidence)
	}
	return view
}

// passageTokens are the chapter tokens of the passage's whole paragraphs, the span every take is set against; the asked
// tokens when the alignment has no paragraphs.
func passageTokens(view coverage.AlignmentView, alternates Alternates) []coverage.TokenLine {
	if len(view.Paragraphs) == 0 || alternates.LastParagraph >= len(view.Paragraphs) {
		return view.Tokens[alternates.FirstToken : alternates.LastToken+1]
	}
	inSpan := map[string]bool{}
	for _, paragraph := range view.Paragraphs[alternates.FirstParagraph : alternates.LastParagraph+1] {
		inSpan[paragraph.ID] = true
	}
	var tokens []coverage.TokenLine
	for _, token := range view.Tokens {
		if token.ParagraphID != nil && inSpan[*token.ParagraphID] {
			tokens = append(tokens, token)
		}
	}
	return tokens
}

// matchedShare is the percent of the passage's script words the stored alignment heard the candidate's take read as
// written, or why there is none: the alignment heard a take of an item only when that take was the one playing.
func matchedShare(view coverage.AlignmentView, tokens []coverage.TokenLine, candidate Candidate) Figure {
	if len(tokens) == 0 {
		return reasonOf(reasonNoScriptWords)
	}
	index, aligned := -1, false
	for _, item := range view.Items {
		if item.ItemGUID == candidate.ItemGUID && (item.TakeGUID == candidate.TakeGUID || (item.TakeGUID == "" && candidate.Active)) {
			index, aligned = item.Index, true
			break
		}
	}
	heard, read := 0, 0
	for _, token := range tokens {
		if aligned && token.Item != nil && *token.Item == index {
			heard++
			if token.Status == "read" {
				read++
			}
		}
	}
	if heard == 0 {
		return reasonOf(reasonNotAligned)
	}
	return valueOf(math.Round(float64(read) * 100 / float64(len(tokens))))
}

// sourceKind is the REAPER source kind of the candidate's take, from the saved project.
func sourceKind(project tracks.Project, candidate Candidate) string {
	if _, item, found := project.ItemByGUID(candidate.ItemGUID); found {
		for _, take := range item.Takes {
			if take.GUID == candidate.TakeGUID {
				return take.SourceKind
			}
		}
	}
	return ""
}

// MeasureRange measures a take range the one way every take is measured, so their figures compare: measure.MeasureTake
// over the range for the level and noise floor (and every reason it gives), then the windowed diagnostics over the
// same range for the longest pause and the breaths.
func MeasureRange(r Range) TakeMeasure {
	item := tracks.Item{Length: r.Length, Takes: []tracks.Take{{SourceFile: r.File, SourceKind: r.Kind, SourceAvailable: true, SOFFS: r.Start, PlayRate: 1}}}
	metrics, err := measure.MeasureTake(measure.TakeInput{Item: item})
	if err != nil {
		return unmeasured("The take could not be measured (" + err.Error() + ").")
	}
	if metrics.Audio == nil {
		return unmeasured(sentence(metrics.Noise.Reason))
	}
	result := TakeMeasure{
		RMS:     tenths(figure(metrics.Audio.RMSdBFS, "The take is silent, so it has no level.")),
		NF:      tenths(figure(metrics.Noise.NoiseFloordBFS, sentence(metrics.Noise.Reason))),
		Clarity: reasonOf(ReasonClarityNotMeasured),
	}
	rng := measure.Range{StartSeconds: metrics.Source.Range.StartSeconds, LengthSeconds: metrics.Source.Range.LengthSeconds}
	diagnostics, err := measure.DiagnoseFile(context.Background(), r.File, measure.DiagnosticInput{SourceKind: measure.SourceRawRecording, Options: measure.DefaultDiagnosticOptions(), Range: &rng})
	if err != nil {
		why := "The take's pauses and breaths could not be read (" + err.Error() + ")."
		result.Pause, result.Breaths = reasonOf(why), reasonOf(why)
		return result
	}
	result.Pause = valueOf(longestPause(diagnostics))
	if diagnostics.Cleanup.SpeechLeveldBFS == nil {
		result.Breaths = reasonOf(reasonNoBreathLevel)
	} else {
		breaths := 0
		for _, candidate := range diagnostics.Cleanup.Candidates {
			if candidate.Class == measure.CleanupBreath {
				breaths++
			}
		}
		result.Breaths = valueOf(float64(breaths))
	}
	return result
}

// longestPause is the longest silence with sound on both sides of it, rounded to the 50 ms the silence map resolves; a
// silence at either edge of the range is room tone around the read, not a pause in it.
func longestPause(d measure.Diagnostics) float64 {
	longest := 0.0
	for _, silence := range d.Silences {
		if silence.StartSeconds <= 0 || silence.EndSeconds >= d.DurationSeconds {
			continue
		}
		longest = max(longest, silence.EndSeconds-silence.StartSeconds)
	}
	return math.Round(longest*20) / 20
}

// sentence makes measure's lower-case reason a sentence the page can show.
func sentence(reason string) string {
	if reason == "" {
		return "The take could not be measured."
	}
	first := reason[0]
	if first >= 'a' && first <= 'z' {
		reason = string(first-'a'+'A') + reason[1:]
	}
	if reason[len(reason)-1] != '.' {
		reason += "."
	}
	return reason
}

// MeasureCache keeps each range's figures while its file is unchanged (same size and modification time), so asking
// for a passage's evidence again decodes nothing. It holds at most measureCacheLimit ranges.
type MeasureCache struct {
	measure Measure
	mu      sync.Mutex
	// +checklocks:mu
	entries map[cacheKey]TakeMeasure
}

type cacheKey struct {
	Range
	size     int64
	modified time.Time
}

const measureCacheLimit = 512

// NewMeasureCache is a cache over measure (MeasureRange in the host, a spy in tests).
func NewMeasureCache(measure Measure) *MeasureCache {
	return &MeasureCache{measure: measure, entries: map[cacheKey]TakeMeasure{}}
}

// Get is r's figures, measured once per version of its file. A file that cannot be read is a reason, not cached.
func (c *MeasureCache) Get(r Range) TakeMeasure {
	info, err := os.Stat(r.File)
	if err != nil || !info.Mode().IsRegular() {
		return unmeasured("This take's audio file cannot be read, so it was not measured.")
	}
	key := cacheKey{Range: r, size: info.Size(), modified: info.ModTime()}
	c.mu.Lock()
	cached, found := c.entries[key]
	c.mu.Unlock()
	if found {
		return cached
	}
	measured := c.measure(r)
	c.mu.Lock()
	if len(c.entries) >= measureCacheLimit {
		clear(c.entries)
	}
	c.entries[key] = measured
	c.mu.Unlock()
	return measured
}
