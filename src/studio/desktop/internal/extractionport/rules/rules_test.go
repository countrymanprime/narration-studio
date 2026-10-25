package rules

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"desktop/internal/contractfile"
	"desktop/internal/extraction"
	"desktop/internal/extractionport"
	"desktop/internal/extractionport/extractionporttest"
	"desktop/internal/guide"
	"desktop/internal/port"
)

// goldenLines are testdata/suggest-lines.json as the rules give them: one compact JSON object per line.
func goldenLines(t *testing.T) []string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "suggest-lines.json"))
	if err != nil {
		t.Fatal(err)
	}
	var lines []json.RawMessage
	if err := json.Unmarshal(data, &lines); err != nil {
		t.Fatal(err)
	}
	out := make([]string, len(lines))
	for i, line := range lines {
		compact, _ := json.Marshal(line)
		out[i] = string(compact)
	}
	return out
}

// fake is a rules source whose rules give what mode says.
func fake(t *testing.T, mode string) (Source, *[]string) {
	t.Helper()
	var mu sync.Mutex
	var logged []string
	lines := func(ctx context.Context, manuscript, bible string) ([]string, error) {
		if manuscript != "m.json" || bible != "g.json" {
			return nil, errors.New("unexpected files " + manuscript + " " + bible)
		}
		switch mode {
		case "golden":
			return goldenLines(t), nil
		case "sample":
			return []string{`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"Alice","type":"","aliases":[],"description":"","appearsIn":[]},"confidence":null,"quotes":[{"paragraphId":"1-1","text":"Alice was beginning"}],"chapterId":"1","note":"The rules give no score for this."}`}, nil
		case "bad-quote":
			return []string{
				`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"Dawnspyre"},"confidence":null,"quotes":[{"paragraphId":"p-000001","text":"the road to Dawnspyre"}],"chapterId":"c-0001"}`,
				`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"Dawnspire"},"confidence":null,"quotes":[{"paragraphId":"p-000002","text":"Captain Arelian said"}],"chapterId":"c-0001"}`,
			}, nil
		case "unknown-kind":
			return []string{`{"source":"rules","rule":"new-name","payload":{"kind":"theme","name":"Loss"},"confidence":null,"quotes":[{"paragraphId":"p-000001","text":"Captain Arelian said"}]}`}, nil
		case "unknown-field":
			return []string{`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"Ash"},"confidence":null,"quotes":[],"status":"accepted"}`}, nil
		case "big-field":
			return []string{`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"` + strings.Repeat("A", MaxFieldBytes+1) + `"},"confidence":null,"quotes":[]}`}, nil
		case "long-line":
			return []string{`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"Ash","aliases":["` + strings.Repeat("a\",\"", MaxLineBytes/4) + `"]},"confidence":null,"quotes":[]}`}, nil
		case "flood":
			entry := `{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"` + strings.Repeat("A", 1000) + `"},"confidence":null,"quotes":[]}`
			return slices.Repeat([]string{entry}, MaxOutputBytes/len(entry)+10), nil
		case "hang":
			<-ctx.Done()
			return nil, ctx.Err()
		case "fail":
			return nil, errors.New("The manuscript has no readable text paragraphs.")
		}
		return nil, nil
	}
	return Source{
		Files:   func() (Files, error) { return Files{Manuscript: "m.json", Guide: "g.json"}, nil },
		Suggest: lines,
		Log:     func(s string) { mu.Lock(); logged = append(logged, s); mu.Unlock() },
	}, &logged
}

var book = extractionport.Input{Paragraphs: []extraction.Paragraph{
	{ID: "p-000001", ChapterID: "c-0001", Text: "Captain Arelian said the Council of Ash would meet in Dawnspire."},
	{ID: "p-000002", ChapterID: "c-0001", Text: "Later they saw Dawnspire burning. The road to Dawnspire was long, and Arelian rode it alone."},
	{ID: "p-000003", ChapterID: "c-0001", Text: "“We ride at dawn,” Ada said. Everyone knew Dawnspire well."},
}}

func extract(t *testing.T, source Source, ctx context.Context) ([]extractionport.Raw, error) {
	t.Helper()
	extractor, err := source.Extractor()
	if err != nil {
		t.Fatal(err)
	}
	return extractor.Extract(ctx, book)
}

func TestTheRulesLinesBecomeRawSuggestions(t *testing.T) {
	source, logged := fake(t, "golden")
	raws, err := extract(t, source, context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var kinds []extraction.Kind
	for _, raw := range raws {
		kinds = append(kinds, raw.Payload.Kind)
		for _, p := range extractionporttest.RawProblems(raw, true) {
			t.Error(p)
		}
	}
	if want := []extraction.Kind{extraction.KindAlias, extraction.KindEntry, extraction.KindEntry, extraction.KindSpeaker}; !slices.Equal(kinds, want) {
		t.Fatalf("kinds = %v, want %v (logged %q)", kinds, want, *logged)
	}
	alias, speaker := raws[0], raws[3]
	if alias.Payload.Entry != "Arelian" || alias.Payload.Alias != "Captain Arelian" || alias.Confidence != nil || alias.Note == "" {
		t.Errorf("alias = %+v", alias)
	}
	if speaker.Payload.Speaker != "Ada" || speaker.Payload.Quote != "“We ride at dawn,”" || speaker.Confidence == nil || *speaker.Confidence != 0.96 {
		t.Errorf("speaker = %+v", speaker)
	}
	if want := (extractionport.Quote{ParagraphID: "p-000003", Text: "“We ride at dawn,” Ada said"}); !slices.Equal(speaker.Quotes, []extractionport.Quote{want}) {
		t.Errorf("speaker quotes = %+v", speaker.Quotes)
	}
	if speaker.ChapterID != "c-0001" {
		t.Errorf("chapter = %q", speaker.ChapterID)
	}
}

func TestAQuoteThatIsNotInItsParagraphIsDroppedWithALogLine(t *testing.T) {
	source, logged := fake(t, "bad-quote")
	raws, err := extract(t, source, context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(raws) != 0 {
		t.Fatalf("raws = %+v, want both dropped (one is not in the book, one is in another paragraph)", raws)
	}
	if len(*logged) != 2 || !strings.Contains((*logged)[0], "Dawnspyre") {
		t.Fatalf("logged = %q", *logged)
	}
}

func TestOutputBreakingTheContractIsRefused(t *testing.T) {
	for mode, want := range map[string]string{
		"unknown-kind":  `kind "theme"`,
		"unknown-field": `unknown field "status"`,
		"big-field":     "field over",
		"long-line":     "line over",
		"flood":         "more than",
		"fail":          "the rules could not look for suggestions: The manuscript has no readable text paragraphs",
	} {
		t.Run(mode, func(t *testing.T) {
			source, _ := fake(t, mode)
			raws, err := extract(t, source, context.Background())
			if err == nil || !strings.Contains(err.Error(), want) || raws != nil {
				t.Fatalf("Extract = (%v, %v), want an error containing %q", raws, err, want)
			}
		})
	}
}

func TestCancellingStopsARunThatNeverEnds(t *testing.T) {
	source, _ := fake(t, "hang")
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := extract(t, source, ctx); done <- err }()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("err = %v, want context.Canceled", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Extract did not return after cancellation")
	}
}

func TestFilesThatCannotBeFoundAreAnError(t *testing.T) {
	source, _ := fake(t, "golden")
	source.Files = func() (Files, error) { return Files{}, errors.New("Save the REAPER project first.") }
	if _, err := extract(t, source, context.Background()); err == nil || err.Error() != "Save the REAPER project first." {
		t.Fatalf("err = %v", err)
	}
}

func TestAnUnconfiguredSourceIsUnavailableWithAReason(t *testing.T) {
	a := (Source{}).Available()
	if a.OK || a.Reason == "" {
		t.Fatalf("Available = %+v", a)
	}
	if _, err := (Source{}).Extractor(); !errors.Is(err, port.ErrNotSupported) {
		t.Fatalf("Extractor err = %v", err)
	}
}

func TestTheRulesRowPassesThePortConformanceSuite(t *testing.T) {
	source, _ := fake(t, "sample")
	r := &port.Registry[extractionport.Source]{Kind: "extraction source"}
	r.Register(Entry(source))
	extractionporttest.Run(t, r)
	if got := extractionport.RunnableNamesIn(r); !slices.Equal(got, []string{extractionport.Rules}) {
		t.Fatalf("runnable = %v", got)
	}
	if entry, _ := r.Lookup(extractionport.Rules); entry.Descriptor.Label != "Rules" {
		t.Fatalf("label = %q", entry.Descriptor.Label)
	}
}

func TestTheRowMatchesTheProgramsRulesRow(t *testing.T) {
	builtin, err := extractionport.Sources.Lookup(extractionport.Rules)
	if err != nil {
		t.Fatal(err)
	}
	ours, theirs := Entry(Source{}), builtin.New()
	mine := ours.New()
	if ours.Descriptor.Label != builtin.Descriptor.Label || mine.Icon() != theirs.Icon() || mine.Runs() != theirs.Runs() ||
		mine.Scored() != theirs.Scored() || !slices.Equal(mine.Assets(), theirs.Assets()) {
		t.Fatalf("the rules row differs from the program's: %+v / %+v", ours.Descriptor, builtin.Descriptor)
	}
}

// contractBook writes the manuscript and Story Bible the suggest-lines contract file was recorded from (the sidecar's
// test_contract_goldens.py, and the suggest-lines-contract case of tests/fixtures/guide-rules) and gives their paths.
func contractBook(t *testing.T) Files {
	t.Helper()
	dir := t.TempDir()
	var paragraphs []map[string]any
	for i, text := range []string{book.Paragraphs[0].Text, book.Paragraphs[1].Text, book.Paragraphs[2].Text} {
		paragraphs = append(paragraphs, map[string]any{"id": book.Paragraphs[i].ID, "chapterId": "c-0001", "chapterTitle": "Chapter 1", "text": text})
	}
	manuscript, _ := json.Marshal(map[string]any{"schemaVersion": 1, "documentId": "d", "chapters": []any{map[string]any{"id": "c-0001", "title": "Chapter 1"}}, "paragraphs": paragraphs})
	bible, _ := json.Marshal(map[string]any{"entities": []any{
		map[string]any{"id": "entity-ada", "canonical_name": "Ada", "category": "Character", "aliases": []any{}},
		map[string]any{"id": "entity-arelian", "canonical_name": "Arelian", "category": "Character", "aliases": []any{}},
	}})
	files := Files{Manuscript: filepath.Join(dir, "manuscript.json"), Guide: filepath.Join(dir, "manuscript_guide.json")}
	if os.WriteFile(files.Manuscript, manuscript, 0o600) != nil || os.WriteFile(files.Guide, bible, 0o600) != nil {
		t.Fatal("write the contract book")
	}
	return files
}

// TestTheSuggestLinesMatchTheContractFile writes testdata/suggest-lines.json, one line of each kind the rules give, which the
// sidecar's test_contract_goldens.py wrote before the rules moved here (the same bytes).
func TestTheSuggestLinesMatchTheContractFile(t *testing.T) {
	files := contractBook(t)
	lines, err := guide.RuleSuggestions(context.Background(), files.Manuscript, files.Guide)
	if err != nil {
		t.Fatal(err)
	}
	values := make([]any, len(lines))
	kinds := map[string]bool{}
	for i, line := range lines {
		if err := json.Unmarshal([]byte(line), &values[i]); err != nil {
			t.Fatal(err)
		}
		kinds[values[i].(map[string]any)["payload"].(map[string]any)["kind"].(string)] = true
	}
	if len(kinds) != 3 {
		t.Fatalf("kinds = %v, want entry, alias and speaker", kinds)
	}
	contractfile.CheckIn(t, "testdata", "suggest-lines", values)
}

// TestTheRealRulesReadTheProjectsFiles runs the source as the host registers it, with no Suggest: the rules read the files
// themselves and every suggestion passes the evidence check.
func TestTheRealRulesReadTheProjectsFiles(t *testing.T) {
	files := contractBook(t)
	var logged []string
	source := Source{Files: func() (Files, error) { return files, nil }, Log: func(s string) { logged = append(logged, s) }}
	raws, err := extract(t, source, context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(raws) != len(goldenLines(t)) || len(logged) != 0 {
		t.Fatalf("raws = %+v, logged %q", raws, logged)
	}
	files.Manuscript = filepath.Join(t.TempDir(), "missing.json")
	if _, err := extract(t, source, context.Background()); err == nil || err.Error() != "the rules could not look for suggestions: Import a manuscript first" {
		t.Fatalf("a missing manuscript: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := extract(t, source, ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled: %v", err)
	}
}
