package evidence

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"desktop/internal/persist"
)

// retainClock hands out start times one minute apart, oldest first, so a test's records are in the order it wrote them.
type retainClock struct{ at time.Time }

func newRetainClock() *retainClock {
	return &retainClock{at: time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC)}
}

func (c *retainClock) next() time.Time {
	c.at = c.at.Add(time.Minute)
	return c.at
}

// retainLedger is a store, the clock its records are written by and the project folder it is under.
type retainLedger struct {
	t       *testing.T
	store   *LedgerStore
	clock   *retainClock
	project string
}

func newRetainLedger(t *testing.T) *retainLedger {
	t.Helper()
	project := t.TempDir()
	return &retainLedger{t: t, store: NewLedgerStore(project), clock: newRetainClock(), project: project}
}

// write stores a record of analyzer "rc" for chapter c-0001 under id, started at the clock's next minute.
func (l *retainLedger) write(id string, outcome LedgerOutcome, change ...func(*LedgerRecord)) LedgerRecord {
	l.t.Helper()
	record := baseLedgerRecord("rc", "c-0001", l.clock.next(), outcome)
	record.ID = id
	for _, apply := range change {
		apply(&record)
	}
	written, err := l.store.Write(record)
	if err != nil {
		l.t.Fatal(err)
	}
	return written
}

// retain runs Retain with the keys and returns the dropped ids, sorted.
func (l *retainLedger) retain(keys map[string]RetentionKey, referenced ...string) []string {
	l.t.Helper()
	keep := map[string]bool{}
	for _, id := range referenced {
		keep[id] = true
	}
	dropped, err := l.store.Retain(keys, keep, nil)
	if err != nil {
		l.t.Fatal(err)
	}
	ids := droppedIDs(dropped)
	sort.Strings(ids)
	return ids
}

// ids is the sorted id of every record a reader can still read.
func (l *retainLedger) ids() []string {
	l.t.Helper()
	all, err := l.store.All()
	if err != nil {
		l.t.Fatal(err)
	}
	ids := droppedIDs(all)
	sort.Strings(ids)
	return ids
}

func (l *retainLedger) want(dropped, wantDropped, wantLeft []string) {
	l.t.Helper()
	if len(dropped) != len(wantDropped) || (len(dropped) > 0 && !reflect.DeepEqual(dropped, wantDropped)) {
		l.t.Fatalf("Retain dropped %v, want %v", dropped, wantDropped)
	}
	if left := l.ids(); !reflect.DeepEqual(left, wantLeft) {
		l.t.Fatalf("the ledger holds %v, want %v", left, wantLeft)
	}
}

func (l *retainLedger) file(name string) string { return filepath.Join(LedgerDir(l.project), name) }

func mustExist(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Lstat(path); err != nil {
		t.Fatalf("%s is gone: %v", path, err)
	}
}

// --- the rule ---

// A re-check that was cancelled leaves a partial record newer than the complete one the readers still use: both stay,
// and only what is older than that complete record goes. A later complete record lets both go.
func TestRetainKeepsTheCompleteRecordBehindACancelledRecheck(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("c0", LedgerComplete)
	ledger.write("c1", LedgerComplete)
	ledger.write("p2", LedgerPartial)

	before, _, _ := latestCompleteRecord(ledger.store, "rc", "c-0001")
	ledger.want(ledger.retain(rcKeys), []string{"c0"}, []string{"c1", "p2"})
	if after, found, _ := latestCompleteRecord(ledger.store, "rc", "c-0001"); !found || after.ID != "c1" || after.ID != before.ID {
		t.Fatalf("the newest complete record is %q after Retain, was %q", after.ID, before.ID)
	}
	ledger.want(ledger.retain(rcKeys), nil, []string{"c1", "p2"})

	ledger.write("c3", LedgerComplete)
	ledger.want(ledger.retain(rcKeys), []string{"c1", "p2"}, []string{"c3"})
}

func TestRetainKeepsEveryRecordOfAGroupWithNoCompleteOne(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("f0", LedgerFailed)
	ledger.write("p1", LedgerPartial)
	ledger.write("f2", LedgerFailed)
	ledger.want(ledger.retain(rcKeys), nil, []string{"f0", "f2", "p1"})
}

func TestRetainKeepsWhatItCannotPlace(t *testing.T) {
	unreadable := func(record LedgerRecord) (string, bool) { return "", len(record.Payload) > 0 }
	cases := map[string]struct {
		keys       map[string]RetentionKey
		referenced []string
	}{
		"an analyzer with no key":         {keys: map[string]RetentionKey{"another": wholeChapter}},
		"no keys at all":                  {},
		"a key that cannot read a record": {keys: map[string]RetentionKey{"rc": unreadable}},
		"a referenced record":             {keys: rcKeys, referenced: []string{"old", "gone-since"}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			ledger := newRetainLedger(t)
			ledger.write("old", LedgerComplete)
			ledger.write("new", LedgerComplete)
			ledger.want(ledger.retain(c.keys, c.referenced...), nil, []string{"new", "old"})
		})
	}
}

// A key's group, the document and the chapter each separate records: the newest complete record of one never lets a
// record of another go.
func TestRetainGroupsByAnalyzerDocumentChapterAndKey(t *testing.T) {
	byItem := func(record LedgerRecord) (string, bool) { return record.Scope.ItemGUIDs[0], true }
	item := func(guid string) func(*LedgerRecord) {
		return func(record *LedgerRecord) { record.AnalyzerID, record.Scope.ItemGUIDs = "items", []string{guid} }
	}
	ledger := newRetainLedger(t)
	ledger.write("a-old", LedgerComplete, item("{A}"))
	ledger.write("b-only", LedgerComplete, item("{B}"))
	ledger.write("a-new", LedgerComplete, item("{A}"))
	ledger.write("doc-2", LedgerComplete, func(record *LedgerRecord) { record.Scope.DocumentID = "doc-2" })
	ledger.write("chapter-2", LedgerComplete, func(record *LedgerRecord) { record.Scope.ChapterID = "c-0002" })
	ledger.write("other-analyzer", LedgerComplete, func(record *LedgerRecord) { record.AnalyzerID = "other" })
	ledger.write("rc-old", LedgerComplete)
	ledger.write("rc-new", LedgerComplete)

	keys := map[string]RetentionKey{"rc": wholeChapter, "other": wholeChapter, "items": byItem}
	ledger.want(ledger.retain(keys), []string{"a-old", "rc-old"},
		[]string{"a-new", "b-only", "chapter-2", "doc-2", "other-analyzer", "rc-new"})
}

// List sorts by StartedAt with no tie-break, so a reader may take either of two records that started together: both stay.
func TestRetainKeepsARecordThatStartedWithTheNewestCompleteOne(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("old", LedgerComplete)
	first := ledger.write("tie-a", LedgerComplete)
	sameStart := func(record *LedgerRecord) { record.StartedAt = first.StartedAt }
	ledger.write("tie-b", LedgerComplete, sameStart)
	ledger.write("tie-c", LedgerFailed, sameStart)
	ledger.want(ledger.retain(rcKeys), []string{"old"}, []string{"tie-a", "tie-b", "tie-c"})
}

// newestRecordTime reads the latest end of any record of the chapter. A run that started before the newest complete
// one and ended after it holds that time, so it stays.
func TestRetainKeepsARecordThatEndedAfterTheOnesItKeeps(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("old", LedgerComplete)
	ledger.write("overlapping", LedgerFailed, func(record *LedgerRecord) { record.CompletedAt = record.StartedAt.Add(time.Hour) })
	ledger.write("no-end", LedgerPartial, func(record *LedgerRecord) { record.CompletedAt = time.Time{} })
	ledger.write("new", LedgerComplete)

	before, err := newestRecordTime(ledger.store, "c-0001")
	if err != nil {
		t.Fatal(err)
	}
	ledger.want(ledger.retain(rcKeys), []string{"no-end", "old"}, []string{"new", "overlapping"})
	if after, _ := newestRecordTime(ledger.store, "c-0001"); !after.Equal(before) {
		t.Fatalf("the chapter's newest record time is %s after Retain, was %s", after, before)
	}
}

// The readers of this package answer the same from the ledger before Retain and after it, whatever the mix of outcomes.
func TestRetainLeavesThisPackagesReadersTheirAnswers(t *testing.T) {
	outcomes := []LedgerOutcome{LedgerComplete, LedgerPartial, LedgerFailed}
	for seed := range 27 {
		t.Run(fmt.Sprintf("mix %d", seed), func(t *testing.T) {
			ledger := newRetainLedger(t)
			for position, pick := 0, seed; position < 6; position, pick = position+1, pick/3 {
				chapter := []string{"c-0001", "c-0002"}[position%2]
				ledger.write(fmt.Sprintf("r%d", position), outcomes[(pick+position/2)%3], func(record *LedgerRecord) { record.Scope.ChapterID = chapter })
			}
			type answer struct {
				complete   string
				found      bool
				latest     string
				newestTime time.Time
			}
			read := func(chapter string) answer {
				complete, found, err := latestCompleteRecord(ledger.store, "rc", chapter)
				if err != nil {
					t.Fatal(err)
				}
				latest, _ := ledger.store.Latest("rc", chapter)
				newest, err := newestRecordTime(ledger.store, chapter)
				if err != nil {
					t.Fatal(err)
				}
				return answer{complete.ID, found, latest.ID, newest}
			}
			before := map[string]answer{"c-0001": read("c-0001"), "c-0002": read("c-0002")}
			ledger.retain(rcKeys)
			for chapter, was := range before {
				if now := read(chapter); now != was {
					t.Fatalf("%s reads %+v after Retain, was %+v", chapter, now, was)
				}
			}
			if again := ledger.retain(rcKeys); len(again) != 0 {
				t.Fatalf("a second Retain dropped %v", again)
			}
		})
	}
}

// --- files Retain never deletes ---

// A file a reader cannot decode is not a record to Retain either: it is not deleted, and it is not the complete record
// that would let an older one go.
func TestRetainLeavesFilesNoReaderCanDecode(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("old", LedgerComplete)
	newer := ledger.clock.next().Format(time.RFC3339)
	strays := map[string]string{
		"newer-schema.json":      `{"id":"newer-schema","schemaVersion":99,"analyzerId":"rc","scope":{"documentId":"doc-1","chapterId":"c-0001"},"outcome":"complete","startedAt":"` + newer + `"}`,
		"corrupt.json":           `{"id":"corrupt"`,
		"renamed.json":           `{"id":"another","schemaVersion":1,"analyzerId":"rc","scope":{"documentId":"doc-1","chapterId":"c-0001"},"outcome":"complete","startedAt":"` + newer + `"}`,
		"old.json.123.tmp":       `{"id":"old"`,
		"in-flight.json.tmp":     `{"id":"in-flight"`,
		"notes.txt":              "not a record",
		"old.json.corrupt-2026":  "kept aside",
		"UPPER-and-lower-1.json": "",
	}
	for name, content := range strays {
		if err := os.WriteFile(ledger.file(name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	ledger.want(ledger.retain(rcKeys), nil, []string{"old"})
	for name := range strays {
		mustExist(t, ledger.file(name))
	}
}

// A file named outside the record-name pattern that still decodes (a copy made by hand) is read by the readers, so it
// counts in the rule, but Retain deletes no file it would not have named itself.
func TestRetainDeletesOnlyFilesNamedLikeARecord(t *testing.T) {
	names := []string{"..evil", "my copy", "a.b", strings.Repeat("x", 65), "ünïcode"}
	ledger := newRetainLedger(t)
	for _, id := range names {
		started := ledger.clock.next()
		record := fmt.Sprintf(`{"id":%q,"schemaVersion":1,"analyzerId":"rc","scope":{"documentId":"doc-1","chapterId":"c-0001"},"outcome":"complete","startedAt":%q}`, id, started.Format(time.RFC3339))
		if err := os.MkdirAll(LedgerDir(ledger.project), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(ledger.file(id+".json"), []byte(record), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	ledger.write("newest", LedgerComplete)
	if readable := ledger.ids(); len(readable) != len(names)+1 {
		t.Fatalf("the readers see %v, want the hand-named files too", readable)
	}
	if dropped := ledger.retain(rcKeys); len(dropped) != 0 {
		t.Fatalf("Retain dropped %v", dropped)
	}
	for _, id := range names {
		mustExist(t, ledger.file(id+".json"))
	}
}

func TestRetainLeavesAFolderNamedLikeARecord(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("old", LedgerComplete)
	ledger.write("new", LedgerComplete)
	if err := os.MkdirAll(filepath.Join(ledger.file("folder.json"), "inside"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(ledger.file("empty.json"), 0o755); err != nil {
		t.Fatal(err)
	}
	ledger.want(ledger.retain(rcKeys), []string{"old"}, []string{"new"})
	mustExist(t, filepath.Join(ledger.file("folder.json"), "inside"))
	mustExist(t, ledger.file("empty.json"))
}

// A link in the ledger folder is read through by the readers, so the record behind it counts in the rule; when the rule
// would drop it, neither the link nor the file or folder it leads to is deleted.
func TestRetainLeavesALinkAndWhatItLeadsTo(t *testing.T) {
	ledger := newRetainLedger(t)
	outside := t.TempDir()
	linked := baseLedgerRecord("rc", "c-0001", ledger.clock.next(), LedgerComplete)
	linked.ID = "linked"
	elsewhere := NewLedgerStore(outside)
	if _, err := elsewhere.Write(linked); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(LedgerDir(outside), "linked.json")
	ledger.write("old", LedgerComplete)
	if err := os.Symlink(target, ledger.file("linked.json")); err != nil {
		t.Skipf("this platform or account cannot make a symlink: %v", err)
	}
	if err := os.Symlink(outside, ledger.file("to-a-folder.json")); err != nil {
		t.Fatal(err)
	}
	ledger.write("new", LedgerComplete)

	ledger.want(ledger.retain(rcKeys), []string{"old"}, []string{"linked", "new"})
	mustExist(t, ledger.file("linked.json"))
	mustExist(t, ledger.file("to-a-folder.json"))
	mustExist(t, target)
}

// A ledger folder that is a link out of the project is read by the readers, but a delete is rooted at the project folder
// and refuses to follow it: Retain reports that and deletes nothing, there or here.
func TestRetainDeletesNothingThroughALedgerFolderLinkedOutOfTheProject(t *testing.T) {
	outside := NewLedgerStore(t.TempDir())
	clock := newRetainClock()
	for _, id := range []string{"old", "new"} {
		record := baseLedgerRecord("rc", "c-0001", clock.next(), LedgerComplete)
		record.ID = id
		if _, err := outside.Write(record); err != nil {
			t.Fatal(err)
		}
	}
	project := t.TempDir()
	if err := os.MkdirAll(filepath.Dir(LedgerDir(project)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside.dir, LedgerDir(project)); err != nil {
		t.Skipf("this platform or account cannot make a symlink: %v", err)
	}
	store := NewLedgerStore(project)
	if all, _ := store.All(); len(all) != 2 {
		t.Fatalf("the readers see %d records through the link, want 2", len(all))
	}
	called := false
	dropped, err := store.Retain(rcKeys, nil, func(LedgerRecord) error { called = true; return nil })
	if err == nil || len(dropped) != 0 || called {
		t.Fatalf("Retain = %v, %v, beforeDelete called %v; want an error, nothing dropped and no call", droppedIDs(dropped), err, called)
	}
	if all, _ := outside.All(); len(all) != 2 {
		t.Fatalf("the folder outside the project holds %d records, want both", len(all))
	}
}

// The same link to a folder inside the project is followed: the files are the project's own.
func TestRetainFollowsALedgerFolderLinkedInsideTheProject(t *testing.T) {
	project := t.TempDir()
	if err := os.MkdirAll(filepath.Join(project, "moved"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(LedgerDir(project)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join("..", "..", "moved"), LedgerDir(project)); err != nil {
		t.Skipf("this platform or account cannot make a symlink: %v", err)
	}
	ledger := &retainLedger{t: t, store: NewLedgerStore(project), clock: newRetainClock(), project: project}
	ledger.write("old", LedgerComplete)
	ledger.write("new", LedgerComplete)
	ledger.want(ledger.retain(rcKeys), []string{"old"}, []string{"new"})
}

// --- where the project is ---

func TestRetainWorksWhereverTheProjectIs(t *testing.T) {
	folders := map[string]string{
		"spaces":            "My Audio Book (final) ",
		"unicode":           "Книга 📚 كتاب 本",
		"very long":         strings.Repeat("a-long-folder-name/", 11) + "project",
		"nested":            "books/2026/draft/project",
		"dots in the names": "v1.2/book.final",
	}
	for name, folder := range folders {
		t.Run(name, func(t *testing.T) {
			project := filepath.Join(t.TempDir(), filepath.FromSlash(strings.TrimSpace(folder)))
			ledger := &retainLedger{t: t, store: NewLedgerStore(project), clock: newRetainClock(), project: project}
			ledger.write("old", LedgerComplete)
			ledger.write("new", LedgerComplete)
			ledger.want(ledger.retain(rcKeys), []string{"old"}, []string{"new"})
		})
	}
}

func TestRetainWorksInAProjectReachedThroughALink(t *testing.T) {
	base := t.TempDir()
	if err := os.Mkdir(filepath.Join(base, "real"), 0o755); err != nil {
		t.Fatal(err)
	}
	project := filepath.Join(base, "link")
	if err := os.Symlink(filepath.Join(base, "real"), project); err != nil {
		t.Skipf("this platform or account cannot make a symlink: %v", err)
	}
	ledger := &retainLedger{t: t, store: NewLedgerStore(project), clock: newRetainClock(), project: project}
	ledger.write("old", LedgerComplete)
	ledger.write("new", LedgerComplete)
	ledger.want(ledger.retain(rcKeys), []string{"old"}, []string{"new"})
}

func TestRetainDoesNothingWhereThereIsNoLedger(t *testing.T) {
	for name, project := range map[string]string{
		"no ledger folder":  t.TempDir(),
		"no project folder": filepath.Join(t.TempDir(), "missing"),
		"no project":        "",
	} {
		t.Run(name, func(t *testing.T) {
			dropped, err := NewLedgerStore(project).Retain(rcKeys, nil, nil)
			if err != nil || len(dropped) != 0 {
				t.Fatalf("Retain = %v, %v; want nothing and no error", droppedIDs(dropped), err)
			}
		})
	}
}

func TestRetainReportsALedgerItCannotList(t *testing.T) {
	project := t.TempDir()
	if err := os.MkdirAll(filepath.Dir(LedgerDir(project)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(LedgerDir(project), []byte("a file where the folder goes"), 0o600); err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS == "windows" {
		t.Skip("listing a file reads as an empty folder's error only off Windows")
	}
	if dropped, err := NewLedgerStore(project).Retain(rcKeys, nil, nil); err == nil || len(dropped) != 0 {
		t.Fatalf("Retain = %v, %v; want an error", droppedIDs(dropped), err)
	}
}

func TestRetainReportsARecordAReadOnlyFolderKeeps(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("a folder's mode does not stop a delete on Windows or for root, so the refusal cannot be made here")
	}
	ledger := newRetainLedger(t)
	ledger.write("old", LedgerComplete)
	ledger.write("new", LedgerComplete)
	if err := os.Chmod(LedgerDir(ledger.project), 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(LedgerDir(ledger.project), 0o700) })
	dropped, err := ledger.store.Retain(rcKeys, nil, nil)
	if err == nil || len(dropped) != 0 {
		t.Fatalf("Retain in a read-only ledger = %v, %v; want an error and nothing dropped", droppedIDs(dropped), err)
	}
	if left := ledger.ids(); len(left) != 2 {
		t.Fatalf("the ledger holds %v, want both records", left)
	}
}

// --- the step before a delete ---

// beforeDelete sees each record while its file is still there, oldest first, and only the records that are dropped.
func TestRetainCallsBeforeDeleteWhileTheRecordIsStillThere(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("old-1", LedgerComplete)
	ledger.write("old-2", LedgerFailed)
	ledger.write("new", LedgerComplete)
	var seen []string
	dropped, err := ledger.store.Retain(rcKeys, nil, func(record LedgerRecord) error {
		if _, err := os.Lstat(ledger.file(record.ID + ".json")); err != nil {
			t.Fatalf("record %s was deleted before its step ran: %v", record.ID, err)
		}
		seen = append(seen, record.ID)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"old-1", "old-2"}; !reflect.DeepEqual(seen, want) || !reflect.DeepEqual(droppedIDs(dropped), want) {
		t.Fatalf("beforeDelete saw %v and Retain dropped %v, want %v for both", seen, droppedIDs(dropped), want)
	}
}

// A step that fails keeps its record and stops the pass; the next pass drops what is left.
func TestRetainKeepsARecordWhoseStepFailed(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("old-1", LedgerComplete)
	ledger.write("old-2", LedgerComplete)
	ledger.write("old-3", LedgerComplete)
	ledger.write("new", LedgerComplete)
	refused := errors.New("the result is in use")
	dropped, err := ledger.store.Retain(rcKeys, nil, func(record LedgerRecord) error {
		if record.ID == "old-2" {
			return refused
		}
		return nil
	})
	if !errors.Is(err, refused) || !reflect.DeepEqual(droppedIDs(dropped), []string{"old-1"}) {
		t.Fatalf("Retain = %v, %v; want old-1 dropped and the step's error", droppedIDs(dropped), err)
	}
	ledger.want(nil, nil, []string{"new", "old-2", "old-3"})
	ledger.want(ledger.retain(rcKeys), []string{"old-2", "old-3"}, []string{"new"})
}

// A record that is gone by the time its turn comes (another pass, a manuscript replace) is not reported as dropped.
func TestRetainSkipsARecordThatIsAlreadyGone(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("old-1", LedgerComplete)
	ledger.write("old-2", LedgerComplete)
	ledger.write("new", LedgerComplete)
	dropped, err := ledger.store.Retain(rcKeys, nil, func(record LedgerRecord) error {
		if record.ID == "old-1" {
			return os.Remove(ledger.file("old-1.json"))
		}
		return os.Remove(ledger.file("old-2.json"))
	})
	if err != nil || len(dropped) != 0 {
		t.Fatalf("Retain = %v, %v; want nothing dropped by it and no error", droppedIDs(dropped), err)
	}
	ledger.want(nil, nil, []string{"new"})
}

// --- what the host's shared reads see ---

func TestRetainMovesTheGenerationEvenWhenItDropsNothing(t *testing.T) {
	ledger := newRetainLedger(t)
	before := persist.Generation()
	ledger.retain(rcKeys)
	if persist.Generation() == before {
		t.Fatal("Retain did not move the generation")
	}
}

func TestRetainedRecordsLeaveTheIndexOnTheNextRead(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("old", LedgerComplete)
	ledger.write("new", LedgerComplete)
	reader := NewLedgerStore(ledger.project)
	if all, _ := reader.All(); len(all) != 2 {
		t.Fatalf("All = %d records, want 2", len(all))
	}
	ledger.retain(rcKeys)
	if all, _ := reader.All(); len(all) != 1 || all[0].ID != "new" {
		t.Fatalf("another store reads %v after Retain, want only the kept record", droppedIDs(all))
	}
}

// --- Retain beside writes and reads (run with -race) ---

func TestRetainRunsBesideWritesAndReads(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("seed", LedgerComplete)
	reader := NewLedgerStore(ledger.project)
	started := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	const writers, perWriter = 4, 25

	var work sync.WaitGroup
	stop := make(chan struct{})
	for writer := range writers {
		work.Go(func() {
			for n := range perWriter {
				record := baseLedgerRecord("rc", fmt.Sprintf("c-%04d", writer), started.Add(time.Duration(n)*time.Second), []LedgerOutcome{LedgerComplete, LedgerPartial}[n%2])
				record.ID = fmt.Sprintf("w%d-%02d", writer, n)
				if _, err := ledger.store.Write(record); err != nil {
					t.Error(err)
				}
			}
		})
	}
	var others sync.WaitGroup
	for _, read := range []func() error{
		func() error { _, err := ledger.store.All(); return err },
		func() error { _, err := reader.List("rc", "c-0001"); return err },
		func() error { _, err := reader.Snapshot(); return err },
		func() error { _, err := ledger.store.Retain(rcKeys, nil, nil); return err },
		func() error { _, err := reader.Retain(rcKeys, nil, nil); return err },
	} {
		others.Go(func() {
			for {
				select {
				case <-stop:
					return
				default:
					if err := read(); err != nil {
						t.Error(err)
						return
					}
				}
			}
		})
	}
	work.Wait()
	close(stop)
	others.Wait()

	ledger.retain(rcKeys)
	for writer := range writers {
		chapter := fmt.Sprintf("c-%04d", writer)
		left, err := ledger.store.List("rc", chapter)
		if err != nil {
			t.Fatal(err)
		}
		// The last write of a chapter is partial and the one before it complete: those two are what the readers use.
		want := []string{fmt.Sprintf("w%d-%02d", writer, perWriter-1), fmt.Sprintf("w%d-%02d", writer, perWriter-2)}
		if perWriter%2 == 1 {
			want = want[:1]
		}
		if got := droppedIDs(left); !reflect.DeepEqual(got, want) {
			t.Fatalf("%s holds %v after the writes and a last Retain, want %v", chapter, got, want)
		}
	}
}

// --- RecordFileIDs ---

func TestRecordFileIDsListsEveryNameARecordCouldBeBehind(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("readable", LedgerComplete)
	for name, content := range map[string]string{
		"corrupt.json":           `{"id":`,
		"being-written.json.tmp": "",
		"written.json.123.tmp":   "",
		"aside.json.corrupt-1":   "",
		"notes.txt":              "",
	} {
		if err := os.WriteFile(ledger.file(name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(ledger.file("folder.json"), 0o755); err != nil {
		t.Fatal(err)
	}
	ids, err := ledger.store.RecordFileIDs()
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{"readable": true, "corrupt": true, "being-written": true, "written": true, "aside": true, "folder": true}
	if !reflect.DeepEqual(ids, want) {
		t.Fatalf("RecordFileIDs = %v, want %v", ids, want)
	}
}

func TestRecordFileIDsReportsAMissingLedgerFolder(t *testing.T) {
	if _, err := NewLedgerStore(t.TempDir()).RecordFileIDs(); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("RecordFileIDs with no ledger folder = %v, want an error that is fs.ErrNotExist", err)
	}
}
