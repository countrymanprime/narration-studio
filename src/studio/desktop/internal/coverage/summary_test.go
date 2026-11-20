package coverage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/evidence"
)

// summaryFixture is a project with one finished check, the record's id, and the paths of its result and its summary.
func summaryFixture(t *testing.T) (p *testProject, recordID, resultPath, summaryPath string) {
	t.Helper()
	p = newTestProject(t)
	run(t, p.service(&fakeSidecar{present: 6}), testRequest())
	recordID = latestRecord(t, p).ID
	return p, recordID, filepath.Join(resultsDir(p.dir), recordID+".json"), filepath.Join(summariesDir(p.dir), recordID+".json")
}

// decodedResults is how many stored results the service holds decoded: a result that was read is kept (resultCache).
func decodedResults(service *Service) int {
	service.results.cache.mu.Lock()
	defer service.results.cache.mu.Unlock()
	return len(service.results.cache.entries)
}

// A finished check stores a summary beside its result: what a read of every chapter needs, and nothing that is judged on
// read. coverage-result-summary.json is the file as stored (UPDATE_CONTRACTS=1 rewrites it).
func TestAFinishedCheckStoresTheSummaryOfItsResult(t *testing.T) {
	p, recordID, _, _ := summaryFixture(t)
	fresh := p.service(&fakeSidecar{})
	stored, ok := fresh.summaries.read(recordID)
	if !ok {
		t.Fatal("no summary was stored for the finished check")
	}
	result, ok := fresh.results.read(recordID)
	if !ok {
		t.Fatal("the stored result is not readable")
	}
	if want := summarize(result); !reflect.DeepEqual(stored, want) {
		t.Fatalf("stored summary\n%+v\nsummary of the stored result\n%+v", stored, want)
	}
	if stored.SchemaVersion != resultSummaryVersion || stored.RecordID != recordID || stored.ManuscriptHash == "" || len(stored.Paragraphs) == 0 || stored.Gaps == nil {
		t.Fatalf("summary = %+v", stored)
	}
	stable, err := contractfile.Stabilize(stored)
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "coverage-result-summary", stable)
}

// The chapter list's read answers from the summary: no stored result is decoded for it, in the service that ran the check
// or in one started later, and the answer is the one the stored result gives.
func TestAReadOfEveryChapterDecodesNoStoredResult(t *testing.T) {
	p, recordID, _, _ := summaryFixture(t)
	fresh := p.service(&fakeSidecar{})
	fractions, paragraphs := fresh.Current(DefaultAlignmentParams)
	if decoded := decodedResults(fresh); decoded != 0 {
		t.Fatalf("the read decoded %d stored results, want 0", decoded)
	}
	result, _ := fresh.results.read(recordID)
	if len(fractions) != 1 || fractions[testChapter] != result.Report.PresentFraction() || !reflect.DeepEqual(paragraphs[testChapter], result.Report.Paragraphs) {
		t.Fatalf("fractions = %v, paragraphs = %v; the stored result gives %v and %v", fractions, paragraphs, result.Report.PresentFraction(), result.Report.Paragraphs)
	}
}

// A summary that is missing or cannot be used is rebuilt from its result, stored again, and the read answers as before.
func TestASummaryThatCannotBeUsedIsRebuiltFromItsResult(t *testing.T) {
	cases := map[string]func(t *testing.T, path, otherRecord string){
		"missing (a result from before summaries)": func(t *testing.T, path, _ string) {
			if err := os.Remove(path); err != nil {
				t.Fatal(err)
			}
		},
		"not JSON": func(t *testing.T, path, _ string) { writeBytes(t, path, []byte("{\"schemaVersion\": 1, \"recor")) },
		"empty":    func(t *testing.T, path, _ string) { writeBytes(t, path, nil) },
		"another version": func(t *testing.T, path, _ string) {
			rewriteSummary(t, path, func(s *ResultSummary) { s.SchemaVersion++ })
		},
		"of a result of another version": func(t *testing.T, path, _ string) {
			rewriteSummary(t, path, func(s *ResultSummary) { s.ResultVersion++ })
		},
		"another record's": func(t *testing.T, path, other string) {
			rewriteSummary(t, path, func(s *ResultSummary) { s.RecordID = other; s.Summary.PresentTokens = 0 })
		},
	}
	for name, spoil := range cases {
		t.Run(name, func(t *testing.T) {
			p, recordID, _, summaryPath := summaryFixture(t)
			want, _ := p.service(&fakeSidecar{}).Current(DefaultAlignmentParams)
			spoil(t, summaryPath, "0123456789abcdef0123456789abcdef")

			first := p.service(&fakeSidecar{})
			if got, _ := first.Current(DefaultAlignmentParams); len(want) != 1 || !reflect.DeepEqual(got, want) {
				t.Fatalf("fractions = %v, want %v", got, want)
			}
			if decodedResults(first) != 1 {
				t.Fatalf("the rebuild decoded %d results, want 1", decodedResults(first))
			}
			second := p.service(&fakeSidecar{})
			if rebuilt, ok := second.summaries.read(recordID); !ok || rebuilt.RecordID != recordID {
				t.Fatalf("the rebuilt summary was not stored: %+v, %v", rebuilt, ok)
			}
			if got, _ := second.Current(DefaultAlignmentParams); !reflect.DeepEqual(got, want) || decodedResults(second) != 0 {
				t.Fatalf("after the rebuild fractions = %v with %d results decoded, want %v and 0", got, decodedResults(second), want)
			}
		})
	}
}

// A summary never stands in for a result that is gone: the chapter reads as never checked, as it does for every other reader.
func TestASummaryWhoseResultIsGoneAnswersNothing(t *testing.T) {
	p, _, resultPath, _ := summaryFixture(t)
	service := p.service(&fakeSidecar{})
	if fractions, _ := service.Current(DefaultAlignmentParams); len(fractions) != 1 {
		t.Fatalf("fractions before = %v", fractions)
	}
	if err := os.Remove(resultPath); err != nil {
		t.Fatal(err)
	}
	if fractions, _ := service.Current(DefaultAlignmentParams); len(fractions) != 0 {
		t.Fatalf("fractions = %v with the result gone, want none", fractions)
	}
}

// Whether a check is current is not in the summary: a read through it gives the state and reasons a read of the result gives,
// for a current check, a text edit, changed settings and a result that is gone.
func TestAReadThroughTheSummaryJudgesAsAReadOfTheResultDoes(t *testing.T) {
	changes := map[string]func(p *testProject, resultPath string) AlignmentParams{
		"current": func(*testProject, string) AlignmentParams { return DefaultAlignmentParams },
		"the text was edited": func(p *testProject, _ string) AlignmentParams {
			p.writeManuscript(testDocument, "Chapter One", "Alice was not tired at all.")
			return DefaultAlignmentParams
		},
		"the settings changed": func(*testProject, string) AlignmentParams {
			changed := DefaultAlignmentParams
			changed.MaxMisreadRun++
			return changed
		},
		"the result is gone": func(_ *testProject, resultPath string) AlignmentParams {
			_ = os.Remove(resultPath)
			return DefaultAlignmentParams
		},
	}
	for name, change := range changes {
		t.Run(name, func(t *testing.T) {
			p, _, resultPath, _ := summaryFixture(t)
			alignment := change(p, resultPath)
			service := p.service(&fakeSidecar{})
			project, projectFile, err := service.savedProject()
			if err != nil {
				t.Fatal(err)
			}
			basis, err := service.chapter(testChapter)
			if err != nil {
				t.Fatal(err)
			}
			full, err := service.evaluate(service.asked(), project, projectFile, basis, alignment)
			if err != nil {
				t.Fatal(err)
			}
			light, summary, err := service.evaluateSummary(service.asked(), project, projectFile, basis, alignment)
			if err != nil {
				t.Fatal(err)
			}
			if light.State != full.State || !reflect.DeepEqual(light.Reasons, full.Reasons) || (summary != nil) != (full.Result != nil) {
				t.Fatalf("through the summary: %s %v (summary %v); through the result: %s %v (result %v)", light.State, light.Reasons, summary != nil, full.State, full.Reasons, full.Result != nil)
			}
			if name == "current" && full.State != evidence.StateCurrent {
				t.Fatalf("the fixture's check is %s, want current", full.State)
			}
		})
	}
}

func writeBytes(t *testing.T, path string, content []byte) {
	t.Helper()
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
}

// rewriteSummary changes the stored summary at path through the store's own encoding.
func rewriteSummary(t *testing.T, path string, change func(*ResultSummary)) {
	t.Helper()
	store := &summaryStore{dir: filepath.Dir(path)}
	summary, ok := store.read(filepath.Base(path[:len(path)-len(".json")]))
	if !ok {
		t.Fatalf("no summary at %s", path)
	}
	change(&summary)
	encoded, err := json.Marshal(summary)
	if err != nil {
		t.Fatal(err)
	}
	writeBytes(t, path, encoded)
}
