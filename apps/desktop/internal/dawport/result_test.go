package dawport

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
)

func marshalResult(t *testing.T, r Result) map[string]any {
	t.Helper()
	raw, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

// go-result-roundtrips: the wire keys, the omitted optional keys, and OK's undoSteps default (the mock's dawOk).
func TestResultRoundtripsAndOKCountsOneUndoStepPerChange(t *testing.T) {
	cases := []struct {
		name string
		got  Result
		want map[string]any
	}{
		{"a move changes nothing", OK("Moved to 0:42.", false),
			map[string]any{"ok": true, "changed": false, "message": "Moved to 0:42.", "undoSteps": 0.0}},
		{"a change is one undo step", OK("Marker added.", true),
			map[string]any{"ok": true, "changed": true, "message": "Marker added.", "undoSteps": 1.0}},
		{"a given count wins", OK("Retake lanes tidied.", true).WithUndoSteps(3),
			map[string]any{"ok": true, "changed": true, "message": "Retake lanes tidied.", "undoSteps": 3.0}},
		{"steps are listed in order", OK("Pickup rolled in.", true).WithSteps([]string{"split", "delete", "paste"}),
			map[string]any{"ok": true, "changed": true, "message": "Pickup rolled in.", "undoSteps": 1.0,
				"steps": []any{"split", "delete", "paste"}}},
		{"no steps is no key", OK("Marker added.", true).WithSteps(nil),
			map[string]any{"ok": true, "changed": true, "message": "Marker added.", "undoSteps": 1.0}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := marshalResult(t, tc.got)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("json = %v, want %v", got, tc.want)
			}
			var back Result
			raw, _ := json.Marshal(tc.got)
			if err := json.Unmarshal(raw, &back); err != nil || !reflect.DeepEqual(back, tc.got) {
				t.Fatalf("roundtrip = %+v (%v), want %+v", back, err, tc.got)
			}
		})
	}
}

func TestResultUndoStepsStayInsideTheWireBound(t *testing.T) {
	for in, want := range map[int]int{-1: 0, 0: 0, 12: 12, 13: MaxUndoSteps, 99: MaxUndoSteps} {
		if got := OK("Done.", true).WithUndoSteps(in).UndoSteps; got != want {
			t.Errorf("WithUndoSteps(%d) = %d, want %d", in, got, want)
		}
	}
}

// go-refused-changes-nothing: a refusal is not ok, changes nothing, adds no undo step and repeats its reason as the message.
func TestRefusedChangesNothingAndSpeaksItsReason(t *testing.T) {
	reason := "REAPER is not answering. Check that REAPER is open, then try again."
	got := Refused(reason)
	want := Result{OK: false, Changed: false, Message: reason, UndoSteps: 0, Refused: reason}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Refused = %+v, want %+v", got, want)
	}
}

func TestARefusalErrorMapsToItsCapabilitysOwnSentence(t *testing.T) {
	msg := "Punch and roll is not something Audacity can do."
	support := Support{Level: Unsupported, Reason: ReasonUnsupported, Message: msg}
	for name, err := range map[string]error{
		"port's error":            &port.NotSupportedError{Capability: "punch", Support: support},
		"dawport's error":         &NotSupportedError{Capability: CapPunch, Support: support},
		"a wrapped dawport error": fmt.Errorf("punch: %w", &NotSupportedError{Capability: CapPunch, Support: support}),
	} {
		t.Run(name, func(t *testing.T) {
			got, ok := RefusedFrom(err)
			if !ok || !reflect.DeepEqual(got, Refused(msg)) {
				t.Fatalf("RefusedFrom = %+v, %v; want Refused(%q)", got, ok, msg)
			}
		})
	}
	for name, err := range map[string]error{"nil": nil, "another error": fmt.Errorf("disk full")} {
		if got, ok := RefusedFrom(err); ok {
			t.Errorf("RefusedFrom(%s) = %+v, true; want false: only a capability refusal maps", name, got)
		}
	}
}

// result-has-an-optional-code: a stale refusal is Refused with code "stale"; success and every other refusal carry no code.
func TestResultHasAnOptionalCodeThatOnlyAStaleRefusalSets(t *testing.T) {
	sentence := "This take's item is no longer in the REAPER project, so nothing was changed. Run the check again to find the takes where they are now."
	stale := RefusedStale(sentence)
	want := Refused(sentence)
	want.Code = CodeStale
	if !reflect.DeepEqual(stale, want) {
		t.Fatalf("RefusedStale = %+v, want %+v", stale, want)
	}
	if got := marshalResult(t, stale)["code"]; got != "stale" {
		t.Fatalf(`json code = %v, want "stale"`, got)
	}
	for name, r := range map[string]Result{
		"a success":         OK("Marker added.", true),
		"a plain refusal":   Refused("REAPER is not answering."),
		"a multi-step edit": OK("Pickup rolled in.", true).WithSteps([]string{"split"}),
	} {
		if _, has := marshalResult(t, r)["code"]; has {
			t.Errorf("%s sends a code: only a stale refusal has one", name)
		}
	}
}

// result-has-an-optional-code: RefusedFrom maps capability refusals only, so it never sets a code. A stale answer comes
// from the bridge as its own error, which a caller maps with RefusedStale and the host's sentence (ADR 0861).
func TestRefusedFromNeverSetsACode(t *testing.T) {
	support := Support{Level: Unsupported, Reason: ReasonUnsupported, Message: "Punch and roll is not something Audacity can do."}
	got, ok := RefusedFrom(&NotSupportedError{Capability: CapPunch, Support: support})
	if !ok || got.Code != "" {
		t.Fatalf("RefusedFrom = %+v, %v; want a refusal with no code", got, ok)
	}
	if _, ok := RefusedFrom(fmt.Errorf("item: %w", errors.New("stale"))); ok {
		t.Fatal("RefusedFrom mapped a non-capability error; a stale answer is mapped with RefusedStale")
	}
}

// go-golden-result: UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-result-*.json; otherwise drift fails.
func TestDawResultGoldenIsCurrent(t *testing.T) {
	for name, r := range map[string]Result{
		"daw-result-ok": OK("Marker added.", true),
		"daw-result-refused-stale": RefusedStale(
			"The project changed in REAPER since this was read. Read it again, then try again."),
		"daw-result-multi-step": OK("Pickup rolled in.", true).
			WithSteps([]string{"Split the item at the pickup", "Delete the old take", "Paste the pickup"}).
			WithUndoSteps(3),
	} {
		t.Run(name, func(t *testing.T) { contractfile.Check(t, name, marshalResult(t, r)) })
	}
}
