package guide

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction/apply"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
)

// recordingSidecar is a fake sidecar process: it appends its arguments, one command per line with the parts joined by a unit separator,
// to a log file and prints what a create prints.
func recordingSidecar(t *testing.T, root string) (program, log string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the fake sidecar is a shell script")
	}
	log = filepath.Join(root, "calls.log")
	program = filepath.Join(root, "fake-guide")
	script := "#!/bin/sh\nIFS=\"$(printf '\\037')\"\necho \"$*\" >> '" + log + "'\nif [ \"$1\" = create ]; then echo 'CREATED|new-id'; fi\n"
	if err := os.WriteFile(program, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	return program, log
}

func calls(t *testing.T, log string) [][]string {
	t.Helper()
	raw, err := os.ReadFile(log)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	var out [][]string
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		out = append(out, strings.Split(line, "\x1f"))
	}
	return out
}

func writeBible(t *testing.T, s *Service, entities []any, cues []any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(map[string]any{"schema_version": schemaVersion, "entities": entities, "dialogue_cues": cues})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(s.guidePath(), encoded, 0o600); err != nil {
		t.Fatal(err)
	}
}

func newExtractionService(t *testing.T) (*Service, string) {
	root := t.TempDir()
	program, log := recordingSidecar(t, root)
	return New(root, program, "", settings.New(root, root), process.NewSupervisor()), log
}

var _ apply.Bible = (*Service)(nil).ExtractionBible()

func TestExtractionBibleReadsEntriesAndCues(t *testing.T) {
	s, _ := newExtractionService(t)
	writeBible(t, s, []any{
		map[string]any{
			"id": "wren", "canonical_name": "Wren", "category": "Character", "locked": true,
			"description":   map[string]any{"text": "A courier."},
			"aliases":       []any{map[string]any{"text": "Little Wren"}, map[string]any{"text": "W"}},
			"review":        map[string]any{"entry": true, "aliases": []any{"W"}},
			"properties":    []any{map[string]any{"key": "Codename", "value": "Sparrow"}},
			"relationships": []any{map[string]any{"id": "mill", "label": "works at"}},
		},
	}, []any{map[string]any{"id": "c1", "paragraphId": "p1", "quote_start": 4, "quote_end": 20, "speaker_entity_id": "unknown", "corrected": false}})
	b := s.ExtractionBible()
	entries, err := b.Entries()
	if err != nil || len(entries) != 1 {
		t.Fatalf("%v %v", entries, err)
	}
	e := entries[0]
	if e.ID != "wren" || e.Name != "Wren" || !e.Locked || e.Description != "A courier." || !slices.Equal(e.Aliases, []string{"Little Wren", "W"}) ||
		!e.FlaggedEntry || !slices.Equal(e.FlaggedAliases, []string{"W"}) || e.Properties[0].Value != "Sparrow" || e.Relations[0] != (apply.Relation{To: "mill", Label: "works at"}) {
		t.Fatalf("%+v", e)
	}
	cues, err := b.Cues()
	if err != nil || len(cues) != 1 || cues[0].SpeakerID != "" || cues[0].Start != 4 || cues[0].End != 20 {
		t.Fatalf("%+v %v", cues, err)
	}
}

func TestExtractionBibleWritesThroughTheStoryBibleCommands(t *testing.T) {
	s, log := newExtractionService(t)
	writeBible(t, s, []any{
		map[string]any{"id": "wren", "canonical_name": "Wren", "category": "Character", "aliases": []any{map[string]any{"text": "Little Wren"}, map[string]any{"text": "W"}},
			"review": map[string]any{"entry": true, "aliases": []any{"W"}}},
	}, nil)
	b := s.ExtractionBible()
	if id, err := b.Create("Brook", "Place", []string{"the stream"}, "A stream."); err != nil || id != "new-id" {
		t.Fatalf("%q %v", id, err)
	}
	steps := []error{
		b.SetAliases("wren", []string{"Little Wren"}),
		b.SetProperties("wren", []apply.Property{{Key: "Says", Value: "Hold the door."}}),
		b.Relate("wren", "mill", "works at"),
		b.Flag("wren", "Little Wren"),
		b.Unflag("wren", "W"),
		b.Unflag("wren", ""),
		b.CorrectCue("c1", "wren"),
		b.Delete("brook"),
	}
	for i, err := range steps {
		if err != nil {
			t.Fatalf("step %d: %v", i, err)
		}
	}
	var verbs []string
	for _, c := range calls(t, log) {
		verbs = append(verbs, c[0])
	}
	want := []string{"create", "edit", "edit", "relate", "review-flag", "mark-reviewed", "mark-reviewed", "review-flag", "correct-cue", "delete"}
	if !slices.Equal(verbs, want) {
		t.Fatalf("commands = %v, want %v", verbs, want)
	}
	all := calls(t, log)
	if !slices.Contains(all[1], "--value=Little Wren") || !slices.Contains(all[2], `--value=[{"key":"Says","value":"Hold the door."}]`) {
		t.Fatalf("edits: %v %v", all[1], all[2])
	}
	// clearing the entry's own flag puts back the flag of the name that was still to look at
	if last := all[7]; !slices.Contains(last, "--alias-index") || !slices.Contains(last, "1") {
		t.Fatalf("re-flag of W: %v", last)
	}
}

func TestExtractionBibleRefusesANameWithASemicolon(t *testing.T) {
	s, log := newExtractionService(t)
	if err := s.ExtractionBible().SetAliases("wren", []string{"a;b"}); err == nil {
		t.Fatal("want an error")
	}
	if len(calls(t, log)) != 0 {
		t.Fatal("no sidecar process starts")
	}
}
