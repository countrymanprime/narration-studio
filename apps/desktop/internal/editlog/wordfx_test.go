package editlog

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// polishFx is "the Queen shouted." (words 4 to 6 of p-000001), heard from 12 s to 13.5 s of the chapter recording, with the
// DAW's "Voice polish" chain on it, as the app sends it after the DAW accepted applyFxToRange.
func polishFx() WordFxRequest {
	return WordFxRequest{
		ParagraphID: "p-000001", TakeID: "t-1", Keys: []string{"p-000001:4", "p-000001:5", "p-000001:6"}, Text: "the Queen shouted.",
		A: 12, B: 13.5, Off0: 2, Off1: 3.5, ChainID: "Voice/Polish.RfxChain", ChainName: "Voice polish (EQ, compressor, de-esser)",
		Source: "Your REAPER FX chains", FadeMs: 8, Daw: "reaper", GUID: "{FX-1}",
	}
}

// deesserFx is "were silent." (words 2 and 3 of p-000002) with the de-esser.
func deesserFx() WordFxRequest {
	fx := polishFx()
	fx.ParagraphID, fx.Keys, fx.Text, fx.GUID = "p-000002", []string{"p-000002:2", "p-000002:3"}, "were silent.", "{FX-2}"
	fx.A, fx.B, fx.Off0, fx.Off1 = 20, 21, 10, 11
	fx.ChainID, fx.ChainName = "Deesser.RfxChain", "De-esser only"
	return fx
}

func fxIDs(effects []WordFx) string {
	ids := make([]string, 0, len(effects))
	for _, fx := range effects {
		ids = append(ids, fx.ID)
	}
	return strings.Join(ids, ",")
}

// 1. record-list-remove-roundtrip
func TestWordFxRecordListRemoveRoundtrip(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	// Recorded out of time order: the list is in time order.
	if _, err := service.WordFxRecord("c-0001", deesserFx()); err != nil {
		t.Fatal(err)
	}
	change, err := service.WordFxRecord("c-0001", polishFx())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(change.Changed, ",") != "fx2" || fxIDs(change.Effects) != "fx2,fx1" || len(change.Over) != 0 {
		t.Fatalf("record = %+v", change)
	}
	first := change.Effects[0]
	if strings.Join(first.Keys, ",") != "p-000001:4,p-000001:5,p-000001:6" || strings.Join(first.Words, " ") != "the Queen shouted." || first.Stale ||
		first.ChainID != "Voice/Polish.RfxChain" || first.ChainName != "Voice polish (EQ, compressor, de-esser)" || first.Source != "Your REAPER FX chains" ||
		first.FadeMs != 8 || first.Paragraph == nil || *first.Paragraph != 0 || first.At.IsZero() {
		t.Fatalf("first effect = %+v", first)
	}
	reopened := newService(t, project, &book)
	list, err := reopened.WordFxList("c-0001")
	if err != nil || fxIDs(list.Effects) != "fx2,fx1" {
		t.Fatalf("list from a new service = %+v, %v", list, err)
	}
	if other, _ := reopened.WordFxList("c-0002"); len(other.Effects) != 0 || other.ChapterID != "c-0002" {
		t.Fatalf("another chapter's list = %+v", other)
	}
	removed, err := reopened.WordFxRemove("c-0001", "fx2")
	if err != nil || strings.Join(removed.Changed, ",") != "fx2" || fxIDs(removed.Effects) != "fx1" {
		t.Fatalf("remove = %+v, %v", removed, err)
	}
	if again, err := reopened.WordFxRemove("c-0001", "fx2"); err != nil || len(again.Changed) != 0 {
		t.Fatalf("removing again = %+v, %v", again, err)
	}
	if _, err := reopened.WordFxRemove("c-0001", ""); err == nil {
		t.Fatal("a remove with no id succeeded")
	}
	// An id is never reused while a later one is kept.
	if next, err := reopened.WordFxRecord("c-0001", polishFx()); err != nil || next.Changed[0] != "fx2" {
		t.Fatalf("next id = %+v, %v", next, err)
	}
}

// 2. chain-name-is-a-list-name-never-a-path, and 11. no-sneaked-path
func TestWordFxChainNameIsAListNameNeverAPath(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	// A real file the path-shaped names point at: refusing them must not depend on it being there.
	outside := filepath.Join(t.TempDir(), "Evil.RfxChain")
	writeFile(t, outside, "<FXCHAIN>")
	for _, name := range []string{
		outside, "/etc/passwd", "C:\\Users\\me\\FXChains\\Polish.RfxChain", "C:Polish.RfxChain", "..\\Polish.RfxChain", "../Polish.RfxChain",
		"Voice/../../Polish.RfxChain", "Voice/./Polish.RfxChain", "Voice//Polish.RfxChain", "Voice/", "..", "", " ", "Polish\x00.RfxChain", "Polish\n",
	} {
		for _, field := range []string{"chainId", "chainName"} {
			request := polishFx()
			if field == "chainId" {
				request.ChainID = name
			} else {
				request.ChainName = name
			}
			if _, err := service.WordFxRecord("c-0001", request); !errors.Is(err, ErrBadChainName) {
				t.Errorf("%s %q: err = %v, want ErrBadChainName", field, name, err)
			}
		}
	}
	if _, err := os.Stat(WordFxFile(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused effect saved the file: %v", err)
	}
	// A chain in a subfolder of FXChains is named as the DAW lists it, and other text is stored as text, never opened.
	request := polishFx()
	request.Text, request.GUID, request.Daw, request.TakeID, request.Source = "../../etc/passwd", "C:\\Windows\\win.ini", "/bin/sh", "../take", "/tmp/x"
	change, err := service.WordFxRecord("c-0001", request)
	if err != nil {
		t.Fatal(err)
	}
	if fx := change.Effects[0]; fx.ChainID != "Voice/Polish.RfxChain" || fx.Text != "../../etc/passwd" || fx.GUID != "C:\\Windows\\win.ini" {
		t.Fatalf("effect = %+v", fx)
	}
	entries, _ := os.ReadDir(Dir(project))
	if len(entries) != 1 || entries[0].Name() != "wordfx.json" {
		t.Fatalf("editing folder = %v", entries)
	}
	pathKey := polishFx()
	pathKey.Keys = []string{"../../etc/passwd:0"}
	if _, err := service.WordFxRecord("c-0001", pathKey); err == nil || !strings.Contains(err.Error(), "more than one take") {
		t.Fatalf("path-shaped key = %v", err)
	}
}

// 3. record-is-validated
func TestWordFxRecordIsValidated(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	for _, call := range []struct {
		name      string
		chapterID string
		change    func(*WordFxRequest)
		want      string
	}{
		{"unknown chapter", "c-9999", func(*WordFxRequest) {}, "not in the manuscript"},
		{"paragraph of another chapter", "c-0002", func(*WordFxRequest) {}, "not in this chapter"},
		{"unknown paragraph", "c-0001", func(r *WordFxRequest) { r.ParagraphID, r.Keys = "p-999999", []string{"p-999999:0"} }, "not in this chapter"},
		{"words in two takes", "c-0001", func(r *WordFxRequest) { r.Keys = []string{"p-000001:6", "p-000002:0"} }, "more than one take"},
		{"key past the line", "c-0001", func(r *WordFxRequest) { r.Keys = []string{"p-000001:7"} }, "past the end"},
		{"malformed key", "c-0001", func(r *WordFxRequest) { r.Keys = []string{"p-000001:01"} }, "not a word of the script"},
		{"no key", "c-0001", func(r *WordFxRequest) { r.Keys = nil }, "choose a word"},
		{"b before a", "c-0001", func(r *WordFxRequest) { r.B = r.A }, "end after it starts"},
		{"negative time", "c-0001", func(r *WordFxRequest) { r.A = -1 }, "seconds from the start"},
		{"endless time", "c-0001", func(r *WordFxRequest) { r.B = math.Inf(1) }, "seconds from the start"},
		{"off1 before off0", "c-0001", func(r *WordFxRequest) { r.Off1 = r.Off0 - 1 }, "place in its take"},
		{"negative fade", "c-0001", func(r *WordFxRequest) { r.FadeMs = -1 }, "fade"},
		{"long fade", "c-0001", func(r *WordFxRequest) { r.FadeMs = MaxFxFadeMs + 1 }, "fade"},
		{"no text", "c-0001", func(r *WordFxRequest) { r.Text = " " }, "show the words"},
		{"text too long", "c-0001", func(r *WordFxRequest) { r.Text = strings.Repeat("a", MaxFxText+1) }, "at most"},
		{"no source", "c-0001", func(r *WordFxRequest) { r.Source = "" }, "list it came from"},
		{"no DAW result", "c-0001", func(r *WordFxRequest) { r.GUID, r.Daw = "", "" }, "after the DAW added it"},
		{"no guid", "c-0001", func(r *WordFxRequest) { r.GUID = "" }, "after the DAW added it"},
	} {
		request := polishFx()
		call.change(&request)
		if _, err := service.WordFxRecord(call.chapterID, request); err == nil || !strings.Contains(err.Error(), call.want) {
			t.Errorf("%s: err = %v, want %q", call.name, err, call.want)
		}
	}
	if _, err := os.Stat(WordFxFile(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused effect saved the file: %v", err)
	}
}

// 4. span-stays-in-original-time
func TestWordFxSpanStaysInOriginalTime(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.WordFxRecord("c-0001", deesserFx()); err != nil {
		t.Fatal(err)
	}
	// "the Queen shouted." is cut (a 1.5 s close at 12 s), before the effect on "were silent." at 20 s.
	if _, err := service.CutRecord("c-0001", queenCut()); err != nil {
		t.Fatal(err)
	}
	list, _ := service.WordFxList("c-0001")
	fx := list.Effects[0]
	if fx.A != 20 || fx.B != 21 || fx.Stale {
		t.Fatalf("listed span = %+v", fx)
	}
	cuts, _ := service.CutsList("c-0001")
	if start, end := curTime(cuts.Cuts, fx.A), curTime(cuts.Cuts, fx.B); start != 18.5 || end != 19.5 {
		t.Fatalf("displayed span = %v..%v", start, end)
	}
}

// 5. overlap-keeps-both-and-says-so
func TestWordFxOverlapKeepsBothAndSaysSo(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.WordFxRecord("c-0001", polishFx()); err != nil {
		t.Fatal(err)
	}
	// "shouted." alone, under the chain already on "the Queen shouted.": a chain on top of a chain.
	onTop := deesserFx()
	onTop.ParagraphID, onTop.Keys, onTop.Text, onTop.A, onTop.B, onTop.Off0, onTop.Off1 = "p-000001", []string{"p-000001:6"}, "shouted.", 13, 13.5, 3, 3.5
	change, err := service.WordFxRecord("c-0001", onTop)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(change.Changed, ",") != "fx2" || strings.Join(change.Over, ",") != "fx1" || len(change.Effects) != 2 {
		t.Fatalf("overlap = %+v", change)
	}
	// Words beside each other do not overlap.
	beside := deesserFx()
	beside.ParagraphID, beside.Keys, beside.Text, beside.A, beside.B, beside.Off0, beside.Off1 = "p-000001", []string{"p-000001:3"}, "head!”", 11, 12, 1, 2
	if change, err := service.WordFxRecord("c-0001", beside); err != nil || len(change.Over) != 0 {
		t.Fatalf("beside = %+v, %v", change, err)
	}
}

// 6. stale-effect-is-reported-not-moved
func TestStaleWordFxIsReportedNotMoved(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.WordFxRecord("c-0001", polishFx()); err != nil {
		t.Fatal(err)
	}
	if _, err := service.WordFxRecord("c-0001", deesserFx()); err != nil {
		t.Fatal(err)
	}
	book.Lines[0].Text = "“Off with her head!” the King shouted."
	book.Lines[1].Text = "The soldiers were"
	list, err := service.WordFxList("c-0001")
	if err != nil {
		t.Fatal(err)
	}
	if !list.Effects[0].Stale || list.Effects[0].StaleReason != StaleTextChanged || list.Effects[0].A != 12 || strings.Join(list.Effects[0].Words, " ") != "the Queen shouted." {
		t.Fatalf("changed words = %+v", list.Effects[0])
	}
	if !list.Effects[1].Stale || list.Effects[1].StaleReason != StaleWordMissing {
		t.Fatalf("shorter line = %+v", list.Effects[1])
	}
	book.Lines = book.Lines[2:]
	list, _ = service.WordFxList("c-0001")
	if !list.Effects[0].Stale || list.Effects[0].StaleReason != StaleParagraphMissing || list.Effects[0].Paragraph != nil {
		t.Fatalf("gone line = %+v", list.Effects[0])
	}
}

// 7. file-is-narrator-data
func TestWordFxFileIsNarratorData(t *testing.T) {
	book := aliceBook()
	t.Run("a corrupt file is kept aside and an empty list starts", func(t *testing.T) {
		project := t.TempDir()
		writeFile(t, WordFxFile(project), "{not json")
		list, err := newService(t, project, &book).WordFxList("c-0001")
		if err != nil || len(list.Effects) != 0 {
			t.Fatalf("list from a corrupt file = %+v, %v", list, err)
		}
		if kept, _ := filepath.Glob(WordFxFile(project) + ".corrupt-*"); len(kept) != 1 {
			t.Fatalf("corrupt copies = %v", kept)
		}
	})
	for name, effect := range map[string]string{
		"ends before it starts": `"a": 5, "b": 4, "chainId": "Polish.RfxChain"`,
		"a path for a chain":    `"a": 4, "b": 5, "chainId": "C:\\FX\\Polish.RfxChain"`,
	} {
		t.Run("a file that breaks a rule is corrupt: "+name, func(t *testing.T) {
			project := t.TempDir()
			writeFile(t, WordFxFile(project), `{"schemaVersion": 1, "effects": [{"id": "fx1", "chapterId": "c-0001", "pid": "p-000001", "words": [{"ordinal": 0, "text": "Off"}], "text": "Off", `+effect+`, "chainName": "Polish", "source": "Your REAPER FX chains", "fadeMs": 8, "daw": "reaper", "guid": "g", "at": "2026-10-11T10:00:00Z"}]}`)
			if list, err := newService(t, project, &book).WordFxList("c-0001"); err != nil || len(list.Effects) != 0 {
				t.Fatalf("list = %+v, %v", list, err)
			}
			if kept, _ := filepath.Glob(WordFxFile(project) + ".corrupt-*"); len(kept) != 1 {
				t.Fatalf("corrupt copies = %v", kept)
			}
		})
	}
	t.Run("a file from a newer app is refused and never overwritten", func(t *testing.T) {
		project := t.TempDir()
		newer := `{"schemaVersion": 99, "effects": []}`
		writeFile(t, WordFxFile(project), newer)
		service := newService(t, project, &book)
		if _, err := service.WordFxList("c-0001"); err == nil || !strings.Contains(err.Error(), "newer version") {
			t.Fatalf("list of a newer file = %v", err)
		}
		if _, err := service.WordFxRecord("c-0001", polishFx()); err == nil {
			t.Fatal("a record over a newer file succeeded")
		}
		if _, err := service.WordFxRemove("c-0001", "fx1"); err == nil {
			t.Fatal("a remove over a newer file succeeded")
		}
		if raw, _ := os.ReadFile(WordFxFile(project)); string(raw) != newer {
			t.Fatalf("the newer file was overwritten: %s", raw)
		}
	})
	t.Run("a write is temp-file-then-rename", func(t *testing.T) {
		project := t.TempDir()
		if _, err := newService(t, project, &book).WordFxRecord("c-0001", polishFx()); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(WordFxFile(project) + ".tmp"); !os.IsNotExist(err) {
			t.Fatalf("temporary file left: %v", err)
		}
		var file wordFxFile
		raw, _ := os.ReadFile(WordFxFile(project))
		if err := json.Unmarshal(raw, &file); err != nil || file.SchemaVersion != WordFxVersion || len(file.Effects) != 1 {
			t.Fatalf("file = %s, %v", raw, err)
		}
	})
}

func TestWordFxWithNoProject(t *testing.T) {
	book := aliceBook()
	service := newService(t, "", &book)
	if list, err := service.WordFxList("c-0001"); err != nil || len(list.Effects) != 0 {
		t.Fatalf("list = %+v, %v", list, err)
	}
	if _, err := service.WordFxRecord("c-0001", polishFx()); err == nil {
		t.Fatal("record without a project succeeded")
	}
	if _, err := service.WordFxRemove("c-0001", "fx1"); err == nil {
		t.Fatal("remove without a project succeeded")
	}
}
