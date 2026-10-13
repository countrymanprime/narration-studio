package bridge

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
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

// A command that cannot be written, and one whose caller gave up waiting, are logged too, each with its own kind: the host log is
// where a narrator's "nothing happened" is traced, whatever stopped it.
func TestASendErrorAndACancelAreLogged(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var lines []string
	var mu sync.Mutex
	client.SetLog(func(kind, message string) {
		mu.Lock()
		defer mu.Unlock()
		lines = append(lines, kind+": "+message)
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := actions.RecordStop(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("RecordStop on a cancelled context: %v", err)
	}
	if err := os.RemoveAll(filepath.Join(dir, "commands")); err != nil {
		t.Fatal(err)
	}
	if _, err := actions.RecordStop(context.Background()); err == nil || !strings.Contains(err.Error(), "could not send record_stop") {
		t.Fatalf("RecordStop with no command folder: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(lines) != 2 || !strings.HasSuffix(lines[0], ": cancelled") || !strings.HasSuffix(lines[1], ": could not send") {
		t.Fatalf("lines = %q", lines)
	}
}

// failureKind writes the host's own sentence for an error the host names, and never the script's.
func TestFailureKindKeepsTheScriptsSentenceOut(t *testing.T) {
	for _, check := range []struct {
		err  error
		want string
	}{
		{ErrNoTrackArmed, "error: " + ErrNoTrackArmed.Error()},
		{ErrRecording, "error: " + ErrRecording.Error()},
		{fmt.Errorf("%w: %s", ErrRollStopped, "Track \"Alice\" stopped."), "error: " + ErrRollStopped.Error()},
		{&RefusalError{Sentence: "Track \"Alice\" is locked."}, "error (the script's own sentence, not logged)"},
		{errors.New("REAPER sent an answer this app could not read"), "error"},
	} {
		if got := failureKind(check.err); got != check.want {
			t.Errorf("failureKind(%v) = %q, want %q", check.err, got, check.want)
		}
	}
}
