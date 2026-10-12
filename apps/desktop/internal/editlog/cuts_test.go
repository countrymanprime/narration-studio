package editlog

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func steps(n int) *int { return &n }

// queenCut is "the Queen shouted." (words 4 to 6 of p-000001), heard from 12 s to 13.5 s of the chapter recording.
func queenCut() CutRequest {
	return CutRequest{
		ParagraphID: "p-000001", TakeID: "t-1", Keys: []string{"p-000001:4", "p-000001:5", "p-000001:6"}, Text: "the Queen shouted.",
		A: 12, B: 13.5, Off0: 2, Off1: 3.5, Mode: CutClose, FadeMs: 12, Daw: "reaper", GUID: "{CUT-1}", UndoSteps: steps(1),
	}
}

// silentCut is "were silent." (words 2 and 3 of p-000002).
func silentCut() CutRequest {
	cut := queenCut()
	cut.ParagraphID, cut.Keys, cut.Text, cut.GUID = "p-000002", []string{"p-000002:2", "p-000002:3"}, "were silent.", "{CUT-2}"
	cut.A, cut.B, cut.Off0, cut.Off1 = 20, 21, 10, 11
	return cut
}

func cutIDs(cuts []Cut) string {
	ids := make([]string, 0, len(cuts))
	for _, cut := range cuts {
		ids = append(ids, cut.ID)
	}
	return strings.Join(ids, ",")
}

// 1. record-list-remove-roundtrip
func TestCutRecordListRemoveRoundtrip(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	// Recorded out of time order: the list is in time order.
	if _, err := service.CutRecord("c-0001", silentCut()); err != nil {
		t.Fatal(err)
	}
	change, err := service.CutRecord("c-0001", queenCut())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(change.Changed, ",") != "cut2" || cutIDs(change.Cuts.Cuts) != "cut2,cut1" {
		t.Fatalf("record = %+v", change)
	}
	first := change.Cuts.Cuts[0]
	if strings.Join(first.Keys, ",") != "p-000001:4,p-000001:5,p-000001:6" || strings.Join(first.Words, " ") != "the Queen shouted." || first.Stale || first.UndoSteps != 1 || first.Paragraph == nil || *first.Paragraph != 0 {
		t.Fatalf("first cut = %+v", first)
	}
	reopened := newService(t, project, &book)
	list, err := reopened.CutsList("c-0001")
	if err != nil || cutIDs(list.Cuts) != "cut2,cut1" {
		t.Fatalf("list from a new service = %+v, %v", list, err)
	}
	if other, _ := reopened.CutsList("c-0002"); len(other.Cuts) != 0 {
		t.Fatalf("another chapter's list = %+v", other)
	}
	removed, err := reopened.CutRemove("c-0001", "cut2")
	if err != nil || strings.Join(removed.Changed, ",") != "cut2" || cutIDs(removed.Cuts.Cuts) != "cut1" {
		t.Fatalf("remove = %+v, %v", removed, err)
	}
	if again, err := reopened.CutRemove("c-0001", "cut2"); err != nil || len(again.Changed) != 0 {
		t.Fatalf("removing again = %+v, %v", again, err)
	}
	// An id is never reused while a later one is kept.
	if next, err := reopened.CutRecord("c-0001", queenCut()); err != nil || next.Changed[0] != "cut2" {
		t.Fatalf("next id = %+v, %v", next, err)
	}
}

// curTime and origTime as the mock's selectors/cuts.ts has them: the oracle for what the store holds.
func curTime(cuts []Cut, orig float64) float64 {
	shift := 0.0
	for _, cut := range cuts {
		if cut.Mode != CutClose {
			continue
		}
		if orig >= cut.B {
			shift += cut.B - cut.A
		} else if orig > cut.A {
			shift += orig - cut.A
		}
	}
	return orig - shift
}

func origTime(cuts []Cut, cur float64) float64 {
	added := 0.0
	for _, cut := range cuts {
		if cut.Mode == CutClose && cur+1e-9 >= cut.A-added {
			added += cut.B - cut.A
		}
	}
	return cur + added
}

// 2. cut-times-stay-in-the-original-recording
func TestCutTimesStayInTheOriginalRecording(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.CutRecord("c-0001", queenCut()); err != nil {
		t.Fatal(err)
	}
	// After the 1.5 s close at 12 s, "were silent." plays from 18.5 s; the app converts it back to the recording's 20 s.
	first, _ := service.CutsList("c-0001")
	if got := origTime(first.Cuts, 18.5); got != 20 {
		t.Fatalf("origTime(18.5) = %v", got)
	}
	second := silentCut()
	second.A, second.B = origTime(first.Cuts, 18.5), origTime(first.Cuts, 19.5)
	if _, err := service.CutRecord("c-0001", second); err != nil {
		t.Fatal(err)
	}
	list, _ := service.CutsList("c-0001")
	if list.Cuts[1].A != 20 || list.Cuts[1].B != 21 {
		t.Fatalf("second cut = %+v", list.Cuts[1])
	}
	// The recording's own moments round-trip through the stored list.
	for _, orig := range []float64{0, 11.9, 13.5, 19, 21, 30} {
		if got := origTime(list.Cuts, curTime(list.Cuts, orig)); math.Abs(got-orig) > 1e-9 {
			t.Fatalf("origTime(curTime(%v)) = %v", orig, got)
		}
	}
	// A gap moves nothing.
	gap := queenCut()
	gap.Mode, gap.A, gap.B = CutGap, 40, 41
	gap.Keys, gap.ParagraphID, gap.TakeID = []string{"p-000002:0"}, "p-000002", "t-2"
	if _, err := service.CutRecord("c-0001", gap); err != nil {
		t.Fatal(err)
	}
	list, _ = service.CutsList("c-0001")
	if got := curTime(list.Cuts, 50); got != 47.5 {
		t.Fatalf("curTime(50) with a gap = %v", got)
	}
}

// 3. cut-is-validated-against-the-manuscript, and 4. a-record-needs-a-daw-result-it-is-given
func TestCutIsValidatedAgainstTheManuscript(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	for _, call := range []struct {
		name      string
		chapterID string
		change    func(*CutRequest)
		want      string
	}{
		{"unknown chapter", "c-9999", func(*CutRequest) {}, "not in the manuscript"},
		{"paragraph of another chapter", "c-0002", func(*CutRequest) {}, "not in this chapter"},
		{"unknown paragraph", "c-0001", func(r *CutRequest) { r.ParagraphID, r.Keys = "p-999999", []string{"p-999999:0"} }, "not in this chapter"},
		{"key of another paragraph", "c-0001", func(r *CutRequest) { r.Keys = []string{"p-000002:0"} }, "all be in its paragraph"},
		{"key past the line", "c-0001", func(r *CutRequest) { r.Keys = []string{"p-000001:7"} }, "past the end"},
		{"malformed key", "c-0001", func(r *CutRequest) { r.Keys = []string{"p-000001:01"} }, "not a word of the script"},
		{"no key", "c-0001", func(r *CutRequest) { r.Keys = nil }, "choose a word"},
		{"b before a", "c-0001", func(r *CutRequest) { r.B = r.A }, "end after it starts"},
		{"negative time", "c-0001", func(r *CutRequest) { r.A = -1 }, "seconds from the start"},
		{"off1 before off0", "c-0001", func(r *CutRequest) { r.Off1 = r.Off0 - 1 }, "place in its take"},
		{"unknown mode", "c-0001", func(r *CutRequest) { r.Mode = "erase" }, "closes the gap or leaves it"},
		{"fade off the choices", "c-0001", func(r *CutRequest) { r.FadeMs = 13 }, "crossfade"},
		{"no text", "c-0001", func(r *CutRequest) { r.Text = " " }, "show the words"},
		{"text too long", "c-0001", func(r *CutRequest) { r.Text = strings.Repeat("a", MaxCutText+1) }, "at most"},
		{"no DAW result", "c-0001", func(r *CutRequest) { r.GUID, r.UndoSteps = "", nil }, "after the DAW made it"},
		{"no guid", "c-0001", func(r *CutRequest) { r.GUID = "" }, "after the DAW made it"},
		{"no undo steps", "c-0001", func(r *CutRequest) { r.UndoSteps = nil }, "after the DAW made it"},
		{"negative undo steps", "c-0001", func(r *CutRequest) { r.UndoSteps = steps(-1) }, "cannot be negative"},
	} {
		request := queenCut()
		call.change(&request)
		if _, err := service.CutRecord(call.chapterID, request); err == nil || !strings.Contains(err.Error(), call.want) {
			t.Errorf("%s: err = %v, want %q", call.name, err, call.want)
		}
	}
	if _, err := os.Stat(CutsFile(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused cut saved the file: %v", err)
	}
	// Undo steps of 0 (an app-kept edit list) is a DAW result.
	request := queenCut()
	request.UndoSteps = steps(0)
	if _, err := service.CutRecord("c-0001", request); err != nil {
		t.Fatal(err)
	}
}

// 5. overlap-is-refused
func TestCutOverlapIsRefused(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.CutRecord("c-0001", queenCut()); err != nil {
		t.Fatal(err)
	}
	overlap := queenCut()
	overlap.A, overlap.B = 13, 14
	if _, err := service.CutRecord("c-0001", overlap); err == nil || !strings.Contains(err.Error(), "cut1") {
		t.Fatalf("an overlapping cut = %v", err)
	}
	// Touching at an edge is not an overlap, and another take is other audio.
	touching := queenCut()
	touching.A, touching.B = 13.5, 14
	if _, err := service.CutRecord("c-0001", touching); err != nil {
		t.Fatal(err)
	}
	otherTake := queenCut()
	otherTake.TakeID = "t-2"
	if _, err := service.CutRecord("c-0001", otherTake); err != nil {
		t.Fatal(err)
	}
	if list, _ := service.CutsList("c-0001"); len(list.Cuts) != 3 {
		t.Fatalf("list = %+v", list)
	}
}

// 6. stale-cut-is-reported-not-moved
func TestStaleCutIsReportedNotMoved(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.CutRecord("c-0001", queenCut()); err != nil {
		t.Fatal(err)
	}
	if _, err := service.CutRecord("c-0001", silentCut()); err != nil {
		t.Fatal(err)
	}
	book.Lines[0].Text = "“Off with her head!” the King shouted."
	book.Lines[1].Text = "The soldiers were"
	list, err := service.CutsList("c-0001")
	if err != nil {
		t.Fatal(err)
	}
	if !list.Cuts[0].Stale || list.Cuts[0].StaleReason != StaleTextChanged || list.Cuts[0].A != 12 || strings.Join(list.Cuts[0].Words, " ") != "the Queen shouted." {
		t.Fatalf("changed words = %+v", list.Cuts[0])
	}
	if !list.Cuts[1].Stale || list.Cuts[1].StaleReason != StaleWordMissing {
		t.Fatalf("shorter line = %+v", list.Cuts[1])
	}
	book.Lines = book.Lines[2:]
	list, _ = service.CutsList("c-0001")
	if !list.Cuts[0].Stale || list.Cuts[0].StaleReason != StaleParagraphMissing || list.Cuts[0].Paragraph != nil {
		t.Fatalf("gone line = %+v", list.Cuts[0])
	}
}

// 7. file-is-narrator-data
func TestCutsFileIsNarratorData(t *testing.T) {
	book := aliceBook()
	t.Run("a corrupt file is kept aside and an empty list starts", func(t *testing.T) {
		project := t.TempDir()
		writeFile(t, CutsFile(project), "{not json")
		list, err := newService(t, project, &book).CutsList("c-0001")
		if err != nil || len(list.Cuts) != 0 {
			t.Fatalf("list from a corrupt file = %+v, %v", list, err)
		}
		if kept, _ := filepath.Glob(CutsFile(project) + ".corrupt-*"); len(kept) != 1 {
			t.Fatalf("corrupt copies = %v", kept)
		}
	})
	t.Run("a file that breaks a rule is corrupt", func(t *testing.T) {
		project := t.TempDir()
		writeFile(t, CutsFile(project), `{"schemaVersion": 1, "cuts": [{"id": "cut1", "chapterId": "c-0001", "pid": "p-000001", "words": [{"ordinal": 0, "text": "Off"}], "text": "Off", "a": 5, "b": 4, "mode": "close", "fadeMs": 0, "daw": "reaper", "guid": "g", "undoSteps": 1, "at": "2026-10-11T10:00:00Z"}]}`)
		if list, err := newService(t, project, &book).CutsList("c-0001"); err != nil || len(list.Cuts) != 0 {
			t.Fatalf("list = %+v, %v", list, err)
		}
		if kept, _ := filepath.Glob(CutsFile(project) + ".corrupt-*"); len(kept) != 1 {
			t.Fatalf("corrupt copies = %v", kept)
		}
	})
	t.Run("a file from a newer app is refused and never overwritten", func(t *testing.T) {
		project := t.TempDir()
		newer := `{"schemaVersion": 99, "cuts": []}`
		writeFile(t, CutsFile(project), newer)
		service := newService(t, project, &book)
		if _, err := service.CutsList("c-0001"); err == nil || !strings.Contains(err.Error(), "newer version") {
			t.Fatalf("list of a newer file = %v", err)
		}
		if _, err := service.CutRecord("c-0001", queenCut()); err == nil {
			t.Fatal("a record over a newer file succeeded")
		}
		if _, err := service.CutRemove("c-0001", "cut1"); err == nil {
			t.Fatal("a remove over a newer file succeeded")
		}
		if raw, _ := os.ReadFile(CutsFile(project)); string(raw) != newer {
			t.Fatalf("the newer file was overwritten: %s", raw)
		}
	})
	t.Run("a write is temp-file-then-rename", func(t *testing.T) {
		project := t.TempDir()
		if _, err := newService(t, project, &book).CutRecord("c-0001", queenCut()); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(CutsFile(project) + ".tmp"); !os.IsNotExist(err) {
			t.Fatalf("temporary file left: %v", err)
		}
		var file cutsFile
		raw, _ := os.ReadFile(CutsFile(project))
		if err := json.Unmarshal(raw, &file); err != nil || file.SchemaVersion != CutsVersion || len(file.Cuts) != 1 {
			t.Fatalf("file = %s, %v", raw, err)
		}
	})
}

// 11. no-sneaked-path
func TestCutPathShapedTextIsStoredAsText(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	request := queenCut()
	request.Text, request.GUID, request.Daw, request.TakeID = "../../etc/passwd", "C:\\Windows\\win.ini", "/bin/sh", "../take"
	change, err := service.CutRecord("c-0001", request)
	if err != nil {
		t.Fatal(err)
	}
	if cut := change.Cuts.Cuts[0]; cut.Text != "../../etc/passwd" || cut.GUID != "C:\\Windows\\win.ini" {
		t.Fatalf("cut = %+v", cut)
	}
	entries, _ := os.ReadDir(Dir(project))
	if len(entries) != 1 || entries[0].Name() != "cuts.json" {
		t.Fatalf("editing folder = %v", entries)
	}
	pathKey := queenCut()
	pathKey.Keys = []string{"../../etc/passwd:0"}
	if _, err := service.CutRecord("c-0001", pathKey); err == nil || !strings.Contains(err.Error(), "all be in its paragraph") {
		t.Fatalf("path-shaped key = %v", err)
	}
}

func TestCutsWithNoProject(t *testing.T) {
	book := aliceBook()
	service := newService(t, "", &book)
	if list, err := service.CutsList("c-0001"); err != nil || len(list.Cuts) != 0 {
		t.Fatalf("list = %+v, %v", list, err)
	}
	if _, err := service.CutRecord("c-0001", queenCut()); err == nil {
		t.Fatal("record without a project succeeded")
	}
	if _, err := service.CutRemove("c-0001", "cut1"); err == nil {
		t.Fatal("remove without a project succeeded")
	}
}

// gapTrim is a gap Clean up shortened (SN-E112): no paragraph and no words, from 30 s to 31.2 s of the chapter recording.
func gapTrim() CutRequest {
	return CutRequest{Text: "A gap of 1.2 s", A: 30, B: 31.2, Off0: 30, Off1: 31.2, Mode: CutClose, FadeMs: 6, Daw: "REAPER", GUID: "{GAP-1}", UndoSteps: steps(1)}
}

// 12. a-wordless-cut-is-a-range: a gap between words is recorded with no paragraph and no words, comes back never stale, survives a
// reopen, and is refused where it overlaps any cut of the chapter; a paragraph with no words, or words with no paragraph, is refused.
func TestAWordlessCutIsRecordedAsARange(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.CutRecord("c-0001", queenCut()); err != nil {
		t.Fatal(err)
	}
	change, err := service.CutRecord("c-0001", gapTrim())
	if err != nil {
		t.Fatal(err)
	}
	gap := change.Cuts.Cuts[1]
	if change.Changed[0] != "cut2" || gap.ID != "cut2" || gap.ParagraphID != "" || len(gap.Keys) != 0 || gap.Keys == nil || len(gap.Words) != 0 || gap.Words == nil ||
		gap.Paragraph != nil || gap.Stale || gap.Text != "A gap of 1.2 s" || gap.A != 30 || gap.B != 31.2 {
		t.Fatalf("wordless cut = %+v", gap)
	}
	if list, err := newService(t, project, &book).CutsList("c-0001"); err != nil || cutIDs(list.Cuts) != "cut1,cut2" || list.Cuts[1].Stale {
		t.Fatalf("list from a new service = %+v, %v", list, err)
	}
	overlapping := gapTrim()
	overlapping.A, overlapping.B, overlapping.TakeID = 13, 14, "t-9"
	if _, err := service.CutRecord("c-0001", overlapping); err == nil || !strings.Contains(err.Error(), "overlaps cut cut1") {
		t.Fatalf("a wordless cut over a word cut = %v", err)
	}
	word := queenCut()
	word.TakeID, word.A, word.B = "t-9", 30.5, 31
	if _, err := service.CutRecord("c-0001", word); err == nil || !strings.Contains(err.Error(), "overlaps cut cut2") {
		t.Fatalf("a word cut over a wordless cut = %v", err)
	}
	for name, mutate := range map[string]func(*CutRequest){
		"a paragraph with no words": func(r *CutRequest) { r.ParagraphID = "p-000001" },
		"words with no paragraph":   func(r *CutRequest) { r.Keys = []string{"p-000001:4"} },
		"no text":                   func(r *CutRequest) { r.Text = " " },
		"no DAW result":             func(r *CutRequest) { r.UndoSteps = nil },
	} {
		request := gapTrim()
		request.A, request.B = 40, 41
		mutate(&request)
		if _, err := service.CutRecord("c-0001", request); err == nil {
			t.Errorf("%s: recorded", name)
		}
	}
	if _, err := service.CutRecord("c-0009", gapTrim()); err == nil {
		t.Error("a wordless cut of a chapter the manuscript does not have was recorded")
	}
	writeFile(t, CutsFile(project), `{"schemaVersion": 1, "cuts": [{"id": "cut1", "chapterId": "c-0001", "pid": "p-000001", "words": [], "text": "x", "a": 4, "b": 5, "off0": 4, "off1": 5, "mode": "close", "fadeMs": 0, "daw": "reaper", "guid": "g", "undoSteps": 1, "at": "2026-10-11T10:00:00Z"}]}`)
	if list, err := newService(t, project, &book).CutsList("c-0001"); err != nil || len(list.Cuts) != 0 {
		t.Fatalf("a stored paragraph with no words is not corrupt: %+v, %v", list, err)
	}
}
