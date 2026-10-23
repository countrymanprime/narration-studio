package pickuplist

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/findings"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
	"github.com/countrymanprime/narration-utils/shell/internal/proofing"
	"github.com/countrymanprime/narration-utils/shell/internal/stages"
)

type fakeFindings struct{ all []findings.Finding }

func (f fakeFindings) List(query findings.Query) ([]findings.Finding, error) {
	var out []findings.Finding
	for _, finding := range f.all {
		if query.Status != "" && finding.Review.Status != query.Status {
			continue
		}
		out = append(out, finding)
	}
	return out, nil
}

type fakeDAW struct {
	reachable bool
	markers   []Marker
	listed    bool
	refuse    error
	writes    []string
}

func (d *fakeDAW) Reachable() bool           { return d.reachable }
func (d *fakeDAW) Markers() ([]Marker, bool) { return d.markers, d.listed }
func (d *fakeDAW) SetDone(at float64, done bool) error {
	if d.refuse != nil {
		return d.refuse
	}
	d.writes = append(d.writes, strings.TrimSpace(strings.Join([]string{ftoa(at), map[bool]string{true: "done", false: "open"}[done]}, " ")))
	return nil
}

func ftoa(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

func ptr[T any](v T) *T { return &v }

func chapterOne() Chapter {
	return Chapter{ID: "c-0001", Seconds: ptr(600.0), Paragraphs: []Paragraph{
		{ID: "p-1", Index: 0, Text: "Alice was beginning to get very tired of sitting by her sister."},
		{ID: "p-2", Index: 1, Text: "So she was considering in her own mind what to do."},
		{ID: "p-3", Index: 2, Text: "There was nothing so very remarkable in that."},
		{ID: "p-4", Index: 3, Text: "The rabbit-hole went straight on like a tunnel."},
	}}
}

// currentSpeech is a current check with two gaps inside the read part; ClassifyGaps already leaves the unread tail out.
func currentSpeech() Speech {
	report := coverage.Report{
		Paragraphs: []coverage.ParagraphLine{{ID: "p-1", Tokens: 10, Present: 10}, {ID: "p-2", Tokens: 10, Present: 6}, {ID: "p-3", Tokens: 8, Present: 4}, {ID: "p-4", Tokens: 9, Present: 0}},
		Regions: []coverage.RegionLine{
			{Kind: "skip", ParagraphIDs: []string{"p-2"}, TokenCount: 4, FirstWord: "in", LastWord: "mind", Position: &coverage.RegionPosition{ItemGUID: "{I}", SourceTime: 31.5}},
			{Kind: "different_text", ParagraphIDs: []string{"p-3"}, TokenCount: 2, FirstWord: "very", LastWord: "remarkable", Position: &coverage.RegionPosition{ItemGUID: "{I}", SourceTime: 44}},
			{Kind: "tail", ParagraphIDs: []string{"p-4"}, TokenCount: 9, FirstWord: "The", LastWord: "tunnel"},
		},
	}
	gaps, _ := coverage.ClassifyGaps(report)
	return Speech{State: "current", Reasons: []string{}, RecordID: "rec-1", Gaps: gaps}
}

func acceptedFinding(id string, category findings.Category, noteType findings.NoteType, paragraph string, start float64) findings.Finding {
	confidence := 0.82
	return findings.Finding{
		ID: id, Analyzer: "transcript-compare", Category: category, Confidence: &confidence, ConfidenceReason: "word_scores",
		TimeRange:  &findings.TimeRange{Start: start, End: start + 2},
		Manuscript: &findings.Manuscript{ChapterID: "c-0001", Expected: "the words", Span: &findings.Span{ParagraphID: paragraph}},
		Review:     findings.ReviewState{Status: findings.StatusAccepted, Type: noteType},
	}
}

type fixture struct {
	project  string
	findings []findings.Finding
	speech   map[string]Speech
	daw      *fakeDAW
}

func newFixture(t *testing.T) *fixture {
	return &fixture{
		project: t.TempDir(),
		findings: []findings.Finding{
			acceptedFinding("f-proof", findings.CategoryPickup, "", "p-1", 12),
			acceptedFinding("f-audio", findings.CategoryTranscriptDiscrepancy, findings.NoteNoise, "p-3", 50),
		},
		speech: map[string]Speech{"c-0001": currentSpeech()},
		daw:    &fakeDAW{},
	}
}

func (f *fixture) service() *Service {
	return New(Config{
		Project:  f.project,
		Chapters: func() ([]Chapter, error) { return []Chapter{chapterOne(), {ID: "c-0002"}}, nil },
		Speech: func(id string) Speech {
			if speech, ok := f.speech[id]; ok {
				return speech
			}
			return Speech{State: "never", Reasons: []string{"never_analyzed"}}
		},
		Findings: fakeFindings{all: f.findings},
		Locate:   func(_ string, p coverage.RegionPosition) (float64, bool) { return 100 + p.SourceTime, true },
		DAW:      f.daw,
		Reporter: &persist.Reporter{},
	})
}

func mustList(t *testing.T) func(List, error) List {
	return func(list List, err error) List {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		return list
	}
}

func bySource(list List) map[Source][]Pickup {
	out := map[Source][]Pickup{}
	for _, p := range list.Pickups {
		out[p.Source] = append(out[p.Source], p)
	}
	return out
}

func find(t *testing.T, list List, id string) Pickup {
	t.Helper()
	for _, p := range list.Pickups {
		if p.ID == id {
			return p
		}
	}
	t.Fatalf("%s is not in %+v", id, list.Pickups)
	return Pickup{}
}

func TestListMergesTheFourSources(t *testing.T) {
	f := newFixture(t)
	if _, err := f.service().Add("c-0001", 75, "the rabbit-hole went straight on"); err != nil {
		t.Fatal(err)
	}
	list := mustList(t)(f.service().List())
	if len(list.Pickups) != 5 {
		t.Fatalf("pickups = %+v", list.Pickups)
	}
	sources := bySource(list)
	if len(sources[SourceSpeech]) != 2 || len(sources[SourceProof]) != 1 || len(sources[SourceAudio]) != 1 || len(sources[SourceYou]) != 1 {
		t.Fatalf("sources = %+v", sources)
	}
	for _, p := range list.Pickups {
		if p.ChapterID != "c-0001" || p.Paragraph == nil || p.Time == nil || !p.Included || p.Done {
			t.Fatalf("pickup %+v", p)
		}
		if p.Source == SourceSpeech && *p.Paragraph == 3 {
			t.Fatalf("the unread tail became a pickup: %+v", p)
		}
	}
	speech := sources[SourceSpeech][0]
	if *speech.Paragraph != 1 || *speech.Time != 31.5 || speech.At == nil || *speech.At != 131.5 || speech.Gap != coverage.GapMissing || speech.Script != "in … mind" {
		t.Fatalf("speech pickup %+v", speech)
	}
	if you := sources[SourceYou][0]; *you.Paragraph != 3 || *you.Time != 75 || you.At != nil || you.Context != chapterOne().Paragraphs[3].Text {
		t.Fatalf("hand-added pickup %+v", you)
	}
	again := mustList(t)(f.service().List())
	for i := range list.Pickups {
		if again.Pickups[i].ID != list.Pickups[i].ID {
			t.Fatalf("ids moved: %v then %v", list.Pickups[i].ID, again.Pickups[i].ID)
		}
	}
}

func TestConfidenceIsANumberOrAReason(t *testing.T) {
	f := newFixture(t)
	if _, err := f.service().Add("c-0001", 1, "a line"); err != nil {
		t.Fatal(err)
	}
	for _, p := range mustList(t)(f.service().List()).Pickups {
		switch p.Source {
		case SourceSpeech:
			if p.Confidence != nil || p.ConfReason != coverage.ConfNoWordScores {
				t.Fatalf("speech %+v", p)
			}
		case SourceProof, SourceAudio:
			if p.Confidence == nil || *p.Confidence != 0.82 || p.ConfReason != "word_scores" {
				t.Fatalf("finding %+v", p)
			}
		case SourceYou:
			if p.Confidence != nil || p.ConfReason != ConfAddedByHand {
				t.Fatalf("by hand %+v", p)
			}
		}
	}
}

func TestStaleResultAddsNoSpeechPickups(t *testing.T) {
	f := newFixture(t)
	stale := currentSpeech()
	stale.State, stale.Reasons = "stale", []string{"item_trimmed"}
	f.speech["c-0001"] = stale
	list := mustList(t)(f.service().List())
	if got := bySource(list)[SourceSpeech]; len(got) != 0 {
		t.Fatalf("a stale check added %+v", got)
	}
	want := map[string]string{"c-0001": "stale", "c-0002": "never"}
	if len(list.LeftOut) != 2 {
		t.Fatalf("left out = %+v", list.LeftOut)
	}
	for _, left := range list.LeftOut {
		if want[left.ChapterID] != left.State || len(left.Reasons) == 0 {
			t.Fatalf("left out = %+v", list.LeftOut)
		}
	}
}

func TestAnAcceptedGapIsOnePickup(t *testing.T) {
	f := newFixture(t)
	gap := f.speech["c-0001"].Gaps[0]
	f.findings = append(f.findings, findings.Finding{
		ID: "f-gap", Analyzer: "recording-check", Category: findings.CategoryPickup, ConfidenceReason: coverage.ConfNoWordScores,
		Manuscript: &findings.Manuscript{ChapterID: "c-0001"}, Evidence: map[string]any{"gap_id": gap.ID, "evidence_key": "rec-1"},
		Review: findings.ReviewState{Status: findings.StatusAccepted},
	})
	list := mustList(t)(f.service().List())
	if len(list.Pickups) != 4 || find(t, list, speechID("c-0001", gap.ID)).FindingID != "f-gap" {
		t.Fatalf("pickups = %+v", list.Pickups)
	}
}

func TestOnlyDecidedPickupsComeFromFindings(t *testing.T) {
	f := newFixture(t)
	edit := acceptedFinding("f-edit", findings.CategoryPacing, "", "p-1", 3)
	extra := acceptedFinding("f-extra", findings.CategoryTranscriptDiscrepancy, "", "p-1", 4)
	extra.Evidence = map[string]any{"kind": "EXTRA"}
	open := acceptedFinding("f-open", findings.CategoryPickup, "", "p-1", 5)
	open.Review.Status = findings.StatusUnreviewed
	f.findings = append(f.findings, edit, extra, open)
	if got := len(mustList(t)(f.service().List()).Pickups); got != 4 {
		t.Fatalf("an edit, an extra or an undecided note became a pickup: %d", got)
	}
}

func TestAddByHandFindsItsParagraph(t *testing.T) {
	f := newFixture(t)
	s := f.service()
	for _, bad := range []struct {
		chapter string
		at      float64
		line    string
	}{{"c-0001", 1, "   "}, {"c-9999", 1, "a line"}, {"c-0001", 601, "a line"}, {"c-0001", -1, "a line"}} {
		if _, err := s.Add(bad.chapter, bad.at, bad.line); err == nil {
			t.Fatalf("accepted %+v", bad)
		}
	}
	list := mustList(t)(s.Add("c-0001", 20, "  SO SHE WAS CONSIDERING IN HER OWN thoughts  "))
	you := bySource(list)[SourceYou]
	if len(you) != 1 || *you[0].ParagraphID != "p-2" || you[0].Script != "SO SHE WAS CONSIDERING IN HER OWN thoughts" {
		t.Fatalf("you = %+v", you)
	}
	list = mustList(t)(s.Add("c-0001", 20, "SO SHE WAS CONSIDERING IN HER OWN thoughts"))
	if got := bySource(list)[SourceYou]; len(got) != 1 {
		t.Fatalf("two identical adds made %+v", got)
	}
	nowhere := mustList(t)(s.Add("c-0001", 30, "a line that starts like nothing"))
	for _, p := range bySource(nowhere)[SourceYou] {
		if p.Script == "a line that starts like nothing" && (p.ParagraphID != nil || p.Context != p.Script) {
			t.Fatalf("unmatched line %+v", p)
		}
	}
}

func TestRemoveAndIncludeAreStored(t *testing.T) {
	f := newFixture(t)
	speech := f.speech["c-0001"].Gaps[0]
	speechPickup := speechID("c-0001", speech.ID)
	mustList(t)(f.service().Remove("finding:f-proof"))
	mustList(t)(f.service().Remove(speechPickup))
	mustList(t)(f.service().SetIncluded("finding:f-audio", false))
	list := mustList(t)(New(f.service().config).List())
	if len(list.Pickups) != 2 || find(t, list, "finding:f-audio").Included {
		t.Fatalf("after a new service: %+v", list.Pickups)
	}
	if _, err := f.service().SetIncluded("finding:f-proof", true); !errors.Is(err, ErrUnknownPickup) {
		t.Fatalf("a removed pickup was changed: %v", err)
	}
	if _, err := f.service().Remove("finding:f-proof"); err != nil {
		t.Fatalf("removing twice: %v", err)
	}
	for _, id := range []string{"finding:nope", "../../etc/passwd", "", "/tmp/x"} {
		if _, err := f.service().Remove(id); err == nil {
			t.Fatalf("removed %q", id)
		}
	}

	added := mustList(t)(f.service().Add("c-0001", 5, "a line to read again"))
	you := bySource(added)[SourceYou][0]
	mustList(t)(f.service().Remove(you.ID))
	if got := bySource(mustList(t)(f.service().List()))[SourceYou]; len(got) != 0 {
		t.Fatalf("removed line still listed: %+v", got)
	}
	again := mustList(t)(f.service().Add("c-0001", 5, "a line to read again"))
	if got := bySource(again)[SourceYou]; len(got) != 1 || got[0].ID != you.ID {
		t.Fatalf("re-adding did not show it again: %+v", got)
	}
}

func TestDoneFollowsTheMarkersThenTheStore(t *testing.T) {
	f := newFixture(t)
	gap := f.speech["c-0001"].Gaps[0]
	id := speechID("c-0001", gap.ID)

	// The DAW is absent: done is kept here and waits for the marker.
	list := mustList(t)(f.service().SetDone(id, true))
	if p := find(t, list, id); !p.Done || !p.Waiting {
		t.Fatalf("absent DAW: %+v", p)
	}
	if p := find(t, list, "finding:f-proof"); p.Done {
		t.Fatalf("another pickup changed: %+v", p)
	}

	// The DAW answers with the marker still open: the next open finishes the write.
	f.daw.reachable, f.daw.listed = true, true
	f.daw.markers = []Marker{{At: 131.5, Done: false}, {At: 12, Done: true}}
	list = mustList(t)(f.service().List())
	if p := find(t, list, id); !p.Done || p.Waiting || len(f.daw.writes) != 1 || f.daw.writes[0] != "131.5 done" {
		t.Fatalf("finish the write: %+v writes %v", p, f.daw.writes)
	}
	// A marker the DAW lists as done is done here, though nothing here said so.
	if p := find(t, list, "finding:f-proof"); !p.Done {
		t.Fatalf("marker done not read: %+v", p)
	}

	// With the DAW answering, marking open goes through the marker; a refusal stores nothing.
	f.daw.markers[0].Done = true
	f.daw.refuse = errors.New("the project changed in REAPER; read it again")
	if _, err := f.service().SetDone(id, false); err == nil || !strings.Contains(err.Error(), "changed in REAPER") {
		t.Fatalf("refusal = %v", err)
	}
	if p := find(t, mustList(t)(f.service().List()), id); !p.Done || p.Waiting {
		t.Fatalf("a refused write changed the list: %+v", p)
	}
	f.daw.refuse = nil
	list = mustList(t)(f.service().SetDone(id, false))
	if p := find(t, list, id); p.Done || p.Waiting || f.daw.writes[len(f.daw.writes)-1] != "131.5 open" {
		t.Fatalf("write through: %+v %v", p, f.daw.writes)
	}

	// A pickup with no place in the project keeps its done state here even while the DAW answers.
	added := bySource(mustList(t)(f.service().Add("c-0001", 9, "a line by hand")))[SourceYou][0]
	if p := find(t, mustList(t)(f.service().SetDone(added.ID, true)), added.ID); !p.Done || p.Waiting {
		t.Fatalf("by hand: %+v", p)
	}
}

func TestOpenCountAgreesWithTheStageEngine(t *testing.T) {
	f := newFixture(t)
	f.speech = map[string]Speech{}
	dismissed := acceptedFinding("f-dismissed", findings.CategoryPickup, "", "p-2", 20)
	dismissed.Review.Status = findings.StatusDismissed
	gone := acceptedFinding("f-gone", findings.CategoryTranscriptDiscrepancy, "", "p-2", 22)
	gone.NotInLatestRun = true
	f.findings = append(f.findings, dismissed, gone)

	notDone := 0
	for _, p := range mustList(t)(f.service().List()).Pickups {
		if p.ChapterID == "c-0001" && !p.Done {
			notDone++
		}
	}
	var items []proofing.PickupItem
	for _, finding := range f.findings {
		if FixKind(finding) == FixPickup && finding.Review.Status != findings.StatusUnreviewed {
			items = append(items, proofing.PickupItem{FindingID: finding.ID, Category: finding.Category, Status: finding.Review.Status, NotInLatestRun: finding.NotInLatestRun})
		}
	}
	signal := proofing.PickupsSignal(proofing.PickupsInput{Sources: []proofing.SourceReport{{Analyzer: proofing.AnalyzerTranscriptCompare, Label: "Transcript Compare", Items: items}}})
	open := 0
	for _, evidence := range signal.Evidence {
		if evidence.Kind == proofing.EvidencePickup {
			open++
		}
	}
	if signal.State != stages.SignalNotMet || open != notDone || notDone != 3 {
		t.Fatalf("list not done %d, signal open %d (%s)", notDone, open, signal.Reason)
	}
}

func TestFileIsNarratorData(t *testing.T) {
	f := newFixture(t)
	path := File(f.project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := mustList(t)(f.service().List()); len(got.Pickups) != 4 {
		t.Fatalf("corrupt file: %+v", got)
	}
	kept, _ := filepath.Glob(path + ".corrupt-*")
	if len(kept) != 1 {
		t.Fatalf("corrupt copy not kept aside: %v", kept)
	}

	newer := []byte(`{"schemaVersion": 99, "removed": ["finding:f-proof"]}`)
	if err := os.WriteFile(path, newer, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service().List(); err == nil {
		t.Fatal("a newer file was read")
	}
	if _, err := f.service().Remove("finding:f-audio"); err == nil {
		t.Fatal("a newer file was changed")
	}
	if raw, _ := os.ReadFile(path); string(raw) != string(newer) {
		t.Fatalf("a newer file was overwritten: %s", raw)
	}

	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	mustList(t)(f.service().Remove("finding:f-audio"))
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("the temporary file was left: %v", err)
	}
	if raw, _ := os.ReadFile(path); !strings.Contains(string(raw), `"finding:f-audio"`) {
		t.Fatalf("file = %s", raw)
	}
}

func TestBindingsTakeIDsAndPlainTextOnly(t *testing.T) {
	f := newFixture(t)
	s := f.service()
	for _, line := range []string{strings.Repeat("a", MaxLineRunes+1), "two\nlines", "bell\x07", "tab\tinside"} {
		if _, err := s.Add("c-0001", 1, line); err == nil {
			t.Fatalf("accepted %q", line)
		}
	}
	if _, err := s.Add("c-0001", 1, strings.Repeat("é", MaxLineRunes)); err != nil {
		t.Fatalf("a line of %d characters: %v", MaxLineRunes, err)
	}
	path := filepath.Join(f.project, "secret.txt")
	if err := os.WriteFile(path, []byte("do not read"), 0o600); err != nil {
		t.Fatal(err)
	}
	list := mustList(t)(s.Add("c-0001", 1, path))
	for _, p := range bySource(list)[SourceYou] {
		if strings.Contains(p.Context, "do not read") || strings.Contains(p.Script, "do not read") {
			t.Fatalf("a path-shaped line was opened: %+v", p)
		}
	}
	for _, id := range []string{path, "you:" + path, "finding:../x"} {
		if _, err := s.SetDone(id, true); err == nil {
			t.Fatalf("SetDone took %q", id)
		}
	}
}

func TestNoProjectIsAnEmptyList(t *testing.T) {
	list := mustList(t)(New(Config{}).List())
	if list.Pickups == nil || list.LeftOut == nil || len(list.Pickups) != 0 {
		t.Fatalf("list = %+v", list)
	}
	if _, err := New(Config{}).Add("c", 1, "x"); err == nil {
		t.Fatal("added with no project")
	}
}
