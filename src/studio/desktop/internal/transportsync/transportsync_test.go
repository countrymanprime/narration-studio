package transportsync

import (
	"context"
	"errors"
	"math"
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
)

// The Editing page's transport sync host logic (the DawTransportSync binding and the daw_position_changed event). What REAPER does is narration_transport.lua's (transport_sync_test.lua) and what the role
// answers is dawport/reaper's. These cover the host's wiring: the capability checked first, the project REAPER has open, the sentence each
// refusal gets, and the event's payload.

type fakeSyncer struct {
	calls   []string
	times   []float64
	err     error
	handler func(dawport.TransportPosition)
}

func (f *fakeSyncer) OnPosition(handler func(dawport.TransportPosition)) { f.handler = handler }
func (f *fakeSyncer) SetCursor(_ context.Context, seconds float64) (float64, error) {
	f.calls, f.times = append(f.calls, "cursor"), append(f.times, seconds)
	return seconds, f.err
}
func (f *fakeSyncer) PlayFrom(_ context.Context, seconds float64) (float64, error) {
	f.calls, f.times = append(f.calls, "play"), append(f.times, seconds)
	return seconds, f.err
}
func (f *fakeSyncer) PlayRange(_ context.Context, from, to float64) (float64, float64, error) {
	f.calls, f.times = append(f.calls, "playRange"), append(f.times, from, to)
	return from, to, f.err
}
func (f *fakeSyncer) Stop(context.Context) (float64, error) {
	f.calls = append(f.calls, "stop")
	return 0, f.err
}
func (f *fakeSyncer) Watch(_ context.Context, lease time.Duration) (time.Duration, error) {
	f.calls = append(f.calls, "watch")
	return lease, f.err
}

func run(t *testing.T, syncer dawport.TransportSyncer, support dawport.Support, same bool, action string, seconds float64) dawport.Result {
	t.Helper()
	return runRange(t, syncer, support, same, action, seconds, 0)
}

func runRange(t *testing.T, syncer dawport.TransportSyncer, support dawport.Support, same bool, action string, seconds, until float64) dawport.Result {
	t.Helper()
	return Do(t.Context(), "REAPER", support, syncer, func() bool { return same }, action, seconds, until)
}

func TestTransportSyncAnswersOKAndChangesNothingInTheProject(t *testing.T) {
	for _, action := range []string{"cursor", "play", "stop", "watch"} {
		role := &fakeSyncer{}
		got := run(t, role, available(), true, action, 12.5)
		if !got.OK || got.UndoSteps != 0 || got.Refused != "" {
			t.Errorf("%s: %+v, want ok, no undo step, no refusal", action, got)
		}
		if len(role.calls) != 1 || role.calls[0] != action {
			t.Errorf("%s: calls = %v", action, role.calls)
		}
	}
}

func TestTransportSyncSendsTheTimeAsGiven(t *testing.T) {
	role := &fakeSyncer{}
	run(t, role, available(), true, "cursor", 12.5)
	run(t, role, available(), true, "play", 0)
	if len(role.times) != 2 || role.times[0] != 12.5 || role.times[1] != 0 {
		t.Fatalf("times = %v", role.times)
	}
}

func TestTransportSyncRefusesWhenTheCapabilityIsRefusedAndAsksNothing(t *testing.T) {
	role := &fakeSyncer{}
	got := run(t, role, dawport.Support{Message: "Experimental DAW actions are off."}, true, "play", 3)
	if got.OK || got.Refused != "Experimental DAW actions are off." || len(role.calls) != 0 {
		t.Fatalf("got %+v (calls %v)", got, role.calls)
	}
}

func TestTransportSyncWithNoAdapterSaysTheDAWIsNotConnected(t *testing.T) {
	got := run(t, nil, available(), true, "play", 3)
	if got.OK || !strings.Contains(got.Message, "not connected") {
		t.Fatalf("got %+v", got)
	}
}

func TestTransportSyncRefusesATimeThatIsNotUsableForACursorOrAPlayAndSendsNothing(t *testing.T) {
	for _, bad := range []float64{math.NaN(), math.Inf(1), math.Inf(-1), -0.001} {
		for _, action := range []string{"cursor", "play"} {
			role := &fakeSyncer{}
			got := run(t, role, available(), true, action, bad)
			if got.OK || got.Refused == "" || len(role.calls) != 0 {
				t.Errorf("%s %v: %+v (calls %v)", action, bad, got, role.calls)
			}
		}
	}
}

func TestTransportSyncRefusesAnUnknownAction(t *testing.T) {
	role := &fakeSyncer{}
	if got := run(t, role, available(), true, "rewind", 1); got.OK || len(role.calls) != 0 {
		t.Fatalf("got %+v", got)
	}
}

// A different project open in REAPER is not this book's: moving its cursor or playing it would be wrong, so those are refused. Stop is never
// refused for it, so a transport the app started can always be stopped.
func TestTransportSyncDoesNotMoveOrPlayAnotherProjectButStillStops(t *testing.T) {
	for _, action := range []string{"cursor", "play", "watch"} {
		role := &fakeSyncer{}
		got := run(t, role, available(), false, action, 3)
		if got.OK || !strings.Contains(got.Message, "project") || len(role.calls) != 0 {
			t.Errorf("%s: %+v (calls %v), want a refusal that names the project and nothing sent", action, got, role.calls)
		}
	}
	role := &fakeSyncer{}
	if got := run(t, role, available(), false, "stop", 0); !got.OK || len(role.calls) != 1 {
		t.Fatalf("stop on another project = %+v (calls %v)", got, role.calls)
	}
}

func TestTransportSyncWordsEachFailureAsASentence(t *testing.T) {
	for name, err := range map[string]error{
		"recording":      bridge.ErrRecording,
		"no answer":      bridge.ErrNoAnswer,
		"unavailable":    bridge.ErrUnavailable,
		"deadline":       context.DeadlineExceeded,
		"something else": errors.New("boom"),
	} {
		got := run(t, &fakeSyncer{err: err}, available(), true, "play", 3)
		if got.OK || got.Message == "" || got.Refused != got.Message {
			t.Errorf("%s: %+v, want a refusal with one sentence", name, got)
		}
	}
	if got := run(t, &fakeSyncer{err: bridge.ErrRecording}, available(), true, "play", 3); !strings.Contains(got.Message, "recording") {
		t.Errorf("recording sentence = %q", got.Message)
	}
}

func TestTheDawPositionPayloadSaysPlayingRecordingHeadCursorAndWhetherItIsThisProject(t *testing.T) {
	playing := Payload(dawport.TransportPosition{Playing: true, PlayPosition: 12.5, EditCursor: 9}, true)
	stopped := Payload(dawport.TransportPosition{PlayPosition: 12.5, EditCursor: 9}, false)
	recording := Payload(dawport.TransportPosition{Playing: true, Recording: true, PlayPosition: 30, EditCursor: 9}, true)
	contractfile.Check(t, "daw-position-playing", playing)
	contractfile.Check(t, "daw-position-stopped-other-project", stopped)
	contractfile.Check(t, "daw-position-recording", recording)
}

func TestTransportSyncGoldensAreCurrent(t *testing.T) {
	role := &fakeSyncer{}
	contractfile.Check(t, "daw-transport-sync-ok", run(t, role, available(), true, "play", 40.25))
	contractfile.Check(t, "daw-transport-sync-refused", run(t, role, available(), false, "play", 40.25))
}

func available() dawport.Support { return dawport.Support{Available: true} }

// playRange hands the DAW a whole stretch to play and stop at, so the end does not wait on the app: the capability and the project are checked as
// for play, and a stretch that is empty, backwards or not a number is refused with nothing sent.
func TestTransportSyncPlayRangeSendsBothTimes(t *testing.T) {
	role := &fakeSyncer{}
	got := runRange(t, role, available(), true, "playRange", 40.25, 41.5)
	if !got.OK || got.UndoSteps != 0 || !got.Changed {
		t.Fatalf("got %+v, want ok, changed, no undo step", got)
	}
	if len(role.calls) != 1 || role.calls[0] != "playRange" || len(role.times) != 2 || role.times[0] != 40.25 || role.times[1] != 41.5 {
		t.Fatalf("calls %v times %v", role.calls, role.times)
	}
}

func TestTransportSyncPlayRangeRefusesAStretchThatIsNotUsableAndSendsNothing(t *testing.T) {
	for _, bad := range [][2]float64{{5, 5}, {6, 5}, {-1, 5}, {math.NaN(), 5}, {1, math.NaN()}, {1, math.Inf(1)}, {math.Inf(-1), 5}} {
		role := &fakeSyncer{}
		got := runRange(t, role, available(), true, "playRange", bad[0], bad[1])
		if got.OK || got.Refused == "" || len(role.calls) != 0 {
			t.Errorf("%v: %+v (calls %v)", bad, got, role.calls)
		}
	}
}

func TestTransportSyncPlayRangeFollowsTheCapabilityAndTheProject(t *testing.T) {
	role := &fakeSyncer{}
	if got := runRange(t, role, dawport.Support{Message: "Experimental DAW actions are off."}, true, "playRange", 1, 2); got.OK || got.Refused != "Experimental DAW actions are off." || len(role.calls) != 0 {
		t.Fatalf("capability: %+v (calls %v)", got, role.calls)
	}
	if got := runRange(t, role, available(), false, "playRange", 1, 2); got.OK || !strings.Contains(got.Message, "project") || len(role.calls) != 0 {
		t.Fatalf("other project: %+v (calls %v)", got, role.calls)
	}
	if got := runRange(t, nil, available(), true, "playRange", 1, 2); got.OK || !strings.Contains(got.Message, "not connected") {
		t.Fatalf("no adapter: %+v", got)
	}
}
