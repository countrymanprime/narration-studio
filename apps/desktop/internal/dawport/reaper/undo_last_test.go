package reaper

import (
	"errors"
	"reflect"
	"strconv"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

func undoerAnswering(t *testing.T, answer func(command []string) [][]string) dawport.LastActionUndoer {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, answer)
	return adapter.Role(dawport.CapUndoLast).(dawport.LastActionUndoer)
}

// undo_last is its own capability's role (dawport.LastActionUndoer): Experimental, gated by undo_last for both commands, and not
// destructive.
func TestUndoLastIsExperimentalAndGatedByItsCapability(t *testing.T) {
	if declares[dawport.CapUndoLast] != dawport.Experimental || !bridge.Experimental("last_action") || !bridge.Experimental("undo_last") ||
		commandCapability["last_action"] != dawport.CapUndoLast || commandCapability["undo_last"] != dawport.CapUndoLast ||
		depthOf(dawport.CapUndoLast).Destructive {
		t.Fatalf("last_action and undo_last must be Experimental, non-destructive commands of the undo_last capability")
	}
}

// LastAction sends the kind and reads this or other; whatever keeps REAPER from telling is unknown, never an error, and only an
// unknown kind is an error, with nothing sent.
func TestLastActionAnswersThisOtherOrUnknown(t *testing.T) {
	for answer, want := range map[string]dawport.LastAction{"this": dawport.LastActionThis, "other": dawport.LastActionOther} {
		undoer := undoerAnswering(t, func(command []string) [][]string {
			if command[0] != "last_action" || len(command) != 3 || command[2] != "cut_range" {
				t.Errorf("command = %v", command)
			}
			return [][]string{{"LAST_ACTION", command[1], "cut_range", answer}}
		})
		if got, err := undoer.LastAction(t.Context(), dawport.ActionCutRange); err != nil || got != want {
			t.Errorf("%s: LastAction = %q, %v; want %q", answer, got, err, want)
		}
	}
	for _, answer := range [][]string{{"ERROR", "", "Unsupported workspace command"}, {"ERROR", "", "That is not an action this app can undo."}} {
		undoer := undoerAnswering(t, func(command []string) [][]string {
			line := append([]string(nil), answer...)
			line[1] = command[1]
			return [][]string{line}
		})
		if got, err := undoer.LastAction(t.Context(), dawport.ActionCutRange); err != nil || got != dawport.LastActionUnknown {
			t.Errorf("answer %v: LastAction = %q, %v; want unknown", answer, got, err)
		}
	}

	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: "off"}}
	})
	undoer := adapter.Role(dawport.CapUndoLast).(dawport.LastActionUndoer)
	if got, err := undoer.LastAction(t.Context(), dawport.ActionCutRange); err != nil || got != dawport.LastActionUnknown {
		t.Errorf("refused capability: LastAction = %q, %v; want unknown", got, err)
	}
	for _, kind := range []dawport.ActionKind{"", "fx_range", "Narration Utils: delete words"} {
		if got, err := undoer.LastAction(t.Context(), kind); !errors.Is(err, dawport.ErrActionKind) || got != dawport.LastActionUnknown {
			t.Errorf("kind %q: LastAction = %q, %v; want ErrActionKind", kind, got, err)
		}
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("%d commands were written", n)
	}
}

// UndoLast sends the kind and the steps; all undone is ok and changed with no undo step added, none undone is the refusal that
// names REAPER, part undone says how many, and every other refusal is a sentence.
func TestUndoLastAnswersADawResult(t *testing.T) {
	for _, tc := range []struct {
		steps, undone int
		want          dawport.Result
	}{
		{1, 1, dawport.OK("Undid the cut in REAPER.", true).WithUndoSteps(0)},
		{3, 3, dawport.OK("Undid the last 3 cuts in REAPER.", true).WithUndoSteps(0)},
		{4, 2, dawport.OK("Undid 2 of the 4 cuts in REAPER. The rest are no longer REAPER's last actions, so they were left alone. Use Edit > Undo in REAPER for them.", true).WithUndoSteps(0)},
		{1, 0, dawport.Refused("REAPER's last action is not this one, so it was left alone. Use Edit > Undo in REAPER.")},
		{5, 0, dawport.Refused("REAPER's last action is not this one, so it was left alone. Use Edit > Undo in REAPER.")},
	} {
		undoer := undoerAnswering(t, func(command []string) [][]string {
			if command[0] != "undo_last" || len(command) != 4 || command[2] != "cut_range" {
				t.Errorf("command = %v", command)
			}
			return [][]string{{"UNDONE_LAST", command[1], "cut_range", command[3], strconv.Itoa(tc.undone)}}
		})
		got, err := undoer.UndoLast(t.Context(), dawport.ActionCutRange, tc.steps)
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%d of %d: UndoLast = %+v, %v; want %+v", tc.undone, tc.steps, got, err, tc.want)
		}
	}

	for _, tc := range []struct {
		answer []string
		want   dawport.Result
	}{
		{[]string{"ERROR", "", "REAPER is recording. Stop recording first."}, dawport.Refused("REAPER is recording. Stop recording first.")},
		{[]string{"ERROR", "", "Unsupported workspace command"}, dawport.Refused(messageUndoScriptOutdated)},
		{[]string{"ERROR", "", "That is not an action this app can undo."}, dawport.Refused("That is not an action this app can undo.")},
	} {
		undoer := undoerAnswering(t, func(command []string) [][]string {
			line := append([]string(nil), tc.answer...)
			line[1] = command[1]
			return [][]string{line}
		})
		if got, err := undoer.UndoLast(t.Context(), dawport.ActionCutRange, 1); err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("answer %v: UndoLast = %+v, %v; want %+v", tc.answer, got, err, tc.want)
		}
	}
}

// A refused capability is its own sentence, steps outside 1 to 12 are refused and an unknown kind is an error; nothing is sent.
func TestUndoLastRefusesBeforeAnythingIsSent(t *testing.T) {
	refusedSentence := "Experimental REAPER actions are off. Turn them on in Settings to undo the app's last action."
	var asked []dawport.Capability
	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		asked = append(asked, c)
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: refusedSentence}}
	})
	got, err := adapter.Role(dawport.CapUndoLast).(dawport.LastActionUndoer).UndoLast(t.Context(), dawport.ActionCutRange, 1)
	if err != nil || !reflect.DeepEqual(got, dawport.Refused(refusedSentence)) || len(asked) == 0 || asked[0] != dawport.CapUndoLast {
		t.Errorf("UndoLast with undo_last refused = %+v, %v (asked %v)", got, err, asked)
	}
	allowedAdapter, allowedDir := newAdapter(t, func(dawport.Capability) error { return nil })
	undoer := allowedAdapter.Role(dawport.CapUndoLast).(dawport.LastActionUndoer)
	for _, steps := range []int{0, -1, 13} {
		if got, err := undoer.UndoLast(t.Context(), dawport.ActionCutRange, steps); err != nil || !reflect.DeepEqual(got, dawport.Refused(messageUndoSteps)) {
			t.Errorf("%d steps: UndoLast = %+v, %v", steps, got, err)
		}
	}
	for _, kind := range []dawport.ActionKind{"", "fx_range", "Narration Utils: delete words"} {
		if _, err := undoer.UndoLast(t.Context(), kind, 1); !errors.Is(err, dawport.ErrActionKind) {
			t.Errorf("kind %q: err = %v, want ErrActionKind", kind, err)
		}
	}
	if n := len(sentCommands(t, dir)) + len(sentCommands(t, allowedDir)); n != 0 {
		t.Errorf("a refused request wrote %d commands", n)
	}
}
