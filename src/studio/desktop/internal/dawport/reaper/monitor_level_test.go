package reaper

import (
	"errors"
	"strconv"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-studio/shell/internal/bridge"
	"github.com/countrymanprime/narration-studio/shell/internal/dawport"
)

func levelerAnswering(t *testing.T, answer func(command []string) [][]string) dawport.MonitorLeveler {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, answer)
	return adapter.Role(dawport.CapMonitorLevel).(dawport.MonitorLeveler)
}

// monitor_level is Experimental and gated by its own capability; input_level is Unsupported with no role, so nothing can send it.
func TestMonitorLevelIsExperimentalAndInputLevelIsUnsupported(t *testing.T) {
	if declares[dawport.CapMonitorLevel] != dawport.Experimental || !bridge.Experimental("monitor_level") ||
		commandCapability["monitor_level"] != dawport.CapMonitorLevel || depthOf(dawport.CapMonitorLevel).Destructive {
		t.Fatal("monitor_level must be an Experimental, non-destructive command of the monitor_level capability")
	}
	if declares[dawport.CapInputLevel] != dawport.Unsupported {
		t.Fatalf("input_level = %v, want Unsupported: ReaScript cannot set an audio interface's input gain", declares[dawport.CapInputLevel])
	}
	adapter, _ := newAdapter(t, func(dawport.Capability) error { return nil })
	if adapter.Role(dawport.CapInputLevel) != nil {
		t.Error("input_level has no role on REAPER")
	}
}

func TestMonitorLevelReadsAndSetsTheWholeNumber(t *testing.T) {
	var held = 70
	leveler := levelerAnswering(t, func(command []string) [][]string {
		if command[0] != "monitor_level" || len(command) != 3 {
			t.Errorf("command = %v", command)
		}
		if command[2] != "" {
			held, _ = strconv.Atoi(command[2])
		}
		return [][]string{{"MONITOR_LEVEL", command[1], strconv.Itoa(held)}}
	})
	if got, err := leveler.MonitorLevel(t.Context()); err != nil || got != 70 {
		t.Fatalf("MonitorLevel = %d, %v", got, err)
	}
	if got, err := leveler.SetMonitorLevel(t.Context(), 35); err != nil || got != 35 {
		t.Fatalf("SetMonitorLevel = %d, %v", got, err)
	}
	if got, err := leveler.MonitorLevel(t.Context()); err != nil || got != 35 {
		t.Fatalf("MonitorLevel after a set = %d, %v", got, err)
	}
}

func TestMonitorLevelRefusesBeforeAnythingIsSent(t *testing.T) {
	refused := "Experimental DAW actions are off. Turn them on in Settings to set the monitor level."
	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: refused}}
	})
	leveler := adapter.Role(dawport.CapMonitorLevel).(dawport.MonitorLeveler)
	if _, err := leveler.MonitorLevel(t.Context()); err == nil {
		t.Error("MonitorLevel with the capability refused must be an error")
	} else if result, ok := dawport.RefusedFrom(err); !ok || result.Message != refused {
		t.Errorf("err = %v, want the capability's own sentence", err)
	}
	if _, err := leveler.SetMonitorLevel(t.Context(), 50); err == nil {
		t.Error("SetMonitorLevel with the capability refused must be an error")
	}
	allowed, allowedDir := newAdapter(t, func(dawport.Capability) error { return nil })
	open := allowed.Role(dawport.CapMonitorLevel).(dawport.MonitorLeveler)
	for _, level := range []int{-1, 101, 1 << 40} {
		if _, err := open.SetMonitorLevel(t.Context(), level); err == nil {
			t.Errorf("level %d must be an error", level)
		}
	}
	if n := len(sentCommands(t, dir)) + len(sentCommands(t, allowedDir)); n != 0 {
		t.Errorf("a refused request wrote %d commands", n)
	}
}

func TestMonitorLevelPassesOnTheScriptsSentence(t *testing.T) {
	message := "The master track has no hardware output to set the monitor level on."
	leveler := levelerAnswering(t, func(command []string) [][]string {
		return [][]string{{"ERROR", command[1], message}}
	})
	_, err := leveler.SetMonitorLevel(t.Context(), 50)
	var refusal *bridge.RefusalError
	if !errors.As(err, &refusal) || !strings.Contains(refusal.Sentence, "no hardware output") {
		t.Fatalf("err = %v, want the script's *bridge.RefusalError", err)
	}
}
