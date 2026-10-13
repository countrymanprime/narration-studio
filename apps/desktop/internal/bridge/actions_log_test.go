package bridge

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

// A bridge command that fails (no answer, an ERROR, a refusal) leaves one host-log line naming the command and its run ID, the ID
// every event answering it carries in the session's events.log, so a narrator's "Record did nothing" can be traced. The line
// carries the failure's kind, never the answer's text, which can hold a track's or a file's name.
func TestAFailedCommandIsLoggedWithItsRunID(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var mu sync.Mutex
	var lines []string
	client.SetLog(func(kind, message string) {
		mu.Lock()
		defer mu.Unlock()
		lines = append(lines, kind+": "+message)
	})
	var runs []string
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		runs = append(runs, run(command))
		if command[1] == "arm_only" {
			return [][]string{{"ERROR", run(command), "Track \"Chapter 1 - Alice\" is locked."}}
		}
		return nil
	})
	actions.SetTimeout(50 * time.Millisecond)

	if _, err := actions.ArmOnly(context.Background(), testTrack); err == nil {
		t.Fatal("ArmOnly: no error")
	}
	if _, err := actions.RecordStop(context.Background()); !errors.Is(err, ErrNoAnswer) {
		t.Fatalf("RecordStop: %v, want ErrNoAnswer", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(lines) != 2 || len(runs) != 2 {
		t.Fatalf("lines = %q, runs = %q", lines, runs)
	}
	for i, want := range []struct{ command, kind string }{{"arm_only", "error"}, {"record_stop", "no answer"}} {
		line := lines[i]
		if !strings.HasPrefix(line, "reaper_action_failed: ") || !strings.Contains(line, want.command) || !strings.Contains(line, runs[i]) || !strings.Contains(line, want.kind) {
			t.Errorf("line %d = %q, want %s, run %s and %q", i, line, want.command, runs[i], want.kind)
		}
		if strings.Contains(line, "Alice") {
			t.Errorf("line %d = %q carries the answer's text", i, line)
		}
	}
}

// A command the gate refuses never reaches the bridge, so it has no run to trace and logs nothing.
func TestARefusedByTheGateCommandIsNotLogged(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	logged := 0
	client.SetLog(func(string, string) { logged++ })
	startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.ArmOnly(context.Background(), testTrack); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("ArmOnly: %v", err)
	}
	if logged != 0 {
		t.Fatalf("logged %d lines", logged)
	}
}
