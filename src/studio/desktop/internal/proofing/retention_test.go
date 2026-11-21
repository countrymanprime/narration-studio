package proofing

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"desktop/internal/evidence"
	"desktop/internal/stages"
)

// retentionKeys is the keys of this package's analyzers.
var retentionKeys = map[string]evidence.RetentionKey{
	AnalyzerTranscriptCompare: ComparisonRetentionKey, AnalyzerRenderMeasurement: RenderMeasurementRetentionKey,
}

// mixedOutcome is one of the three outcomes, picked by a seed and a position, so a loop over seeds covers every mix of
// its first three positions.
func mixedOutcome(seed, position int) evidence.LedgerOutcome {
	outcomes := []evidence.LedgerOutcome{evidence.LedgerComplete, evidence.LedgerPartial, evidence.LedgerFailed}
	for range position % 3 {
		seed /= 3
	}
	return outcomes[(seed+position/3)%3]
}

func retainAll(t *testing.T, ledger *evidence.LedgerStore) []evidence.LedgerRecord {
	t.Helper()
	dropped, err := ledger.Retain(retentionKeys, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	return dropped
}

func payloadOf(t *testing.T, payload any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

// ComparisonJudge answers the same for every chapter before Retain and after it: runs of two chapters with every mix
// of outcomes, runs whose title matched more than one chapter (no chapter id) under two titles and two documents, a
// run with no chapter id that is not ambiguous, and one whose payload does not decode.
func TestRetainLeavesComparisonJudgeItsAnswer(t *testing.T) {
	chapters := []stages.ChapterContext{
		proofingChapter(),
		{DocumentID: testDocument, ChapterID: "c-0002", Title: " Chapter Two ", Status: stages.StageProofing},
		{DocumentID: testDocument, ChapterID: "c-0003", Title: "Chapter Two", Status: stages.StageProofing},
		{DocumentID: "doc-2", ChapterID: "c-0001", Title: "Chapter One", Status: stages.StageProofing},
		// A chapter with no run of its own: only a run with no chapter id can speak for it.
		{DocumentID: testDocument, ChapterID: "c-0004", Title: "Chapter One", Status: stages.StageProofing},
	}
	type run struct{ document, chapter, title, resolution string }
	runs := []run{
		{testDocument, testChapter, "Chapter One", ResolutionResolved},
		{testDocument, "", "Chapter Two", ResolutionAmbiguous},
		{testDocument, "c-0002", "Chapter Two", ResolutionResolved},
		{testDocument, "", "Chapter One", ResolutionAmbiguous},
		{"doc-2", "", "Chapter One", ResolutionAmbiguous},
		{testDocument, "", "Chapter One", ResolutionResolved},
		{"doc-2", testChapter, "Chapter One", ResolutionResolved},
	}
	dropped := 0
	for seed := range 27 {
		f := newCompareFixture(t)
		at := runStarted
		for pass := range 4 {
			for index, r := range runs {
				at = at.Add(time.Second)
				// The runs with no chapter id take turns at being newest, so each title's ambiguous run is at times
				// newer than the chapter's own and at times older.
				if r.chapter == "" && (pass+index)%2 == 0 {
					continue
				}
				record := evidence.LedgerRecord{
					AnalyzerID: AnalyzerTranscriptCompare, AnalyzerVersion: ComparisonAnalyzerVersion, Outcome: mixedOutcome(seed, pass+index),
					Scope: evidence.LedgerScope{DocumentID: r.document, ChapterID: r.chapter}, StartedAt: at, CompletedAt: at.Add(time.Minute),
					Payload: payloadOf(t, ComparisonPayload{ChapterTitle: r.title, Resolution: r.resolution, Compared: []ComparedItem{{Path: f.audioA, Length: 10}}}),
				}
				if _, err := f.ledger.Write(record); err != nil {
					t.Fatal(err)
				}
			}
		}
		for _, chapterID := range []string{testChapter, ""} {
			if _, err := f.ledger.Write(evidence.LedgerRecord{
				ID: "undecodable-" + chapterID, AnalyzerID: AnalyzerTranscriptCompare, Outcome: evidence.LedgerFailed, StartedAt: runStarted, Payload: json.RawMessage(`"not a payload"`),
				Scope: evidence.LedgerScope{DocumentID: testDocument, ChapterID: chapterID},
			}); err != nil {
				t.Fatal(err)
			}
		}

		type answer struct {
			status RunStatus
			covers bool
		}
		read := func() []answer {
			answers := []answer{}
			for _, chapter := range chapters {
				judgement, err := ComparisonJudge(t.Context(), chapter, f.savedView())
				if err != nil {
					t.Fatal(err)
				}
				answers = append(answers, answer{judgement.Status, judgement.Covers != nil})
			}
			return answers
		}
		before := read()
		dropped += len(retainAll(t, f.ledger))
		if after := read(); !reflect.DeepEqual(after, before) {
			t.Fatalf("mix %d: ComparisonJudge answers\n%+v\nafter Retain, was\n%+v", seed, after, before)
		}
		if _, kept := f.ledger.Get("undecodable-"); !kept {
			t.Fatalf("mix %d: the run with no chapter id whose payload does not decode is gone", seed)
		}
	}
	if dropped == 0 {
		t.Fatal("Retain dropped nothing in any mix, so the test compared nothing")
	}
}

// EvaluateRender answers the same before Retain and after it: measurements of the chosen render and of another one,
// in two documents, with every mix of outcomes, and one whose payload does not decode.
func TestRetainLeavesEvaluateRenderItsAnswer(t *testing.T) {
	type measurement struct{ document, key string }
	dropped := 0
	for seed := range 27 {
		f := newRenderFixture(t)
		association := f.attest(t, f.render)
		measurements := []measurement{
			{testDocument, association.Render.Key}, {testDocument, "another-render"}, {"doc-2", association.Render.Key},
		}
		at := attestedAt
		report := wavReport(f.render)
		for pass := range 4 {
			for index, m := range measurements {
				at = at.Add(time.Second)
				outcome := mixedOutcome(seed, pass+index)
				payload := RenderMeasurementPayload{RenderKey: m.key, Path: f.render}
				if outcome == evidence.LedgerComplete {
					payload.Report = &report
				}
				if _, err := f.ledger.Write(evidence.LedgerRecord{
					AnalyzerID: AnalyzerRenderMeasurement, Outcome: outcome, StartedAt: at, CompletedAt: at.Add(time.Minute),
					Scope: evidence.LedgerScope{DocumentID: m.document, ChapterID: testChapter}, Payload: payloadOf(t, payload),
				}); err != nil {
					t.Fatal(err)
				}
			}
		}
		if _, err := f.ledger.Write(evidence.LedgerRecord{
			ID: "undecodable", AnalyzerID: AnalyzerRenderMeasurement, Outcome: evidence.LedgerComplete, StartedAt: attestedAt, Payload: json.RawMessage(`7`),
			Scope: evidence.LedgerScope{DocumentID: testDocument, ChapterID: testChapter},
		}); err != nil {
			t.Fatal(err)
		}

		before := f.evaluate(t)
		if len(before.RecordIDs) != 1 {
			t.Fatalf("mix %d: the render's status names %v, want its newest measurement", seed, before.RecordIDs)
		}
		dropped += len(retainAll(t, f.ledger))
		if after := f.evaluate(t); !reflect.DeepEqual(after, before) {
			t.Fatalf("mix %d: EvaluateRender answers\n%+v\nafter Retain, was\n%+v", seed, after, before)
		}
		if _, kept := f.ledger.Get("undecodable"); !kept {
			t.Fatalf("mix %d: the measurement whose payload does not decode is gone", seed)
		}
	}
	if dropped == 0 {
		t.Fatal("Retain dropped nothing in any mix, so the test compared nothing")
	}
}

func TestRetentionKeysNameWhatTheirReadersMatchOn(t *testing.T) {
	comparison := func(chapterID string, payload string) evidence.LedgerRecord {
		return evidence.LedgerRecord{Scope: evidence.LedgerScope{ChapterID: chapterID}, Payload: json.RawMessage(payload)}
	}
	for name, c := range map[string]struct {
		key    evidence.RetentionKey
		record evidence.LedgerRecord
		group  string
		ok     bool
	}{
		"a chapter's run":                        {ComparisonRetentionKey, comparison("c-0001", `{"chapterTitle":"One","resolution":"resolved"}`), "", true},
		"a chapter's run with no payload":        {ComparisonRetentionKey, comparison("c-0001", ``), "", true},
		"an ambiguous run":                       {ComparisonRetentionKey, comparison("", `{"chapterTitle":"One","resolution":"ambiguous"}`), "ambiguous\x00One", true},
		"a run with no chapter and no payload":   {ComparisonRetentionKey, comparison("", ``), "", false},
		"a run with no chapter and a bad one":    {ComparisonRetentionKey, comparison("", `{`), "", false},
		"a measurement":                          {RenderMeasurementRetentionKey, evidence.LedgerRecord{Payload: json.RawMessage(`{"renderKey":"key-a"}`)}, "key-a", true},
		"a measurement with no payload":          {RenderMeasurementRetentionKey, evidence.LedgerRecord{}, "", false},
		"a measurement whose payload is not one": {RenderMeasurementRetentionKey, evidence.LedgerRecord{Payload: json.RawMessage(`7`)}, "", false},
	} {
		t.Run(name, func(t *testing.T) {
			if group, ok := c.key(c.record); group != c.group || ok != c.ok {
				t.Fatalf("key = %q, %v; want %q, %v", group, ok, c.group, c.ok)
			}
		})
	}
}
