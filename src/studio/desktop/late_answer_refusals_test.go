package main

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"desktop/internal/bridge"
)

// #3752: a command the DAW took and had not confirmed when the wait ended (bridge.ErrAnswerLate, alone or wrapping the binding's own
// deadline) is worded as that by every binding that sends a command that changes the DAW. "Not answering" would be wrong (the DAW
// answered by taking it) and so would "nothing changed" or "within N seconds": the change may land.
func TestEveryWriteBindingSaysTheDawTookACommandItHasNotConfirmed(t *testing.T) {
	mappers := map[string]func(err error) string{
		"cut":             func(err error) string { return cutRefusal("REAPER", err).Refused },
		"stack":           func(err error) string { return stackRefusal("REAPER", err).Refused },
		"split":           func(err error) string { return splitRefusal("REAPER", err).Refused },
		"roll":            func(err error) string { return rollRefusal("REAPER", err).Refused },
		"undo":            func(err error) string { return undoLastRefusal("REAPER", err).Refused },
		"save":            func(err error) string { return saveProjectRefusal("REAPER", err).Refused },
		"fx range":        func(err error) string { return fxRangeRefusal("REAPER", err).Refused },
		"replace":         func(err error) string { return replaceRefusal("REAPER", err).Refused },
		"file":            func(err error) string { return fileRefusal("REAPER", err).Refused },
		"move to chapter": func(err error) string { return placeRefusal("REAPER", true, err) },
		"solo":            func(err error) string { return soloRefusal("REAPER", err).Refused },
		"monitor level":   func(err error) string { return monitorLevelRefusal("REAPER", true, err) },
		"navigation":      func(err error) string { return refusal(err).Message },
		"chapter folders": func(err error) string { return chapterFoldersError("REAPER", err).Message },
		"select track":    func(err error) string { return trackSelectRefusal(err).Message },
		"record stop":     func(err error) string { return readAloudRecordRefusal("REAPER", err).Message },
	}
	want := lateAnswerSentence("REAPER")
	for name, words := range mappers {
		for kind, err := range map[string]error{
			"late":                  bridge.ErrAnswerLate,
			"late, deadline ended":  fmt.Errorf("%w: %w", bridge.ErrAnswerLate, context.DeadlineExceeded),
			"late, caller gave up":  fmt.Errorf("%w: %w", bridge.ErrAnswerLate, context.Canceled),
			"late, through a layer": fmt.Errorf("could not do it: %w", bridge.ErrAnswerLate),
		} {
			if got := words(err); got != want {
				t.Errorf("%s, %s: %q; want %q", name, kind, got, want)
			}
		}
		// A DAW that never read the command is still the DAW not answering.
		if got := words(bridge.ErrNoAnswer); strings.Contains(got, "took the command") {
			t.Errorf("%s: a command the DAW never read is worded as taken: %q", name, got)
		}
	}
}

// A binding that sends a write bounds it past the bridge's late wait, or its own deadline ends that wait and reports a change that is
// about to land as not confirmed.
func TestEveryWriteBindingsDeadlineCoversTheLateWait(t *testing.T) {
	covers := bridge.DefaultAnswerTimeout + bridge.LateAnswerWait
	for name, timeout := range map[string]interface{ Seconds() float64 }{
		"writeCommandTimeout": writeCommandTimeout, "takeRequestTimeout": takeRequestTimeout, "deleteRangeTimeout": deleteRangeTimeout,
		"stackTakesTimeout": stackTakesTimeout, "splitTakeTimeout": splitTakeTimeout, "undoLastTimeout": undoLastTimeout,
		"fxRangeTimeout": fxRangeTimeout, "reduceRangeGainTimeout": reduceRangeGainTimeout, "repairClickTimeout": repairClickTimeout,
		"hideTakesTimeout": hideTakesTimeout, "rollTimeout": rollTimeout, "fileActionTimeout": fileActionTimeout,
		"saveProjectTimeout": saveProjectTimeout, "chapterFoldersTimeout": chapterFoldersTimeout, "boothArmTimeout": boothArmTimeout,
		"replaceTimeout": replaceTimeout, "laneCommandTimeout": laneCommandTimeout,
	} {
		if timeout.Seconds() < covers.Seconds() {
			t.Errorf("%s is %v s, shorter than the usual wait and the late wait (%v)", name, timeout.Seconds(), covers)
		}
	}
}
