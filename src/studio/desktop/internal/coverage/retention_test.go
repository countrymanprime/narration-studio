package coverage

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"desktop/internal/evidence"
	"desktop/internal/persist"
)

// retentionKeys is the keys of this package's analyzer.
var retentionKeys = map[string]evidence.RetentionKey{AnalyzerID: RetentionKey}

// retentionFixture is a project whose chapter was checked several times, and the service that reads it.
type retentionFixture struct {
	*testProject
	service *Service
}

// checkedTwiceThenFailed is a chapter with two complete checks and a newer one that failed: ids are oldest first.
func checkedTwiceThenFailed(t *testing.T) (f *retentionFixture, first, second, failed string) {
	t.Helper()
	p := newTestProject(t)
	f = &retentionFixture{testProject: p}
	ids := []string{}
	for _, sidecar := range []*fakeSidecar{{present: 6}, {present: 8}, {exitCode: 3, errorMessage: "The check was stopped."}} {
		run(t, p.service(sidecar), testRequest())
		ids = append(ids, latestRecord(t, p).ID)
	}
	f.service = p.service(&fakeSidecar{})
	return f, ids[0], ids[1], ids[2]
}

func (f *retentionFixture) resultPath(id string) string {
	return filepath.Join(resultsDir(f.dir), id+".json")
}

func (f *retentionFixture) summaryPath(id string) string {
	return filepath.Join(summariesDir(f.dir), id+".json")
}

func (f *retentionFixture) recordPath(id string) string {
	return filepath.Join(evidence.LedgerDir(f.dir), id+".json")
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

// stored is which of a record's three files are there, as "result summary record" with a dash for one that is gone.
func (f *retentionFixture) stored(id string) string {
	parts := []string{"-", "-", "-"}
	for index, path := range []string{f.resultPath(id), f.summaryPath(id), f.recordPath(id)} {
		if exists(path) {
			parts[index] = []string{"result", "summary", "record"}[index]
		}
	}
	return strings.Join(parts, " ")
}

// readersAnswer is what this package's readers answer for the chapter: the result reader (the newest complete check, whether
// it is current, its stored result), the newest record of any outcome (the signal's), and the chapter list's fraction.
type readersAnswer struct {
	Result    ChapterResult
	Latest    string
	Fractions map[string]float64
	Summary   *ResultSummary
}

// read asks a service started now, so nothing held in memory answers for a file that is gone.
func (f *retentionFixture) read(t *testing.T) readersAnswer {
	t.Helper()
	return readWith(t, f.testProject.service(&fakeSidecar{}))
}

func readWith(t *testing.T, service *Service) readersAnswer {
	t.Helper()
	result, err := service.Result(testChapter, DefaultAlignmentParams)
	if err != nil {
		t.Fatal(err)
	}
	latest, err := service.latestRecord(testChapter)
	if err != nil || latest == nil {
		t.Fatalf("latestRecord = %v, %v", latest, err)
	}
	answer := readersAnswer{Result: result, Latest: latest.ID, Fractions: service.RecordedFractions(DefaultAlignmentParams)}
	if result.Record != nil {
		if summary, ok := service.summary(result.Record.ID); ok {
			answer.Summary = &summary
		}
	}
	return answer
}

func (f *retentionFixture) retain(t *testing.T, service *Service, beforeDelete func(evidence.LedgerRecord) error) ([]string, error) {
	t.Helper()
	dropped, err := service.ledger.Retain(retentionKeys, nil, beforeDelete)
	ids := []string{}
	for _, record := range dropped {
		ids = append(ids, record.ID)
	}
	return ids, err
}

func removeStoredOf(service *Service) func(evidence.LedgerRecord) error {
	return func(record evidence.LedgerRecord) error { return service.RemoveStoredResult(record.ID) }
}

// --- the readers' answers ---

// After a check that did not finish, the readers still use the complete check before it: Retain keeps both and drops
// the older complete check with its result and summary, and every reader answers as it did.
func TestRetainLeavesTheCoverageReadersTheirAnswersAfterAnUnfinishedRecheck(t *testing.T) {
	f, first, second, failed := checkedTwiceThenFailed(t)
	before := f.read(t)
	if before.Result.Record == nil || before.Result.Record.ID != second || before.Result.Result == nil || before.Latest != failed || before.Summary == nil || len(before.Fractions) != 1 {
		t.Fatalf("before Retain the readers answer %+v, want the second check, its result and summary, and the failed check as newest", before)
	}

	dropped, err := f.retain(t, f.service, removeStoredOf(f.service))
	if err != nil || !reflect.DeepEqual(dropped, []string{first}) {
		t.Fatalf("Retain dropped %v, %v; want the first check only", dropped, err)
	}
	if after := f.read(t); !reflect.DeepEqual(after, before) {
		t.Fatalf("the readers answer\n%+v\nafter Retain, was\n%+v", after, before)
	}
	if after := readWith(t, f.service); !reflect.DeepEqual(after, before) {
		t.Fatalf("the service that ran Retain answers\n%+v\nwas\n%+v", after, before)
	}
	for id, want := range map[string]string{first: "- - -", second: "result summary record", failed: "- - record"} {
		if got := f.stored(id); got != want {
			t.Fatalf("record %s has %q, want %q", id, got, want)
		}
	}

	// A new complete check makes the second one and the failed one droppable.
	run(t, f.testProject.service(&fakeSidecar{present: 9}), testRequest())
	newest := latestRecord(t, f.testProject).ID
	before = f.read(t)
	dropped, err = f.retain(t, f.service, removeStoredOf(f.service))
	if err != nil || !reflect.DeepEqual(dropped, []string{second, failed}) {
		t.Fatalf("Retain dropped %v, %v; want the second check and the failed one", dropped, err)
	}
	if after := f.read(t); !reflect.DeepEqual(after, before) || after.Result.Record.ID != newest {
		t.Fatalf("the readers answer\n%+v\nafter the second Retain, was\n%+v", after, before)
	}
}

// Every mix of outcomes over two chapters: the result reader, the newest record and the checked chapters answer the same
// from the ledger before Retain and after it.
func TestRetainLeavesTheCoverageReadersTheirAnswersForEveryMixOfOutcomes(t *testing.T) {
	p := newTestProject(t)
	p.addSecondChapter()
	for _, chapter := range []string{testChapter, testSecondChapter} {
		request := testRequest()
		request.ChapterID = chapter
		run(t, p.service(&fakeSidecar{present: 6}), request)
	}
	seeds, err := evidence.NewLedgerStore(p.dir).List(AnalyzerID, "")
	if err != nil || len(seeds) != 2 {
		t.Fatalf("the two checks left %d records, %v", len(seeds), err)
	}
	outcomes := []evidence.LedgerOutcome{evidence.LedgerComplete, evidence.LedgerPartial, evidence.LedgerFailed}
	dropped := 0
	for mix := range 27 {
		service := p.service(&fakeSidecar{})
		for position, pick := 0, mix; position < 6; position, pick = position+1, pick/3 {
			record := seeds[position%2]
			record.ID = fmt.Sprintf("mix-%d-%d", mix, position)
			record.StartedAt = record.StartedAt.Add(time.Duration(mix*10+position+1) * time.Minute)
			record.CompletedAt = record.StartedAt.Add(time.Second)
			record.Outcome = outcomes[(pick+position/2)%3]
			if _, err := service.ledger.Write(record); err != nil {
				t.Fatal(err)
			}
		}
		type answer struct {
			Results []ChapterResult
			Latest  []string
			Checked []string
		}
		read := func() answer {
			fresh := p.service(&fakeSidecar{})
			got := answer{Checked: checkedChapters(fresh.ledger)}
			for _, chapter := range []string{testChapter, testSecondChapter} {
				result, err := fresh.Result(chapter, DefaultAlignmentParams)
				if err != nil {
					t.Fatal(err)
				}
				latest, err := fresh.latestRecord(chapter)
				if err != nil || latest == nil {
					t.Fatalf("latestRecord = %v, %v", latest, err)
				}
				got.Results, got.Latest = append(got.Results, result), append(got.Latest, latest.ID)
			}
			return got
		}
		before := read()
		gone, err := service.ledger.Retain(retentionKeys, nil, removeStoredOf(service))
		if err != nil {
			t.Fatal(err)
		}
		dropped += len(gone)
		if after := read(); !reflect.DeepEqual(after, before) {
			t.Fatalf("mix %d: the readers answer\n%+v\nafter Retain, was\n%+v", mix, after, before)
		}
	}
	if dropped == 0 {
		t.Fatal("Retain dropped nothing in any mix, so the test compared nothing")
	}
}

// --- the order: result, summary, record ---

// The record's file is the last to go. That the result goes before the summary is the summaries case of
// TestRemoveStoredResultLeavesWhatIsNotAFileOfTheProject.
func TestRetainRemovesWhatIsStoredForARecordBeforeTheRecord(t *testing.T) {
	f, first, _, _ := checkedTwiceThenFailed(t)
	var steps []string
	_, err := f.retain(t, f.service, func(record evidence.LedgerRecord) error {
		steps = append(steps, f.stored(record.ID))
		err := f.service.RemoveStoredResult(record.ID)
		steps = append(steps, f.stored(record.ID))
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	steps = append(steps, f.stored(first))
	want := []string{"result summary record", "- - record", "- - -"}
	if !reflect.DeepEqual(steps, want) {
		t.Fatalf("the files went in the order %q, want %q", steps, want)
	}
}

// A pass that stops after any step leaves the readers their answers, and the next pass finishes the work.
func TestAnInterruptedRetainIsFinishedByTheNextPass(t *testing.T) {
	stopped := errors.New("the app was closed")
	interruptions := map[string]struct {
		interrupt func(f *retentionFixture, record evidence.LedgerRecord) error
		left      string
	}{
		"before anything was removed": {
			func(*retentionFixture, evidence.LedgerRecord) error { return stopped }, "result summary record",
		},
		"after the result was removed": {
			func(f *retentionFixture, record evidence.LedgerRecord) error {
				if err := os.Remove(f.resultPath(record.ID)); err != nil {
					return err
				}
				return stopped
			}, "- summary record",
		},
		"after the summary was removed": {
			func(f *retentionFixture, record evidence.LedgerRecord) error {
				if err := f.service.RemoveStoredResult(record.ID); err != nil {
					return err
				}
				return stopped
			}, "- - record",
		},
	}
	for name, c := range interruptions {
		t.Run(name, func(t *testing.T) {
			f, first, _, _ := checkedTwiceThenFailed(t)
			before := f.read(t)
			dropped, err := f.retain(t, f.service, func(record evidence.LedgerRecord) error { return c.interrupt(f, record) })
			if !errors.Is(err, stopped) || len(dropped) != 0 {
				t.Fatalf("the interrupted pass = %v, %v; want nothing dropped and the interruption", dropped, err)
			}
			if got := f.stored(first); got != c.left {
				t.Fatalf("the interrupted pass left %q, want %q", got, c.left)
			}
			if after := f.read(t); !reflect.DeepEqual(after, before) {
				t.Fatalf("after the interruption the readers answer\n%+v\nwas\n%+v", after, before)
			}

			restarted := f.testProject.service(&fakeSidecar{})
			dropped, err = f.retain(t, restarted, removeStoredOf(restarted))
			if err != nil || !reflect.DeepEqual(dropped, []string{first}) {
				t.Fatalf("the next pass = %v, %v; want the first check dropped", dropped, err)
			}
			if got := f.stored(first); got != "- - -" {
				t.Fatalf("the next pass left %q", got)
			}
			if after := f.read(t); !reflect.DeepEqual(after, before) {
				t.Fatalf("after the next pass the readers answer\n%+v\nwas\n%+v", after, before)
			}
			if swept, err := restarted.SweepOrphanResults(); err != nil || len(swept) != 0 {
				t.Fatalf("the sweep after a finished pass = %v, %v; want nothing left to remove", swept, err)
			}
		})
	}
}

// A record that went without its stored files (a pass that used no beforeDelete, a read that stored the summary again
// behind the pass) leaves files only the sweep can find: no record names them any more.
func TestTheSweepRemovesWhatARemovedRecordLeftBehind(t *testing.T) {
	for name, leave := range map[string]string{
		"the result and the summary": "result summary -",
		"the summary alone":          "- summary -",
		"the result alone":           "result - -",
	} {
		t.Run(name, func(t *testing.T) {
			f, first, second, failed := checkedTwiceThenFailed(t)
			before := f.read(t)
			if dropped, err := f.retain(t, f.service, nil); err != nil || !reflect.DeepEqual(dropped, []string{first}) {
				t.Fatalf("Retain = %v, %v", dropped, err)
			}
			if !strings.HasPrefix(leave, "result") {
				_ = os.Remove(f.resultPath(first))
			}
			if !strings.Contains(leave, "summary") {
				_ = os.Remove(f.summaryPath(first))
			}
			if got := f.stored(first); got != leave {
				t.Fatalf("the fixture left %q, want %q", got, leave)
			}
			if after := f.read(t); !reflect.DeepEqual(after, before) {
				t.Fatalf("with the leftovers the readers answer\n%+v\nwas\n%+v", after, before)
			}

			swept, err := f.service.SweepOrphanResults()
			if err != nil || !reflect.DeepEqual(swept, []string{first}) {
				t.Fatalf("SweepOrphanResults = %v, %v; want the first check's files", swept, err)
			}
			for id, want := range map[string]string{first: "- - -", second: "result summary record", failed: "- - record"} {
				if got := f.stored(id); got != want {
					t.Fatalf("after the sweep record %s has %q, want %q", id, got, want)
				}
			}
			if after := f.read(t); !reflect.DeepEqual(after, before) {
				t.Fatalf("after the sweep the readers answer\n%+v\nwas\n%+v", after, before)
			}
		})
	}
}

// --- RemoveStoredResult ---

func TestRemoveStoredResultForgetsWhatTheServiceHeldInMemory(t *testing.T) {
	p, recordID, resultPath, summaryPath := summaryFixture(t)
	service := p.service(&fakeSidecar{})
	if _, ok := service.results.read(recordID); !ok {
		t.Fatal("the stored result is not readable")
	}
	if _, ok := service.summary(recordID); !ok {
		t.Fatal("the summary is not readable")
	}
	held := func() bool {
		service.summaries.mu.Lock()
		defer service.summaries.mu.Unlock()
		_, found := service.summaries.held[recordID]
		return found
	}
	if cachedResults(service) != 1 || !held() {
		t.Fatalf("before the removal the service holds %d results and the summary %v, want both", cachedResults(service), held())
	}

	if err := service.RemoveStoredResult(recordID); err != nil {
		t.Fatal(err)
	}
	if exists(resultPath) || exists(summaryPath) {
		t.Fatalf("result there %v, summary there %v; want both gone", exists(resultPath), exists(summaryPath))
	}
	if cachedResults(service) != 0 || held() {
		t.Fatalf("after the removal the service holds %d results and the summary %v, want neither", cachedResults(service), held())
	}
	if _, ok := service.results.read(recordID); ok {
		t.Fatal("a removed result was read")
	}
	if _, ok := service.summary(recordID); ok {
		t.Fatal("a removed result's summary was read")
	}
	if err := service.RemoveStoredResult(recordID); err != nil {
		t.Fatalf("removing what is already gone: %v", err)
	}
}

func TestRemoveStoredResultRefusesAnIDThatIsNoRecordsID(t *testing.T) {
	p, recordID, resultPath, _ := summaryFixture(t)
	service := p.service(&fakeSidecar{})
	for _, id := range []string{"", "..", "../" + recordID, recordID + ".json", "a/b", `a\b`, strings.Repeat("x", 65), "ünïcode"} {
		if err := service.RemoveStoredResult(id); err == nil {
			t.Fatalf("RemoveStoredResult(%q) = nil, want a refusal", id)
		}
	}
	if !exists(resultPath) {
		t.Fatal("a refused id removed the stored result")
	}
}

// A link or a folder where a stored file would be is left, with what it leads to, and so is a results folder that is a
// link out of the project; the last is an error, and the summary is then left too.
func TestRemoveStoredResultLeavesWhatIsNotAFileOfTheProject(t *testing.T) {
	t.Run("a link in the results folder", func(t *testing.T) {
		p, recordID, resultPath, summaryPath := summaryFixture(t)
		outside := filepath.Join(t.TempDir(), "kept.json")
		if err := os.Rename(resultPath, outside); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(outside, resultPath); err != nil {
			t.Skipf("this platform or account cannot make a symlink: %v", err)
		}
		if err := p.service(&fakeSidecar{}).RemoveStoredResult(recordID); err != nil {
			t.Fatal(err)
		}
		if !exists(resultPath) || !exists(outside) || exists(summaryPath) {
			t.Fatalf("link there %v, its target there %v, summary there %v; want the link and its target kept and the summary gone", exists(resultPath), exists(outside), exists(summaryPath))
		}
	})
	t.Run("a folder in the results folder", func(t *testing.T) {
		p, recordID, resultPath, _ := summaryFixture(t)
		if err := os.Remove(resultPath); err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Join(resultPath, "inside"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := p.service(&fakeSidecar{}).RemoveStoredResult(recordID); err != nil {
			t.Fatal(err)
		}
		if !exists(filepath.Join(resultPath, "inside")) {
			t.Fatal("the folder was removed")
		}
	})
	for _, kind := range []string{"results", "summaries"} {
		t.Run("the "+kind+" folder linked out of the project", func(t *testing.T) {
			p, recordID, resultPath, summaryPath := summaryFixture(t)
			folder := filepath.Dir(map[string]string{"results": resultPath, "summaries": summaryPath}[kind])
			outside := filepath.Join(t.TempDir(), kind)
			if err := os.Rename(folder, outside); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(outside, folder); err != nil {
				t.Skipf("this platform or account cannot make a symlink: %v", err)
			}
			if err := p.service(&fakeSidecar{}).RemoveStoredResult(recordID); err == nil {
				t.Fatal("RemoveStoredResult through a folder linked out of the project = nil, want an error")
			}
			if !exists(filepath.Join(outside, recordID+".json")) {
				t.Fatal("a file outside the project was removed")
			}
			if kind == "results" && !exists(summaryPath) {
				t.Fatal("the summary was removed though its result could not be")
			}
			if kind == "summaries" && exists(resultPath) {
				t.Fatal("the result is still there: it goes first, before the summary is tried")
			}
		})
	}
}

func TestRemoveStoredResultWorksWhereverTheProjectIs(t *testing.T) {
	folders := map[string]string{
		"spaces":    "My Audio Book (final)",
		"unicode":   "Книга 📚 كتاب 本",
		"very long": strings.Repeat("a-long-folder-name/", 11) + "project",
		"missing":   "never/made",
	}
	for name, folder := range folders {
		t.Run(name, func(t *testing.T) {
			project := filepath.Join(t.TempDir(), filepath.FromSlash(folder))
			service := New(Config{Project: project}, nil, nil)
			if name != "missing" {
				if err := service.results.write(StoredResult{RecordID: "r1"}); err != nil {
					t.Fatal(err)
				}
				if err := service.summaries.write(ResultSummary{RecordID: "r1"}); err != nil {
					t.Fatal(err)
				}
			}
			if err := service.RemoveStoredResult("r1"); err != nil {
				t.Fatal(err)
			}
			for _, dir := range []string{resultsDir(project), summariesDir(project)} {
				if exists(filepath.Join(dir, "r1.json")) {
					t.Fatalf("%s still holds the record's file", dir)
				}
			}
			if swept, err := service.SweepOrphanResults(); err != nil || len(swept) != 0 {
				t.Fatalf("SweepOrphanResults = %v, %v; want nothing", swept, err)
			}
		})
	}
}

func TestRemoveStoredResultReportsAFileAReadOnlyFolderKeeps(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("a folder's mode does not stop a delete on Windows or for root, so the refusal cannot be made here")
	}
	for _, kind := range []string{"results", "summaries"} {
		t.Run(kind, func(t *testing.T) {
			p, recordID, resultPath, summaryPath := summaryFixture(t)
			folder := filepath.Dir(map[string]string{"results": resultPath, "summaries": summaryPath}[kind])
			if err := os.Chmod(folder, 0o500); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = os.Chmod(folder, 0o700) })
			if err := p.service(&fakeSidecar{}).RemoveStoredResult(recordID); err == nil {
				t.Fatal("RemoveStoredResult in a read-only folder = nil, want an error")
			}
			if !exists(summaryPath) {
				t.Fatal("the summary is gone")
			}
		})
	}
}

// --- SweepOrphanResults ---

func writeStored(t *testing.T, service *Service, id string) {
	t.Helper()
	if err := service.results.write(StoredResult{RecordID: id}); err != nil {
		t.Fatal(err)
	}
	if err := service.summaries.write(ResultSummary{RecordID: id}); err != nil {
		t.Fatal(err)
	}
}

// A record file that is there protects its stored result, readable or not; only an id with no file in the ledger
// folder is an orphan.
func TestTheSweepKeepsTheResultOfEveryRecordFileThatIsThere(t *testing.T) {
	p, recordID, _, _ := summaryFixture(t)
	service := p.service(&fakeSidecar{})
	ledger := evidence.LedgerDir(p.dir)
	protected := map[string]string{
		"unreadable":   `{"id":"unreadable"`,
		"newer-schema": `{"id":"newer-schema","schemaVersion":99}`,
		"renamed":      `{"id":"another","schemaVersion":1}`,
		"empty":        ``,
	}
	for id, content := range protected {
		writeBytes(t, filepath.Join(ledger, id+".json"), []byte(content))
		writeStored(t, service, id)
	}
	writeBytes(t, filepath.Join(ledger, "being-written.json.123.tmp"), nil)
	writeStored(t, service, "being-written")
	if err := os.Mkdir(filepath.Join(ledger, "folder.json"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeStored(t, service, "folder")
	writeStored(t, service, "orphan-1")
	writeStored(t, service, "orphan-2")
	if err := os.Remove(filepath.Join(resultsDir(p.dir), "orphan-2.json")); err != nil {
		t.Fatal(err)
	}
	// Files in the stored folders that are no record's: a hand-named copy, a write's temporary file, a folder.
	strays := []string{
		filepath.Join(resultsDir(p.dir), "my copy.json"), filepath.Join(resultsDir(p.dir), "orphan-3.json.tmp"),
		filepath.Join(summariesDir(p.dir), "notes.txt"), filepath.Join(summariesDir(p.dir), "..hidden.json"),
	}
	for _, path := range strays {
		writeBytes(t, path, []byte("{}"))
	}
	if err := os.Mkdir(filepath.Join(resultsDir(p.dir), "orphan-4.json"), 0o755); err != nil {
		t.Fatal(err)
	}

	swept, err := service.SweepOrphanResults()
	if err != nil || !reflect.DeepEqual(swept, []string{"orphan-1", "orphan-2"}) {
		t.Fatalf("SweepOrphanResults = %v, %v; want the two orphans", swept, err)
	}
	kept := append([]string{recordID, "being-written", "folder"}, "unreadable", "newer-schema", "renamed", "empty")
	for _, id := range kept {
		if !exists(filepath.Join(resultsDir(p.dir), id+".json")) || !exists(filepath.Join(summariesDir(p.dir), id+".json")) {
			t.Fatalf("the sweep removed what is stored for %q, whose record file is there", id)
		}
	}
	for _, path := range append(strays, filepath.Join(resultsDir(p.dir), "orphan-4.json")) {
		if !exists(path) {
			t.Fatalf("the sweep removed %s", path)
		}
	}
	if again, err := service.SweepOrphanResults(); err != nil || len(again) != 0 {
		t.Fatalf("a second sweep = %v, %v; want nothing", again, err)
	}
}

// With no ledger folder to say which records exist, nothing is an orphan.
func TestTheSweepRemovesNothingWithoutALedgerFolder(t *testing.T) {
	p, recordID, resultPath, summaryPath := summaryFixture(t)
	if err := os.RemoveAll(evidence.LedgerDir(p.dir)); err != nil {
		t.Fatal(err)
	}
	swept, err := p.service(&fakeSidecar{}).SweepOrphanResults()
	if err != nil || len(swept) != 0 || !exists(resultPath) || !exists(summaryPath) {
		t.Fatalf("SweepOrphanResults with no ledger folder = %v, %v (record %s); want nothing removed", swept, err, recordID)
	}
}

func TestTheSweepReportsAFolderItCannotList(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("a file where a folder goes reads as a missing folder on Windows")
	}
	for name, folder := range map[string]func(project string) string{
		"results": resultsDir, "summaries": summariesDir, "ledger": evidence.LedgerDir,
	} {
		t.Run(name, func(t *testing.T) {
			p, _, resultPath, summaryPath := summaryFixture(t)
			service := p.service(&fakeSidecar{})
			writeStored(t, service, "orphan")
			aside := filepath.Join(t.TempDir(), "aside")
			if err := os.Rename(folder(p.dir), aside); err != nil {
				t.Fatal(err)
			}
			writeBytes(t, folder(p.dir), []byte("a file where the folder goes"))
			if swept, err := service.SweepOrphanResults(); err == nil || len(swept) != 0 {
				t.Fatalf("SweepOrphanResults = %v, %v; want an error and nothing removed", swept, err)
			}
			for _, path := range []string{resultPath, summaryPath, filepath.Join(resultsDir(p.dir), "orphan.json"), filepath.Join(summariesDir(p.dir), "orphan.json")} {
				if filepath.Dir(path) != folder(p.dir) && !exists(path) {
					t.Fatalf("%s was removed", path)
				}
			}
		})
	}
}

// --- what the sweep refuses, and what it leaves ---

// entries is the names in dir, sorted, for comparing a folder before and after a sweep.
func entries(t *testing.T, dir string) []string {
	t.Helper()
	listed, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, entry := range listed {
		names = append(names, entry.Name())
	}
	return names
}

// linkTo replaces the folder at link (kept aside when it is there) with a relative link to target.
func linkTo(t *testing.T, link, target string) {
	t.Helper()
	if exists(link) {
		if err := os.Rename(link, filepath.Join(t.TempDir(), "aside")); err != nil {
			t.Fatal(err)
		}
	}
	relative, err := filepath.Rel(filepath.Dir(link), target)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(relative, link); err != nil {
		t.Skipf("this platform or account cannot make a symlink: %v", err)
	}
}

// storedResultFile and storedSummaryFile are a result and a summary as this package stores them for record id.
func storedResultFile(id string) []byte {
	return []byte(fmt.Sprintf(`{"schemaVersion":1,"recordId":%q,"report":{}}`, id))
}

func storedSummaryFile(id string) []byte {
	return []byte(fmt.Sprintf(`{"schemaVersion":1,"resultVersion":1,"recordId":%q}`, id))
}

// The sweep deletes by a file's name in two folders, so it must be in those two folders and the file must be what this
// package stored there. A results or summaries folder that is a link, or is below one, leads to another folder (the
// project's own, in the worst case), whose files have names too: the sweep refuses it and deletes nothing. In the real
// folders, a file that is no stored result or summary of the record its name carries is left and not reported.
func TestTheSweepDeletesOnlyStoredResultsInItsOwnFolders(t *testing.T) {
	// The narrator's own folder in the project: files named like any other, and a copy of a stored result and summary.
	narratorFiles := map[string][]byte{
		"notes.json": []byte(`{"mine":true}`), "settings.json": []byte(`{"mine":true}`), "reader-state.json": []byte(`{}`),
		"kept-result.json": storedResultFile("kept-result"), "kept-summary.json": storedSummaryFile("kept-summary"),
	}
	links := map[string]struct {
		link   func(project string) string
		target func(project string) string
	}{
		"results linked to the project folder":        {resultsDir, func(project string) string { return project }},
		"summaries linked to the project folder":      {summariesDir, func(project string) string { return project }},
		"results linked to a folder of the project":   {resultsDir, func(project string) string { return filepath.Join(project, "narrator") }},
		"summaries linked to a folder of the project": {summariesDir, func(project string) string { return filepath.Join(project, "narrator") }},
		"results linked to an empty folder":           {resultsDir, func(project string) string { return filepath.Join(project, "empty") }},
		"the coverage folder linked":                  {Dir, func(project string) string { return filepath.Join(project, "narrator") }},
		"the folder above the coverage folder linked": {func(project string) string { return filepath.Dir(Dir(project)) }, func(project string) string { return filepath.Join(project, "narrator") }},
	}
	for name, c := range links {
		t.Run(name, func(t *testing.T) {
			f, _, _, _ := checkedTwiceThenFailed(t)
			writeStored(t, f.service, "orphan")
			writeBytes(t, filepath.Join(f.dir, "project.json"), []byte(`{"dawProjectFile":"book.rpp"}`))
			writeBytes(t, filepath.Join(f.dir, "kept-result.json"), storedResultFile("kept-result"))
			writeBytes(t, filepath.Join(f.dir, "kept-summary.json"), storedSummaryFile("kept-summary"))
			if err := os.Mkdir(filepath.Join(f.dir, "narrator"), 0o755); err != nil {
				t.Fatal(err)
			}
			for file, content := range narratorFiles {
				writeBytes(t, filepath.Join(f.dir, "narrator", file), content)
			}
			if err := os.Mkdir(filepath.Join(f.dir, "empty"), 0o755); err != nil {
				t.Fatal(err)
			}
			linkTo(t, c.link(f.dir), c.target(f.dir))
			project, narrator := entries(t, f.dir), entries(t, filepath.Join(f.dir, "narrator"))

			swept, err := f.service.SweepOrphanResults()
			if err == nil || len(swept) != 0 {
				t.Fatalf("SweepOrphanResults = %v, %v; want an error and nothing removed", swept, err)
			}
			if after := entries(t, f.dir); !reflect.DeepEqual(after, project) {
				t.Fatalf("the project folder holds %v after the sweep, held %v", after, project)
			}
			if after := entries(t, filepath.Join(f.dir, "narrator")); !reflect.DeepEqual(after, narrator) {
				t.Fatalf("the narrator's folder holds %v after the sweep, held %v", after, narrator)
			}
			for _, dir := range []string{resultsDir(f.dir), summariesDir(f.dir)} {
				if real, err := os.Lstat(dir); err == nil && real.IsDir() && !exists(filepath.Join(dir, "orphan.json")) {
					t.Fatalf("the sweep removed the orphan in %s though it refused the pass", dir)
				}
			}
			for _, id := range []string{"kept-result", "kept-summary"} {
				if err := f.service.RemoveStoredResult(id); err == nil {
					t.Fatalf("RemoveStoredResult(%q) through the link = nil, want an error", id)
				}
			}
			if after := entries(t, filepath.Join(f.dir, "narrator")); !reflect.DeepEqual(after, narrator) {
				t.Fatalf("the narrator's folder holds %v after RemoveStoredResult, held %v", after, narrator)
			}
		})
	}

	t.Run("files in the real folders that this package did not store", func(t *testing.T) {
		f, _, _, _ := checkedTwiceThenFailed(t)
		writeStored(t, f.service, "orphan")
		foreign := map[string][]byte{
			"README.json":        []byte("not a result"),
			"another-shape.json": []byte(`{"name":"another-shape","items":[1,2,3]}`),
			"a-list.json":        []byte(`[]`),
			"empty.json":         nil,
			"no-version.json":    []byte(`{"recordId":"no-version"}`),
			"renamed.json":       storedResultFile("another-record"),
			"renamed-too.json":   storedSummaryFile("another-record"),
		}
		for _, dir := range []string{resultsDir(f.dir), summariesDir(f.dir)} {
			for file, content := range foreign {
				writeBytes(t, filepath.Join(dir, file), content)
			}
		}
		// A result is no summary: one left in the summaries folder is not the summary store's file.
		writeBytes(t, filepath.Join(summariesDir(f.dir), "a-result.json"), storedResultFile("a-result"))

		swept, err := f.service.SweepOrphanResults()
		if err != nil || !reflect.DeepEqual(swept, []string{"orphan"}) {
			t.Fatalf("SweepOrphanResults = %v, %v; want the orphan alone", swept, err)
		}
		if got := f.stored("orphan"); got != "- - -" {
			t.Fatalf("the orphan has %q left", got)
		}
		for _, dir := range []string{resultsDir(f.dir), summariesDir(f.dir)} {
			for file := range foreign {
				if !exists(filepath.Join(dir, file)) {
					t.Fatalf("the sweep removed %s from %s", file, dir)
				}
			}
		}
		if !exists(filepath.Join(summariesDir(f.dir), "a-result.json")) {
			t.Fatal("the sweep removed a result from the summaries folder")
		}
	})
}

// The refusal does not wait for a file to remove: a linked folder with nothing in it is an error all the same.
func TestTheSweepRefusesALinkedFolderWithNothingToRemove(t *testing.T) {
	for name, folder := range map[string]func(project string) string{"results": resultsDir, "summaries": summariesDir} {
		t.Run(name, func(t *testing.T) {
			p, _, _, _ := summaryFixture(t)
			empty := filepath.Join(p.dir, "empty")
			if err := os.Mkdir(empty, 0o755); err != nil {
				t.Fatal(err)
			}
			linkTo(t, folder(p.dir), empty)
			if swept, err := p.service(&fakeSidecar{}).SweepOrphanResults(); err == nil || len(swept) != 0 {
				t.Fatalf("SweepOrphanResults = %v, %v; want an error", swept, err)
			}
		})
	}
}

// A results or summaries folder linked out of the project is refused before anything is removed, here or there.
func TestTheSweepRemovesNothingThroughAFolderLinkedOutOfTheProject(t *testing.T) {
	p, _, _, _ := summaryFixture(t)
	service := p.service(&fakeSidecar{})
	writeStored(t, service, "orphan-1")
	writeStored(t, service, "orphan-2")
	outside := filepath.Join(t.TempDir(), "summaries")
	if err := os.Rename(summariesDir(p.dir), outside); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, summariesDir(p.dir)); err != nil {
		t.Skipf("this platform or account cannot make a symlink: %v", err)
	}
	swept, err := service.SweepOrphanResults()
	if err == nil || len(swept) != 0 {
		t.Fatalf("SweepOrphanResults = %v, %v; want an error and nothing removed", swept, err)
	}
	for _, path := range []string{
		filepath.Join(outside, "orphan-1.json"), filepath.Join(outside, "orphan-2.json"),
		filepath.Join(resultsDir(p.dir), "orphan-1.json"), filepath.Join(resultsDir(p.dir), "orphan-2.json"),
	} {
		if !exists(path) {
			t.Fatalf("the sweep removed %s", path)
		}
	}
}

// A ledger folder that is there but holds no record file says nothing of which records exist (a folder being synced or
// moved back, a link to an empty folder): nothing is an orphan, and when the records are back every result still reads.
func TestTheSweepRemovesNothingWhenTheLedgerFolderIsEmpty(t *testing.T) {
	ledgers := map[string]struct {
		make    func(t *testing.T, ledger string)
		refused bool
	}{
		"an empty folder": {make: func(t *testing.T, ledger string) {
			if err := os.Mkdir(ledger, 0o755); err != nil {
				t.Fatal(err)
			}
		}},
		"a folder with no record file": {make: func(t *testing.T, ledger string) {
			if err := os.Mkdir(ledger, 0o755); err != nil {
				t.Fatal(err)
			}
			writeBytes(t, filepath.Join(ledger, "notes.txt"), []byte("no record"))
		}},
		"a link to an empty folder outside the project": {refused: true, make: func(t *testing.T, ledger string) {
			if err := os.Symlink(t.TempDir(), ledger); err != nil {
				t.Skipf("this platform or account cannot make a symlink: %v", err)
			}
		}},
		"a link to an empty folder of the project": {refused: true, make: func(t *testing.T, ledger string) {
			empty := filepath.Join(filepath.Dir(ledger), "empty")
			if err := os.Mkdir(empty, 0o755); err != nil {
				t.Fatal(err)
			}
			linkTo(t, ledger, empty)
		}},
		"a link to nothing": {refused: true, make: func(t *testing.T, ledger string) {
			if err := os.Symlink(filepath.Join(t.TempDir(), "nowhere"), ledger); err != nil {
				t.Skipf("this platform or account cannot make a symlink: %v", err)
			}
		}},
	}
	for name, c := range ledgers {
		t.Run(name, func(t *testing.T) {
			f, first, second, failed := checkedTwiceThenFailed(t)
			before := f.read(t)
			ledger := evidence.LedgerDir(f.dir)
			aside := filepath.Join(t.TempDir(), "ledger")
			if err := os.Rename(ledger, aside); err != nil {
				t.Fatal(err)
			}
			c.make(t, ledger)

			swept, err := f.service.SweepOrphanResults()
			if len(swept) != 0 || (err != nil) != c.refused {
				t.Fatalf("SweepOrphanResults = %v, %v; want nothing removed and refused %v", swept, err, c.refused)
			}

			// The records come back.
			if err := os.RemoveAll(ledger); err != nil {
				t.Fatal(err)
			}
			if err := os.Rename(aside, ledger); err != nil {
				t.Fatal(err)
			}
			for id, want := range map[string]string{first: "result summary record", second: "result summary record", failed: "- - record"} {
				if got := f.stored(id); got != want {
					t.Fatalf("record %s has %q, want %q", id, got, want)
				}
			}
			if after := f.read(t); !reflect.DeepEqual(after, before) {
				t.Fatalf("with the ledger back the readers answer\n%+v\nwas\n%+v", after, before)
			}
		})
	}
}

// The sweep lists the stored files before the ledger. A check that finishes between the two listings (its record, then
// its result) is then in the ledger listing, so its result is no orphan; listed the other way round, it would be one.
func TestTheSweepKeepsACheckThatFinishedWhileItListed(t *testing.T) {
	f, _, second, _ := checkedTwiceThenFailed(t)
	seed, ok := f.service.ledger.Get(second)
	if !ok {
		t.Fatal("the second check's record is not readable")
	}
	writeStored(t, f.service, "orphan")
	f.service.sweepListed = func() {
		arrived := seed
		arrived.ID = "arrived"
		arrived.StartedAt = seed.StartedAt.Add(time.Hour)
		if _, err := f.service.ledger.Write(arrived); err != nil {
			t.Error(err)
		}
		writeStored(t, f.service, arrived.ID)
	}
	swept, err := f.service.SweepOrphanResults()
	if err != nil || !reflect.DeepEqual(swept, []string{"orphan"}) {
		t.Fatalf("SweepOrphanResults = %v, %v; want the orphan alone", swept, err)
	}
	if got := f.stored("arrived"); got != "result summary record" {
		t.Fatalf("the check that finished during the sweep has %q", got)
	}
	f.service.sweepListed = nil
	if again, err := f.service.SweepOrphanResults(); err != nil || len(again) != 0 {
		t.Fatalf("the next sweep = %v, %v; want nothing", again, err)
	}
}

// Only a file with no record is read to see what it is: a sweep that finds no orphan decodes nothing, however many
// results are stored, and one that finds an orphan reads that record's two files.
func TestTheSweepReadsOnlyTheFilesOfRecordsThatAreGone(t *testing.T) {
	f, _, _, _ := checkedTwiceThenFailed(t)
	decoded := func() int64 {
		files, _ := persist.Work()
		return files + f.service.ResultsDecoded()
	}
	before := decoded()
	if swept, err := f.service.SweepOrphanResults(); err != nil || len(swept) != 0 {
		t.Fatalf("SweepOrphanResults = %v, %v; want nothing", swept, err)
	}
	if read := decoded() - before; read != 0 {
		t.Fatalf("a sweep with no orphan decoded %d files, want none", read)
	}
	writeStored(t, f.service, "orphan")
	before = decoded()
	if swept, err := f.service.SweepOrphanResults(); err != nil || !reflect.DeepEqual(swept, []string{"orphan"}) {
		t.Fatalf("SweepOrphanResults = %v, %v; want the orphan", swept, err)
	}
	if read := decoded() - before; read != 2 {
		t.Fatalf("a sweep of one orphan decoded %d files, want its result and its summary", read)
	}
}

// --- a read across a Retain pass ---

// A read picks a chapter's record and then reads that record's stored result. A new check and a Retain pass in between
// delete the picked record with its result; the read then asks the ledger again and answers from the record that is
// there now, never "result missing" for a record that is gone. The pass's snapshot is the pick made before.
func TestAReadAcrossARetainPassNeverAnswersResultMissing(t *testing.T) {
	f, first, second, failed := checkedTwiceThenFailed(t)
	project, projectFile, err := f.service.savedProject()
	if err != nil {
		t.Fatal(err)
	}
	picked := f.service.Pass()
	if records, _ := picked.read.ledger.List(AnalyzerID, testChapter); len(records) != 3 {
		t.Fatalf("the read picked from %d records, want the three checks", len(records))
	}

	run(t, f.testProject.service(&fakeSidecar{present: 9}), testRequest())
	newest := latestRecord(t, f.testProject).ID
	dropped, err := f.retain(t, f.service, removeStoredOf(f.service))
	if err != nil || !reflect.DeepEqual(dropped, []string{first, second, failed}) {
		t.Fatalf("Retain dropped %v, %v; want the three older checks", dropped, err)
	}

	listings, _ := f.service.LedgerReads()
	result, err := picked.ResultIn(project, projectFile, testChapter, DefaultAlignmentParams)
	if err != nil {
		t.Fatal(err)
	}
	if result.State != evidence.StateCurrent || result.Record == nil || result.Record.ID != newest || result.Result == nil || result.Result.RecordID != newest {
		t.Fatalf("the read across the pass answers %s %v of record %+v; want the newest check, current, with its result", result.State, result.Reasons, result.Record)
	}
	if after, _ := f.service.LedgerReads(); after == listings {
		t.Fatal("the read did not ask the ledger again")
	}
	state, summary, err := picked.Summary(project, projectFile, testChapter, DefaultAlignmentParams)
	if err != nil {
		t.Fatal(err)
	}
	if state.State != evidence.StateCurrent || state.Record == nil || state.Record.ID != newest || summary == nil || summary.RecordID != newest {
		t.Fatalf("the summary read across the pass answers %s %v, summary %+v; want the newest check's", state.State, state.Reasons, summary)
	}

	// A read whose record is still there asks the ledger no more than it did: the result is found at once.
	fresh := f.service.Pass()
	listings, _ = f.service.LedgerReads()
	if result, err := fresh.ResultIn(project, projectFile, testChapter, DefaultAlignmentParams); err != nil || result.Result == nil {
		t.Fatalf("a read after the pass = %+v, %v", result, err)
	}
	if after, _ := f.service.LedgerReads(); after != listings {
		t.Fatalf("a read that found its result listed the ledger %d more times", after-listings)
	}
}

// A result that is missing with its record still there is still answered as missing, after one more look at the ledger;
// and when that look finds no record at all, the chapter reads as never checked.
func TestAReadWhoseResultIsMissingAsksTheLedgerOnceMore(t *testing.T) {
	p, recordID, resultPath, _ := summaryFixture(t)
	service := p.service(&fakeSidecar{})
	project, projectFile, err := service.savedProject()
	if err != nil {
		t.Fatal(err)
	}
	picked := service.Pass()
	if err := os.Remove(resultPath); err != nil {
		t.Fatal(err)
	}
	listings, _ := service.LedgerReads()
	result, err := picked.ResultIn(project, projectFile, testChapter, DefaultAlignmentParams)
	if err != nil || result.State != evidence.StateNever || !reflect.DeepEqual(result.Reasons, []string{string(ReasonResultMissing)}) || result.Record == nil || result.Record.ID != recordID {
		t.Fatalf("a read of a record without its result = %+v, %v; want never checked, result missing", result, err)
	}
	if after, _ := service.LedgerReads(); after != listings+1 {
		t.Fatalf("the read listed the ledger %d times after the miss, want once", after-listings)
	}
	if state, summary, err := picked.Summary(project, projectFile, testChapter, DefaultAlignmentParams); err != nil || summary != nil || !reflect.DeepEqual(state.Reasons, []string{string(ReasonResultMissing)}) {
		t.Fatalf("a summary read of a record without its result = %+v, %+v, %v; want result missing", state, summary, err)
	}

	if err := os.Remove(filepath.Join(evidence.LedgerDir(p.dir), recordID+".json")); err != nil {
		t.Fatal(err)
	}
	result, err = picked.ResultIn(project, projectFile, testChapter, DefaultAlignmentParams)
	if err != nil || result.State != evidence.StateNever || result.Record != nil || len(result.Reasons) != 0 && result.Reasons[0] == string(ReasonResultMissing) {
		t.Fatalf("a read whose record is gone too = %+v, %v; want never checked, with no record", result, err)
	}
	if state, summary, err := picked.Summary(project, projectFile, testChapter, DefaultAlignmentParams); err != nil || summary != nil || state.Record != nil {
		t.Fatalf("a summary read whose record is gone too = %+v, %+v, %v; want no record", state, summary, err)
	}
}

// --- beside reads and writes (run with -race) ---

func TestRetainAndTheSweepRunBesideReadsAndWrites(t *testing.T) {
	f, _, second, _ := checkedTwiceThenFailed(t)
	seed, ok := f.service.ledger.Get(second)
	if !ok {
		t.Fatal("the second check's record is not readable")
	}
	stop := make(chan struct{})
	var busy sync.WaitGroup
	loop := func(work func() error) {
		busy.Go(func() {
			for {
				select {
				case <-stop:
					return
				default:
					if err := work(); err != nil {
						t.Error(err)
						return
					}
				}
			}
		})
	}
	loop(func() error { _, err := f.service.Result(testChapter, DefaultAlignmentParams); return err })
	loop(func() error { f.service.RecordedFractions(DefaultAlignmentParams); return nil })
	loop(func() error { _, err := f.service.latestRecord(testChapter); return err })
	loop(func() error {
		_, err := f.service.ledger.Retain(retentionKeys, nil, removeStoredOf(f.service))
		return err
	})
	loop(func() error { _, err := f.service.SweepOrphanResults(); return err })

	// Complete checks arrive as a run stores them: the record, then its result and summary.
	var newest string
	for n := range 20 {
		record := seed
		record.ID = fmt.Sprintf("arrived-%02d", n)
		record.StartedAt = seed.StartedAt.Add(time.Duration(n+1) * time.Hour)
		record.CompletedAt = record.StartedAt.Add(time.Minute)
		if _, err := f.service.ledger.Write(record); err != nil {
			t.Fatal(err)
		}
		writeStored(t, f.service, record.ID)
		newest = record.ID
	}
	close(stop)
	busy.Wait()

	if _, err := f.service.ledger.Retain(retentionKeys, nil, removeStoredOf(f.service)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.SweepOrphanResults(); err != nil {
		t.Fatal(err)
	}
	left, err := f.service.ledger.List(AnalyzerID, testChapter)
	if err != nil || len(left) != 1 || left[0].ID != newest {
		t.Fatalf("the ledger holds %d records, %v; want only the newest check", len(left), err)
	}
	for _, dir := range []string{resultsDir(f.dir), summariesDir(f.dir)} {
		entries, err := os.ReadDir(dir)
		if err != nil || len(entries) != 1 || entries[0].Name() != newest+".json" {
			t.Fatalf("%s holds %d files, %v; want only the newest check's", dir, len(entries), err)
		}
	}
}

// A ledger that belongs to another project holds none of this project's records, so a sweep that trusted it would treat every
// stored result as an orphan.
func TestTheSweepRefusesALedgerOfAnotherProject(t *testing.T) {
	f, _, _, _ := checkedTwiceThenFailed(t)
	writeStored(t, f.service, "orphan")
	before := f.stored("orphan")
	other := t.TempDir()
	foreign := evidence.NewLedgerStore(other)
	if _, err := foreign.Write(evidence.LedgerRecord{AnalyzerID: "coverage"}); err != nil {
		t.Fatal(err)
	}
	f.service.ledger = foreign
	swept, err := f.service.SweepOrphanResults()
	if err == nil || len(swept) != 0 {
		t.Fatalf("SweepOrphanResults = %v, %v; want an error and nothing removed", swept, err)
	}
	if got := f.stored("orphan"); got != before {
		t.Fatalf("the sweep touched the results: %q", got)
	}
}
