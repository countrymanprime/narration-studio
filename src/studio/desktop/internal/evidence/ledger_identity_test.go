package evidence

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// A record is found by its file's name and by the id inside it. A file copied or renamed by hand carries another record's
// id, so it is not read as a record under either name (issue 3801).
func TestARecordFileWhoseNameIsNotItsRecordsIdIsNotRead(t *testing.T) {
	project := t.TempDir()
	store := NewLedgerStore(project)
	written, err := store.Write(baseLedgerRecord("rc", "c-0001", time.Now(), LedgerComplete))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(LedgerDir(project), written.ID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(LedgerDir(project), "copy of a record.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	all, err := store.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 || all[0].ID != written.ID {
		t.Fatalf("the store read %v, want only %s", recordIDs(all), written.ID)
	}
	if _, found := store.Get("copy of a record"); found {
		t.Fatal("the copy was read as a record of its own")
	}
	if _, found := store.Get(written.ID); !found {
		t.Fatal("the record itself is no longer read")
	}
}

// A mapping snapshot answers as the store does for its document, from the one read it was taken with.
func TestAMappingSnapshotAnswersAsTheStoreDidWhenItWasTaken(t *testing.T) {
	store := NewMappingStore(t.TempDir())
	if _, err := store.Confirm("doc-1", "{T1}", "c-0001", "One"); err != nil {
		t.Fatal(err)
	}
	snapshot := store.Snapshot("doc-1")
	if _, err := store.Confirm("doc-1", "{T2}", "c-0002", "Two"); err != nil {
		t.Fatal(err)
	}
	links, err := snapshot.List("doc-1")
	if err != nil || len(links) != 1 || links[0].TrackGUID != "{T1}" || links[0].ChapterID != "c-0001" {
		t.Fatalf("snapshot = %+v, %v; want the one link it was taken with", links, err)
	}
	if other, _ := snapshot.List("doc-2"); len(other) != 0 {
		t.Fatalf("another document's links = %+v, want none", other)
	}
	reads := store.Reads()
	asked := store.SnapshotWhenAsked("doc-1")
	if store.Reads() != reads {
		t.Fatal("a snapshot taken when asked read the links before it was asked")
	}
	for range 3 {
		if links, _ := asked.List("doc-1"); len(links) != 2 {
			t.Fatalf("asked now, the links = %+v, want both", links)
		}
	}
	if got := store.Reads() - reads; got != 1 {
		t.Fatalf("three questions read the links %d times, want 1", got)
	}
	if empty, _ := NewMappingStore(t.TempDir()).Snapshot("doc-1").List("doc-1"); len(empty) != 0 {
		t.Fatalf("a project with no link file = %+v, want none", empty)
	}
}
