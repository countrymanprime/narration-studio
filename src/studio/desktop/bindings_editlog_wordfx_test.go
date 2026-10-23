package main

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
)

// polishFxRequest is "the Queen shouted." (words 4 to 6 of the bookmarks manuscript's p-000001), from 12 s to 13.5 s of the
// chapter recording, with REAPER's "Voice polish" chain, as the app sends it after REAPER accepted applyFxToRange.
func polishFxRequest() editlog.WordFxRequest {
	return editlog.WordFxRequest{
		ParagraphID: "p-000001", TakeID: "t-1", Keys: []string{"p-000001:4", "p-000001:5", "p-000001:6"}, Text: "the Queen shouted.",
		A: 12, B: 13.5, Off0: 2, Off1: 3.5, ChainID: "Voice/Polish.RfxChain", ChainName: "Voice polish (EQ, compressor, de-esser)",
		Source: "Your REAPER FX chains", FadeMs: 8, Daw: "reaper", GUID: "{FX-1}",
	}
}

// shoutedFxRequest is "shouted." alone with the de-esser: a chain on top of polishFxRequest's.
func shoutedFxRequest() editlog.WordFxRequest {
	return editlog.WordFxRequest{
		ParagraphID: "p-000001", TakeID: "t-1", Keys: []string{"p-000001:6"}, Text: "shouted.", A: 13, B: 13.5, Off0: 3, Off1: 3.5,
		ChainID: "Deesser.RfxChain", ChainName: "De-esser only", Source: "Your REAPER FX chains", FadeMs: 8, Daw: "reaper", GUID: "{FX-2}",
	}
}

// silentFxRequest is "were silent." (words 2 and 3 of p-000002), at 20 s of the recording before any cut.
func silentFxRequest() editlog.WordFxRequest {
	return editlog.WordFxRequest{
		ParagraphID: "p-000002", TakeID: "t-1", Keys: []string{"p-000002:2", "p-000002:3"}, Text: "were silent.", A: 20, B: 21, Off0: 10,
		Off1: 11, ChainID: "Room tone.RfxChain", ChainName: "Room tone match", Source: "Your REAPER FX chains", FadeMs: 8, Daw: "reaper",
		GUID: "{FX-3}", BackupID: "bk1",
	}
}

func decodeWordFx(t *testing.T) func(string, error) editlog.WordFxList {
	return func(payload string, err error) editlog.WordFxList {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var list editlog.WordFxList
		if err := json.Unmarshal([]byte(payload), &list); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return list
	}
}

func decodeWordFxChange(t *testing.T) func(string, error) editlog.WordFxChange {
	return func(payload string, err error) editlog.WordFxChange {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var change editlog.WordFxChange
		if err := json.Unmarshal([]byte(payload), &change); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return change
	}
}

func wordFxIDsOf(effects []editlog.WordFx) string {
	ids := make([]string, 0, len(effects))
	for _, fx := range effects {
		ids = append(ids, fx.ID)
	}
	return strings.Join(ids, ",")
}

func TestEditWordFxBindingsRecordListRemoveRoundtrip(t *testing.T) {
	host, project := editLogHost(t)
	if list := decodeWordFx(t)(host.EditingWordFxList("c-0001")); len(list.Effects) != 0 || list.ChapterID != "c-0001" {
		t.Fatalf("list of a new project = %+v", list)
	}
	decodeWordFxChange(t)(host.EditingWordFxRecord("c-0001", silentFxRequest()))
	change := decodeWordFxChange(t)(host.EditingWordFxRecord("c-0001", polishFxRequest()))
	if wordFxIDsOf(change.Effects) != "fx2,fx1" || strings.Join(change.Changed, ",") != "fx2" {
		t.Fatalf("record = %+v", change)
	}
	if list := decodeWordFx(t)(hostOverProject(t, project).EditingWordFxList("c-0001")); wordFxIDsOf(list.Effects) != "fx2,fx1" || list.Effects[1].A != 20 {
		t.Fatalf("list from another host = %+v", list)
	}
	removed := decodeWordFxChange(t)(host.EditingWordFxRemove("c-0001", "fx2"))
	if wordFxIDsOf(removed.Effects) != "fx1" || strings.Join(removed.Changed, ",") != "fx2" {
		t.Fatalf("remove = %+v", removed)
	}
}

func TestEditWordFxBindingsRefuseAndSaveNothing(t *testing.T) {
	host, project := editLogHost(t)
	noResult := polishFxRequest()
	noResult.GUID = ""
	pathChain := polishFxRequest()
	pathChain.ChainID = `C:\Users\me\AppData\Roaming\REAPER\FXChains\Polish.RfxChain`
	twoTakes := polishFxRequest()
	twoTakes.Keys = []string{"p-000001:6", "p-000002:0"}
	for _, call := range []struct {
		chapterID string
		request   editlog.WordFxRequest
		want      string
	}{
		{"missing", polishFxRequest(), "not in the manuscript"},
		{"c-0001", noResult, "after the DAW added it"},
		{"c-0001", pathChain, editlog.ErrBadChainName.Error()},
		{"c-0001", twoTakes, "more than one take"},
	} {
		if _, err := host.EditingWordFxRecord(call.chapterID, call.request); err == nil || !strings.Contains(err.Error(), call.want) {
			t.Errorf("record(%s) = %v, want %q", call.chapterID, err, call.want)
		}
	}
	if _, err := host.EditingWordFxRecord("c-0001", pathChain); !errors.Is(err, editlog.ErrBadChainName) {
		t.Fatalf("a path for a chain = %v", err)
	}
	if _, err := os.Stat(editlog.WordFxFile(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused effect saved the file: %v", err)
	}
}
