package evidence

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// mappingDecodesOf reads the store's decode counter.
func mappingDecodesOf(s *MappingStore) int {
	s.hold.mu.Lock()
	defer s.hold.mu.Unlock()
	return s.hold.decodes
}

// A pass that asks for each chapter's links reads the mapping file once, not once per chapter (#3749).
func TestRepeatedListsOfAnUnchangedMappingDecodeTheFileOnce(t *testing.T) {
	store := NewMappingStore(t.TempDir())
	if _, err := store.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.List("doc-1"); err != nil {
		t.Fatal(err)
	}
	before := mappingDecodesOf(store)
	for range 40 {
		list, err := store.List("doc-1")
		if err != nil || len(list) != 1 {
			t.Fatalf("List = %v, %v", list, err)
		}
	}
	if got := mappingDecodesOf(store); got != before {
		t.Fatalf("40 lists of an unchanged file decoded it %d more times, want 0", got-before)
	}
}

// A link made through another store (another service holds its own) is seen by the first store's next read.
func TestAWriteThroughAnotherStoreIsSeen(t *testing.T) {
	project := t.TempDir()
	first, second := NewMappingStore(project), NewMappingStore(project)
	if _, err := first.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	if list, _ := first.List("doc-1"); len(list) != 1 {
		t.Fatalf("first list = %v", list)
	}
	if _, err := second.Confirm("doc-1", "track-b", "c-2", "Two"); err != nil {
		t.Fatal(err)
	}
	if list, _ := first.List("doc-1"); len(list) != 2 {
		t.Fatalf("after another store's write the first store lists %v, want both links", list)
	}
}

// The same store's own write is seen at once, with no help from the file's time or size (a same-size link swap inside one clock tick).
func TestAWriteThroughTheSameStoreIsSeenEvenWhenSizeAndTimeStayTheSame(t *testing.T) {
	store := NewMappingStore(t.TempDir())
	if _, err := store.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	if list, _ := store.List("doc-1"); list[0].ChapterID != "c-1" {
		t.Fatalf("list = %v", list)
	}
	if _, err := store.Confirm("doc-1", "track-a", "c-2", "One"); err != nil { // same length of everything
		t.Fatal(err)
	}
	if list, _ := store.List("doc-1"); len(list) != 1 || list[0].ChapterID != "c-2" {
		t.Fatalf("after the swap the list is %v, want c-2", list)
	}
}

// A re-import deletes the file; a later read is empty, and a file put back by another writer is read again.
func TestADeletedOrReplacedFileIsNotServedFromTheHeldRead(t *testing.T) {
	project := t.TempDir()
	store := NewMappingStore(project)
	if _, err := store.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	if list, _ := store.List("doc-1"); len(list) != 1 {
		t.Fatalf("list = %v", list)
	}
	if err := os.Remove(MappingFile(project)); err != nil {
		t.Fatal(err)
	}
	if list, _ := store.List("doc-1"); len(list) != 0 {
		t.Fatalf("after the file was deleted the list is %v, want none", list)
	}
	other := NewMappingStore(project)
	if _, err := other.Confirm("doc-1", "track-z", "c-9", "Nine"); err != nil {
		t.Fatal(err)
	}
	if list, _ := store.List("doc-1"); len(list) != 1 || list[0].TrackGUID != "track-z" {
		t.Fatalf("after the file came back the list is %v", list)
	}
}

// A file replaced by rename with the same size and the same modification time is a different file: its identity differs.
func TestAReplacementWithTheSameSizeAndTimeIsStillRead(t *testing.T) {
	project := t.TempDir()
	store := NewMappingStore(project)
	if _, err := store.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	path := MappingFile(project)
	if list, _ := store.List("doc-1"); list[0].ChapterID != "c-1" {
		t.Fatalf("list = %v", list)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	swapped := strings.Replace(string(raw), `"c-1"`, `"c-2"`, 1)
	temp := filepath.Join(filepath.Dir(path), "swap.tmp")
	if err := os.WriteFile(temp, []byte(swapped), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(temp, time.Now(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(temp, path); err != nil {
		t.Fatal(err)
	}
	after, err := os.Stat(path)
	if err != nil || after.Size() != info.Size() || !after.ModTime().Equal(info.ModTime()) {
		t.Skipf("the file system did not keep the size and time the same (%v)", err)
	}
	if list, _ := store.List("doc-1"); list[0].ChapterID != "c-2" {
		t.Fatalf("a same-size same-time replacement was not read: %v", list)
	}
}

// A caller that edits what List returned does not change the next List.
func TestEditingAListedResultDoesNotChangeTheNextRead(t *testing.T) {
	store := NewMappingStore(t.TempDir())
	if _, err := store.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	first, _ := store.List("doc-1")
	first[0].ChapterID = "edited"
	if again, _ := store.List("doc-1"); again[0].ChapterID != "c-1" {
		t.Fatalf("an edited result leaked into the held read: %v", again)
	}
}

// A corrupt file is not held: it is read (and reported) every time, and a repaired file is read at once.
func TestACorruptFileIsNotHeld(t *testing.T) {
	project := t.TempDir()
	store := NewMappingStore(project)
	path := MappingFile(project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	for range 3 {
		if list, _ := store.List("doc-1"); len(list) != 0 {
			t.Fatalf("a corrupt file listed %v", list)
		}
	}
	if got := mappingDecodesOf(store); got != 3 {
		t.Fatalf("a corrupt file was decoded %d times in 3 reads, want 3", got)
	}
	if _, err := store.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	if list, _ := store.List("doc-1"); len(list) != 1 {
		t.Fatalf("after repair list = %v", list)
	}
}
