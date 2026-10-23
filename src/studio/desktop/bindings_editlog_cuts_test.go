package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
)

func undoSteps(n int) *int { return &n }

// queenCutRequest is "the Queen shouted." (words 4 to 6 of the bookmarks manuscript's p-000001), from 12 s to 13.5 s of
// the chapter recording, as the app sends it after REAPER accepted the deleteRange.
func queenCutRequest() editlog.CutRequest {
	return editlog.CutRequest{
		ParagraphID: "p-000001", TakeID: "t-1", Keys: []string{"p-000001:4", "p-000001:5", "p-000001:6"}, Text: "the Queen shouted.",
		A: 12, B: 13.5, Off0: 2, Off1: 3.5, Mode: editlog.CutClose, FadeMs: 12, Daw: "reaper", GUID: "{CUT-1}", UndoSteps: undoSteps(1),
	}
}

// silentCutRequest is "were silent." (words 2 and 3 of p-000002), heard at 18.5 s after the first cut closed, so 20 s in
// the recording before any cut: the app sends the converted number.
func silentCutRequest() editlog.CutRequest {
	return editlog.CutRequest{
		ParagraphID: "p-000002", TakeID: "t-1", Keys: []string{"p-000002:2", "p-000002:3"}, Text: "were silent.",
		A: 20, B: 21, Off0: 10, Off1: 11, Mode: editlog.CutGap, FadeMs: 0, Daw: "reaper", GUID: "{CUT-2}", UndoSteps: undoSteps(2),
	}
}

func decodeCuts(t *testing.T) func(string, error) editlog.Cuts {
	return func(payload string, err error) editlog.Cuts {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var cuts editlog.Cuts
		if err := json.Unmarshal([]byte(payload), &cuts); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return cuts
	}
}

func decodeCutsChange(t *testing.T) func(string, error) editlog.CutsChange {
	return func(payload string, err error) editlog.CutsChange {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var change editlog.CutsChange
		if err := json.Unmarshal([]byte(payload), &change); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return change
	}
}

func cutIDsOf(cuts []editlog.Cut) string {
	ids := make([]string, 0, len(cuts))
	for _, cut := range cuts {
		ids = append(ids, cut.ID)
	}
	return strings.Join(ids, ",")
}

func TestEditCutsBindingsRecordListRemoveRoundtrip(t *testing.T) {
	host, project := editLogHost(t)
	if list := decodeCuts(t)(host.EditingCutsList("c-0001")); len(list.Cuts) != 0 || list.ChapterID != "c-0001" {
		t.Fatalf("list of a new project = %+v", list)
	}
	decodeCutsChange(t)(host.EditingCutRecord("c-0001", silentCutRequest()))
	change := decodeCutsChange(t)(host.EditingCutRecord("c-0001", queenCutRequest()))
	if cutIDsOf(change.Cuts.Cuts) != "cut2,cut1" || strings.Join(change.Changed, ",") != "cut2" {
		t.Fatalf("record = %+v", change)
	}
	if list := decodeCuts(t)(hostOverProject(t, project).EditingCutsList("c-0001")); cutIDsOf(list.Cuts) != "cut2,cut1" || list.Cuts[1].A != 20 {
		t.Fatalf("list from another host = %+v", list)
	}
	removed := decodeCutsChange(t)(host.EditingCutRemove("c-0001", "cut2"))
	if cutIDsOf(removed.Cuts.Cuts) != "cut1" || strings.Join(removed.Changed, ",") != "cut2" {
		t.Fatalf("remove = %+v", removed)
	}
}

func TestEditCutsBindingsRefuseAndSaveNothing(t *testing.T) {
	host, project := editLogHost(t)
	noResult := queenCutRequest()
	noResult.GUID, noResult.UndoSteps = "", nil
	pathKey := queenCutRequest()
	pathKey.Keys = []string{"../../etc/passwd:0"}
	for _, call := range []struct {
		chapterID string
		request   editlog.CutRequest
		want      string
	}{
		{"missing", queenCutRequest(), "not in the manuscript"},
		{"c-0001", noResult, "after the DAW made it"},
		{"c-0001", pathKey, "all be in its paragraph"},
	} {
		if _, err := host.EditingCutRecord(call.chapterID, call.request); err == nil || !strings.Contains(err.Error(), call.want) {
			t.Errorf("record(%s) = %v, want %q", call.chapterID, err, call.want)
		}
	}
	if _, err := os.Stat(editlog.CutsFile(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused cut saved the file: %v", err)
	}
	decodeCutsChange(t)(host.EditingCutRecord("c-0001", queenCutRequest()))
	if _, err := host.EditingCutRecord("c-0001", queenCutRequest()); err == nil || !strings.Contains(err.Error(), "cut1") {
		t.Fatalf("a double cut = %v", err)
	}
}
