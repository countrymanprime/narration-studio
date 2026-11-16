package bridge

import (
	"context"
	"errors"
	"math"
	"strconv"
	"sync"
	"testing"
	"time"
)

func TestReadPlaceAnswersTheSelectedTrackAndTheCursor(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"PLACE", run(command), "{AAAAAAAA-0000-4000-8000-000000000001}", "1", "12.5"}}
	})
	place, err := actions.ReadPlace(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if place.TrackGUID != "{AAAAAAAA-0000-4000-8000-000000000001}" || place.Selected != 1 || place.Cursor != 12.5 {
		t.Fatalf("place = %+v", place)
	}
	if command := fake.commands()[0]; command[1] != "read_place" || len(command) != 3 {
		t.Fatalf("command = %q", command)
	}
}

func TestReadPlaceWithNoOrSeveralTracksNamesNone(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	selected := "0"
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"PLACE", run(command), "", selected, "0"}}
	})
	for _, count := range []string{"0", "2"} {
		selected = count
		place, err := actions.ReadPlace(context.Background())
		if err != nil || place.TrackGUID != "" {
			t.Fatalf("with %s selected: %+v, %v", count, place, err)
		}
	}
}

func TestGoToSendsTheTrackAndWhereAndAnswersTheCursor(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"PLACE_SET", run(command), command[3], "42.5"}}
	})
	got, err := actions.GoTo(context.Background(), "{G}", PlaceTarget{End: true})
	if err != nil || got != 42.5 {
		t.Fatalf("GoTo end = %v, %v", got, err)
	}
	if command := fake.commands()[0]; len(command) != 6 || command[3] != "{G}" || command[4] != "end" || command[5] != "" {
		t.Fatalf("end command = %q", command)
	}
	if _, err := actions.GoTo(context.Background(), "{G}", PlaceTarget{Seconds: 17.25}); err != nil {
		t.Fatal(err)
	}
	if command := fake.commands()[1]; command[4] != "at" || command[5] != "17.25" {
		t.Fatalf("at command = %q", command)
	}
}

func TestGoToStartAsksForTheStartOfTheTrack(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"PLACE_SET", run(command), command[3], "12.5"}}
	})
	got, err := actions.GoTo(context.Background(), "{G}", PlaceTarget{Start: true})
	if err != nil || got != 12.5 {
		t.Fatalf("GoTo = %v, %v", got, err)
	}
	if commands := fake.commands(); len(commands) != 1 || commands[0][4] != "start" {
		t.Fatalf("commands = %v, want go_to with start", commands)
	}
}

func TestGoToRefusesATimeThatIsNotUsableBeforeAnythingIsSent(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	for _, seconds := range []float64{-1, math.NaN(), math.Inf(1), math.Inf(-1), 1e12} {
		if _, err := actions.GoTo(context.Background(), "{G}", PlaceTarget{Seconds: seconds}); err == nil {
			t.Errorf("%v must be refused", seconds)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestGoToOnAGoneTrackIsAStaleError(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_STALE", run(command), command[3]}}
	})
	_, err := actions.GoTo(context.Background(), "{GONE}", PlaceTarget{End: true})
	var stale *TrackStaleError
	if !errors.As(err, &stale) || stale.GUID != "{GONE}" {
		t.Fatalf("err = %v, want a stale track", err)
	}
}

func TestPlaceCommandsAreExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.ReadPlace(context.Background()); !errors.Is(err, errGateRefused) {
		t.Fatalf("ReadPlace err = %v", err)
	}
	if _, err := actions.GoTo(context.Background(), "{G}", PlaceTarget{End: true}); !errors.Is(err, errGateRefused) {
		t.Fatalf("GoTo err = %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

// TestGoToLeavesTheHeartbeatChangeCount: the fake REAPER keeps a project change count, sends it on every heartbeat, and (like the real
// script since #3560, which selects with I_SELECTED) leaves it alone on go_to. The test reads the count off the heartbeats the client
// dispatches around three go_to calls; it fails if a later change makes the fake's go_to answer move the count. It does not prove the Lua: the Lua harness test ("go_to a folder leaves the project change count alone") and the real-REAPER row
// in scripts/ci/real-reaper/scenarios_select_count.py prove the command, and this fake only states what they showed.
func TestGoToLeavesTheHeartbeatChangeCount(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var mu sync.Mutex
	count, beats := 41, []string{}
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		mu.Lock()
		defer mu.Unlock()
		return [][]string{{"PLACE_SET", run(command), command[3], "1"}, {"PROJECT_STATUS", "", "", "0", strconv.Itoa(count)}}
	})
	client.Subscribe(Subscription{Tags: []string{"PROJECT_STATUS"}, Handle: func(event Event) {
		mu.Lock()
		beats = append(beats, event.Fields[4])
		mu.Unlock()
	}})
	for _, target := range []PlaceTarget{{End: true}, {End: true}, {Seconds: 3}} {
		if _, err := actions.GoTo(context.Background(), "{G}", target); err != nil {
			t.Fatal(err)
		}
	}
	mu.Lock()
	defer mu.Unlock()
	if len(beats) == 0 {
		t.Fatal("no heartbeat reached the client")
	}
	for _, beat := range beats {
		if beat != "41" {
			t.Fatalf("a go_to must leave the heartbeat's change count at 41, saw %v", beats)
		}
	}
}
