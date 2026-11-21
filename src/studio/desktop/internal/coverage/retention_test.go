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

func TestTheSweepStopsAtAnOrphanItCannotRemove(t *testing.T) {
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
		t.Fatalf("SweepOrphanResults = %v, %v; want an error at the first orphan", swept, err)
	}
	if !exists(filepath.Join(outside, "orphan-1.json")) || !exists(filepath.Join(resultsDir(p.dir), "orphan-2.json")) {
		t.Fatal("the sweep went on past the orphan it could not remove")
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
