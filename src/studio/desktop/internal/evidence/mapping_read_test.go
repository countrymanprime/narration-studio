package evidence

import (
	"os"
	"strings"
	"testing"
)

func TestListDecodesAnUnchangedMappingFileOnce(t *testing.T) {
	store := NewMappingStore(t.TempDir())
	if _, err := store.Confirm("doc", "{T1}", "c-0001", "Chapter 1"); err != nil {
		t.Fatal(err)
	}
	before := store.decodes.Load()
	for range 5 {
		if links, err := store.List("doc"); err != nil || len(links) != 1 || links[0].ChapterID != "c-0001" {
			t.Fatalf("List() = %v, %v", links, err)
		}
	}
	if got := store.decodes.Load() - before; got != 1 {
		t.Fatalf("five reads of one file decoded it %d times, want 1", got)
	}
}

func TestListNeverAnswersFromAFileAnotherWriterChanged(t *testing.T) {
	project := t.TempDir()
	store := NewMappingStore(project)
	if _, err := store.Confirm("doc", "{T1}", "c-0001", "Chapter 1"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.List("doc"); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(MappingFile(project))
	if err != nil {
		t.Fatal(err)
	}
	changed := strings.Replace(string(raw), "c-0001", "c-0002", 1) // the same length: only the bytes differ
	if err := os.WriteFile(MappingFile(project), []byte(changed), 0o600); err != nil {
		t.Fatal(err)
	}
	if links, err := store.List("doc"); err != nil || len(links) != 1 || links[0].ChapterID != "c-0002" {
		t.Fatalf("after another writer's change List() = %v, %v, want c-0002", links, err)
	}
	if err := os.Remove(MappingFile(project)); err != nil {
		t.Fatal(err)
	}
	if links, err := store.List("doc"); err != nil || len(links) != 0 {
		t.Fatalf("after the file was deleted List() = %v, %v, want none", links, err)
	}
}

// A writer sorts and appends to the slices it read; the next read must not see what a writer did before its write landed.
func TestAWriteNeverChangesWhatTheNextReadAnswersFrom(t *testing.T) {
	store := NewMappingStore(t.TempDir())
	if _, err := store.Confirm("doc", "{T2}", "c-0002", "Chapter 2"); err != nil {
		t.Fatal(err)
	}
	store.mu.Lock()
	file := store.readLocked("doc")
	file.Mappings[0].ChapterID = "changed in place"
	file.Mappings = append(file.Mappings, TrackMapping{TrackGUID: "{T1}"})
	store.mu.Unlock()
	if links, err := store.List("doc"); err != nil || len(links) != 1 || links[0].ChapterID != "c-0002" {
		t.Fatalf("a reader's change reached the next read: %v, %v", links, err)
	}
	if _, err := store.Confirm("doc", "{T1}", "c-0001", "Chapter 1"); err != nil {
		t.Fatal(err)
	}
	if links, err := store.List("doc"); err != nil || len(links) != 2 {
		t.Fatalf("after a second link List() = %v, %v, want both", links, err)
	}
}
