package bridge

import (
	"context"
	"testing"
)

func TestPunchPrerollSendsOnlyTheRunAndParsesTheAnswer(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"PUNCH_PREROLL", run(command), "1", "1.500000", "2.000000"}}
	})
	got, err := actions.PunchPreroll(context.Background())
	if err != nil || got != (PunchPreroll{OnRecord: true, Measures: 1.5, MeasureSeconds: 2}) {
		t.Fatalf("PunchPreroll = %+v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "punch_preroll" || len(command) != 3 {
		t.Fatalf("command = %q; want the name and the run only", command)
	}
}

func TestPunchPrerollReadsALongPrerollAsREAPERHoldsIt(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"PUNCH_PREROLL", run(command), "0", "40.000000", "1.500000"}}
	})
	if got, err := actions.PunchPreroll(context.Background()); err != nil || got.Measures != 40 {
		t.Fatalf("PunchPreroll = %+v, %v", got, err)
	}
}

func TestPunchPrerollRefusesAnAnswerThatIsNotAPreroll(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	answer := []string{}
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{append([]string{"PUNCH_PREROLL", run(command)}, answer...)}
	})
	for _, bad := range [][]string{{"2", "1.0", "2.0"}, {"1", "-1", "2.0"}, {"1", "1", "0"}, {"1", "1", "-2"}} {
		answer = bad
		if _, err := actions.PunchPreroll(context.Background()); err == nil {
			t.Errorf("answer %q must be an error", bad)
		}
	}
}
