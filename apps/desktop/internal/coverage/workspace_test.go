package coverage

import (
	"encoding/json"
	"math"
	"os"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/evidence"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// alignedResults is a results file with the chapter's per-token alignment
// (ADR 0242) for the fixture chapter's one paragraph, "Alice was beginning to
// get very tired.": item A carries the first five words, item B the last two,
// one of them a misread, plus one run of extra words after the chapter ends.
var alignedResults = []string{
	`COVERAGE|{"schemaVersion":1,"chapterId":"c-0001","bodyTokens":7,"presentTokens":7,"missingTokens":0,"extraTokens":1,"longestMissingRun":0,"alignment":{"maxMisreadRun":8,"minAnchorRun":3},"items":{"analyzed":2,"muted":0,"playedSeconds":16.0,"transcribed":0,"reused":2},"analysis":{"model":"small","language":"en","equivalencesHash":null}}`,
	`COVERAGE_ITEM|{"index":0,"itemGuid":"{ITEM-A}","status":"analyzed","words":"reused","playedSeconds":10.0,"wordCount":5,"model":"small","language":"en"}`,
	`COVERAGE_ITEM|{"index":1,"itemGuid":"{ITEM-B}","status":"analyzed","words":"reused","playedSeconds":6.0,"wordCount":2,"model":"small","language":"en"}`,
	`COVERAGE_PARAGRAPH|{"id":"p-000001","tokens":7,"present":7,"longestMissingRun":0}`,
	`COVERAGE_TOKEN|{"i":0,"p":"p-000001","w":0,"text":"Alice","status":"read","heard":null,"item":0,"start":5.0,"end":5.3}`,
	`COVERAGE_TOKEN|{"i":1,"p":"p-000001","w":1,"text":"was","status":"read","heard":null,"item":0,"start":5.3,"end":5.5}`,
	`COVERAGE_TOKEN|{"i":2,"p":"p-000001","w":2,"text":"beginning","status":"misread","heard":"begging","item":0,"start":5.5,"end":6.0}`,
	`COVERAGE_TOKEN|{"i":3,"p":"p-000001","w":3,"text":"to","status":"read","heard":null,"item":0,"start":6.0,"end":6.1}`,
	`COVERAGE_TOKEN|{"i":4,"p":"p-000001","w":4,"text":"get","status":"read","heard":null,"item":0,"start":6.1,"end":6.3}`,
	`COVERAGE_TOKEN|{"i":5,"p":"p-000001","w":5,"text":"very","status":"read","heard":null,"item":1,"start":0.0,"end":0.3}`,
	`COVERAGE_TOKEN|{"i":6,"p":"p-000001","w":6,"text":"tired.","status":"read","heard":null,"item":1,"start":0.3,"end":0.6}`,
	`COVERAGE_EXTRA|{"text":"um","tokens":1,"start":{"itemIndex":1,"itemGuid":"{ITEM-B}","sourceTime":0.6},"end":{"itemIndex":1,"itemGuid":"{ITEM-B}","sourceTime":0.8},"afterToken":6}`,
}

// liveItem is the saved project's current played range for guid, as
// Service.Alignment must join it in (tracks.Item's TakeGUID, SourceStart and PlayRate).
func liveItem(t *testing.T, p *testProject, guid string) AlignmentItem {
	t.Helper()
	project, err := tracks.Parse(p.rpp)
	if err != nil {
		t.Fatal(err)
	}
	_, item, ok := project.ItemByGUID(guid)
	if !ok {
		t.Fatalf("no item %s in the saved project", guid)
	}
	return AlignmentItem{
		ItemGUID: guid, Live: true, TakeGUID: item.TakeGUID, SourceStart: item.SourceStart,
		PlayRate: item.PlayRate, Position: item.Position, Length: item.Length,
	}
}

func alignmentOf(t *testing.T, service *Service) AlignmentView {
	t.Helper()
	view, err := service.Alignment(testChapter, DefaultAlignmentParams)
	if err != nil {
		t.Fatalf("Alignment: %v", err)
	}
	return view
}

func TestAlignmentJoinsTheStoredTokensWithParagraphsAndPlayedRanges(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{results: alignedResults}
	service := p.service(sidecar)
	run(t, service, testRequest())

	view := alignmentOf(t, service)

	if view.State != evidence.StateCurrent || view.NeedsAlignAgain {
		t.Fatalf("view = %+v", view)
	}
	if len(view.Paragraphs) != 1 || view.Paragraphs[0] != (AlignmentParagraph{ID: "p-000001", Text: "Alice was beginning to get very tired."}) {
		t.Fatalf("paragraphs = %+v", view.Paragraphs)
	}
	if len(view.Tokens) != 7 || view.Tokens[2].Status != "misread" || *view.Tokens[2].Heard != "begging" {
		t.Fatalf("tokens = %+v", view.Tokens)
	}
	if len(view.Extras) != 1 || view.Extras[0].Text != "um" {
		t.Fatalf("extras = %+v", view.Extras)
	}
	wantA, wantB := liveItem(t, p, "{ITEM-A}"), liveItem(t, p, "{ITEM-B}")
	wantA.Index, wantB.Index = 0, 1
	if len(view.Items) != 2 || view.Items[0] != wantA || view.Items[1] != wantB {
		t.Fatalf("items = %+v, want [%+v %+v]", view.Items, wantA, wantB)
	}
}

func TestAReportWithNoStoredAlignmentAnswersNeedsAlignAgain(t *testing.T) {
	p := newTestProject(t)
	// The default fake sidecar writes a results file with no COVERAGE_TOKEN
	// lines, as a report stored before ADR 0242 shipped would read.
	service := p.service(&fakeSidecar{})
	run(t, service, testRequest())

	view := alignmentOf(t, service)

	if view.State != evidence.StateCurrent || !view.NeedsAlignAgain {
		t.Fatalf("view = %+v", view)
	}
	if len(view.Tokens) != 0 || len(view.Extras) != 0 {
		t.Fatalf("a report with no alignment must answer no tokens or extras: %+v", view)
	}
	if len(view.Paragraphs) != 1 {
		t.Fatalf("the chapter's paragraphs still read while alignment is missing: %+v", view.Paragraphs)
	}
}

func TestAlignmentOfAChapterNeverCheckedAnswersNever(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{})

	view := alignmentOf(t, service)

	if view.State != evidence.StateNever || len(view.Paragraphs) != 0 || len(view.Items) != 0 {
		t.Fatalf("view = %+v", view)
	}
}

func TestAStaleAlignmentStillReadsItsStoredTokens(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{results: alignedResults}
	service := p.service(sidecar)
	run(t, service, testRequest())
	p.items[1].length = 9 // item B now plays more of its source: the record is stale
	p.writeRPP()

	view := alignmentOf(t, service)

	if view.State != evidence.StateStale {
		t.Fatalf("view.State = %v, want stale", view.State)
	}
	if len(view.Tokens) != 7 {
		t.Fatalf("a stale alignment must still carry the last run's tokens: %+v", view.Tokens)
	}
	// The item's played range is read live, so it already reflects the edit.
	if got := view.Items[1].Length; got != 9 {
		t.Fatalf("item B length = %v, want the edited 9", got)
	}
}

func TestAnItemNoLongerInTheSavedProjectAnswersNotLive(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{results: []string{
		`COVERAGE|{"schemaVersion":1,"chapterId":"c-0001","bodyTokens":1,"presentTokens":1,"missingTokens":0,"extraTokens":0,"longestMissingRun":0,"alignment":{"maxMisreadRun":8,"minAnchorRun":3},"items":{"analyzed":1,"muted":0,"playedSeconds":1.0,"transcribed":0,"reused":1},"analysis":{"model":"small","language":null,"equivalencesHash":null}}`,
		`COVERAGE_ITEM|{"index":0,"itemGuid":"{GONE}","status":"analyzed","words":"reused","playedSeconds":1.0,"wordCount":1,"model":"small","language":"en"}`,
		`COVERAGE_PARAGRAPH|{"id":"p-000001","tokens":1,"present":1,"longestMissingRun":0}`,
		`COVERAGE_TOKEN|{"i":0,"p":"p-000001","w":0,"text":"Alice","status":"read","heard":null,"item":0,"start":0.0,"end":0.3}`,
	}}
	service := p.service(sidecar)
	run(t, service, testRequest())

	view := alignmentOf(t, service)

	if len(view.Items) != 1 || view.Items[0].Live || view.Items[0].ItemGUID != "{GONE}" || view.Items[0].TakeGUID != "" {
		t.Fatalf("items = %+v", view.Items)
	}
}

func TestChapterTrackGUIDIsTheTrackTheNewestCheckCovered(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{})
	if got := service.ChapterTrackGUID(testChapter); got != "" {
		t.Fatalf("a chapter never checked has no track, got %q", got)
	}
	run(t, service, testRequest())
	if got := service.ChapterTrackGUID(testChapter); got != testTrack {
		t.Fatalf("track = %q, want %q", got, testTrack)
	}
}

// addedWordsResults is alignedResults with two more extra runs: one said before anything was heard (no afterToken)
// and one that starts on item A and ends on item B, so it has no single source timeline to spread its words over.
var addedWordsResults = append(append([]string{}, alignedResults[:len(alignedResults)-1]...),
	`COVERAGE_EXTRA|{"text":"chapter one","tokens":2,"start":{"itemIndex":0,"itemGuid":"{ITEM-A}","sourceTime":4.0},"end":{"itemIndex":0,"itemGuid":"{ITEM-A}","sourceTime":4.6},"afterToken":null}`,
	`COVERAGE_EXTRA|{"text":"sorry very","tokens":2,"start":{"itemIndex":0,"itemGuid":"{ITEM-A}","sourceTime":6.3},"end":{"itemIndex":1,"itemGuid":"{ITEM-B}","sourceTime":0.0},"afterToken":4}`,
	alignedResults[len(alignedResults)-1],
)

func TestViewCarriesTheEngine(t *testing.T) {
	p := newTestProject(t)
	never := alignmentOf(t, p.service(&fakeSidecar{}))
	if never.Engine != nil {
		t.Fatalf("a chapter never checked names no engine: %+v", never.Engine)
	}
	old := p.service(&fakeSidecar{})
	run(t, old, testRequest())
	if view := alignmentOf(t, old); !view.NeedsAlignAgain || view.Engine != nil {
		t.Fatalf("a result stored before the lines existed names no engine: %+v", view.Engine)
	}

	aligned := p.service(&fakeSidecar{results: alignedResults})
	run(t, aligned, testRequest())
	view := alignmentOf(t, aligned)
	if view.Engine == nil || *view.Engine != (AlignmentEngine{ID: "whisper:small", Name: "Whisper small"}) {
		t.Fatalf("engine = %+v", view.Engine)
	}
	raw, _ := json.Marshal(never)
	if strings.Contains(string(raw), `"engine"`) {
		t.Fatalf("the engine is absent, not empty, when nothing ran: %s", raw)
	}
}

func TestEveryWordScoreIsNullWithAReason(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{results: addedWordsResults})
	run(t, service, testRequest())
	view := alignmentOf(t, service)

	for _, token := range view.WireTokens() {
		if token.Conf != nil || token.ConfReason != ConfNoWordScores {
			t.Errorf("token %d: conf %v, reason %q", token.Index, token.Conf, token.ConfReason)
		}
	}
	for _, extra := range view.WireExtras() {
		for _, word := range extra.Words {
			if word.Conf != nil || word.ConfReason != ConfNoWordScores {
				t.Errorf("extra word %q: conf %v, reason %q", word.Text, word.Conf, word.ConfReason)
			}
		}
	}
	raw, _ := json.Marshal(view.WireTokens()[0])
	if !strings.Contains(string(raw), `"conf":null`) || !strings.Contains(string(raw), `"confReason":"no_word_scores"`) {
		t.Fatalf("wire = %s", raw)
	}
	// The same guard ADR 0830 added for gaps (TestNoGapScoreExistsWhileTheWordsFileCarriesNoProbabilities): a sidecar
	// that starts writing probabilities must be met by a deliberate change here, not by a number nobody reads.
	source, err := os.ReadFile("../../../../sidecars/transcript-compare/core/coverage_mode.py")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(source), "probability") {
		t.Fatal("the words file now carries probabilities: score heard words from them and amend ADR 0855")
	}
}

func TestExtraRunsBecomeAddedWordsInOrder(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{results: addedWordsResults})
	run(t, service, testRequest())
	extras := alignmentOf(t, service).WireExtras()
	if len(extras) != 3 {
		t.Fatalf("extras = %+v", extras)
	}

	start := extras[0]
	if start.AfterToken != nil || len(start.Words) != 2 {
		t.Fatalf("the run before anything was heard: %+v", start)
	}
	want := []ExtraWord{
		{Text: "chapter", Item: 0, Start: 4.0, End: 4.3, Added: true, Timing: TimingSpread, ConfReason: ConfNoWordScores},
		{Text: "one", Item: 0, Start: 4.3, End: 4.6, Added: true, Timing: TimingSpread, ConfReason: ConfNoWordScores},
	}
	for i, word := range start.Words {
		if !closeWord(word, want[i]) {
			t.Fatalf("word %d = %+v, want %+v", i, word, want[i])
		}
	}

	across := extras[1]
	for _, word := range across.Words {
		if !word.Added || word.Timing != TimingUnplaced || word.Item != 0 || word.Start != 6.3 || word.End != 6.3 {
			t.Fatalf("a run across two items is placed at its start and claims no duration: %+v", word)
		}
	}
	if um := extras[2].Words; len(um) != 1 || !closeWord(um[0], ExtraWord{Text: "um", Item: 1, Start: 0.6, End: 0.8, Added: true, Timing: TimingSpread, ConfReason: ConfNoWordScores}) {
		t.Fatalf("um = %+v", um)
	}
}

func closeWord(got, want ExtraWord) bool {
	near := func(a, b float64) bool { return math.Abs(a-b) < 1e-9 }
	return got.Text == want.Text && got.Item == want.Item && near(got.Start, want.Start) && near(got.End, want.End) &&
		got.Added == want.Added && got.Timing == want.Timing && got.Conf == nil && got.ConfReason == want.ConfReason
}
