package bridge

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestMonitorLevelReadsWithAnEmptyLevelAndSetSendsTheWholeNumber(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	held := "70"
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"MONITOR_LEVEL", run(command), held}}
	})
	got, err := actions.MonitorLevel(context.Background())
	if err != nil || got != 70 {
		t.Fatalf("MonitorLevel = %d, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "monitor_level" || len(command) != 4 || command[3] != "" {
		t.Fatalf("read command = %q", command)
	}
	held = "41"
	got, err = actions.SetMonitorLevel(context.Background(), 40)
	if err != nil || got != 41 {
		t.Fatalf("SetMonitorLevel = %d, %v; want the level read back, 41", got, err)
	}
	if command := fake.commands()[1]; len(command) != 4 || command[3] != "40" {
		t.Fatalf("set command = %q", command)
	}
}

func TestMonitorLevelRefusesALevelOutsideTheScaleBeforeAnythingIsSent(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	for _, level := range []int{-1, 101, 1 << 40, -1 << 40} {
		if _, err := actions.SetMonitorLevel(context.Background(), level); err == nil {
			t.Errorf("level %d must be refused", level)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestMonitorLevelRefusesAnAnswerThatIsNotALevel(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	held := ""
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"MONITOR_LEVEL", run(command), held}}
	})
	for _, bad := range []string{"-1", "101", "x", "70.5", ""} {
		held = bad
		if _, err := actions.MonitorLevel(context.Background()); err == nil {
			t.Errorf("answer %q must be an error", bad)
		}
	}
}

func TestMonitorLevelPassesOnTheScriptsSentenceAndRecognisesAnOldScript(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	message := ""
	startFakeReaper(t, client, dir, func(command []string) [][]string { return [][]string{{"ERROR", run(command), message}} })
	message = "The master track has no hardware output to set the monitor level on."
	_, err := actions.SetMonitorLevel(context.Background(), 50)
	var refusal *RefusalError
	if !errors.As(err, &refusal) || !strings.Contains(err.Error(), "no hardware output") {
		t.Fatalf("err = %v, want the script's sentence", err)
	}
	message = "Unsupported workspace command"
	if _, err := actions.MonitorLevel(context.Background()); !errors.Is(err, ErrScriptOutdated) {
		t.Fatalf("err = %v, want ErrScriptOutdated", err)
	}
}

func TestMonitorLevelIsExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.MonitorLevel(context.Background()); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("MonitorLevel: %v", err)
	}
	if _, err := actions.SetMonitorLevel(context.Background(), 10); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("SetMonitorLevel: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if !Experimental("monitor_level") {
		t.Error("monitor_level must stay experimental until the verification pass")
	}
}
