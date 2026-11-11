package bridge

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

const testTrack = "{00000001-0000-4000-8000-000000000001}"

func newActionsSession(t *testing.T, enabled bool) (*Actions, *Client, string) {
	t.Helper()
	dir := t.TempDir()
	client, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	actions := NewActions(client, switchGate(enabled))
	actions.SetTimeout(fakeAnswersWithin)
	return actions, client, dir
}

// trackStateAnswer is what track_state_test.lua pins for a track with two items, the second trimmed and faster. The first
// is muted; the second has no muted field, as a bridge script older than the muted field answers.
func trackStateAnswer(command []string) [][]string {
	return [][]string{
		{"TRACK_STATE", run(command), testTrack, "5", "2.500000", "12.345678", "C:/p/Book.rpp", "0", "7", "1", "2", "1024", "Focusrite USB ASIO", "Speakers (Focusrite USB Audio)", "Mic/Line 1 / Mic/Line 2"},
		{"TRACK_ITEM", run(command), testItem, testTake, "0.000000", "4.000000", "0.000000", "1.000000", "C:/Audio/ch1|take 1.wav", "1"},
		{"TRACK_ITEM", run(command), "{AAAAAAAA-0000-4000-8000-000000000002}", "", "10.000000", "3.000000", "1.500000", "1.250000", ""},
		{"TRACK_STATE_END", run(command), "2", "3"},
	}
}

func TestChapterTrackStateIsRefusedWhenTheGateRefuses(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, trackStateAnswer)
	if _, err := actions.ChapterTrackState(context.Background(), testTrack); !errors.Is(err, errGateRefused) {
		t.Fatalf("err = %v, want errGateRefused", err)
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a command was written while the gate refuses: %v", got)
	}
	if !Experimental("chapter_track_state") {
		t.Fatal("chapter_track_state must stay experimental until the verification pass has confirmed it")
	}
}

func TestChapterTrackStateWithANilGateIsOff(t *testing.T) {
	actions := NewActions(nil, nil)
	if _, err := actions.ChapterTrackState(context.Background(), testTrack); !errors.Is(err, ErrNotGated) {
		t.Fatalf("err = %v, want ErrNotGated", err)
	}
}

func TestChapterTrackStateWithNoBridgeIsUnavailable(t *testing.T) {
	actions := NewActions(nil, switchGate(true))
	if _, err := actions.ChapterTrackState(context.Background(), testTrack); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err = %v, want ErrUnavailable", err)
	}
}

func TestChapterTrackStateSendsTheTrackAndReadsTheTransportArmsAndItems(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, trackStateAnswer)
	got, err := actions.ChapterTrackState(context.Background(), testTrack)
	if err != nil {
		t.Fatal(err)
	}
	commands := fake.commands()
	if len(commands) != 1 || commands[0][1] != "chapter_track_state" || commands[0][3] != testTrack {
		t.Fatalf("commands = %v, want one chapter_track_state naming the track", commands)
	}
	input, muted := 1024, true
	want := TrackState{
		TrackGUID: testTrack, PlayState: 5, Playing: true, Recording: true,
		EditCursor: 2.5, PlayPosition: 12.345678, ProjectPath: "C:/p/Book.rpp", ChangeCount: 7,
		TrackArmed: true, ArmedCount: 2, RecordInput: &input, InputDevice: "Focusrite USB ASIO",
		OutputDevice: "Speakers (Focusrite USB Audio)", InputChannel: "Mic/Line 1 / Mic/Line 2",
		Items: []TrackItem{
			{ItemGUID: testItem, TakeGUID: testTake, Position: 0, Length: 4, SourceOffset: 0, PlayRate: 1, SourceFile: "C:/Audio/ch1|take 1.wav", Muted: &muted},
			{ItemGUID: "{AAAAAAAA-0000-4000-8000-000000000002}", Position: 10, Length: 3, SourceOffset: 1.5, PlayRate: 1.25},
		},
		ItemsTotal: 3,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got  %+v\nwant %+v", got, want)
	}
}

func TestChapterTrackStateWithNoTrackReadsTheTransportOnly(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"TRACK_STATE", run(command), "", "2", "0.000000", "0.000000", "", "1", "0", "0", "1", "", ""},
			{"TRACK_STATE_END", run(command), "0", "0"},
		}
	})
	got, err := actions.ChapterTrackState(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if got.TrackGUID != "" || !got.Paused || got.Playing || !got.Unsaved || got.ArmedCount != 1 || got.RecordInput != nil || len(got.Items) != 0 {
		t.Fatalf("got %+v", got)
	}
}

func TestChapterTrackStateReportsATrackThatIsGoneAsStale(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_STALE", run(command), command[3]}}
	})
	_, err := actions.ChapterTrackState(context.Background(), "{FFFFFFFF-0000-4000-8000-00000000FFFF}")
	var stale *TrackStaleError
	if !errors.As(err, &stale) || stale.GUID != "{FFFFFFFF-0000-4000-8000-00000000FFFF}" || !errors.Is(err, ErrStale) {
		t.Fatalf("err = %v, want a TrackStaleError naming the GUID", err)
	}
}

func TestChapterTrackStateRefusesAnAnswerForAnotherTrack(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"TRACK_STATE", run(command), "{00000002-0000-4000-8000-000000000002}", "0", "0", "0", "", "1", "0", "0", "0", "0", ""},
			{"TRACK_STATE_END", run(command), "0", "0"},
		}
	})
	if _, err := actions.ChapterTrackState(context.Background(), testTrack); err == nil {
		t.Fatal("an answer naming another track must be an error, never another track's state")
	}
}

func TestChapterTrackStateSaysWhenTheScriptIsOlderThanTheApp(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "Unsupported workspace command"}}
	})
	if _, err := actions.ChapterTrackState(context.Background(), testTrack); !errors.Is(err, ErrScriptOutdated) {
		t.Fatalf("err = %v, want ErrScriptOutdated", err)
	}
}

func TestChapterTrackStateRejectsAnAnswerThatDoesNotReadAndTimesOutWithoutOne(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_STATE", run(command), testTrack, "playing"}}
	})
	if _, err := actions.ChapterTrackState(context.Background(), testTrack); err == nil || errors.Is(err, ErrNoAnswer) {
		t.Fatalf("err = %v, want the invalid answer reported", err)
	}

	quiet, _, _ := newActionsSession(t, true)
	quiet.SetTimeout(30 * time.Millisecond)
	if _, err := quiet.ChapterTrackState(context.Background(), testTrack); !errors.Is(err, ErrNoAnswer) {
		t.Fatalf("err = %v, want ErrNoAnswer", err)
	}
}

func TestASessionLevelErrorAnswersEveryActionInFlight(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func([]string) [][]string {
		return [][]string{{"ERROR", "", "Unsupported hub protocol"}}
	})
	if _, err := actions.ChapterTrackState(context.Background(), testTrack); err == nil || err.Error() != "Unsupported hub protocol" {
		t.Fatalf("err = %v, want the session-level error", err)
	}
}

func TestDeviceNameDropsControlCharactersAndBoundsTheLength(t *testing.T) {
	cases := map[string]string{
		"":                         "",
		"  Focusrite   USB ASIO ":  "Focusrite USB ASIO",
		"Mic\x1b[31m\nLine\t1\x00": "Mic [31m Line 1",
		"Микрофон (USB) 🎙️":        "Микрофон (USB) 🎙️",
		"\u202eOIDUA\u2066":        "OIDUA",
		strings.Repeat("é", 500):   strings.Repeat("é", maxDeviceName-1) + "…",
	}
	for raw, want := range cases {
		if got := DeviceName(raw); got != want {
			t.Errorf("DeviceName(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestChapterTrackStateFromAnOlderScriptHasNoOutputDeviceOrChannel(t *testing.T) {
	state := readTrackState([]string{"TRACK_STATE", "t1", testTrack, "0", "0", "0", "", "1", "0", "0", "0", "1", "ASIO4ALL"})
	if state.InputDevice != "ASIO4ALL" || state.OutputDevice != "" || state.InputChannel != "" {
		t.Fatalf("got %+v", state)
	}
}

const testChild = "{00000002-0000-4000-8000-000000000002}"

// folderStateAnswer is what track_state_test.lua pins for a 'children' read: each TRACK_ITEM ends with its track's GUID.
func folderStateAnswer(command []string) [][]string {
	return [][]string{
		{"TRACK_STATE", run(command), testTrack, "0", "0.000000", "0.000000", "C:/p/Book.rpp", "0", "7", "0", "0", "0", "", "", ""},
		{"TRACK_ITEM", run(command), testItem, testTake, "0.000000", "4.000000", "0.000000", "1.000000", "narrator.wav", "0", testTrack},
		{"TRACK_ITEM", run(command), "{AAAAAAAA-0000-4000-8000-000000000002}", "", "4.000000", "1.000000", "0.000000", "1.000000", "veyra.wav", "0", strings.ToLower(testChild)},
		{"TRACK_STATE_END", run(command), "2", "2"},
	}
}

func TestChapterFolderStateSendsChildrenAndReadsEachItemsTrack(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, folderStateAnswer)
	got, err := actions.ChapterFolderState(context.Background(), testTrack)
	if err != nil {
		t.Fatal(err)
	}
	commands := fake.commands()
	if len(commands) != 1 || commands[0][1] != "chapter_track_state" || commands[0][3] != testTrack || len(commands[0]) < 5 || commands[0][4] != "children" {
		t.Fatalf("commands = %v, want one chapter_track_state naming the track with the children option", commands)
	}
	if len(got.Items) != 2 || got.ItemsTotal != 2 {
		t.Fatalf("items = %+v, total %d", got.Items, got.ItemsTotal)
	}
	if got.Items[0].TrackGUID != testTrack || got.Items[1].TrackGUID != testChild {
		t.Fatalf("track GUIDs = %q, %q; want each item's own track, normalised", got.Items[0].TrackGUID, got.Items[1].TrackGUID)
	}
}

func TestChapterTrackStateLeavesTheItemsTrackEmpty(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, trackStateAnswer)
	got, err := actions.ChapterTrackState(context.Background(), testTrack)
	if err != nil {
		t.Fatal(err)
	}
	if commands := fake.commands(); len(commands[0]) > 4 {
		t.Fatalf("the one-track read sent an option: %v", commands[0])
	}
	for _, item := range got.Items {
		if item.TrackGUID != "" {
			t.Fatalf("one-track read set TrackGUID %q", item.TrackGUID)
		}
	}
}

func TestChapterFolderStateNeedsATrack(t *testing.T) {
	actions, _, _ := newActionsSession(t, true)
	if _, err := actions.ChapterFolderState(context.Background(), " "); err == nil {
		t.Fatal("a folder read with no track was sent")
	}
}

func TestChapterFolderStateRefusesAnOlderScriptsOneTrackAnswer(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, trackStateAnswer) // items with no track field, as a script that ignores the option answers
	if _, err := actions.ChapterFolderState(context.Background(), testTrack); !errors.Is(err, ErrFolderReadUnsupported) {
		t.Fatalf("err = %v, want ErrFolderReadUnsupported", err)
	}
}

func TestChapterTrackStateNoItemsSendsTheNoneOptionAndKeepsTheTotal(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			trackStateAnswer(command)[0],
			{"TRACK_STATE_END", run(command), "0", "3"},
		}
	})
	got, err := actions.ChapterTrackStateNoItems(context.Background(), testTrack)
	if err != nil {
		t.Fatal(err)
	}
	commands := fake.commands()
	if len(commands) != 1 || len(commands[0]) < 5 || commands[0][4] != "none" {
		t.Fatalf("commands = %v, want one chapter_track_state with the none option", commands)
	}
	if len(got.Items) != 0 || got.ItemsTotal != 3 || !got.Recording || !got.Playing || got.ArmedCount != 2 {
		t.Fatalf("state = %+v, want the transport and arms, no items and a total of 3", got)
	}
}

// A bridge script older than the 'none' option refuses it with this sentence; the press must still work.
func TestChapterTrackStateNoItemsFallsBackToTheFullReadOnAnOlderScript(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		if len(command) > 4 {
			return [][]string{{"ERROR", run(command), "Unknown track read option: none."}}
		}
		return trackStateAnswer(command)
	})
	got, err := actions.ChapterTrackStateNoItems(context.Background(), testTrack)
	if err != nil {
		t.Fatal(err)
	}
	commands := fake.commands()
	if len(commands) != 2 || len(commands[1]) > 4 {
		t.Fatalf("commands = %v, want the none read, then the plain read", commands)
	}
	if !got.Recording || len(got.Items) != 2 {
		t.Fatalf("state = %+v, want the full read's answer", got)
	}
}

func TestChapterTrackStateNoItemsKeepsAStaleTrackAStaleError(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_STALE", run(command), testTrack}}
	})
	var stale *TrackStaleError
	if _, err := actions.ChapterTrackStateNoItems(context.Background(), testTrack); !errors.As(err, &stale) {
		t.Fatalf("err = %v, want a *TrackStaleError", err)
	}
}
