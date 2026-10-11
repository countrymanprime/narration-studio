package coverage

import (
	"encoding/json"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/evidence"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// AlignmentParagraph is one of the chapter's paragraphs, for the workspace to
// show against the tokens.
type AlignmentParagraph struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// AlignmentItem is one manifest item's current played range, joined by item
// GUID against the saved project (tracks.Item's TakeGUID, SourceStart
// and PlayRate). Live is false when the
// saved project no longer has an item with this GUID (deleted, or the track
// relinked): the workspace can still show the item's tokens, but cannot map
// them to a played range or send a REAPER command for them any more.
type AlignmentItem struct {
	Index       int     `json:"index"`
	ItemGUID    string  `json:"itemGuid"`
	Live        bool    `json:"live"`
	TakeGUID    string  `json:"takeGuid,omitempty"`
	SourceStart float64 `json:"sourceStart,omitempty"`
	PlayRate    float64 `json:"playRate,omitempty"`
	Position    float64 `json:"position,omitempty"`
	Length      float64 `json:"length,omitempty"`
}

// AlignmentView is a chapter's stored word alignment (ADR 0242) as the WorkspaceAlignment binding sends it: the same
// state, reasons and basis CoverageResult answers (an alignment is only ever
// as current as the coverage result it was written with), the chapter's
// paragraphs, the per-token alignment and extra runs, and each analyzed
// item's current played range. NeedsAlignAgain is set when the newest current
// or stale result has no stored alignment yet; align-again re-aligns from
// cached words alone, without running the check again (ADR 0242). Engine names
// the recogniser whose words the alignment came from, and is nil when there is
// no alignment. On the wire each token also carries a score and each extra run
// its words (MarshalJSON, ADR 0855).
type AlignmentView struct {
	ChapterID       string                  `json:"chapterId"`
	State           evidence.EvaluatorState `json:"state"`
	Reasons         []string                `json:"reasons"`
	Basis           *BasisView              `json:"basis,omitempty"`
	NeedsAlignAgain bool                    `json:"needsAlignAgain"`
	Paragraphs      []AlignmentParagraph    `json:"paragraphs"`
	Tokens          []TokenLine             `json:"tokens"`
	Extras          []ExtraLine             `json:"extras"`
	Items           []AlignmentItem         `json:"items"`
	Engine          *AlignmentEngine        `json:"engine,omitempty"`
}

// AlignmentEngine is the recogniser that wrote a chapter's alignment: a stable
// id and the name the page shows ("Flagged by Whisper small").
type AlignmentEngine struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// How an added word's times were found (ADR 0855). A stored extra run keeps
// only its two ends, so its words are spread evenly between them; a run whose
// ends are on two items has no one source timeline, so its words sit at its
// start with no duration.
const (
	TimingSpread   = "spread"
	TimingUnplaced = "unplaced"
)

// HeardToken is a token as the wire sends it: the stored line plus its score.
// Conf is always nil with ConfNoWordScores while the words file carries no
// Whisper word probabilities (ADR 0830, ADR 0855).
type HeardToken struct {
	TokenLine
	Conf       *float64 `json:"conf"`
	ConfReason string   `json:"confReason,omitempty"`
}

// ExtraWord is one word of an extra run: said, and not in the script.
type ExtraWord struct {
	Text       string   `json:"text"`
	Item       int      `json:"item"`
	Start      float64  `json:"start"`
	End        float64  `json:"end"`
	Added      bool     `json:"added"`
	Timing     string   `json:"timing"`
	Conf       *float64 `json:"conf"`
	ConfReason string   `json:"confReason,omitempty"`
}

// HeardExtra is an extra run as the wire sends it: the stored line plus its words.
type HeardExtra struct {
	ExtraLine
	Words []ExtraWord `json:"words"`
}

// WireTokens is the view's tokens with their scores (nil for nil, so a view
// that never read a report still sends null).
func (v AlignmentView) WireTokens() []HeardToken {
	if v.Tokens == nil {
		return nil
	}
	out := make([]HeardToken, 0, len(v.Tokens))
	for _, token := range v.Tokens {
		out = append(out, HeardToken{TokenLine: token, ConfReason: ConfNoWordScores})
	}
	return out
}

// WireExtras is the view's extra runs with their words (nil for nil).
func (v AlignmentView) WireExtras() []HeardExtra {
	if v.Extras == nil {
		return nil
	}
	out := make([]HeardExtra, 0, len(v.Extras))
	for _, extra := range v.Extras {
		out = append(out, HeardExtra{ExtraLine: extra, Words: extraWords(extra)})
	}
	return out
}

// extraWords splits an extra run into its words, spread evenly between the
// run's ends when both are on one item (TimingSpread), else all at its start
// (TimingUnplaced): nothing claims a recogniser time the stored run lacks.
func extraWords(extra ExtraLine) []ExtraWord {
	texts := strings.Fields(extra.Text)
	words := make([]ExtraWord, 0, len(texts))
	from, to := extra.Start.SourceTime, extra.End.SourceTime
	timing := TimingSpread
	if extra.Start.ItemIndex != extra.End.ItemIndex || to < from {
		timing, to = TimingUnplaced, from
	}
	step := (to - from) / float64(max(len(texts), 1))
	for i, text := range texts {
		words = append(words, ExtraWord{
			Text: text, Item: extra.Start.ItemIndex, Start: from + step*float64(i), End: from + step*float64(i+1),
			Added: true, Timing: timing, ConfReason: ConfNoWordScores,
		})
	}
	return words
}

// MarshalJSON sends the view with WireTokens and WireExtras in place of the
// stored lines, so the Go callers keep reading plain TokenLine and ExtraLine.
func (v AlignmentView) MarshalJSON() ([]byte, error) {
	type plain AlignmentView
	return json.Marshal(struct {
		plain
		Tokens []HeardToken `json:"tokens"`
		Extras []HeardExtra `json:"extras"`
	}{plain: plain(v), Tokens: v.WireTokens(), Extras: v.WireExtras()})
}

// engineOf names the recogniser of a report's first pass (Summary.Analysis.Model),
// or nil when the report holds no alignment or names no model.
func engineOf(report Report) *AlignmentEngine {
	model := report.Summary.Analysis.Model
	if !report.HasAlignment() || model == "" {
		return nil
	}
	return &AlignmentEngine{ID: "whisper:" + model, Name: "Whisper " + model}
}

// Alignment reads a chapter's stored word alignment back and joins it with
// the chapter's current paragraphs and its items' current played ranges. It
// never runs anything (Q14), exactly like Result, whose state, reasons and
// basis it shares: an alignment newer than the coverage result it came from
// cannot exist, so a chapter that is current, stale or never for Result reads
// exactly the same way here.
func (s *Service) Alignment(chapterID string, alignment AlignmentParams) (AlignmentView, error) {
	result, err := s.Result(chapterID, alignment)
	if err != nil {
		return AlignmentView{}, err
	}
	view := AlignmentView{ChapterID: chapterID, State: result.State, Reasons: nonNil(result.Reasons)}
	if result.Basis != nil {
		view.Basis = &BasisView{Label: result.Basis.Label, ModifiedAt: result.Basis.ProjectFile.ModTime, Stale: result.Basis.Stale}
	}
	if result.Result == nil {
		return view, nil
	}
	report := result.Result.Report
	view.NeedsAlignAgain = !report.HasAlignment()
	view.Tokens, view.Extras = nonNil(report.Tokens), nonNil(report.Extras)
	view.Engine = engineOf(report)
	paragraphs, err := s.chapterParagraphs(chapterID)
	if err != nil {
		return AlignmentView{}, err
	}
	view.Paragraphs = paragraphs
	project, _, err := s.savedProject()
	if err != nil {
		return AlignmentView{}, err
	}
	view.Items = alignmentItems(report.Items, project)
	return view, nil
}

// chapterParagraphs is the chapter's paragraph texts, in manuscript order:
// chapterBasis (chapter.go) hashes the same paragraphs but keeps only the
// hash, so this reads them again for the text itself.
func (s *Service) chapterParagraphs(chapterID string) ([]AlignmentParagraph, error) {
	if s.config.LoadManuscript == nil {
		return nil, unknown(ReasonNoManuscript, "import a manuscript before reading the chapter's alignment")
	}
	data, err := s.config.LoadManuscript()
	if err != nil {
		return nil, unknown(ReasonNoManuscript, err.Error())
	}
	var paragraphs []AlignmentParagraph
	rawParagraphs, _ := data["paragraphs"].([]any)
	for _, raw := range rawParagraphs {
		paragraph, _ := raw.(map[string]any)
		if owner, _ := paragraph["chapterId"].(string); owner != chapterID {
			continue
		}
		id, _ := paragraph["id"].(string)
		text, _ := paragraph["text"].(string)
		paragraphs = append(paragraphs, AlignmentParagraph{ID: id, Text: text})
	}
	return nonNil(paragraphs), nil
}

// alignmentItems joins the stored report's items (COVERAGE_ITEM lines, one
// per manifest item, muted ones included) to their current played range in
// the saved project, by item GUID.
func alignmentItems(items []ItemLine, project tracks.Project) []AlignmentItem {
	out := make([]AlignmentItem, 0, len(items))
	for _, line := range items {
		view := AlignmentItem{Index: line.Index, ItemGUID: line.ItemGUID}
		if _, item, ok := project.ItemByGUID(line.ItemGUID); ok {
			view.Live = true
			view.TakeGUID, view.SourceStart, view.PlayRate = item.TakeGUID, item.SourceStart, item.PlayRate
			view.Position, view.Length = item.Position, item.Length
		}
		out = append(out, view)
	}
	return out
}

// ChapterTrackGUID is the REAPER track the chapter's newest coverage run covered (its ledger record's scope), or "" when
// the chapter was never checked. The workspace puts an FX chain on this track (ADR 0234): the page never names a track, so it cannot be steered to another one.
func (s *Service) ChapterTrackGUID(chapterID string) string {
	record, err := s.latestRecord(chapterID)
	if err != nil || record == nil {
		return ""
	}
	return record.Scope.TrackGUID
}
