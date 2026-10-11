package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/marks"
)

func decodeMark(t *testing.T) func(string, error) marks.Resolved {
	return func(payload string, err error) marks.Resolved {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var mark marks.Resolved
		if err := json.Unmarshal([]byte(payload), &mark); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return mark
	}
}

func decodeMarks(t *testing.T) func(string, error) marks.Marks {
	return func(payload string, err error) marks.Marks {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var list marks.Marks
		if err := json.Unmarshal([]byte(payload), &list); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return list
	}
}

func TestMarksBindingsRoundtripInReadingOrder(t *testing.T) {
	host, _ := bookmarksHost(t)
	list := decodeMarks(t)(host.MarksList())
	if len(list.Marks) != 0 || len(list.Types) != 6 {
		t.Fatalf("list of a new project = %+v", list)
	}
	later := decodeMark(t)(host.MarksAdd("c-0002", "p-000003", 0, 5, "stress", ""))
	// "the Queen" after the closing curly quote: UTF-16 offsets 21 to 30.
	queen := decodeMark(t)(host.MarksAdd("c-0001", "p-000001", 21, 30, "ask", "Shrill or loud?"))
	if queen.Quote != "the Queen" || queen.Status != "open" || queen.Paragraph == nil || *queen.Paragraph != 0 {
		t.Fatalf("added = %+v", queen)
	}
	list = decodeMarks(t)(host.MarksList())
	if len(list.Marks) != 2 || list.Marks[0].ID != queen.ID || list.Marks[1].ID != later.ID {
		t.Fatalf("list = %+v", list.Marks)
	}
	remaining := decodeMarks(t)(host.MarksRemove(queen.ID))
	if len(remaining.Marks) != 1 || remaining.Marks[0].ID != later.ID {
		t.Fatalf("after remove = %+v", remaining.Marks)
	}
	types := append([]marks.MarkType{}, remaining.Types...)
	types[0].Name = "Lean on it"
	if saved := decodeMarks(t)(host.MarksSaveTypes(types, false)); saved.Types[0].Name != "Lean on it" {
		t.Fatalf("saved types = %+v", saved.Types)
	}
	if _, err := host.MarksSaveTypes(types[1:], false); err == nil || !strings.Contains(err.Error(), "1 mark uses") {
		t.Fatalf("removing a type in use = %v", err)
	}
}

func TestMarksBindingsRefuseARangeTheManuscriptLacks(t *testing.T) {
	host, project := bookmarksHost(t)
	for _, spot := range []struct {
		chapterID, paragraphID string
		start, end             int
	}{{"c-0009", "p-000001", 0, 1}, {"c-0002", "p-000001", 0, 1}, {"c-0001", "p-000002", 0, 26}, {"c-0001", "p-000002", 4, 4}} {
		if _, err := host.MarksAdd(spot.chapterID, spot.paragraphID, spot.start, spot.end, "stress", ""); err == nil {
			t.Errorf("a mark at %+v was saved", spot)
		}
	}
	if _, err := os.Stat(marks.File(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused add wrote the file: %v", err)
	}
}

// The bindings take ids, offsets, keys and plain text, never a path: a note shaped like one is stored as text and nothing at
// that path is opened or written.
func TestMarksBindingsStoreAPathShapedNoteAsText(t *testing.T) {
	host, project := bookmarksHost(t)
	outside := filepath.Join(filepath.Dir(project), "mark-target.txt")
	added := decodeMark(t)(host.MarksAdd("c-0001", "p-000002", 4, 12, "note", outside))
	if added.Text != outside {
		t.Fatalf("added = %+v", added)
	}
	if _, err := os.Stat(outside); !os.IsNotExist(err) {
		t.Fatalf("a path-shaped note touched the file system: %v", err)
	}
	if _, err := host.MarksSaveTypes([]marks.MarkType{{Key: "../../x", Name: "X", Colour: "ok", Style: "box"}}, true); err == nil {
		t.Fatal("a path-shaped type key was saved")
	}
}

func TestMarksBindingsWithNoProject(t *testing.T) {
	host := NewHost()
	if list := decodeMarks(t)(host.MarksList()); len(list.Marks) != 0 || len(list.Types) != 6 {
		t.Fatalf("list with no project = %+v", list)
	}
	if _, err := host.MarksAdd("c-0001", "p-000001", 0, 1, "stress", ""); err == nil {
		t.Fatal("an add with no project succeeded")
	}
	if _, err := host.MarksRemove("x"); err == nil {
		t.Fatal("a remove with no project succeeded")
	}
	if _, err := host.MarksSaveTypes(marks.DefaultTypes(), false); err == nil {
		t.Fatal("a types save with no project succeeded")
	}
}

// The reader's old notes come across once, through the bindings, and the old notes file is left as it was.
func TestMarksBindingsBringTheReaderNotesAcrossOnce(t *testing.T) {
	host, project := bookmarksHost(t)
	notesFile := filepath.Join(project, "narration-utils", "manuscript-notes.json")
	old := `{"notes":[{"id":"n1","chapterId":"c-0001","paragraphId":"p-000001","paragraph":0,"text":"Big breath first.","anchorStart":21,"anchorEnd":30,"anchorText":"the Queen","createdAt":"2026-10-01T10:00:00Z"},{"id":"n2","chapterId":"c-0002","paragraphId":"p-000003","paragraph":2,"text":"Lighter.","createdAt":"2026-10-02T10:00:00Z"}],"chapterStatus":{},"readerState":{}}`
	writeNested(t, notesFile, old)
	list := decodeMarks(t)(host.MarksList())
	if len(list.Marks) != 2 || list.Marks[0].Quote != "the Queen" || list.Marks[0].Type != "note" || list.Marks[1].Text != "Lighter." || list.Marks[1].End != 0 {
		t.Fatalf("migrated = %+v", list.Marks)
	}
	if raw, _ := os.ReadFile(notesFile); string(raw) != old {
		t.Fatalf("the old notes file changed: %s", raw)
	}
	decodeMarks(t)(host.MarksRemove(list.Marks[0].ID))
	if again := decodeMarks(t)(host.MarksList()); len(again.Marks) != 1 {
		t.Fatalf("the notes came across again: %+v", again.Marks)
	}
}

// Replacing the manuscript is the import's own test (internal/manuscript); Clear project data through its binding removes
// the file too.
func TestClearProjectDataRemovesMarks(t *testing.T) {
	host, project := bookmarksHost(t)
	decodeMark(t)(host.MarksAdd("c-0001", "p-000002", 4, 12, "stress", ""))
	if _, err := host.ManuscriptClearProjectData(true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(marks.File(project)); !os.IsNotExist(err) {
		t.Fatalf("marks after Clear project data: %v", err)
	}
}
