package marks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// alice is a two-chapter manuscript; line p2 holds a character outside the BMP ("𝒜" is two UTF-16 units at 4-6).
func alice() Book {
	return Book{
		Chapters: []string{"c1", "c2"},
		Lines: []Line{
			{ChapterID: "c1", ID: "p1", Index: 0, Text: "Off with her head! the Queen shouted."},
			{ChapterID: "c1", ID: "p2", Index: 1, Text: "The 𝒜 soldiers were silent."},
			{ChapterID: "c2", ID: "p3", Index: 2, Text: "Alice was not a bit hurt."},
		},
	}
}

func newService(t *testing.T, project string, book *Book) *Service {
	t.Helper()
	return New(Config{Project: project, Manuscript: func() (Book, error) { return *book, nil }})
}

func mustAdd(t *testing.T, service *Service, chapterID, paragraphID string, start, end int, typeKey, text string) Resolved {
	t.Helper()
	mark, err := service.Add(chapterID, paragraphID, start, end, typeKey, text)
	if err != nil {
		t.Fatal(err)
	}
	return mark
}

func mustList(t *testing.T, service *Service) Marks {
	t.Helper()
	list, err := service.List()
	if err != nil {
		t.Fatal(err)
	}
	return list
}

func TestAddListRemoveRoundtrip(t *testing.T) {
	project := t.TempDir()
	book := alice()
	service := newService(t, project, &book)
	if list := mustList(t, service); len(list.Marks) != 0 {
		t.Fatalf("a new project's marks = %+v", list.Marks)
	}
	later := mustAdd(t, service, "c2", "p3", 0, 5, "stress", "")
	head := mustAdd(t, service, "c1", "p1", 13, 17, "note", "  Loud, not shrill.\r\nSave energy.  ")
	if head.Quote != "head" || head.Text != "Loud, not shrill.\nSave energy." || head.Status != "" || head.Thread == nil || len(head.Thread) != 0 {
		t.Fatalf("added = %+v", head)
	}
	if head.Paragraph == nil || *head.Paragraph != 0 || head.Stale {
		t.Fatalf("added resolved = %+v", head)
	}

	// A new service over the same folder reads the same state, with the same ids, in reading order.
	again := newService(t, project, &book)
	list := mustList(t, again)
	if len(list.Marks) != 2 || list.Marks[0].ID != head.ID || list.Marks[1].ID != later.ID || list.Marks[1].Quote != "Alice" {
		t.Fatalf("list = %+v", list.Marks)
	}
	remaining, err := again.Remove(head.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(remaining.Marks) != 1 || remaining.Marks[0].ID != later.ID {
		t.Fatalf("after remove = %+v", remaining.Marks)
	}
	if _, err := again.Remove("not-there"); err != nil {
		t.Fatalf("removing an id that is not there: %v", err)
	}
}

func TestRangeIsValidatedAgainstTheManuscript(t *testing.T) {
	project := t.TempDir()
	book := alice()
	service := newService(t, project, &book)
	for _, bad := range []struct {
		name                   string
		chapterID, paragraphID string
		start, end             int
	}{
		{"unknown chapter", "c9", "p1", 0, 3},
		{"line of another chapter", "c2", "p1", 0, 3},
		{"unknown line", "c1", "p9", 0, 3},
		{"empty range", "c1", "p1", 3, 3},
		{"backwards range", "c1", "p1", 5, 3},
		{"negative start", "c1", "p1", -1, 3},
		{"end past the line", "c1", "p2", 0, 29},
		{"start inside a surrogate pair", "c1", "p2", 5, 8},
		{"end inside a surrogate pair", "c1", "p2", 0, 5},
	} {
		if _, err := service.Add(bad.chapterID, bad.paragraphID, bad.start, bad.end, "stress", ""); err == nil {
			t.Errorf("%s was saved", bad.name)
		} else if err.Error() == "" {
			t.Errorf("%s: no sentence", bad.name)
		}
	}
	if _, err := os.Stat(File(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused add wrote the file: %v", err)
	}
	// The quote is the manuscript's own text for the range, the whole surrogate pair included.
	if mark := mustAdd(t, service, "c1", "p2", 4, 6, "stress", ""); mark.Quote != "𝒜" {
		t.Fatalf("quote = %q", mark.Quote)
	}
}

func TestTextIsBoundedPlainText(t *testing.T) {
	project := t.TempDir()
	book := alice()
	service := newService(t, project, &book)
	if _, err := service.Add("c1", "p1", 0, 3, "note", strings.Repeat("a", MaxTextUnits+1)); err == nil {
		t.Error("a note over the cap was saved")
	}
	// A character outside the BMP counts two units, as the UI's maxLength does.
	if _, err := service.Add("c1", "p1", 0, 3, "note", strings.Repeat("𝒜", MaxTextUnits/2+1)); err == nil {
		t.Error("a note over the cap in UTF-16 units was saved")
	}
	if _, err := service.Add("c1", "p1", 0, 3, "note", "bell\x07"); err == nil {
		t.Error("a note with a control character was saved")
	}
	if mark := mustAdd(t, service, "c1", "p1", 0, 3, "note", "<b>tab\there</b>\nnext"); mark.Text != "<b>tab\there</b>\nnext" {
		t.Fatalf("plain text was changed: %q", mark.Text)
	}
	if mark := mustAdd(t, service, "c1", "p1", 4, 8, "note", strings.Repeat("a", MaxTextUnits)); len(mark.Text) != MaxTextUnits {
		t.Fatal("a note at the cap was not saved whole")
	}
}

func TestAQuestionNeedsItsText(t *testing.T) {
	project := t.TempDir()
	book := alice()
	service := newService(t, project, &book)
	if _, err := service.Add("c1", "p1", 0, 3, "ask", "   "); err == nil {
		t.Fatal("an empty question was saved")
	}
	if _, err := service.Add("c1", "p1", 0, 3, "nope", ""); err == nil {
		t.Fatal("a mark of an unknown type was saved")
	}
	question := mustAdd(t, service, "c1", "p1", 0, 3, "ask", "Is it Off or Of?")
	if question.Status != StatusOpen {
		t.Fatalf("an asking mark starts %q", question.Status)
	}
	if note := mustAdd(t, service, "c1", "p1", 0, 3, "note", ""); note.Status != "" {
		t.Fatalf("a note has status %q", note.Status)
	}
}

func TestMarkTypesAreNarratorData(t *testing.T) {
	project := t.TempDir()
	book := alice()
	service := newService(t, project, &book)
	types := mustList(t, service).Types
	want := []MarkType{
		{Key: "stress", Name: "Word stress", Colour: "copper", Style: "highlight"},
		{Key: "breath", Name: "Breath / pause", Colour: "info", Style: "dotted"},
		{Key: "pace", Name: "Pace", Colour: "ok", Style: "wavy"},
		{Key: "emo", Name: "Emotion", Colour: "bad", Style: "underline"},
		{Key: "note", Name: "Note", Colour: "violet", Style: "double"},
		{Key: "ask", Name: "Query for author", Colour: "warn", Style: "highlight", Asks: true},
	}
	if len(types) != len(want) {
		t.Fatalf("default types = %+v", types)
	}
	for index := range want {
		if types[index] != want[index] {
			t.Fatalf("default type %d = %+v, want %+v", index, types[index], want[index])
		}
	}

	// Rename, recolour and restyle one, add one (the host names it), and the list keeps the narrator's order.
	edited := append([]MarkType{}, types...)
	edited[0] = MarkType{Key: "stress", Name: "Lean on it", Colour: "violet", Style: "box"}
	edited = append(edited, MarkType{Name: "Accent", Colour: "info", Style: "wavy"})
	saved, err := service.SaveTypes(edited, false)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Types[0].Name != "Lean on it" || saved.Types[0].Colour != "violet" || saved.Types[0].Style != "box" {
		t.Fatalf("edited = %+v", saved.Types[0])
	}
	added := saved.Types[len(saved.Types)-1]
	if added.Key == "" || added.Name != "Accent" {
		t.Fatalf("added type = %+v", added)
	}

	for _, bad := range []struct {
		name  string
		types []MarkType
	}{
		{"no types", []MarkType{}},
		{"unknown colour", []MarkType{{Key: "a", Name: "A", Colour: "pink", Style: "box"}}},
		{"unknown style", []MarkType{{Key: "a", Name: "A", Colour: "ok", Style: "zigzag"}}},
		{"empty name", []MarkType{{Key: "a", Name: "  ", Colour: "ok", Style: "box"}}},
		{"long name", []MarkType{{Key: "a", Name: strings.Repeat("n", MaxTypeNameUnits+1), Colour: "ok", Style: "box"}}},
		{"two-line name", []MarkType{{Key: "a", Name: "A\nB", Colour: "ok", Style: "box"}}},
		{"duplicate key", []MarkType{{Key: "a", Name: "A", Colour: "ok", Style: "box"}, {Key: "a", Name: "B", Colour: "ok", Style: "box"}}},
		{"path-shaped key", []MarkType{{Key: "../a", Name: "A", Colour: "ok", Style: "box"}}},
	} {
		if _, err := service.SaveTypes(bad.types, true); err == nil {
			t.Errorf("%s was saved", bad.name)
		}
	}

	// Removing a type in use is refused with the count unless the call says to remove its uses.
	mustAdd(t, service, "c1", "p1", 0, 3, "pace", "")
	mustAdd(t, service, "c1", "p1", 4, 8, "pace", "")
	keep := mustAdd(t, service, "c1", "p1", 9, 12, "note", "")
	withoutPace := make([]MarkType, 0, len(saved.Types))
	for _, markType := range saved.Types {
		if markType.Key != "pace" {
			withoutPace = append(withoutPace, markType)
		}
	}
	if _, err := service.SaveTypes(withoutPace, false); err == nil || !strings.Contains(err.Error(), "2 marks") {
		t.Fatalf("removing a type in use = %v", err)
	}
	if list := mustList(t, service); len(list.Marks) != 3 || len(list.Types) != len(saved.Types) {
		t.Fatalf("a refused removal changed the file: %+v", list)
	}
	after, err := service.SaveTypes(withoutPace, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(after.Marks) != 1 || after.Marks[0].ID != keep.ID || len(after.Types) != len(withoutPace) {
		t.Fatalf("after removing pace = %+v", after)
	}

	// Turning on Asks opens the type's existing uses, as the mock's dialog does.
	asking := append([]MarkType{}, after.Types...)
	for index := range asking {
		if asking[index].Key == "note" {
			asking[index].Asks = true
		}
	}
	opened, err := service.SaveTypes(asking, false)
	if err != nil {
		t.Fatal(err)
	}
	if opened.Marks[0].Status != StatusOpen {
		t.Fatalf("a use of a type that now asks = %+v", opened.Marks[0])
	}
}

func TestStaleMarkIsReportedNotMoved(t *testing.T) {
	project := t.TempDir()
	book := alice()
	service := newService(t, project, &book)
	gone := mustAdd(t, service, "c2", "p3", 0, 5, "stress", "")
	short := mustAdd(t, service, "c1", "p1", 28, 37, "stress", "")
	changed := mustAdd(t, service, "c1", "p1", 13, 17, "stress", "")
	fine := mustAdd(t, service, "c1", "p1", 0, 3, "stress", "")

	book = Book{Chapters: []string{"c1", "c2"}, Lines: []Line{
		{ChapterID: "c1", ID: "p1", Index: 0, Text: "Off with his hat! said the Queen."},
	}}
	list := mustList(t, service)
	byID := map[string]Resolved{}
	for _, mark := range list.Marks {
		byID[mark.ID] = mark
	}
	if mark := byID[gone.ID]; !mark.Stale || mark.StaleReason != StaleParagraphMissing || mark.Paragraph != nil || mark.Start != 0 || mark.End != 5 {
		t.Fatalf("mark on a gone line = %+v", mark)
	}
	if mark := byID[short.ID]; !mark.Stale || mark.StaleReason != StaleRangeOutOfRange || mark.Start != 28 {
		t.Fatalf("mark past the line's end = %+v", mark)
	}
	if mark := byID[changed.ID]; !mark.Stale || mark.StaleReason != StaleTextChanged || mark.Quote != "head" {
		t.Fatalf("mark whose words changed = %+v", mark)
	}
	if mark := byID[fine.ID]; mark.Stale {
		t.Fatalf("a mark that still fits = %+v", mark)
	}
	if list.Marks[len(list.Marks)-1].ID != gone.ID {
		t.Fatalf("a mark whose line is gone is not last: %+v", list.Marks)
	}
}

func TestFileIsNarratorData(t *testing.T) {
	project := t.TempDir()
	book := alice()
	service := newService(t, project, &book)
	mustAdd(t, service, "c1", "p1", 0, 3, "stress", "")
	if _, err := os.Stat(File(project) + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("the temporary file was left behind: %v", err)
	}
	raw, err := os.ReadFile(File(project))
	if err != nil {
		t.Fatal(err)
	}
	var stored map[string]any
	if err := json.Unmarshal(raw, &stored); err != nil || stored["schemaVersion"] != float64(1) || stored["migratedNotes"] != true {
		t.Fatalf("stored = %s, %v", raw, err)
	}

	// A corrupt file is kept aside and a fresh list starts.
	if err := os.WriteFile(File(project), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if list := mustList(t, service); len(list.Marks) != 0 || len(list.Types) != 6 {
		t.Fatalf("after a corrupt file = %+v", list)
	}
	kept, _ := filepath.Glob(File(project) + ".corrupt-*")
	if len(kept) != 1 {
		t.Fatalf("the corrupt file was not kept aside: %v", kept)
	}

	// A file holding a mark that breaks a rule is corrupt too.
	breaking := `{"schemaVersion":1,"migratedNotes":true,"types":[{"key":"a","name":"A","colour":"ok","style":"box","asks":false}],"marks":[{"id":"x","chapterId":"c1","paragraphId":"p1","start":5,"end":2,"quote":"","type":"a","text":"","thread":[],"createdAt":"2026-10-11T00:00:00Z"}]}`
	if err := os.WriteFile(File(project), []byte(breaking), 0o600); err != nil {
		t.Fatal(err)
	}
	if list := mustList(t, service); len(list.Marks) != 0 {
		t.Fatalf("a mark breaking the rules was read: %+v", list)
	}

	// One written by a newer app is refused and never overwritten.
	newer := []byte(`{"schemaVersion":2,"types":[],"marks":[]}`)
	if err := os.WriteFile(File(project), newer, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.List(); err == nil || !strings.Contains(err.Error(), "newer version") {
		t.Fatalf("a newer file = %v", err)
	}
	if _, err := service.Add("c1", "p1", 0, 3, "stress", ""); err == nil {
		t.Fatal("an add over a newer file succeeded")
	}
	if after, _ := os.ReadFile(File(project)); string(after) != string(newer) {
		t.Fatalf("a newer file was overwritten: %s", after)
	}

	// A file over the byte cap is not read.
	if err := os.WriteFile(File(project), []byte(`{"schemaVersion":1,"migratedNotes":true,"types":[{"key":"a","name":"A","colour":"ok","style":"box","asks":false}],"marks":[{"id":"x","chapterId":"c1","paragraphId":"p1","start":0,"end":3,"quote":"Off","type":"a","text":"","thread":[],"createdAt":"2026-10-11T00:00:00Z"}],"pad":"`+strings.Repeat("x", MaxFileBytes)+`"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if list := mustList(t, service); len(list.Marks) != 0 || list.Types[0].Key != "stress" {
		t.Fatalf("an oversized file = %+v", list)
	}
}

func TestTheMarkCapRefusesOneMore(t *testing.T) {
	project := t.TempDir()
	book := alice()
	service := newService(t, project, &book)
	full := marksFile{SchemaVersion: SchemaVersion, MigratedNotes: true, Types: DefaultTypes(), Marks: make([]Mark, 0, MaxMarks)}
	for index := 0; index < MaxMarks; index++ {
		full.Marks = append(full.Marks, Mark{ID: newID(), ChapterID: "c1", ParagraphID: "p1", Start: 0, End: 3, Quote: "Off", Type: "stress", Thread: []Message{}, CreatedAt: time.Unix(0, 0).UTC()})
	}
	if err := service.write(full); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Add("c1", "p1", 0, 3, "stress", ""); err == nil || !strings.Contains(err.Error(), "at most") {
		t.Fatalf("one mark over the cap = %v", err)
	}
}

func TestOldNotesComeAcrossOnce(t *testing.T) {
	project := t.TempDir()
	book := alice()
	start, end := 13, 17
	old := []OldNote{
		{ChapterID: "c1", ParagraphID: "p1", Text: "Shout it.", Start: &start, End: &end},
		{ChapterID: "c2", ParagraphID: "p3", Text: "Softer\x01 here."},
		{ChapterID: "", ParagraphID: "p3", Text: "no chapter: skipped"},
	}
	reads := 0
	service := New(Config{Project: project, Manuscript: func() (Book, error) { return book, nil }, OldNotes: func() ([]OldNote, error) {
		reads++
		return old, nil
	}})
	list := mustList(t, service)
	if len(list.Marks) != 2 {
		t.Fatalf("migrated = %+v", list.Marks)
	}
	anchored, unanchored := list.Marks[0], list.Marks[1]
	if anchored.Type != "note" || anchored.Start != 13 || anchored.End != 17 || anchored.Quote != "head" || anchored.Text != "Shout it." || anchored.Stale {
		t.Fatalf("anchored note = %+v", anchored)
	}
	if unanchored.Start != 0 || unanchored.End != 0 || unanchored.Text != "Softer  here." || unanchored.Stale {
		t.Fatalf("unanchored note = %+v", unanchored)
	}
	raw, err := os.ReadFile(File(project))
	if err != nil || !strings.Contains(string(raw), `"migratedNotes": true`) {
		t.Fatalf("stored = %s, %v", raw, err)
	}
	// A second read, and a new service, do not import again.
	mustList(t, service)
	again := New(Config{Project: project, Manuscript: func() (Book, error) { return book, nil }, OldNotes: func() ([]OldNote, error) {
		reads++
		return old, nil
	}})
	if list := mustList(t, again); len(list.Marks) != 2 || reads != 1 {
		t.Fatalf("second read = %+v after %d reads of the old notes", list.Marks, reads)
	}
}
