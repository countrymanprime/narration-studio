package guide

import (
	"os"
	"path/filepath"
	"testing"

	"desktop/internal/findings"
	"desktop/internal/process"
	"desktop/internal/settings"
)

func TestDeleteAllRemovesTheStoryBibleAndItsFindingsOnly(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	store := findings.NewStore(root)
	s.SetFindings(store)
	writeGuideDocument(t, root, map[string]any{
		"schema_version": schemaVersion,
		"entities":       []any{fixtureEntity("ent1", "needs review", false, "low"), fixtureEntity("ent2", "reviewed", false, "high")},
	})
	if err := s.SaveFindings(); err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveAnalyzerFindings("transcript", "c-0001", []findings.Finding{}); err != nil {
		t.Fatal(err)
	}
	guideDir := filepath.Join(root, "ManuscriptGuide")
	for _, name := range []string{"audio/tts/0a.wav", "manuscript_guide.json.corrupt-20261026-120000"} {
		path := filepath.Join(guideDir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	// The rest of the project: the manuscript and another analyzer's findings stay.
	manuscript := filepath.Join(root, "Manuscript.txt")
	if err := os.WriteFile(manuscript, []byte("Alice"), 0o600); err != nil {
		t.Fatal(err)
	}

	entries, err := s.DeleteAll()
	if err != nil {
		t.Fatal(err)
	}
	if entries != 2 {
		t.Fatalf("entries = %d, want 2", entries)
	}
	if _, err := os.Stat(guideDir); !os.IsNotExist(err) {
		t.Fatalf("the ManuscriptGuide folder is still there: %v", err)
	}
	if left, err := store.List(findings.Query{Analyzer: analyzerName}); err != nil || len(left) != 0 {
		t.Fatalf("Story Bible findings after the delete = %+v, %v", left, err)
	}
	if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(findings.Dir), "transcript")); err != nil {
		t.Fatalf("another analyzer's findings went too: %v", err)
	}
	if _, err := os.Stat(manuscript); err != nil {
		t.Fatalf("a file outside the Story Bible went: %v", err)
	}
	// The page then reads an empty Story Bible, and a second delete finds nothing.
	if list, err := s.Entities(); err != nil || len(list) != 0 {
		t.Fatalf("Entities after the delete = %v, %v", list, err)
	}
	if entries, err := s.DeleteAll(); err != nil || entries != 0 {
		t.Fatalf("a second delete = %d, %v", entries, err)
	}
}

func TestDeleteAllDeletesAFileItCannotRead(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	writeGuideDocument(t, root, map[string]any{"schema_version": schemaVersion + 1, "entities": []any{fixtureEntity("ent1", "reviewed", false, "high")}})
	if _, err := s.Entities(); err == nil {
		t.Fatal("a newer Story Bible was read")
	}
	entries, err := s.DeleteAll()
	if err != nil || entries != 0 {
		t.Fatalf("DeleteAll = %d, %v, want 0 entries and no error", entries, err)
	}
	if _, err := os.Stat(s.guidePath()); !os.IsNotExist(err) {
		t.Fatalf("the newer file is still there: %v", err)
	}
}

func TestAnEditAfterDeleteAllDoesNotBringTheOldEntriesBack(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	writeGuideDocument(t, root, map[string]any{"schema_version": schemaVersion, "entities": []any{fixtureEntity("ent1", "reviewed", false, "high")}})
	// An edit leaves the document held in memory; the delete must drop it, so the next change starts from no file.
	if err := s.Edit("ent1", "locked", "true"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DeleteAll(); err != nil {
		t.Fatal(err)
	}
	if err := s.Edit("ent1", "locked", "false"); err == nil {
		t.Fatal("an edit of a deleted entry succeeded")
	}
	if list, err := s.Entities(); err != nil || len(list) != 0 {
		t.Fatalf("Entities = %v, %v", list, err)
	}
}
