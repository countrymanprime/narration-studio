package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
	"github.com/countrymanprime/narration-utils/shell/internal/recording/recordingtest"
)

// stackRequest is a passage's two later reads stacked on its first read, as the app sends it after REAPER accepted stackTakes:
// the takes are named by the ids WorkspaceTakes offers, the offsets are seconds after the first read's start.
func stackRequest(passageID string) editlog.StackRecordRequest {
	one := 1
	return editlog.StackRecordRequest{
		PassageID: passageID, Base: "take:{ITEM-1}:{TAKE-1}",
		Takes: []string{"take:{ITEM-1}:{TAKE-1}", "take:{ITEM-1}:{TAKE-2}", "take:{ITEM-1}:{TAKE-3}"},
		Moves: []editlog.StackMove{{TakeID: "take:{ITEM-1}:{TAKE-2}", Offset: 6.7}, {TakeID: "take:{ITEM-1}:{TAKE-3}", Offset: 14.2}},
		Mode:  editlog.StackModeNative, UndoSteps: &one,
	}
}

func decodeStackList(t *testing.T) func(string, error) editlog.StackList {
	return func(payload string, err error) editlog.StackList {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var list editlog.StackList
		if err := json.Unmarshal([]byte(payload), &list); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return list
	}
}

func decodeStackChange(t *testing.T) func(string, error) editlog.StackChange {
	return func(payload string, err error) editlog.StackChange {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var change editlog.StackChange
		if err := json.Unmarshal([]byte(payload), &change); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return change
	}
}

func decodeRetryMode(t *testing.T) func(string, error) editlog.RetryModeAnswer {
	return func(payload string, err error) editlog.RetryModeAnswer {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var answer editlog.RetryModeAnswer
		if err := json.Unmarshal([]byte(payload), &answer); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return answer
	}
}

func TestEditStacksBindingsRecordListRemoveRoundtrip(t *testing.T) {
	host, project := editLogHost(t)
	if list := decodeStackList(t)(host.EditingStacksList("c-0001")); len(list.Stacks) != 0 || list.ChapterID != "c-0001" {
		t.Fatalf("list of a new project = %+v", list)
	}
	change := decodeStackChange(t)(host.EditingStackRecord("c-0001", stackRequest("passage-1")))
	if strings.Join(change.Changed, ",") != "take:{ITEM-1}:{TAKE-2},take:{ITEM-1}:{TAKE-3}" || len(change.Stacks) != 1 {
		t.Fatalf("record = %+v", change)
	}
	if list := decodeStackList(t)(hostOverProject(t, project).EditingStacksList("c-0001")); len(list.Stacks) != 1 || list.Stacks[0].Offsets["take:{ITEM-1}:{TAKE-2}"] != 6.7 {
		t.Fatalf("list from another host = %+v", list)
	}
	partial := decodeStackChange(t)(host.EditingStackRemove("c-0001", "passage-1", []string{"take:{ITEM-1}:{TAKE-3}"}))
	if len(partial.Stacks) != 1 || len(partial.Stacks[0].Offsets) != 1 {
		t.Fatalf("partial remove = %+v", partial)
	}
	rest := decodeStackChange(t)(host.EditingStackRemove("c-0001", "passage-1", []string{"take:{ITEM-1}:{TAKE-2}"}))
	if len(rest.Stacks) != 0 || strings.Join(rest.Changed, ",") != "take:{ITEM-1}:{TAKE-2}" {
		t.Fatalf("remove the rest = %+v", rest)
	}
}

func TestEditStacksBindingsRefuseAndSaveNothing(t *testing.T) {
	host, project := editLogHost(t)
	notTheirs := stackRequest("passage-1")
	notTheirs.Moves[0].TakeID = "take:{ITEM-9}:{TAKE-9}"
	noResult := stackRequest("passage-1")
	noResult.UndoSteps = nil
	path := stackRequest(`C:\Users\me\passage`)
	for _, call := range []struct {
		chapterID string
		request   editlog.StackRecordRequest
		want      string
	}{
		{"missing", stackRequest("passage-1"), "not in the manuscript"},
		{"c-0001", notTheirs, "not a take of this passage"},
		{"c-0001", noResult, "result is missing"},
		{"c-0001", path, "not one the Takes panel offers"},
	} {
		if _, err := host.EditingStackRecord(call.chapterID, call.request); err == nil || !strings.Contains(err.Error(), call.want) {
			t.Errorf("record(%s) = %v, want %q", call.chapterID, err, call.want)
		}
	}
	if _, err := host.EditingRetryModeSet("book", "", "", "stack"); err == nil {
		t.Error("an unknown level was accepted")
	}
	if _, err := host.EditingRetryModeSet("project", "", "", "always"); err == nil {
		t.Error("an unknown mode was accepted")
	}
	if _, err := os.Stat(editlog.StacksFile(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused call saved the file: %v", err)
	}
}

func TestEditStacksBindingsRetryModeAtEachLevel(t *testing.T) {
	host, _ := editLogHost(t)
	if answer := decodeRetryMode(t)(host.EditingRetryModeGet("passage", "c-0001", "passage-1")); answer.Mode != editlog.RetryLeave || answer.From != "default" {
		t.Fatalf("default = %+v", answer)
	}
	decodeRetryMode(t)(host.EditingRetryModeSet("project", "", "", "stack"))
	decodeRetryMode(t)(host.EditingRetryModeSet("chapter", "c-0001", "", "leave"))
	if answer := decodeRetryMode(t)(host.EditingRetryModeSet("passage", "c-0001", "passage-1", "stack")); answer.Mode != editlog.RetryStack || answer.From != "passage" {
		t.Fatalf("passage = %+v", answer)
	}
	if answer := decodeRetryMode(t)(host.EditingRetryModeGet("passage", "c-0001", "passage-2")); answer.Mode != editlog.RetryLeave || answer.From != "chapter" {
		t.Fatalf("a passage following its chapter = %+v", answer)
	}
	if answer := decodeRetryMode(t)(host.EditingRetryModeGet("chapter", "c-0002", "")); answer.Mode != editlog.RetryStack || answer.From != "project" {
		t.Fatalf("a chapter following the project = %+v", answer)
	}
}

// 5. a-merge-keeps-the-stack-and-the-mode: the Booth recording a new run of the chapter (the passage map the passages are
// re-read from) leaves the stack and the modes as editing left them, since the host keeps them apart from the passage list.
func TestEditStacksSurviveANewPassageMapRun(t *testing.T) {
	host := recorderHost(t, &recordingtest.Fake{})
	decodeStackChange(t)(host.EditingStackRecord("c-0001", stackRequest("passage-1")))
	decodeRetryMode(t)(host.EditingRetryModeSet("passage", "c-0001", "passage-1", "stack"))
	decodePassageMarks(t)(host.PassageMapRecordRun("c-0001", passageMapRun()))
	decodePassageMarks(t)(host.PassageMapRecordRun("c-0001", passageMapRun()))
	if list := decodeStackList(t)(host.EditingStacksList("c-0001")); len(list.Stacks) != 1 || len(list.Stacks[0].Offsets) != 2 {
		t.Fatalf("stacks after a new run = %+v", list)
	}
	if answer := decodeRetryMode(t)(host.EditingRetryModeGet("passage", "c-0001", "passage-1")); answer.Set != editlog.RetryStack {
		t.Fatalf("mode after a new run = %+v", answer)
	}
}
