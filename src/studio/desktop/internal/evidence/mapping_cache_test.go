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

// held reports whether the store holds a decode.
func held(s *MappingStore) bool {
	s.hold.mu.Lock()
	defer s.hold.mu.Unlock()
	return s.hold.shape != nil
}

// aged sets the mapping file's modification time to an old one, as a file written a while ago has.
func aged(t *testing.T, project string, age time.Duration) time.Time {
	t.Helper()
	at := time.Now().Add(-age).Truncate(time.Second)
	if err := os.Chtimes(MappingFile(project), at, at); err != nil {
		t.Fatal(err)
	}
	return at
}

// confirmedAged makes a store with one link whose file was written a minute ago.
func confirmedAged(t *testing.T) (*MappingStore, string) {
	t.Helper()
	project := t.TempDir()
	store := NewMappingStore(project)
	if _, err := store.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	aged(t, project, time.Minute)
	return store, project
}

// A pass that asks for each chapter's links reads the mapping file once, not once per chapter (#3749).
func TestRepeatedListsOfAnUnchangedMappingDecodeTheFileOnce(t *testing.T) {
	store, _ := confirmedAged(t)
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

// A file written a moment ago is never held: a second write inside the file system's clock tick could keep its size and time.
func TestAJustWrittenFileIsDecodedOnEveryRead(t *testing.T) {
	store := NewMappingStore(t.TempDir())
	if _, err := store.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	for range 3 {
		if _, err := store.List("doc-1"); err != nil {
			t.Fatal(err)
		}
	}
	if held(store) {
		t.Fatal("a file written a moment ago was held")
	}
	if got := mappingDecodesOf(store); got < 3 {
		t.Fatalf("3 reads of a just-written file decoded it %d times, want 3", got)
	}
}

// Another store (the UI's bindings make a fresh one for each call) rewrites the file with the same size at the same time as the held one's:
// the held store cannot tell by size and time, so the file is not held while it is younger than the age rule, and is read again.
func TestASameSizeRewriteInsideTheClockTickIsSeen(t *testing.T) {
	project := t.TempDir()
	long := NewMappingStore(project)
	if _, err := long.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if list, _ := long.List("doc-1"); list[0].ChapterID != "c-1" {
			t.Fatalf("list = %v", list)
		}
	}
	info, err := os.Stat(MappingFile(project))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewMappingStore(project).Confirm("doc-1", "track-a", "c-2", "One"); err != nil { // the same length of everything
		t.Fatal(err)
	}
	if err := os.Chtimes(MappingFile(project), info.ModTime(), info.ModTime()); err != nil { // a clock that did not move
		t.Fatal(err)
	}
	if list, _ := long.List("doc-1"); len(list) != 1 || list[0].ChapterID != "c-2" {
		t.Fatalf("a same-size same-time rewrite was not seen: %v", list)
	}
}

// A link made through another store is seen by the first store's next read, when the file is old enough to be held.
func TestAWriteThroughAnotherStoreIsSeen(t *testing.T) {
	store, project := confirmedAged(t)
	if list, _ := store.List("doc-1"); len(list) != 1 || !held(store) {
		t.Fatalf("first list = %v, held %v", list, held(store))
	}
	if _, err := NewMappingStore(project).Confirm("doc-1", "track-b", "c-2", "Two"); err != nil {
		t.Fatal(err)
	}
	if list, _ := store.List("doc-1"); len(list) != 2 {
		t.Fatalf("after another store's write the first store lists %v, want both links", list)
	}
}

// A change of size alone (the old time put back) is seen.
func TestAChangeOfSizeAloneIsSeen(t *testing.T) {
	store, project := confirmedAged(t)
	if list, _ := store.List("doc-1"); len(list) != 1 || !held(store) {
		t.Fatalf("first list = %v, held %v", list, held(store))
	}
	old, err := os.Stat(MappingFile(project))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewMappingStore(project).Confirm("doc-1", "track-b", "c-2", "Two"); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(MappingFile(project), old.ModTime(), old.ModTime()); err != nil {
		t.Fatal(err)
	}
	if list, _ := store.List("doc-1"); len(list) != 2 {
		t.Fatalf("a bigger file with the old time lists %v, want both links", list)
	}
}

// A change of time alone (the same size) is seen.
func TestAChangeOfTimeAloneIsSeen(t *testing.T) {
	store, project := confirmedAged(t)
	if list, _ := store.List("doc-1"); list[0].ChapterID != "c-1" || !held(store) {
		t.Fatalf("first list = %v, held %v", list, held(store))
	}
	raw, err := os.ReadFile(MappingFile(project))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(MappingFile(project), []byte(strings.Replace(string(raw), `"c-1"`, `"c-2"`, 1)), 0o600); err != nil {
		t.Fatal(err)
	}
	aged(t, project, 2*time.Minute)
	if list, _ := store.List("doc-1"); list[0].ChapterID != "c-2" {
		t.Fatalf("a rewrite with another time lists %v, want c-2", list)
	}
}

// The store's own write drops the held decode (even when the new file would keep the old size and time).
func TestAWriteThroughTheSameStoreDropsTheHeldRead(t *testing.T) {
	store, _ := confirmedAged(t)
	if list, _ := store.List("doc-1"); list[0].ChapterID != "c-1" || !held(store) {
		t.Fatalf("first list = %v, held %v", list, held(store))
	}
	if _, err := store.Confirm("doc-1", "track-a", "c-2", "One"); err != nil {
		t.Fatal(err)
	}
	if held(store) {
		t.Fatal("a write through the store left the held read in place")
	}
	if list, _ := store.List("doc-1"); len(list) != 1 || list[0].ChapterID != "c-2" {
		t.Fatalf("after the write the list is %v, want c-2", list)
	}
}

// A re-import deletes the file; a later read is empty, and a file put back by another writer is read again.
func TestADeletedOrReplacedFileIsNotServedFromTheHeldRead(t *testing.T) {
	store, project := confirmedAged(t)
	if list, _ := store.List("doc-1"); len(list) != 1 || !held(store) {
		t.Fatalf("list = %v, held %v", list, held(store))
	}
	if err := os.Remove(MappingFile(project)); err != nil {
		t.Fatal(err)
	}
	if list, _ := store.List("doc-1"); len(list) != 0 {
		t.Fatalf("after the file was deleted the list is %v, want none", list)
	}
	if _, err := NewMappingStore(project).Confirm("doc-1", "track-z", "c-9", "Nine"); err != nil {
		t.Fatal(err)
	}
	if list, _ := store.List("doc-1"); len(list) != 1 || list[0].TrackGUID != "track-z" {
		t.Fatalf("after the file came back the list is %v", list)
	}
}

// A caller that edits what the store returned does not change the next read (the held shape is copied both ways).
func TestEditingAReturnedShapeDoesNotChangeTheHeldRead(t *testing.T) {
	project := t.TempDir()
	store := NewMappingStore(project)
	if _, err := store.Confirm("doc-1", "track-a", "c-1", "One"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Confirm("doc-1", "track-q", "c-2", "Quiet"); err != nil {
		t.Fatal(err)
	}
	if err := store.Clear("doc-1", "track-q"); err != nil { // records the pair as rejected
		t.Fatal(err)
	}
	aged(t, project, time.Minute)
	first, _ := store.List("doc-1")
	if len(first) != 1 || !held(store) {
		t.Fatalf("first list = %v, held %v", first, held(store))
	}
	store.mu.Lock()
	shape := store.readLocked("doc-1")
	shape.Mappings[0].ChapterID = "edited"
	shape.Rejected[0].ChapterTitle = "edited"
	again := store.readLocked("doc-1")
	store.mu.Unlock()
	if again.Mappings[0].ChapterID != "c-1" || again.Rejected[0].ChapterTitle != "Quiet" {
		t.Fatalf("an edited shape leaked into the held read: %+v", again)
	}
}

// A file whose lists are empty (not absent) is rewritten with empty lists, not null ones.
func TestAnEmptyListStaysEmptyNotNull(t *testing.T) {
	if got := (mappingFileShape{Mappings: []TrackMapping{}}).clone(); got.Mappings == nil || got.Rejected != nil {
		t.Fatalf("clone turned an empty list into %#v or an absent one into %#v", got.Mappings, got.Rejected)
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
	aged(t, project, time.Minute)
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
