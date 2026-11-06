package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/brand"
	"desktop/internal/guide"
	"desktop/internal/manuscript"
)

// afterImportFixture is newSpacyFixture with no Story Bible yet and a manuscript in which Clara speaks, Mr. Darcy has a title, the Wild
// Wood is a place, and "I'm", "Oh" and "Hullo" only look like names. The language model is not installed.
func afterImportFixture(t *testing.T) spacyFixture {
	t.Helper()
	f := newSpacyFixture(t)
	if err := os.Remove(filepath.Join(f.project, "ManuscriptGuide", "manuscript_guide.json")); err != nil {
		t.Fatal(err)
	}
	type paragraph struct {
		ID           string `json:"id"`
		ChapterID    string `json:"chapterId"`
		ChapterTitle string `json:"chapterTitle"`
		Text         string `json:"text"`
	}
	var paragraphs []paragraph
	for i := range 4 {
		for j, text := range []string{
			"“I’m cold,” said Clara. Oh, the night was long, and Mr. Darcy walked through the Wild Wood.",
			"“Hullo!” cried Clara, and Mr. Darcy laughed.",
		} {
			paragraphs = append(paragraphs, paragraph{ID: "p" + string(rune('a'+2*i+j)), ChapterID: "c1", ChapterTitle: "One", Text: text})
		}
	}
	raw, err := json.Marshal(map[string]any{"schemaVersion": 1, "documentId": "d", "chapters": []map[string]any{{"id": "c1"}}, "paragraphs": paragraphs})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(f.project, brand.ProjectFolder, "manuscript", "manuscript.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	return f
}

func (f spacyFixture) bible(t *testing.T) map[string]string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(f.project, "ManuscriptGuide", "manuscript_guide.json"))
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		Entities []struct {
			Name     string `json:"canonical_name"`
			Category string `json:"category"`
		} `json:"entities"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	for _, entry := range document.Entities {
		out[entry.Name] = entry.Category
	}
	return out
}

// With the setting on (its default) and no Story Bible, a successful import builds one by the confidence rule. Nobody is there to answer
// the language model's first-use gate, so it builds from the rules, downloads nothing, and the job's end says what it made.
func TestASuccessfulImportBuildsTheStoryBible(t *testing.T) {
	f := afterImportFixture(t)
	events := collectJobEnds(f.host)
	cues := make(chan struct{}, 1)
	f.host.refreshCues = func(context.Context, ...string) (guide.CueCounts, error) {
		cues <- struct{}{}
		return guide.CueCounts{}, nil
	}
	f.host.importJobEnded(manuscript.ImportJob{ID: "import-1", Phase: "success"})
	if event := nextJobEnd(t, events); event.Kind != jobKindManuscriptImport {
		t.Fatalf("first event %+v, want the import's", event)
	}
	event := nextJobEnd(t, events)
	if event.Kind != jobKindStoryBible || event.Outcome != jobOutcomeSuccess {
		t.Fatalf("event %+v, want the Story Bible build's success", event)
	}
	if want := "Story Bible built from the import: 2 characters and 1 place. Built without the language model."; event.Message != want {
		t.Errorf("message %q, want %q", event.Message, want)
	}
	if args := f.sidecarArgs(t); !strings.HasPrefix(args, "pronunciation\n--words-file\n") {
		t.Errorf("sidecar args %q, want only the pronunciation lookup", args)
	}
	bible := f.bible(t)
	for name, want := range map[string]string{"Clara": "Character", "Mr. Darcy": "Character", "Wild Wood": "Place"} {
		if bible[name] != want {
			t.Errorf("%s: %q, want %s (entries %v)", name, bible[name], want, bible)
		}
	}
	for _, junk := range []string{"I’m", "Oh", "Hullo"} {
		if _, ok := bible[junk]; ok {
			t.Errorf("an entry for %q", junk)
		}
	}
	if f.manager.State(mustModel(t, f.manager)) != "not_installed" {
		t.Error("the import's build downloaded the language model")
	}
	f.host.waitForBackground()
	select {
	case <-cues:
		t.Error("the cues were refreshed apart from the build, which finds them itself")
	default:
	}
}

// With the model installed, the import's build reads it.
func TestAnImportBuildsTheStoryBibleWithTheInstalledModel(t *testing.T) {
	f := afterImportFixture(t)
	if err := f.manager.Install(t.Context(), "en_core_web_sm"); err != nil {
		t.Fatal(err)
	}
	if !f.host.buildGuideAfterImport() {
		t.Fatal("no build started")
	}
	dir, _ := f.manager.ModelDir("en_core_web_sm")
	if args := f.sidecarArgs(t); !strings.Contains(args, "--spacy-model\n"+dir+"\n") {
		t.Fatalf("sidecar args %q, want --spacy-model %s", args, dir)
	}
}

// Off, the import builds nothing and only finds the quoted lines, as before.
func TestAnImportWithTheSettingOffBuildsNothing(t *testing.T) {
	f := afterImportFixture(t)
	off := "false"
	if err := f.host.settings.Save("ManuscriptGuide", "project", map[string]*string{"build_after_import": &off}); err != nil {
		t.Fatal(err)
	}
	cues := make(chan struct{}, 1)
	f.host.refreshCues = func(context.Context, ...string) (guide.CueCounts, error) {
		cues <- struct{}{}
		return guide.CueCounts{}, nil
	}
	f.host.importJobEnded(manuscript.ImportJob{ID: "import-1", Phase: "success"})
	select {
	case <-cues:
	case <-time.After(10 * time.Second):
		t.Fatal("the import wrote no cues")
	}
	if f.host.guideJob != nil {
		t.Error("a Story Bible build started with the setting off")
	}
	if _, err := os.Stat(filepath.Join(f.project, "ManuscriptGuide", "manuscript_guide.json")); err == nil {
		t.Error("a Story Bible was written")
	}
}

// A Story Bible the narrator already has is never rebuilt by an import: nothing starts and the file is as it was.
func TestAnImportLeavesAStoryBibleWithEntriesAsItWas(t *testing.T) {
	f := afterImportFixture(t)
	path := filepath.Join(f.project, "ManuscriptGuide", "manuscript_guide.json")
	previous := `{"entities":[{"id":"ada","canonical_name":"Ada","category":"Character","aliases":[]}]}`
	if err := os.WriteFile(path, []byte(previous), 0o600); err != nil {
		t.Fatal(err)
	}
	if f.host.buildGuideAfterImport() {
		t.Fatal("a build started over a Story Bible with entries")
	}
	if raw, _ := os.ReadFile(path); string(raw) != previous {
		t.Errorf("the Story Bible changed: %s", raw)
	}
}

// A build the narrator started is not interrupted: the import's build does not start, and the quoted lines are found as before.
func TestAnImportDuringARunningBuildStartsNoSecondOne(t *testing.T) {
	f := afterImportFixture(t)
	f.host.guideJob = &workJob{id: "running", phase: "running"}
	if f.host.buildGuideAfterImport() {
		t.Fatal("a second build started")
	}
	f.host.guideJob = nil
}
