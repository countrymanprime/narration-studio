package editlog

import (
	"math"
	"strings"
	"testing"
)

// queenReplaced is "the Queen shouted." (words 4 to 6 of p-000001) replaced by 3 s of Eric Leach's file, 0.5 s longer than the words.
func queenReplaced() ReplacementRequest {
	measured := -23.4
	return ReplacementRequest{
		ID: "r-1", Keys: []string{"p-000001:4", "p-000001:5", "p-000001:6"}, Start: 12, End: 14.5, NarratorID: "n-1", FileID: "f-1",
		SourceStart: 164.2, SourceEnd: 167.2, GainDB: 3.4, MeasuredLUFS: &measured, TargetLUFS: -20, FadeMs: 10, Shift: 0.5,
		Daw: "REAPER", Item: "{NEW-1}", CutItem: "{CUT-1}", UndoSteps: 1,
	}
}

func replacementIDs(list []Replacement) string {
	ids := []string{}
	for _, r := range list {
		ids = append(ids, r.ID)
	}
	return strings.Join(ids, ",")
}

func TestReplacementRecordListRestoreRemoveRoundtrip(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	change, err := service.ReplacementRecord("c-0001", "Eric Leach", queenReplaced())
	if err != nil || strings.Join(change.Changed, ",") != "r-1" {
		t.Fatalf("record = %+v, %v", change, err)
	}
	got := change.Replacements.Replacements[0]
	if strings.Join(got.Keys, ",") != "p-000001:4,p-000001:5,p-000001:6" || strings.Join(got.Words, " ") != "the Queen shouted." ||
		got.NarratorName != "Eric Leach" || !got.Active || got.Stale || got.Paragraph == nil || *got.Paragraph != 0 || got.MeasuredLUFS == nil ||
		*got.MeasuredLUFS != -23.4 || got.Shift != 0.5 {
		t.Fatalf("replacement = %+v", got)
	}
	reopened := newService(t, project, &book)
	if list, err := reopened.ReplacementsList("c-0001"); err != nil || replacementIDs(list.Replacements) != "r-1" {
		t.Fatalf("after a reopen = %+v, %v", list, err)
	}
	if other, _ := reopened.ReplacementsList("c-0002"); len(other.Replacements) != 0 {
		t.Fatalf("another chapter lists %+v", other)
	}
	id, replaced, err := reopened.ReplacedWords("c-0001", []string{"p-000002:0", "p-000001:5"})
	if err != nil || !replaced || id != "r-1" {
		t.Fatalf("ReplacedWords = %q %v %v", id, replaced, err)
	}
	if _, active, _ := reopened.ReplacementActive("c-0001", "r-1"); !active {
		t.Fatal("the replacement is not active")
	}
	restored, err := reopened.ReplacementRestored("c-0001", "r-1")
	if err != nil || strings.Join(restored.Changed, ",") != "r-1" || restored.Replacements.Replacements[0].Active ||
		restored.Replacements.Replacements[0].RestoredAt == nil {
		t.Fatalf("restored = %+v, %v", restored, err)
	}
	if again, _ := reopened.ReplacementRestored("c-0001", "r-1"); len(again.Changed) != 0 {
		t.Fatalf("a second put-back changed %v", again.Changed)
	}
	if _, replaced, _ := reopened.ReplacedWords("c-0001", []string{"p-000001:5"}); replaced {
		t.Fatal("words put back still read as replaced")
	}
	if _, err := reopened.ReplacementRecord("c-0001", "Eric Leach", queenReplaced()); err == nil {
		t.Fatal("a second replacement with the same id was recorded")
	}
	second := queenReplaced()
	second.ID = "r-2"
	if _, err := reopened.ReplacementRecord("c-0001", "Eric Leach", second); err != nil {
		t.Fatalf("the words put back could not be replaced again: %v", err)
	}
	removed, err := reopened.ReplacementRemove("c-0001", "r-2")
	if err != nil || strings.Join(removed.Changed, ",") != "r-2" || replacementIDs(removed.Replacements.Replacements) != "r-1" {
		t.Fatalf("remove = %+v, %v", removed, err)
	}
}

func TestReplacementRecordRefusesWordsAlreadyReplacedOrNotInTheText(t *testing.T) {
	book := aliceBook()
	service := newService(t, t.TempDir(), &book)
	if _, err := service.ReplacementRecord("c-0001", "Eric Leach", queenReplaced()); err != nil {
		t.Fatal(err)
	}
	overlap := queenReplaced()
	overlap.ID = "r-2"
	overlap.Keys = []string{"p-000001:6", "p-000002:0"}
	if _, err := service.ReplacementRecord("c-0001", "Eric Leach", overlap); err == nil || !strings.Contains(err.Error(), "already replaced") {
		t.Fatalf("an overlap = %v", err)
	}
	for name, change := range map[string]func(*ReplacementRequest){
		"a word past its line": func(r *ReplacementRequest) { r.Keys = []string{"p-000002:9"} },
		"a line elsewhere":     func(r *ReplacementRequest) { r.Keys = []string{"p-000003:0"} },
		"no words":             func(r *ReplacementRequest) { r.Keys = nil },
		"no id":                func(r *ReplacementRequest) { r.ID = "" },
		"an id with a bar":     func(r *ReplacementRequest) { r.ID = "r|1" },
		"times backwards":      func(r *ReplacementRequest) { r.Start, r.End = 14, 12 },
		"their stretch empty":  func(r *ReplacementRequest) { r.SourceEnd = r.SourceStart },
		"a level of 30 dB":     func(r *ReplacementRequest) { r.GainDB = 30 },
		"a level that is NaN":  func(r *ReplacementRequest) { r.GainDB = math.NaN() },
		"a loudness of +inf":   func(r *ReplacementRequest) { inf := math.Inf(1); r.MeasuredLUFS = &inf },
		"a target of +3 LUFS":  func(r *ReplacementRequest) { r.TargetLUFS = 3 },
		"a fade of 600 ms":     func(r *ReplacementRequest) { r.FadeMs = 600 },
		"no DAW answer":        func(r *ReplacementRequest) { r.Item = "" },
		"no narrator":          func(r *ReplacementRequest) { r.NarratorID = "" },
		"13 undo steps":        func(r *ReplacementRequest) { r.UndoSteps = 13 },
		"a shift not a number": func(r *ReplacementRequest) { r.Shift = math.NaN() },
	} {
		request := queenReplaced()
		request.ID, request.Keys = "r-3", []string{"p-000002:0"}
		change(&request)
		if _, err := service.ReplacementRecord("c-0001", "Eric Leach", request); err == nil {
			t.Errorf("%s was recorded", name)
		}
	}
	request := queenReplaced()
	request.ID, request.Keys = "r-3", []string{"p-000002:0"}
	if _, err := service.ReplacementRecord("c-0001", "A|B", request); err == nil {
		t.Error("a name with a bar was recorded")
	}
	if _, err := service.ReplacementRecord("c-0009", "Eric Leach", request); err == nil {
		t.Error("a chapter not in the manuscript was recorded")
	}
}

func TestAReplacementWhoseWordsChangedIsStale(t *testing.T) {
	book := aliceBook()
	service := newService(t, t.TempDir(), &book)
	if _, err := service.ReplacementRecord("c-0001", "Eric Leach", queenReplaced()); err != nil {
		t.Fatal(err)
	}
	book.Lines[0].Text = "“Off with her head!” the King shouted."
	list, err := service.ReplacementsList("c-0001")
	if err != nil || !list.Replacements[0].Stale || list.Replacements[0].StaleReason != StaleTextChanged {
		t.Fatalf("after the text changed = %+v, %v", list, err)
	}
	book.Lines = book.Lines[1:]
	list, _ = service.ReplacementsList("c-0001")
	if !list.Replacements[0].Stale || list.Replacements[0].StaleReason != StaleParagraphMissing || list.Replacements[0].Paragraph != nil {
		t.Fatalf("after the line went = %+v", list.Replacements[0])
	}
}

func TestACorruptReplacementsFileIsKeptAside(t *testing.T) {
	book := aliceBook()
	project := t.TempDir()
	service := newService(t, project, &book)
	writeFile(t, ReplacementsFile(project), `{"schemaVersion":1,"replacements":[{"id":"r-1","chapterId":"c-0001","words":[]}]}`)
	if list, err := service.ReplacementsList("c-0001"); err != nil || len(list.Replacements) != 0 {
		t.Fatalf("a file that breaks the rules = %+v, %v", list, err)
	}
	if _, err := service.ReplacementRecord("c-0001", "Eric Leach", queenReplaced()); err != nil {
		t.Fatalf("a record after a corrupt file: %v", err)
	}
}
