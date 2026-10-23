package bridge

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// A command the host gave up on must not run later. REAPER 7.82 runs every command file in the session folder when its bridge loop next
// ticks (the real-REAPER run, scripts/ci/real-reaper/scenarios_resilience.py), so a REAPER that was busy for ten seconds, behind a modal
// dialog or just slow would otherwise run, after the narrator was told "REAPER did not answer", the cut, the recording or the gain change
// the host had already reported as not done.

func pendingCommands(t *testing.T, dir string) []string {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(dir, "commands", "*.cmd"))
	if err != nil {
		t.Fatal(err)
	}
	return files
}

func TestAnActionTheHostGaveUpOnIsTakenBackBeforeREAPERCanRunIt(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	actions.SetTimeout(30 * time.Millisecond)
	if _, err := actions.ArmOnly(context.Background(), testTrack); !errors.Is(err, ErrNoAnswer) {
		t.Fatalf("ArmOnly: %v, want ErrNoAnswer", err)
	}
	if left := pendingCommands(t, dir); len(left) != 0 {
		t.Fatalf("an unanswered arm_only is still in the session folder: %v", left)
	}
	_ = client
}

func TestACancelledActionIsTakenBackToo(t *testing.T) {
	actions, _, dir := newActionsSession(t, true)
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(30 * time.Millisecond)
		cancel()
	}()
	if _, err := actions.ArmOnly(ctx, testTrack); !errors.Is(err, context.Canceled) {
		t.Fatalf("ArmOnly: %v, want context.Canceled", err)
	}
	if left := pendingCommands(t, dir); len(left) != 0 {
		t.Fatalf("a cancelled arm_only is still in the session folder: %v", left)
	}
}

func TestAnAnsweredActionLeavesNothingToTakeBack(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ARMED", run(command), testTrack, "0", "1"}}
	})
	if _, err := actions.ArmOnly(context.Background(), testTrack); err != nil {
		t.Fatalf("ArmOnly: %v", err)
	}
	if left := pendingCommands(t, dir); len(left) != 0 {
		t.Fatalf("commands left after an answered request: %v", left)
	}
}

func TestANavigationTheHostGaveUpOnIsTakenBack(t *testing.T) {
	navigator, _, dir := newNavigatorSession(t)
	navigator.SetTimeout(30 * time.Millisecond)
	if _, err := navigator.Ping(context.Background()); !errors.Is(err, ErrNoAnswer) {
		t.Fatalf("Ping: %v, want ErrNoAnswer", err)
	}
	if left := pendingCommands(t, dir); len(left) != 0 {
		t.Fatalf("an unanswered ping is still in the session folder: %v", left)
	}
}

func TestALevelMatchApplyTheHostGaveUpOnIsTakenBack(t *testing.T) {
	levels, _, dir := newLevelMatchSession(t)
	levels.SetTimeout(30 * time.Millisecond)
	_, err := levels.Apply(context.Background(), []GainCandidate{{ItemGUID: testItem, DeltaDB: -3, FindingID: "f1"}})
	if !errors.Is(err, ErrNoAnswer) {
		t.Fatalf("Apply: %v, want ErrNoAnswer", err)
	}
	if left := pendingCommands(t, dir); len(left) != 0 {
		t.Fatalf("an unanswered apply_item_gain is still in the session folder: %v", left)
	}
}

func TestRetractRemovesAPendingCommandOnlyOnce(t *testing.T) {
	client, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	target, err := client.Send("ping", []string{"r1"})
	if err != nil {
		t.Fatal(err)
	}
	if !client.Retract(target) {
		t.Fatal("a pending command was not retracted")
	}
	if client.Retract(target) {
		t.Fatal("a command already gone was reported retracted")
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("the command file is still there: %v", err)
	}
}
