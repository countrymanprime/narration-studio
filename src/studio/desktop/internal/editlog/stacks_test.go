package editlog

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/passagemap"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// stackOf is passage ps-1's two later reads stacked on its first read t-1, as the app sends it after REAPER accepted stackTakes:
// t-2 began 6.7 s and t-3 14.2 s after the first read's start.
func stackOf() StackRecordRequest {
	one := 1
	return StackRecordRequest{
		PassageID: "passage-ps1", Base: "take:{A}:{T1}", Takes: []string{"take:{A}:{T1}", "take:{A}:{T2}", "take:{A}:{T3}"},
		Moves: []StackMove{{TakeID: "take:{A}:{T3}", Offset: 14.2}, {TakeID: "take:{A}:{T2}", Offset: 6.7}}, Mode: StackModeNative, UndoSteps: &one,
	}
}

func offsetsOf(stack PassageStack) string {
	ids := make([]string, 0, len(stack.Offsets))
	for _, id := range []string{"take:{A}:{T1}", "take:{A}:{T2}", "take:{A}:{T3}"} {
		if _, ok := stack.Offsets[id]; ok {
			ids = append(ids, id)
		}
	}
	return strings.Join(ids, ",")
}

// 1. record-list-remove-roundtrip
func TestStackRecordListRemoveRoundtrip(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if list, err := service.StacksList("c-0001"); err != nil || len(list.Stacks) != 0 || list.ChapterID != "c-0001" {
		t.Fatalf("list of a new project = %+v, %v", list, err)
	}
	change, err := service.StackRecord("c-0001", stackOf())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(change.Changed, ",") != "take:{A}:{T2},take:{A}:{T3}" || len(change.Stacks) != 1 {
		t.Fatalf("record = %+v", change)
	}
	stack := change.Stacks[0]
	if stack.ID != "stk-passage-ps1" || stack.Base != "take:{A}:{T1}" || stack.Offsets["take:{A}:{T2}"] != 6.7 || stack.Offsets["take:{A}:{T3}"] != 14.2 ||
		stack.Mode != StackModeNative || stack.UndoSteps != 1 || stack.At.IsZero() {
		t.Fatalf("stack = %+v", stack)
	}
	if list, err := newService(t, project, &book).StacksList("c-0001"); err != nil || len(list.Stacks) != 1 || offsetsOf(list.Stacks[0]) != "take:{A}:{T2},take:{A}:{T3}" {
		t.Fatalf("list from another service = %+v, %v", list, err)
	}
	if list, _ := service.StacksList("c-0002"); len(list.Stacks) != 0 {
		t.Fatalf("another chapter's list = %+v", list)
	}

	// A partial un-stack: t-3 goes back, t-2 stays.
	partial, err := service.StackRemove("c-0001", "passage-ps1", []string{"take:{A}:{T3}", "take:{A}:{T9}"})
	if err != nil || strings.Join(partial.Changed, ",") != "take:{A}:{T3}" || len(partial.Stacks) != 1 || offsetsOf(partial.Stacks[0]) != "take:{A}:{T2}" {
		t.Fatalf("partial remove = %+v, %v", partial, err)
	}
	if list, _ := newService(t, project, &book).StacksList("c-0001"); offsetsOf(list.Stacks[0]) != "take:{A}:{T2}" {
		t.Fatalf("list after the partial remove = %+v", list)
	}
	// The rest: the stack goes with its last take.
	rest, err := service.StackRemove("c-0001", "passage-ps1", []string{"take:{A}:{T2}"})
	if err != nil || strings.Join(rest.Changed, ",") != "take:{A}:{T2}" || len(rest.Stacks) != 0 {
		t.Fatalf("remove the rest = %+v, %v", rest, err)
	}
	if list, _ := newService(t, project, &book).StacksList("c-0001"); len(list.Stacks) != 0 {
		t.Fatalf("list after the last remove = %+v", list)
	}
	if again, err := service.StackRemove("c-0001", "passage-ps1", []string{"take:{A}:{T2}"}); err != nil || len(again.Changed) != 0 {
		t.Fatalf("remove of a take not stacked = %+v, %v", again, err)
	}
	if _, err := service.StackRemove("c-0001", "passage-ps1", nil); err == nil {
		t.Fatal("a remove that names no take was accepted")
	}
}

// A passage already stacked takes another take onto the same first read; the result is the latest record's.
func TestStackRecordAddsToAStackOnTheSameBase(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	first := stackOf()
	first.Moves = first.Moves[1:]
	if _, err := service.StackRecord("c-0001", first); err != nil {
		t.Fatal(err)
	}
	three := 3
	second := stackOf()
	second.Moves = second.Moves[:1]
	second.Mode, second.UndoSteps, second.Steps, second.BackupID = StackModeSteps, &three, []string{"Moved the read at 30 s", "Closed the gap", "Muted the old place"}, "bk1"
	change, err := service.StackRecord("c-0001", second)
	if err != nil {
		t.Fatal(err)
	}
	stack := change.Stacks[0]
	if offsetsOf(stack) != "take:{A}:{T2},take:{A}:{T3}" || stack.Mode != StackModeSteps || stack.UndoSteps != 3 || len(stack.Steps) != 3 || stack.BackupID != "bk1" {
		t.Fatalf("stack = %+v", stack)
	}
	other := stackOf()
	other.Base, other.Moves = "take:{A}:{T2}", []StackMove{{TakeID: "take:{A}:{T1}", Offset: 1}}
	if _, err := service.StackRecord("c-0001", other); err == nil || !strings.Contains(err.Error(), "another first read") {
		t.Fatalf("a record on another first read = %v", err)
	}
}

// 2. offsets-are-validated
func TestStackRecordIsValidated(t *testing.T) {
	book := aliceBook()
	for name, change := range map[string]func(*StackRecordRequest){
		"a take the passage does not have":       func(r *StackRecordRequest) { r.Moves[0].TakeID = "take:{B}:{T9}" },
		"a first read the passage does not have": func(r *StackRecordRequest) { r.Base = "take:{B}:{T9}" },
		"a negative offset":                      func(r *StackRecordRequest) { r.Moves[0].Offset = -0.1 },
		"a NaN offset":                           func(r *StackRecordRequest) { r.Moves[0].Offset = math.NaN() },
		"an infinite offset":                     func(r *StackRecordRequest) { r.Moves[0].Offset = math.Inf(1) },
		"an empty move list":                     func(r *StackRecordRequest) { r.Moves = nil },
		"the first read moved onto itself":       func(r *StackRecordRequest) { r.Moves[0].TakeID = r.Base },
		"a take moved twice":                     func(r *StackRecordRequest) { r.Moves[1].TakeID = r.Moves[0].TakeID },
		"a path for a passage":                   func(r *StackRecordRequest) { r.PassageID = "../../etc/passwd" },
		"a path for a take": func(r *StackRecordRequest) {
			r.Takes = append(r.Takes, `C:\Users\me\take.wav`)
			r.Moves[0].TakeID = `C:\Users\me\take.wav`
		},
		"markup for a take": func(r *StackRecordRequest) {
			r.Takes = append(r.Takes, "<img>")
			r.Moves[0].TakeID = "<img>"
		},
	} {
		t.Run(name, func(t *testing.T) {
			project := t.TempDir()
			request := stackOf()
			change(&request)
			if _, err := newService(t, project, &book).StackRecord("c-0001", request); err == nil {
				t.Fatal("refused request was saved")
			}
			if _, err := os.Stat(StacksFile(project)); !os.IsNotExist(err) {
				t.Fatalf("a refused stack saved the file: %v", err)
			}
		})
	}
	t.Run("a record on a take already stacked", func(t *testing.T) {
		project := t.TempDir()
		service := newService(t, project, &book)
		if _, err := service.StackRecord("c-0001", stackOf()); err != nil {
			t.Fatal(err)
		}
		before, _ := os.ReadFile(StacksFile(project))
		again := stackOf()
		again.Moves = again.Moves[:1]
		if _, err := service.StackRecord("c-0001", again); err == nil || !strings.Contains(err.Error(), "already stacked") {
			t.Fatalf("a second record on the same take = %v", err)
		}
		if after, _ := os.ReadFile(StacksFile(project)); string(after) != string(before) {
			t.Fatalf("a refused record changed the file: %s", after)
		}
	})
	t.Run("a chapter not in the manuscript", func(t *testing.T) {
		project := t.TempDir()
		if _, err := newService(t, project, &book).StackRecord("missing", stackOf()); err == nil || !strings.Contains(err.Error(), "not in the manuscript") {
			t.Fatalf("record = %v", err)
		}
	})
}

// 3. a-record-needs-the-daw-result
func TestStackRecordNeedsTheDawResult(t *testing.T) {
	book := aliceBook()
	zero, one, two := 0, 1, 2
	for name, change := range map[string]func(*StackRecordRequest){
		"no undo steps":            func(r *StackRecordRequest) { r.UndoSteps = nil },
		"no mode":                  func(r *StackRecordRequest) { r.Mode = "" },
		"an unknown mode":          func(r *StackRecordRequest) { r.Mode = "magic" },
		"native with no undo step": func(r *StackRecordRequest) { r.UndoSteps = &zero },
		"native with steps":        func(r *StackRecordRequest) { r.Steps = []string{"Moved"} },
		"too many undo steps":      func(r *StackRecordRequest) { thirteen := 13; r.UndoSteps = &thirteen },
		"steps without steps":      func(r *StackRecordRequest) { r.Mode, r.UndoSteps, r.BackupID = StackModeSteps, &two, "bk1" },
		"steps without a backup": func(r *StackRecordRequest) {
			r.Mode, r.UndoSteps, r.Steps = StackModeSteps, &two, []string{"Moved", "Closed"}
		},
		"a step over two lines": func(r *StackRecordRequest) {
			r.Mode, r.Steps, r.BackupID = StackModeSteps, []string{"Moved\nthen closed"}, "bk1"
		},
		"a backup id that is a path": func(r *StackRecordRequest) {
			r.Mode, r.Steps, r.BackupID = StackModeSteps, []string{"Moved"}, "/tmp/backup.wav"
		},
		"the app's stack with a step": func(r *StackRecordRequest) { r.Mode, r.UndoSteps, r.Steps = StackModeApp, &zero, []string{"Moved"} },
	} {
		t.Run(name, func(t *testing.T) {
			project := t.TempDir()
			request := stackOf()
			change(&request)
			if _, err := newService(t, project, &book).StackRecord("c-0001", request); err == nil {
				t.Fatal("a record without the DAW's result was saved")
			}
		})
	}
	project := t.TempDir()
	service := newService(t, project, &book)
	app := stackOf()
	app.Mode, app.UndoSteps = StackModeApp, &zero
	if _, err := service.StackRecord("c-0001", app); err != nil {
		t.Fatalf("the built-in recorder's stack = %v", err)
	}
	steps := stackOf()
	steps.PassageID, steps.Mode, steps.UndoSteps, steps.Steps, steps.BackupID = "passage-ps2", StackModeSteps, &one, []string{"Moved the read"}, "bk1"
	if _, err := service.StackRecord("c-0001", steps); err != nil {
		t.Fatalf("a steps DAW's stack = %v", err)
	}
}

// 4. retry-mode-resolves-passage-over-chapter-over-project
func TestRetryModeResolvesPassageOverChapterOverProject(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	get := func(level, chapterID, passageID string) RetryModeAnswer {
		t.Helper()
		answer, err := newService(t, project, &book).RetryModeGet(level, chapterID, passageID)
		if err != nil {
			t.Fatal(err)
		}
		return answer
	}
	if answer := get(RetryLevelPassage, "c-0001", "passage-ps1"); answer.Mode != RetryLeave || answer.From != RetryLevelDefault || answer.Set != "" {
		t.Fatalf("default = %+v", answer)
	}
	if _, err := service.RetryModeSet(RetryLevelProject, "", "", RetryStack); err != nil {
		t.Fatal(err)
	}
	if answer := get(RetryLevelPassage, "c-0001", "passage-ps1"); answer.Mode != RetryStack || answer.From != RetryLevelProject {
		t.Fatalf("project's = %+v", answer)
	}
	if _, err := service.RetryModeSet(RetryLevelChapter, "c-0001", "", RetryLeave); err != nil {
		t.Fatal(err)
	}
	if answer := get(RetryLevelChapter, "c-0001", ""); answer.Mode != RetryLeave || answer.From != RetryLevelChapter || answer.Set != RetryLeave {
		t.Fatalf("chapter's = %+v", answer)
	}
	if answer := get(RetryLevelPassage, "c-0002", "passage-ps9"); answer.Mode != RetryStack || answer.From != RetryLevelProject {
		t.Fatalf("another chapter's passage = %+v", answer)
	}
	answer, err := service.RetryModeSet(RetryLevelPassage, "c-0001", "passage-ps1", RetryStack)
	if err != nil || answer.Mode != RetryStack || answer.From != RetryLevelPassage || answer.Set != RetryStack {
		t.Fatalf("passage's set = %+v, %v", answer, err)
	}
	if answer := get(RetryLevelPassage, "c-0001", "passage-ps2"); answer.Mode != RetryLeave || answer.From != RetryLevelChapter || answer.Set != "" {
		t.Fatalf("a sibling passage = %+v", answer)
	}
	if answer := get(RetryLevelProject, "", ""); answer.Mode != RetryStack || answer.Set != RetryStack {
		t.Fatalf("project = %+v", answer)
	}
	// Taking the passage's back makes it follow its chapter again.
	if answer, err := service.RetryModeSet(RetryLevelPassage, "c-0001", "passage-ps1", ""); err != nil || answer.Mode != RetryLeave || answer.From != RetryLevelChapter {
		t.Fatalf("cleared passage = %+v, %v", answer, err)
	}
	for name, call := range map[string]func() error{
		"an unknown level": func() error { _, err := service.RetryModeSet("book", "", "", RetryStack); return err },
		"an unknown mode":  func() error { _, err := service.RetryModeSet(RetryLevelProject, "", "", "always"); return err },
		"a get at an unknown level": func() error {
			_, err := service.RetryModeGet("book", "c-0001", "")
			return err
		},
		"a chapter not in the manuscript": func() error { _, err := service.RetryModeSet(RetryLevelChapter, "missing", "", RetryStack); return err },
		"a passage with no chapter": func() error {
			_, err := service.RetryModeSet(RetryLevelPassage, "", "passage-ps1", RetryStack)
			return err
		},
		"a project mode naming a chapter": func() error { _, err := service.RetryModeSet(RetryLevelProject, "c-0001", "", RetryStack); return err },
		"a path for a passage": func() error {
			_, err := service.RetryModeSet(RetryLevelPassage, "c-0001", "../passage", RetryStack)
			return err
		},
	} {
		if err := call(); err == nil {
			t.Errorf("%s was accepted", name)
		}
	}
}

// Stacks and modes are kept apart: recording a stack keeps the modes and setting a mode keeps the stacks.
func TestStacksAndRetryModesShareTheFile(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.RetryModeSet(RetryLevelChapter, "c-0001", "", RetryStack); err != nil {
		t.Fatal(err)
	}
	if _, err := service.StackRecord("c-0001", stackOf()); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RetryModeSet(RetryLevelPassage, "c-0001", "passage-ps1", RetryLeave); err != nil {
		t.Fatal(err)
	}
	if list, _ := service.StacksList("c-0001"); len(list.Stacks) != 1 {
		t.Fatalf("stacks = %+v", list)
	}
	if answer, _ := service.RetryModeGet(RetryLevelChapter, "c-0001", ""); answer.Set != RetryStack {
		t.Fatalf("chapter mode = %+v", answer)
	}
}

// G6: a Booth recording that merges passages again (a new run over a paragraph Editing already stacked) is written to the
// passage map, a file of its own. The stacked passage keeps its first read, the offsets its moved audio was given, and its
// retry mode, byte for byte, because the passage list is re-read from the map and stacks.json is never rewritten by it.
func TestAStackAndItsRetryModeSurviveABoothMerge(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.StackRecord("c-0001", stackOf()); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RetryModeSet(RetryLevelPassage, "c-0001", "passage-ps1", RetryStack); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(StacksFile(project))
	if err != nil {
		t.Fatal(err)
	}

	words := func(text string) int { return len(strings.Fields(text)) }
	booth := passagemap.New(passagemap.Config{Project: project, Reporter: &persist.Reporter{}, Manuscript: func() (passagemap.Book, error) {
		mapBook := passagemap.Book{Chapters: book.Chapters}
		for _, line := range book.Lines {
			mapBook.Lines = append(mapBook.Lines, passagemap.Line{ChapterID: line.ChapterID, ID: line.ID, Words: words(line.Text)})
		}
		return mapBook, nil
	}})
	// Two recordings of the chapter: the second rolls back into the first paragraph, so the two runs' takes merge over it.
	for _, run := range [][]passagemap.MarkInput{
		{{PID: "p-000001", Word: 0, Sec: 0, Kind: passagemap.KindStart}, {PID: "p-000002", Word: 4, Sec: 9, Kind: passagemap.KindStop, Prev: &passagemap.Place{PID: "p-000002", Word: 4}}},
		{{PID: "p-000001", Word: 0, Sec: 0, Kind: passagemap.KindStart}, {PID: "p-000001", Word: 3, Sec: 4, Kind: passagemap.KindRoll, Prev: &passagemap.Place{PID: "p-000001", Word: 5}},
			{PID: "p-000001", Word: 7, Sec: 8, Kind: passagemap.KindStop, Prev: &passagemap.Place{PID: "p-000001", Word: 7}}},
	} {
		if _, err := booth.RecordRun("c-0001", run); err != nil {
			t.Fatal(err)
		}
	}

	if after, err := os.ReadFile(StacksFile(project)); err != nil || string(after) != string(before) {
		t.Fatalf("stacks.json after the Booth merge:\n%s\nbefore:\n%s (%v)", after, before, err)
	}
	reread := newService(t, project, &book)
	list, err := reread.StacksList("c-0001")
	if err != nil || len(list.Stacks) != 1 {
		t.Fatalf("stacks after the merge = %+v, %v", list, err)
	}
	if stack := list.Stacks[0]; stack.Base != "take:{A}:{T1}" || stack.Offsets["take:{A}:{T2}"] != 6.7 || stack.Offsets["take:{A}:{T3}"] != 14.2 {
		t.Fatalf("the stacked passage after the merge = %+v", stack)
	}
	if answer, err := reread.RetryModeGet(RetryLevelPassage, "c-0001", "passage-ps1"); err != nil || answer.Mode != RetryStack || answer.Set != RetryStack {
		t.Fatalf("retry mode after the merge = %+v, %v", answer, err)
	}
}

// 6. file-is-narrator-data
func TestStacksFileIsNarratorData(t *testing.T) {
	book := aliceBook()
	t.Run("a corrupt file is kept aside and an empty list starts", func(t *testing.T) {
		project := t.TempDir()
		writeFile(t, StacksFile(project), "{not json")
		list, err := newService(t, project, &book).StacksList("c-0001")
		if err != nil || len(list.Stacks) != 0 {
			t.Fatalf("list from a corrupt file = %+v, %v", list, err)
		}
		if kept, _ := filepath.Glob(StacksFile(project) + ".corrupt-*"); len(kept) != 1 {
			t.Fatalf("corrupt copies = %v", kept)
		}
	})
	for name, body := range map[string]string{
		"a negative offset":      `"stacks": [{"id": "stk-p1", "chapterId": "c-0001", "passageId": "p1", "base": "t1", "offsets": {"t2": -1}, "mode": "native", "undoSteps": 1, "at": "2026-10-11T10:00:00Z"}]`,
		"a stack with no take":   `"stacks": [{"id": "stk-p1", "chapterId": "c-0001", "passageId": "p1", "base": "t1", "offsets": {}, "mode": "native", "undoSteps": 1, "at": "2026-10-11T10:00:00Z"}]`,
		"a path for a take":      `"stacks": [{"id": "stk-p1", "chapterId": "c-0001", "passageId": "p1", "base": "t1", "offsets": {"C:\\take.wav": 1}, "mode": "native", "undoSteps": 1, "at": "2026-10-11T10:00:00Z"}]`,
		"a stack with no result": `"stacks": [{"id": "stk-p1", "chapterId": "c-0001", "passageId": "p1", "base": "t1", "offsets": {"t2": 1}, "mode": "steps", "undoSteps": 1, "at": "2026-10-11T10:00:00Z"}]`,
		"an unknown retry mode":  `"stacks": [], "retry": {"project": "always", "chapters": {}, "passages": []}`,
	} {
		t.Run("a file that breaks a rule is corrupt: "+name, func(t *testing.T) {
			project := t.TempDir()
			writeFile(t, StacksFile(project), `{"schemaVersion": 1, `+body+`}`)
			if list, err := newService(t, project, &book).StacksList("c-0001"); err != nil || len(list.Stacks) != 0 {
				t.Fatalf("list = %+v, %v", list, err)
			}
			if kept, _ := filepath.Glob(StacksFile(project) + ".corrupt-*"); len(kept) != 1 {
				t.Fatalf("corrupt copies = %v", kept)
			}
		})
	}
	t.Run("a file from a newer app is refused and never overwritten", func(t *testing.T) {
		project := t.TempDir()
		newer := `{"schemaVersion": 99, "stacks": []}`
		writeFile(t, StacksFile(project), newer)
		service := newService(t, project, &book)
		if _, err := service.StacksList("c-0001"); err == nil || !strings.Contains(err.Error(), "newer version") {
			t.Fatalf("list of a newer file = %v", err)
		}
		if _, err := service.StackRecord("c-0001", stackOf()); err == nil {
			t.Fatal("a record over a newer file succeeded")
		}
		if _, err := service.StackRemove("c-0001", "passage-ps1", []string{"take:{A}:{T2}"}); err == nil {
			t.Fatal("a remove over a newer file succeeded")
		}
		if _, err := service.RetryModeSet(RetryLevelProject, "", "", RetryStack); err == nil {
			t.Fatal("a mode set over a newer file succeeded")
		}
		if _, err := service.RetryModeGet(RetryLevelProject, "", ""); err == nil {
			t.Fatal("a mode get over a newer file succeeded")
		}
		if raw, _ := os.ReadFile(StacksFile(project)); string(raw) != newer {
			t.Fatalf("the newer file was overwritten: %s", raw)
		}
	})
	t.Run("a write is temp-file-then-rename", func(t *testing.T) {
		project := t.TempDir()
		if _, err := newService(t, project, &book).StackRecord("c-0001", stackOf()); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(StacksFile(project) + ".tmp"); !os.IsNotExist(err) {
			t.Fatalf("temporary file left: %v", err)
		}
		var file stacksFile
		raw, _ := os.ReadFile(StacksFile(project))
		if err := json.Unmarshal(raw, &file); err != nil || file.SchemaVersion != StacksVersion || len(file.Stacks) != 1 {
			t.Fatalf("file = %s, %v", raw, err)
		}
	})
}

func TestStacksWithNoProject(t *testing.T) {
	book := aliceBook()
	service := newService(t, "", &book)
	if list, err := service.StacksList("c-0001"); err != nil || len(list.Stacks) != 0 {
		t.Fatalf("list = %+v, %v", list, err)
	}
	if answer, err := service.RetryModeGet(RetryLevelProject, "", ""); err != nil || answer.Mode != RetryLeave {
		t.Fatalf("mode = %+v, %v", answer, err)
	}
	if _, err := service.StackRecord("c-0001", stackOf()); err == nil {
		t.Fatal("record without a project succeeded")
	}
	if _, err := service.StackRemove("c-0001", "passage-ps1", []string{"take:{A}:{T2}"}); err == nil {
		t.Fatal("remove without a project succeeded")
	}
	if _, err := service.RetryModeSet(RetryLevelProject, "", "", RetryStack); err == nil {
		t.Fatal("mode set without a project succeeded")
	}
}
