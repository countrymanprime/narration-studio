package main

import (
	"encoding/json"
	"go/parser"
	"go/token"
	"os"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/apply"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/importer"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/store"
)

// importFile is a file an LLM might write about extractionParagraphs, against extractionHost's Story Bible: a new entry with a claim
// about it, a merge, an entry already there, a locked entry, a claim already offered, an entry rejected before, a speaker whose quote
// uses plain quote marks where the manuscript has curly ones, a path-shaped description, and a property about no one.
const importFile = `{
  "entries": [
    {"name": "The Cheshire Cat", "type": "Character", "aliases": ["Cat"], "description": "C:\\Windows\\system32\\cmd.exe", "confidence": 0.9,
     "claims": [{"kind": "act", "text": "Grins", "evidence": "taking a watch out of its waistcoat-pocket", "paragraph": "p-000001", "confidence": 0.8}]},
    {"name": "White Rabbit", "aliases": ["Mr Rabbit"], "confidence": 0.95,
     "claims": [{"kind": "talk", "text": "Worries about being late", "confidence": 0.9}]},
    {"name": "Alice", "confidence": 0.9},
    {"name": "The Duchess", "aliases": ["Duchess"], "confidence": 0.9},
    {"name": "The Dodo", "type": "Character", "confidence": 0.9},
    {"name": "Bill", "properties": [{"key": "Job", "value": "Lizard", "confidence": 0.3}], "relationships": [{"to": "Nobody", "relation": "knows"}]}
  ],
  "speakers": [
    {"quote": "\"Oh dear! Oh dear! I shall be late!\"", "speaker": "White Rabbit", "paragraph": "p-000001", "confidence": 0.9}
  ]
}`

// importHost is extractionHost with the manuscript's paragraphs and chapters and The Dodo rejected.
func importHost(t *testing.T) (*Host, *apply.FakeBible) {
	t.Helper()
	host, bible := extractionHost(t)
	host.extractionParagraphs = func() ([]extraction.Paragraph, error) { return extractionParagraphs, nil }
	host.extractionChapters = func() ([]importer.Chapter, error) {
		return []importer.Chapter{{ID: "c-0001", Number: 1, Title: "Down the Rabbit-Hole"}, {ID: "c-0002", Number: 2, Title: "Pig and Pepper"}}, nil
	}
	decodeDecision(t)(host.ExtractionReject(suggestionAbout(t, host, "The Dodo").ID))
	return host, bible
}

func decodeImportPlan(t *testing.T) func(string, error) ExtractionImportPlan {
	return func(payload string, err error) ExtractionImportPlan {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var plan ExtractionImportPlan
		if err := json.Unmarshal([]byte(payload), &plan); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return plan
	}
}

func decodeImportResult(t *testing.T) func(string, error) ExtractionImportResult {
	return func(payload string, err error) ExtractionImportResult {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var result ExtractionImportResult
		if err := json.Unmarshal([]byte(payload), &result); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return result
	}
}

func importLine(t *testing.T, plan ExtractionImportPlan, label string) ExtractionImportLine {
	t.Helper()
	for _, l := range plan.Lines {
		if l.Label == label {
			return l
		}
	}
	t.Fatalf("no line %q in %+v", label, plan.Lines)
	return ExtractionImportLine{}
}

func storedSnapshot(t *testing.T, host *Host) string {
	t.Helper()
	list, err := host.ExtractionList()
	if err != nil {
		t.Fatal(err)
	}
	return list
}

func bibleSnapshot(t *testing.T, host *Host) string {
	t.Helper()
	entries, err := host.extractionBibleOf().Entries()
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(entries)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}

func TestExtractionImportPreviewReturnsThePlanAndTheErrors(t *testing.T) {
	host, _ := importHost(t)
	stored, bible := storedSnapshot(t, host), bibleSnapshot(t, host)
	plan := decodeImportPlan(t)(host.ExtractionImportPreview(importFile, ""))

	if plan.Format != importer.FormatJSON {
		t.Fatalf("format = %q, want json (detected)", plan.Format)
	}
	want := map[string]struct {
		action importer.Action
		status extraction.Status
		note   string
	}{
		"The Cheshire Cat · Character":                {importer.ActionAdd, extraction.StatusAcceptedAuto, ""},
		"The Cheshire Cat does: Grins":                {importer.ActionAdd, extraction.StatusAcceptedAuto, ""},
		"White Rabbit":                                {importer.ActionMerge, extraction.StatusAcceptedAuto, "adds Mr Rabbit."},
		"White Rabbit says: Worries about being late": {importer.ActionSkip, "", "Already suggested"},
		"Alice":                {importer.ActionSkip, "", "Already in the Story Bible"},
		"The Duchess":          {importer.ActionSkip, "", "Locked entry; it is not edited"},
		"The Dodo · Character": {importer.ActionSkip, "", "Rejected before"},
		"Bill":                 {importer.ActionAdd, extraction.StatusNeedsVerification, string(extraction.ReasonNoConfidence)},
		"Bill: Job = Lizard":   {importer.ActionAdd, extraction.StatusNeedsVerification, ""},
		"White Rabbit: \"Oh dear! Oh dear! I shall be late!\"": {importer.ActionAdd, extraction.StatusAcceptedAuto, ""},
	}
	if len(plan.Lines) != len(want) {
		t.Fatalf("lines = %+v", plan.Lines)
	}
	for label, w := range want {
		l := importLine(t, plan, label)
		if l.Action != w.action || l.Status != w.status || (w.note != "" && !strings.Contains(l.Note, w.note)) {
			t.Errorf("%s = %+v, want %+v", label, l, w)
		}
		if l.Row < 1 || l.Where == "" || l.Kind == "" {
			t.Errorf("%s has no place in the file: %+v", label, l)
		}
	}
	if c := importLine(t, plan, "The Cheshire Cat · Character").Confidence; c == nil || *c != 0.9 {
		t.Fatalf("confidence = %v", c)
	}
	if c := importLine(t, plan, "Bill").Confidence; c != nil {
		t.Fatalf("a row with no confidence has one: %v", *c)
	}
	if len(plan.Errors) != 1 || !strings.Contains(plan.Errors[0].Reason, "“Nobody”") || plan.Errors[0].Row == 0 || plan.Errors[0].Where == "" {
		t.Fatalf("errors = %+v", plan.Errors)
	}
	if plan.Offered != 6 {
		t.Fatalf("offered = %d, want the 6 lines that add or merge", plan.Offered)
	}
	if storedSnapshot(t, host) != stored || bibleSnapshot(t, host) != bible {
		t.Fatal("the preview wrote something")
	}
}

func TestExtractionImportCommitRecomputesAndNeverTrustsThePage(t *testing.T) {
	commit := reflect.TypeOf((*Host).ExtractionImportCommit)
	if commit.NumIn() != 3 || commit.In(1).Kind() != reflect.String || commit.In(2).Kind() != reflect.String {
		t.Fatalf("ExtractionImportCommit takes %v, want (text, hint string) only", commit)
	}
	host, _ := importHost(t)
	plan := decodeImportPlan(t)(host.ExtractionImportPreview(importFile, "json"))
	if importLine(t, plan, "Bill: Job = Lizard").Action != importer.ActionAdd {
		t.Fatal("the preview should add Bill's job")
	}
	// Between the preview and the commit, Bill's job is offered and rejected some other way: the commit plans again and skips it.
	suggestions := host.extractionStore()
	added, err := suggestions.Ingest(store.SourceRules, []store.Raw{{Payload: store.Payload{Kind: extraction.KindProperty, Entry: "Bill", Key: "Job", Value: "Lizard"}}},
		store.Context{Paragraphs: extractionParagraphs})
	if err != nil || len(added.Added) != 1 {
		t.Fatal(added, err)
	}
	decodeDecision(t)(host.ExtractionReject(added.Added[0].ID))

	result := decodeImportResult(t)(host.ExtractionImportCommit(importFile, "json"))
	if len(result.Suggestions) != plan.Offered-1 {
		t.Fatalf("committed %d, want %d: %+v", len(result.Suggestions), plan.Offered-1, result.Suggestions)
	}
	for _, s := range result.Suggestions {
		if s.Payload.Key == "Job" {
			t.Fatalf("the commit trusted the preview: %+v", s)
		}
	}
}

func TestExtractionImportTakesTextAndOpensNothing(t *testing.T) {
	for _, binding := range []any{(*Host).ExtractionImportPreview, (*Host).ExtractionImportCommit} {
		fn := reflect.TypeOf(binding)
		if fn.NumIn() != 3 || fn.In(1).Kind() != reflect.String || fn.In(2).Kind() != reflect.String {
			t.Fatalf("an import binding takes %v, want (text, hint string)", fn)
		}
	}
	banned := map[string]bool{"os": true, "os/exec": true, "io/fs": true, "io/ioutil": true, "net": true, "net/http": true, "net/url": true,
		"path/filepath": true, "syscall": true, "plugin": true}
	f, err := parser.ParseFile(token.NewFileSet(), "bindings_extraction_import.go", nil, parser.ImportsOnly)
	if err != nil {
		t.Fatal(err)
	}
	for _, imp := range f.Imports {
		if path, _ := strconv.Unquote(imp.Path.Value); banned[path] {
			t.Errorf("bindings_extraction_import.go imports %s", path)
		}
	}

	host, _ := importHost(t)
	result := decodeImportResult(t)(host.ExtractionImportCommit(importFile, ""))
	i := slices.IndexFunc(result.Suggestions, func(s store.Suggestion) bool { return s.Payload.Name == "The Cheshire Cat" })
	if i < 0 || result.Suggestions[i].Payload.Description != `C:\Windows\system32\cmd.exe` {
		t.Fatalf("a path-shaped cell is not kept as text: %+v", result.Suggestions)
	}
}

func TestExtractionImportCapsAreEnforcedBeforeParsing(t *testing.T) {
	host, _ := importHost(t)
	stored := storedSnapshot(t, host)
	cases := map[string]string{
		"over the cap":  strings.Repeat("a", importer.MaxBytes+1),
		"invalid UTF-8": "record,name\nentry,\xff\n",
		"a NUL":         "record,name\nentry,Bill\x00\n",
	}
	for name, text := range cases {
		sentence := importer.Parse([]byte(text), "").Errors[0].Reason
		plan := decodeImportPlan(t)(host.ExtractionImportPreview(text, ""))
		if len(plan.Lines) != 0 || len(plan.Errors) != 1 || plan.Errors[0].Reason != sentence || plan.Errors[0].Row != 0 {
			t.Errorf("%s: preview = %+v, want only %q", name, plan, sentence)
		}
		if _, err := host.ExtractionImportCommit(text, ""); err == nil || err.Error() != sentence {
			t.Errorf("%s: commit = %v, want %q", name, err, sentence)
		}
	}
	if storedSnapshot(t, host) != stored {
		t.Fatal("a refused file stored something")
	}
	if _, err := host.ExtractionImportPreview("{}", "xlsx"); err == nil {
		t.Fatal("an unknown hint is read")
	}
	var prompt ExtractionImportPromptText
	payload, err := host.ExtractionImportPrompt("csv")
	if err != nil || json.Unmarshal([]byte(payload), &prompt) != nil || prompt.MaxBytes != importer.MaxBytes {
		t.Fatalf("prompt = %s, %v; want maxBytes %d", payload, err, importer.MaxBytes)
	}
}

func TestExtractionImportIsOneStep(t *testing.T) {
	host, bible := importHost(t)
	stored, entries := storedSnapshot(t, host), bibleSnapshot(t, host)
	// The store writes through a temporary file; a folder in its place makes the write fail.
	blocker := store.File(host.config.projectFolder) + ".tmp"
	if err := os.MkdirAll(blocker, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := host.ExtractionImportCommit(importFile, ""); err == nil {
		t.Fatal("a failed write was not reported")
	}
	if storedSnapshot(t, host) != stored || bibleSnapshot(t, host) != entries {
		t.Fatal("a failed import changed the suggestions or the Story Bible")
	}
	if err := os.Remove(blocker); err != nil {
		t.Fatal(err)
	}

	result := decodeImportResult(t)(host.ExtractionImportCommit(importFile, ""))
	if len(result.Suggestions) != 6 {
		t.Fatalf("committed %+v", result.Suggestions)
	}
	cat, ok := entryOf(t, bible, "The Cheshire Cat")
	if !ok || !cat.FlaggedEntry {
		t.Fatalf("the accepted-auto entry was not applied and flagged for Review: %+v", cat)
	}
	rabbit, _ := entryOf(t, bible, "White Rabbit")
	if !slices.Contains(rabbit.Aliases, "Mr Rabbit") {
		t.Fatalf("the merge did not add the name: %+v", rabbit)
	}
	for _, id := range []string{cat.ID, rabbit.ID} {
		if !slices.Contains(result.EntryIDs, id) {
			t.Errorf("entryIds = %v, want %s among them", result.EntryIDs, id)
		}
	}
	if _, ok := entryOf(t, bible, "Bill"); ok {
		t.Fatal("a row that needs verification was applied")
	}
	if result.Skipped != 4 {
		t.Fatalf("skipped = %d, want the 4 skipped lines", result.Skipped)
	}
}

func TestExtractionImportSkipsRowsAlreadyOfferedOrRejected(t *testing.T) {
	host, bible := importHost(t)
	before := len(decodeSuggestions(t)(host.ExtractionList()))
	first := decodeImportResult(t)(host.ExtractionImportCommit(importFile, ""))
	if _, ok := entryOf(t, bible, "The Dodo"); ok {
		t.Fatal("a rejected entry was added again")
	}
	again := decodeImportResult(t)(host.ExtractionImportCommit(importFile, ""))
	if len(again.Suggestions) != 0 || len(again.EntryIDs) != 0 {
		t.Fatalf("a second import of the same file added %+v", again)
	}
	if after := len(decodeSuggestions(t)(host.ExtractionList())); after != before+len(first.Suggestions) {
		t.Fatalf("stored %d, want %d", after, before+len(first.Suggestions))
	}
	plan := decodeImportPlan(t)(host.ExtractionImportPreview(importFile, ""))
	if plan.Offered != 0 || importLine(t, plan, "The Dodo · Character").Note != "Rejected before" {
		t.Fatalf("the plan after the import = %+v", plan)
	}
}

func TestExtractionImportLabelsTheSourceAndKeepsTheManuscriptsQuote(t *testing.T) {
	host, _ := importHost(t)
	result := decodeImportResult(t)(host.ExtractionImportCommit(importFile, ""))
	for _, s := range result.Suggestions {
		if s.Source != store.SourceImported {
			t.Errorf("%s has source %q", s.ID, s.Source)
		}
	}
	i := slices.IndexFunc(result.Suggestions, func(s store.Suggestion) bool { return s.Kind == extraction.KindSpeaker })
	if i < 0 || len(result.Suggestions[i].Evidence) != 1 {
		t.Fatalf("the speaker's quote was not found: %+v", result.Suggestions)
	}
	ev := result.Suggestions[i].Evidence[0]
	if ev.Text != "“Oh dear! Oh dear! I shall be late!”" || ev.ParagraphID != "p-000001" {
		t.Fatalf("evidence = %+v, want the manuscript's own text", ev)
	}
}

func TestExtractionImportPromptIsTheImportersText(t *testing.T) {
	host, _ := importHost(t)
	for format, example := range map[importer.Format]string{importer.FormatJSON: importer.ExampleJSON, importer.FormatCSV: importer.ExampleCSV} {
		var prompt ExtractionImportPromptText
		payload, err := host.ExtractionImportPrompt(string(format))
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal([]byte(payload), &prompt); err != nil {
			t.Fatal(err)
		}
		if prompt.Prompt != importer.Copy(format) || prompt.Example != example || prompt.Format != format || prompt.MaxBytes != importer.MaxBytes {
			t.Fatalf("%s prompt = %+v", format, prompt)
		}
	}
	if _, err := host.ExtractionImportPrompt("xlsx"); err == nil {
		t.Fatal("a prompt for an unknown format")
	}
}

func TestExtractionImportNeedsTheStoryBible(t *testing.T) {
	host := &Host{}
	host.config.projectFolder = t.TempDir()
	host.extractionParagraphs = func() ([]extraction.Paragraph, error) { return extractionParagraphs, nil }
	if _, err := host.ExtractionImportPreview(importFile, ""); err == nil || err.Error() != sentenceBibleUnavailable {
		t.Fatalf("preview without a Story Bible = %v", err)
	}
	if _, err := host.ExtractionImportCommit(importFile, ""); err == nil || err.Error() != sentenceBibleUnavailable {
		t.Fatalf("commit without a Story Bible = %v", err)
	}
}
