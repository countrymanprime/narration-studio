package bridge

import (
	"context"
	"testing"
)

func TestDawMetersSendsOnlyTheRunAndParsesTheArmedTrack(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"METERS", run(command), "-20.0", "-6.0", "Chapter 1 | “Alice”"}}
	})
	got, err := actions.DawMeters(context.Background())
	if err != nil || got != (DawMeters{OutputDB: -20, Armed: true, InputDB: -6, InputTrack: "Chapter 1 | “Alice”"}) {
		t.Fatalf("DawMeters = %+v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "daw_meters" || len(command) != 3 {
		t.Fatalf("command = %q; want the name and the run only", command)
	}
}

func TestDawMetersReadsNoArmedTrackAsNoInput(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"METERS", run(command), "-100.0", "", ""}}
	})
	if got, err := actions.DawMeters(context.Background()); err != nil || got != (DawMeters{OutputDB: MeterFloorDB}) {
		t.Fatalf("DawMeters = %+v, %v", got, err)
	}
}

func TestDawMetersReadsALevelOverFullScale(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"METERS", run(command), "3.5", "6.0", "Loud"}}
	})
	if got, err := actions.DawMeters(context.Background()); err != nil || got.OutputDB != 3.5 || got.InputDB != 6 {
		t.Fatalf("DawMeters = %+v, %v", got, err)
	}
}

func TestDawMetersRefusesAnAnswerThatIsNotALevel(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	answer := []string{}
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{append([]string{"METERS", run(command)}, answer...)}
	})
	for _, bad := range [][]string{{"-100.1", "", ""}, {"-20", "-120", "T"}, {"61", "", ""}, {"-20", "NaN", "T"}} {
		answer = bad
		if _, err := actions.DawMeters(context.Background()); err == nil {
			t.Errorf("answer %q must be an error", bad)
		}
	}
}
