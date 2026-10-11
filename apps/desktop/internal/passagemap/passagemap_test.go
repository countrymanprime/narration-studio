package passagemap

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// testBook is a stand-in manuscript a test edits between calls, the way a re-import changes what the host reads back.
type testBook struct{ book Book }

func (b *testBook) read() (Book, error) { return b.book, nil }

func sampleBook() *testBook {
	return &testBook{book: Book{
		Chapters: []string{"c1", "c2"},
		Lines: []Line{
			{ChapterID: "c1", ID: "p1", Words: 6},
			{ChapterID: "c1", ID: "p2", Words: 4},
			{ChapterID: "c2", ID: "p9", Words: 3},
		},
	}}
}

// fakeStamp is what the host would read from the DAW when a run ends.
type fakeStamp struct {
	stamp  Stamp
	err    error
	called []string
}

func (f *fakeStamp) read(chapterID string) (Stamp, error) {
	f.called = append(f.called, chapterID)
	return f.stamp, f.err
}

func newTestService(t *testing.T, manuscript *testBook, stamp *fakeStamp) (*Service, string) {
	t.Helper()
	project := t.TempDir()
	return New(Config{Project: project, Manuscript: manuscript.read, Stamp: stamp.read}), project
}

func at(pid string, word int) *Place { return &Place{PID: pid, Word: word} }

// sampleRun is a take started at p1 word 0, rolled at p1 word 3 after reading to word 4, and stopped at p2 word 2.
func sampleRun() []MarkInput {
	return []MarkInput{
		{PID: "p1", Word: 0, Sec: 0, Kind: KindStart},
		{PID: "p1", Word: 3, Sec: 4.5, Kind: KindRoll, Prev: at("p1", 4)},
		{PID: "p2", Word: 2, Sec: 9.25, Kind: KindStop, Prev: at("p2", 2)},
	}
}

func mustRecord(t *testing.T, service *Service, chapterID string, run []MarkInput) []Resolved {
	t.Helper()
	marks, err := service.RecordRun(chapterID, run)
	if err != nil {
		t.Fatalf("RecordRun(%s): %v", chapterID, err)
	}
	return marks
}

func mustList(t *testing.T, service *Service, chapterID string) []Resolved {
	t.Helper()
	list, err := service.List(chapterID)
	if err != nil {
		t.Fatalf("List(%s): %v", chapterID, err)
	}
	return list
}

func TestWriteARunAndReadItBack(t *testing.T) {
	manuscript := sampleBook()
	stamp := &fakeStamp{stamp: Stamp{ItemGUID: "{ITEM-1}", TakeGUIDs: []string{"{TAKE-1}"}}}
	service, project := newTestService(t, manuscript, stamp)
	marks := mustRecord(t, service, "c1", sampleRun())
	if len(marks) != 3 {
		t.Fatalf("marks = %+v", marks)
	}
	for index, kind := range []string{KindStart, KindRoll, KindStop} {
		mark := marks[index]
		if mark.Kind != kind || mark.Run != "c1.1" || mark.ChapterID != "c1" || mark.ID == "" || mark.Stale {
			t.Fatalf("mark %d = %+v", index, mark)
		}
	}
	if marks[1].Prev == nil || *marks[1].Prev != (Place{PID: "p1", Word: 4}) || marks[0].Prev != nil || marks[2].Sec != 9.25 {
		t.Fatalf("marks = %+v", marks)
	}
	second := mustRecord(t, service, "c1", []MarkInput{{PID: "p2", Word: 0, Sec: 20, Kind: KindStart}, {PID: "p2", Word: 4, Sec: 22, Kind: KindStop, Prev: at("p2", 4)}})
	if second[0].Run != "c1.2" || second[0].ID == marks[0].ID {
		t.Fatalf("second run = %+v", second)
	}
	mustRecord(t, service, "c2", []MarkInput{{PID: "p9", Word: 0, Sec: 0, Kind: KindStart}, {PID: "p9", Word: 3, Sec: 2, Kind: KindStop, Prev: at("p9", 3)}})
	// A new service over the same folder reads the same state, one chapter at a time, runs in the order they were recorded.
	again := New(Config{Project: project, Manuscript: manuscript.read})
	list := mustList(t, again, "c1")
	if len(list) != 5 || list[0].Run != "c1.1" || list[3].Run != "c1.2" || list[2].Kind != KindStop {
		t.Fatalf("list from a new service = %+v", list)
	}
	if other := mustList(t, again, "c2"); len(other) != 2 || other[0].Run != "c2.1" {
		t.Fatalf("other chapter = %+v", other)
	}
	if none := mustList(t, again, "c9"); len(none) != 0 {
		t.Fatalf("a chapter with no runs = %+v", none)
	}
}

func TestMarksAreValidatedAgainstTheManuscript(t *testing.T) {
	stamp := &fakeStamp{}
	service, project := newTestService(t, sampleBook(), stamp)
	with := func(change func([]MarkInput)) []MarkInput {
		run := sampleRun()
		change(run)
		return run
	}
	for _, refused := range []struct {
		name, chapterID string
		run             []MarkInput
		want            string
	}{
		{"chapter the manuscript lacks", "c9", sampleRun(), "chapter"},
		{"paragraph not in that chapter", "c1", with(func(r []MarkInput) { r[1].PID = "p9" }), "paragraph"},
		{"previous paragraph not in that chapter", "c1", with(func(r []MarkInput) { r[1].Prev = at("p9", 0) }), "paragraph"},
		{"word past the paragraph's count", "c1", with(func(r []MarkInput) { r[1].Word = 7 }), "word"},
		{"previous word past the count", "c1", with(func(r []MarkInput) { r[2].Prev = at("p2", 5) }), "word"},
		{"negative word", "c1", with(func(r []MarkInput) { r[0].Word = -1 }), "word"},
		{"negative seconds", "c1", with(func(r []MarkInput) { r[0].Sec = -0.5 }), "seconds"},
		{"not a number", "c1", with(func(r []MarkInput) { r[1].Sec = math.NaN() }), "seconds"},
		{"infinite", "c1", with(func(r []MarkInput) { r[2].Sec = math.Inf(1) }), "seconds"},
		{"roll without prev", "c1", with(func(r []MarkInput) { r[1].Prev = nil }), "where the take before"},
		{"stop without prev", "c1", with(func(r []MarkInput) { r[2].Prev = nil }), "where the take before"},
		{"start with prev", "c1", with(func(r []MarkInput) { r[0].Prev = at("p1", 0) }), "start"},
		{"out of time order", "c1", with(func(r []MarkInput) { r[1].Sec = 10 }), "order"},
		{"no start first", "c1", with(func(r []MarkInput) { r[0].Kind = KindRoll; r[0].Prev = at("p1", 0) }), "start"},
		{"no stop last", "c1", with(func(r []MarkInput) { r[2].Kind = KindRoll }), "stop"},
		{"a second start", "c1", with(func(r []MarkInput) { r[1].Kind = KindStart; r[1].Prev = nil }), "roll"},
		{"unknown kind", "c1", with(func(r []MarkInput) { r[1].Kind = "pause" }), "roll"},
		{"too short", "c1", sampleRun()[:1], "start and a stop"},
		{"empty", "c1", nil, "start and a stop"},
	} {
		if _, err := service.RecordRun(refused.chapterID, refused.run); err == nil || !strings.Contains(err.Error(), refused.want) {
			t.Errorf("%s: err = %v, want a sentence naming %q", refused.name, err, refused.want)
		}
	}
	if _, err := os.Stat(File(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused run wrote the file: %v", err)
	}
	if len(stamp.called) != 0 {
		t.Fatalf("a refused run asked the DAW for its ids: %v", stamp.called)
	}
	// The edges of a paragraph are places: word 0 and the word count (the reading reached its end).
	mustRecord(t, service, "c1", []MarkInput{{PID: "p2", Word: 0, Sec: 0, Kind: KindStart}, {PID: "p2", Word: 4, Sec: 0, Kind: KindStop, Prev: at("p2", 4)}})
}

func TestTheRunIsBounded(t *testing.T) {
	long := strings.Repeat("p", MaxIDLength+1)
	book := sampleBook()
	book.book.Chapters = append(book.book.Chapters, long, "c\x07")
	book.book.Lines = append(book.book.Lines, Line{ChapterID: "c1", ID: long, Words: 3}, Line{ChapterID: "c1", ID: "p\n", Words: 3})
	service, project := newTestService(t, book, &fakeStamp{})
	tooMany := []MarkInput{{PID: "p1", Kind: KindStart}}
	for range MaxMarksPerRun - 1 {
		tooMany = append(tooMany, MarkInput{PID: "p1", Kind: KindRoll, Prev: at("p1", 0)})
	}
	tooMany[len(tooMany)-1].Kind = KindStop
	for _, refused := range []struct {
		name, chapterID string
		run             []MarkInput
		want            string
	}{
		{"an over-long chapter id", long, sampleRun(), "id"},
		{"control characters in a chapter id", "c\x07", sampleRun(), "id"},
		{"an over-long paragraph id", "c1", []MarkInput{{PID: long, Kind: KindStart}, {PID: "p1", Kind: KindStop, Prev: at("p1", 0)}}, "id"},
		{"control characters in a paragraph id", "c1", []MarkInput{{PID: "p\n", Kind: KindStart}, {PID: "p1", Kind: KindStop, Prev: at("p1", 0)}}, "id"},
		{"too many marks", "c1", append(tooMany, MarkInput{PID: "p1", Kind: KindStop, Prev: at("p1", 0)}), "at most"},
		{"too many seconds", "c1", []MarkInput{{PID: "p1", Kind: KindStart}, {PID: "p1", Sec: MaxSeconds + 1, Kind: KindStop, Prev: at("p1", 0)}}, "seconds"},
	} {
		if _, err := service.RecordRun(refused.chapterID, refused.run); err == nil || !strings.Contains(err.Error(), refused.want) {
			t.Errorf("%s: err = %v, want a sentence naming %q", refused.name, err, refused.want)
		}
	}
	if _, err := os.Stat(File(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused run wrote the file: %v", err)
	}
	// The most marks a run holds is a run, and so is the most runs a chapter holds; one more run is refused.
	tooMany[len(tooMany)-1].Kind = KindStop
	mustRecord(t, service, "c1", tooMany)
	short := []MarkInput{{PID: "p1", Kind: KindStart}, {PID: "p1", Kind: KindStop, Prev: at("p1", 1)}}
	for range MaxRunsPerChapter - 1 {
		mustRecord(t, service, "c1", short)
	}
	if _, err := service.RecordRun("c1", short); err == nil || !strings.Contains(err.Error(), "at most") {
		t.Fatalf("one run past the limit: err = %v", err)
	}
	// Another chapter still has room.
	mustRecord(t, service, "c2", []MarkInput{{PID: "p9", Kind: KindStart}, {PID: "p9", Kind: KindStop, Prev: at("p9", 1)}})
}

func TestTheHostStampsTheDAWsIDsAtStop(t *testing.T) {
	t.Run("the last item's GUID on every mark, and each take's GUID on the marks that began it", func(t *testing.T) {
		stamp := &fakeStamp{stamp: Stamp{ItemGUID: "{ITEM-9}", TakeGUIDs: []string{"{TAKE-A}", "{TAKE-B}"}}}
		service, _ := newTestService(t, sampleBook(), stamp)
		marks := mustRecord(t, service, "c1", sampleRun())
		if len(stamp.called) != 1 || stamp.called[0] != "c1" {
			t.Fatalf("stamp asked for %v", stamp.called)
		}
		for index, want := range []string{"{TAKE-A}", "{TAKE-B}", "{TAKE-B}"} {
			if marks[index].ItemGUID != "{ITEM-9}" || marks[index].TakeGUID != want {
				t.Errorf("mark %d = %+v, want take %s", index, marks[index], want)
			}
		}
	})
	t.Run("one take GUID stamps every mark", func(t *testing.T) {
		stamp := &fakeStamp{stamp: Stamp{ItemGUID: "Take 004", TakeGUIDs: []string{"Take 004"}}}
		service, _ := newTestService(t, sampleBook(), stamp)
		for _, mark := range mustRecord(t, service, "c1", sampleRun()) {
			if mark.ItemGUID != "Take 004" || mark.TakeGUID != "Take 004" {
				t.Errorf("mark = %+v", mark)
			}
		}
	})
	t.Run("a DAW that cannot be read keeps the run, unstamped", func(t *testing.T) {
		stamp := &fakeStamp{err: errors.New("REAPER is not answering")}
		service, project := newTestService(t, sampleBook(), stamp)
		marks := mustRecord(t, service, "c1", sampleRun())
		if marks[0].ItemGUID != "" || marks[0].TakeGUID != "" {
			t.Fatalf("marks = %+v", marks)
		}
		if list := mustList(t, New(Config{Project: project, Manuscript: sampleBook().read}), "c1"); len(list) != 3 {
			t.Fatalf("list = %+v", list)
		}
	})
	t.Run("a stamp that is not an id is refused, the run kept unstamped", func(t *testing.T) {
		stamp := &fakeStamp{stamp: Stamp{ItemGUID: strings.Repeat("x", MaxIDLength+1), TakeGUIDs: []string{"ok"}}}
		service, _ := newTestService(t, sampleBook(), stamp)
		if marks := mustRecord(t, service, "c1", sampleRun()); marks[0].ItemGUID != "" || marks[0].TakeGUID != "" {
			t.Fatalf("marks = %+v", marks)
		}
	})
}

func TestFileIsDerivedDataValidatedOnRead(t *testing.T) {
	t.Run("a corrupt file is kept aside and an empty map starts", func(t *testing.T) {
		service, project := newTestService(t, sampleBook(), &fakeStamp{})
		writeFile(t, File(project), "{not json")
		if list := mustList(t, service, "c1"); len(list) != 0 {
			t.Fatalf("list from a corrupt file = %+v", list)
		}
		if kept, _ := filepath.Glob(File(project) + ".corrupt-*"); len(kept) != 1 {
			t.Fatalf("corrupt copies = %v", kept)
		}
		mustRecord(t, service, "c1", sampleRun())
	})
	t.Run("a file that breaks a rule is corrupt", func(t *testing.T) {
		service, project := newTestService(t, sampleBook(), &fakeStamp{})
		writeFile(t, File(project), `{"schemaVersion":1,"marks":[{"id":"c1.1.0","run":"c1.1","chapterId":"c1","pid":"p1","word":-2,"sec":0,"kind":"start","itemGuid":"","takeGuid":""}]}`)
		if list := mustList(t, service, "c1"); len(list) != 0 {
			t.Fatalf("list from a file with a negative word = %+v", list)
		}
		if kept, _ := filepath.Glob(File(project) + ".corrupt-*"); len(kept) != 1 {
			t.Fatalf("corrupt copies = %v", kept)
		}
	})
	t.Run("a file from a newer app is refused and never overwritten", func(t *testing.T) {
		service, project := newTestService(t, sampleBook(), &fakeStamp{})
		newer := `{"schemaVersion": 99, "marks": []}`
		writeFile(t, File(project), newer)
		if _, err := service.List("c1"); err == nil || !strings.Contains(err.Error(), "newer version") {
			t.Fatalf("list of a newer file = %v", err)
		}
		if _, err := service.RecordRun("c1", sampleRun()); err == nil {
			t.Fatal("a run over a newer file was saved")
		}
		if raw, _ := os.ReadFile(File(project)); string(raw) != newer {
			t.Fatalf("the newer file was overwritten: %s", raw)
		}
	})
	t.Run("a write is a temporary file then a rename, and stores no derived field", func(t *testing.T) {
		service, project := newTestService(t, sampleBook(), &fakeStamp{})
		mustRecord(t, service, "c1", sampleRun())
		if _, err := os.Stat(File(project) + ".tmp"); !os.IsNotExist(err) {
			t.Fatalf("the temporary file was left behind: %v", err)
		}
		raw, err := os.ReadFile(File(project))
		if err != nil {
			t.Fatal(err)
		}
		var stored struct {
			SchemaVersion int              `json:"schemaVersion"`
			Marks         []map[string]any `json:"marks"`
		}
		if err := json.Unmarshal(raw, &stored); err != nil {
			t.Fatal(err)
		}
		if stored.SchemaVersion != SchemaVersion || len(stored.Marks) != 3 {
			t.Fatalf("stored = %s", raw)
		}
		if _, ok := stored.Marks[0]["stale"]; ok {
			t.Errorf("stale was stored: %s", raw)
		}
	})
}

func TestAMarkWhoseParagraphIsGoneIsReportedStaleNotMoved(t *testing.T) {
	manuscript := sampleBook()
	service, _ := newTestService(t, manuscript, &fakeStamp{})
	mustRecord(t, service, "c1", sampleRun())
	// The narrator re-imports without a reset: p1 is gone, and p2 has fewer words than the stop mark's word.
	manuscript.book = Book{Chapters: []string{"c1"}, Lines: []Line{{ChapterID: "c1", ID: "p2", Words: 1}}}
	list := mustList(t, service, "c1")
	if len(list) != 3 {
		t.Fatalf("list = %+v", list)
	}
	if !list[0].Stale || list[0].StaleReason != StaleParagraphMissing || list[0].PID != "p1" || list[0].Word != 0 {
		t.Errorf("start on a gone paragraph = %+v", list[0])
	}
	if !list[1].Stale || list[1].StaleReason != StaleParagraphMissing || list[1].Word != 3 {
		t.Errorf("roll on a gone paragraph = %+v", list[1])
	}
	if !list[2].Stale || list[2].StaleReason != StaleWordOutOfRange || list[2].PID != "p2" || list[2].Word != 2 || list[2].Prev.Word != 2 {
		t.Errorf("stop past the shorter paragraph = %+v", list[2])
	}
	// With the paragraphs back, nothing is stale: the marks were never moved.
	manuscript.book = Book{Chapters: []string{"c1"}, Lines: []Line{{ChapterID: "c1", ID: "p1", Words: 6}, {ChapterID: "c1", ID: "p2", Words: 4}}}
	if list := mustList(t, service, "c1"); list[0].Stale || list[1].Stale || list[2].Stale {
		t.Fatalf("with the paragraphs back = %+v", list)
	}
	// A mark whose own paragraph is there but whose previous place is gone is stale too.
	mustRecord(t, service, "c1", []MarkInput{{PID: "p1", Kind: KindStart}, {PID: "p2", Word: 1, Sec: 3, Kind: KindStop, Prev: at("p1", 5)}})
	manuscript.book.Lines = manuscript.book.Lines[1:]
	if list := mustList(t, service, "c1"); !list[4].Stale || list[4].StaleReason != StaleParagraphMissing || list[4].PID != "p2" {
		t.Fatalf("a stop whose prev is gone = %+v", list[4])
	}
}

func TestWithNoProjectNothingIsSaved(t *testing.T) {
	service := New(Config{Manuscript: sampleBook().read})
	if _, err := service.RecordRun("c1", sampleRun()); err == nil {
		t.Fatal("a run with no project was saved")
	}
	if list, err := service.List("c1"); err != nil || len(list) != 0 {
		t.Fatalf("list with no project = %+v, %v", list, err)
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}
