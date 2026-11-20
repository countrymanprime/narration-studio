package evidence

import (
	"os"
	"path/filepath"
	"slices"
	"sync"
	"testing"
	"time"
)

// decodesOf is how many record files the store has read and decoded so far: the work the tests below guard (issue 3749).
func decodesOf(store *LedgerStore) int {
	_, decodes := store.Reads()
	return decodes
}

// ledgerOf writes one record per chapter for chapters c-0001 up to count and returns a second store over the same folder,
// the way the coverage and editing services each hold a store of their own.
func ledgerOf(t *testing.T, count int) (reader *LedgerStore, writer *LedgerStore, project string) {
	t.Helper()
	project = t.TempDir()
	writer = NewLedgerStore(project)
	for i := range count {
		chapter := "c-000" + string(rune('1'+i))
		if _, err := writer.Write(baseLedgerRecord("rc", chapter, time.Now(), LedgerComplete)); err != nil {
			t.Fatal(err)
		}
	}
	return NewLedgerStore(project), writer, project
}

func TestRepeatedReadsDecodeEachRecordFileOnce(t *testing.T) {
	reader, _, _ := ledgerOf(t, 5)
	for range 10 {
		records, err := reader.List("rc", "c-0003")
		if err != nil || len(records) != 1 {
			t.Fatalf("List = %d records, %v; want 1", len(records), err)
		}
	}
	if _, ok := reader.Latest("rc", "c-0001"); !ok {
		t.Fatal("Latest did not find the chapter's record")
	}
	if got := decodesOf(reader); got != 5 {
		t.Fatalf("eleven reads of five records decoded %d files, want 5", got)
	}
}

func TestARecordAnotherStoreWritesIsReadOnTheNextRead(t *testing.T) {
	reader, writer, _ := ledgerOf(t, 3)
	if _, err := reader.All(); err != nil {
		t.Fatal(err)
	}
	added, err := writer.Write(baseLedgerRecord("rc", "c-0009", time.Now(), LedgerComplete))
	if err != nil {
		t.Fatal(err)
	}
	got, ok := reader.Latest("rc", "c-0009")
	if !ok || got.ID != added.ID {
		t.Fatalf("Latest after another store's write = %#v, %v; want %s", got, ok, added.ID)
	}
	if decodes := decodesOf(reader); decodes != 4 {
		t.Fatalf("decoded %d files, want 4 (three, then the new one)", decodes)
	}
}

func TestAClearedLedgerReadsEmptyAndARemovedRecordIsGone(t *testing.T) {
	reader, writer, project := ledgerOf(t, 3)
	all, err := reader.All()
	if err != nil || len(all) != 3 {
		t.Fatalf("All = %d, %v; want 3", len(all), err)
	}
	if err := os.Remove(filepath.Join(LedgerDir(project), all[0].ID+".json")); err != nil {
		t.Fatal(err)
	}
	if left, _ := reader.All(); len(left) != 2 {
		t.Fatalf("after one file was removed All = %d, want 2", len(left))
	}
	// A manuscript replace clears the folder; what is written after it is all the ledger holds.
	if err := os.RemoveAll(LedgerDir(project)); err != nil {
		t.Fatal(err)
	}
	if left, err := reader.All(); err != nil || len(left) != 0 {
		t.Fatalf("after the folder was cleared All = %d, %v; want none", len(left), err)
	}
	if _, err := writer.Write(baseLedgerRecord("rc", "c-0001", time.Now(), LedgerComplete)); err != nil {
		t.Fatal(err)
	}
	if left, _ := reader.All(); len(left) != 1 {
		t.Fatalf("after a write into the cleared ledger All = %d, want 1", len(left))
	}
	if decodes := decodesOf(reader); decodes != 4 {
		t.Fatalf("decoded %d files, want 4 (three, then the one written after the clear)", decodes)
	}
}

func TestARewrittenRecordFileIsDecodedAgain(t *testing.T) {
	reader, writer, _ := ledgerOf(t, 0)
	record := baseLedgerRecord("rc", "c-0001", time.Now(), LedgerPartial)
	record.ID = "explicit-id"
	if _, err := writer.Write(record); err != nil {
		t.Fatal(err)
	}
	if got, _ := reader.Latest("rc", "c-0001"); got.Outcome != LedgerPartial {
		t.Fatalf("first read = %q, want partial", got.Outcome)
	}
	record.Outcome = LedgerComplete // another length, so the file's size changes whatever the clock's resolution
	if _, err := writer.Write(record); err != nil {
		t.Fatal(err)
	}
	if got, _ := reader.Latest("rc", "c-0001"); got.Outcome != LedgerComplete {
		t.Fatalf("read after the rewrite = %q, want complete", got.Outcome)
	}
}

func TestACorruptRecordFileIsReadOnceAndItsRepairIsSeen(t *testing.T) {
	reader, writer, project := ledgerOf(t, 2)
	corrupt := filepath.Join(LedgerDir(project), "broken.json")
	if err := os.WriteFile(corrupt, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	for range 3 {
		if all, err := reader.All(); err != nil || len(all) != 2 {
			t.Fatalf("All beside a corrupt file = %d, %v; want 2", len(all), err)
		}
	}
	if decodes := decodesOf(reader); decodes != 3 {
		t.Fatalf("decoded %d files, want 3 (the corrupt one once)", decodes)
	}
	repaired := baseLedgerRecord("rc", "c-0007", time.Now(), LedgerComplete)
	repaired.ID = "broken"
	if _, err := writer.Write(repaired); err != nil {
		t.Fatal(err)
	}
	if all, _ := reader.All(); len(all) != 3 {
		t.Fatalf("after the corrupt file was replaced All = %d, want 3", len(all))
	}
}

// A record file that cannot be read at all is not remembered as absent: the next read tries it again.
func TestAnUnreadableRecordFileIsTriedAgain(t *testing.T) {
	reader, _, project := ledgerOf(t, 1)
	blocked := filepath.Join(LedgerDir(project), "blocked.json")
	if err := os.Mkdir(blocked, 0o755); err != nil { // a folder in a record's place reads as unreadable on every platform
		t.Fatal(err)
	}
	for range 2 {
		if all, _ := reader.All(); len(all) != 1 {
			t.Fatalf("All beside an unreadable file = %d, want 1", len(all))
		}
	}
	if decodes := decodesOf(reader); decodes != 3 {
		t.Fatalf("decoded %d files, want 3 (the readable one once, the unreadable one on both reads)", decodes)
	}
}

// The page asks for the same lists several times at once; under the race detector this guards the shared index.
func TestReadsThatArriveTogetherDecodeEachFileOnce(t *testing.T) {
	reader, writer, _ := ledgerOf(t, 5)
	var wait sync.WaitGroup
	for worker := range 8 {
		wait.Go(func() {
			for range 20 {
				if _, err := reader.List("rc", ""); err != nil {
					t.Error(err)
				}
			}
			if worker == 0 {
				if _, err := writer.Write(baseLedgerRecord("rc", "c-0009", time.Now(), LedgerComplete)); err != nil {
					t.Error(err)
				}
			}
		})
	}
	wait.Wait()
	if all, _ := reader.All(); len(all) != 6 {
		t.Fatalf("All = %d, want 6", len(all))
	}
	if decodes := decodesOf(reader); decodes != 6 {
		t.Fatalf("decoded %d files, want 6", decodes)
	}
}

// A snapshot answers as the store does, from one listing, and does not see what is written after it was taken.
func TestASnapshotAnswersAsTheStoreDoesFromOneListing(t *testing.T) {
	store := NewLedgerStore(t.TempDir())
	now := time.Now()
	for _, record := range []LedgerRecord{
		baseLedgerRecord("rc", "c-0001", now.Add(-2*time.Hour), LedgerComplete),
		baseLedgerRecord("rc", "c-0001", now.Add(-time.Hour), LedgerFailed),
		baseLedgerRecord("er", "c-0001", now, LedgerComplete),
		baseLedgerRecord("rc", "c-0002", now, LedgerPartial),
	} {
		if _, err := store.Write(record); err != nil {
			t.Fatal(err)
		}
	}
	snapshot, err := store.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	listed, _ := store.Reads()
	questions := map[string][2]string{
		"one analyzer, one chapter": {"rc", "c-0001"}, "any analyzer": {"", "c-0001"}, "any chapter": {"rc", ""},
		"everything": {"", ""}, "no match": {"rc", "c-0009"},
	}
	answers := map[string][]string{}
	for name, question := range questions {
		records, err := snapshot.List(question[0], question[1])
		if err != nil {
			t.Fatal(err)
		}
		answers[name] = recordIDs(records)
	}
	if after, _ := store.Reads(); after != listed {
		t.Fatalf("five questions of one snapshot listed the folder %d more times, want none", after-listed)
	}
	for name, question := range questions {
		records, err := store.List(question[0], question[1])
		if err != nil {
			t.Fatal(err)
		}
		if want := recordIDs(records); !slices.Equal(answers[name], want) {
			t.Errorf("%s: snapshot = %v, store = %v", name, answers[name], want)
		}
	}
	if _, err := store.Write(baseLedgerRecord("rc", "c-0009", now, LedgerComplete)); err != nil {
		t.Fatal(err)
	}
	if late, _ := snapshot.List("rc", "c-0009"); len(late) != 0 {
		t.Fatalf("a snapshot showed a record written after it was taken: %v", recordIDs(late))
	}
}

func recordIDs(records []LedgerRecord) []string {
	ids := make([]string, len(records))
	for i, record := range records {
		ids[i] = record.ID
	}
	return ids
}
