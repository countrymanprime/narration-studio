package main

import (
	"encoding/json"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/passagemap"
	"github.com/countrymanprime/narration-utils/shell/internal/recording/recordingtest"
)

func decodePassageMarks(t *testing.T) func(string, error) []passagemap.Resolved {
	return func(payload string, err error) []passagemap.Resolved {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var marks []passagemap.Resolved
		if err := json.Unmarshal([]byte(payload), &marks); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return marks
	}
}

// passageMapRun is a take of previewManuscriptOK's first chapter: begun at its first word, rolled at the second
// paragraph's start after reading "Alice walked through the forest", and stopped at the end of the second paragraph.
func passageMapRun() []PassageMapMarkInput {
	return []PassageMapMarkInput{
		{PID: "p-000001", Word: 0, Sec: 0, Kind: "start"},
		{PID: "p-000002", Word: 0, Sec: 6.5, Kind: "roll", Prev: &PassageMapMarkPlace{PID: "p-000001", Word: 5}},
		{PID: "p-000002", Word: 9, Sec: 11.25, Kind: "stop", Prev: &PassageMapMarkPlace{PID: "p-000002", Word: 9}},
	}
}

func TestPassageMapBindingsRecordARunAndListIt(t *testing.T) {
	host := recorderHost(t, &recordingtest.Fake{})
	if list := decodePassageMarks(t)(host.PassageMapList("c-0001")); len(list) != 0 {
		t.Fatalf("list of a new project = %+v", list)
	}
	marks := decodePassageMarks(t)(host.PassageMapRecordRun("c-0001", passageMapRun()))
	if len(marks) != 3 || marks[0].Run != "c-0001.1" || marks[1].Prev == nil || marks[1].Prev.Word != 5 || marks[2].Kind != "stop" {
		t.Fatalf("recorded = %+v", marks)
	}
	if list := decodePassageMarks(t)(host.PassageMapList("c-0001")); len(list) != 3 || list[2].ID != marks[2].ID {
		t.Fatalf("list = %+v", list)
	}
	// "called Bob, running to catch up." has nine words: a tenth is refused, with a sentence, and nothing is saved.
	run := passageMapRun()
	run[2].Prev.Word = 10
	if _, err := host.PassageMapRecordRun("c-0001", run); err == nil {
		t.Fatal("a word past the paragraph was saved")
	}
	if _, err := host.PassageMapRecordRun("c-0002", passageMapRun()); err == nil {
		t.Fatal("a run on another chapter's paragraphs was saved")
	}
	if list := decodePassageMarks(t)(host.PassageMapList("c-0001")); len(list) != 3 {
		t.Fatalf("list after refusals = %+v", list)
	}
}

// With the built-in recorder there is no DAW item: the stamp is the take's name, read from the recorder, never the UI.
func TestPassageMapStampIsTheBuiltinRecordersTakeName(t *testing.T) {
	host := recorderHost(t, &recordingtest.Fake{})
	recorderOf(t)(host.RecorderChooseEngine(engineBuiltin))
	recorderOf(t)(host.RecorderStart("Mic"))
	recorderOf(t)(host.RecorderStop())
	waitRecorderIdle(t, host)
	marks := decodePassageMarks(t)(host.PassageMapRecordRun("c-0001", passageMapRun()))
	for _, mark := range marks {
		if mark.ItemGUID != "Take 001" || mark.TakeGUID != "Take 001" {
			t.Fatalf("mark = %+v", mark)
		}
	}
}

// With the DAW, the host reads the chapter's linked track when the run ends and stamps the last item and its active take.
func TestPassageMapStampIsTheLinkedTracksLastItem(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	book, err := passageMapBook(host.manuscript)()
	if err != nil {
		t.Fatal(err)
	}
	var first passagemap.Line
	for _, line := range book.Lines {
		if line.ChapterID == ids[0] && line.Words > 0 {
			first = line
			break
		}
	}
	run := []passagemap.MarkInput{
		{PID: first.ID, Kind: passagemap.KindStart},
		{PID: first.ID, Word: first.Words, Sec: 3, Kind: passagemap.KindStop, Prev: &passagemap.Place{PID: first.ID, Word: first.Words}},
	}
	reader := &fakeTrackStates{state: bridge.TrackState{Items: []bridge.TrackItem{
		{ItemGUID: "{AAAAAAAA-0000-4000-8000-000000000001}", TakeGUID: "{BBBBBBBB-0000-4000-8000-000000000001}"},
		{ItemGUID: "{AAAAAAAA-0000-4000-8000-000000000002}", TakeGUID: "{BBBBBBBB-0000-4000-8000-000000000002}"},
	}}}
	marks, err := host.passageMapIn(host.services(), reader).RecordRun(ids[0], run)
	if err != nil {
		t.Fatal(err)
	}
	if len(reader.asked) != 1 || reader.asked[0] != readAloudTrack {
		t.Fatalf("asked REAPER about %v", reader.asked)
	}
	for _, mark := range marks {
		if mark.ItemGUID != "{AAAAAAAA-0000-4000-8000-000000000002}" || mark.TakeGUID != "{BBBBBBBB-0000-4000-8000-000000000002}" {
			t.Fatalf("mark = %+v", mark)
		}
	}
	// A chapter with no linked track never asks the DAW, and its run is kept unstamped.
	reader.asked = nil
	var other passagemap.Line
	for _, line := range book.Lines {
		if line.ChapterID == ids[1] {
			other = line
			break
		}
	}
	run = []passagemap.MarkInput{
		{PID: other.ID, Kind: passagemap.KindStart},
		{PID: other.ID, Sec: 1, Kind: passagemap.KindStop, Prev: &passagemap.Place{PID: other.ID}},
	}
	marks, err = host.passageMapIn(host.services(), reader).RecordRun(ids[1], run)
	if err != nil {
		t.Fatal(err)
	}
	if len(reader.asked) != 0 || marks[0].ItemGUID != "" || marks[0].TakeGUID != "" {
		t.Fatalf("unlinked chapter: asked %v, marks %+v", reader.asked, marks)
	}
}

func TestPassageMapWithNoProjectSavesNothing(t *testing.T) {
	host := NewHost()
	if _, err := host.PassageMapRecordRun("c-0001", passageMapRun()); err == nil {
		t.Fatal("a run with no project was saved")
	}
	if list := decodePassageMarks(t)(host.PassageMapList("c-0001")); len(list) != 0 {
		t.Fatalf("list with no project = %+v", list)
	}
}
