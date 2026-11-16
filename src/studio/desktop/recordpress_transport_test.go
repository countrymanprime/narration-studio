package main

import (
	"context"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/daw"
)

// countingTrackStates fails the test on a read of the track: #3360, a Record press learns whether REAPER plays or records from
// the heartbeat that already carries it, and asks the bridge only when the heartbeat cannot tell.
type countingTrackStates struct {
	reads int
	state bridge.TrackState
}

func (c *countingTrackStates) ChapterTrackState(context.Context, string) (bridge.TrackState, error) {
	c.reads++
	return c.state, nil
}

// heartbeatWith is a fresh heartbeat carrying REAPER's play state (1 playing, 4 recording), or none when playState is "".
func heartbeatWith(playState string) *daw.Reachability {
	frozen := time.Now()
	reach := daw.NewReachabilityWithClock(nil, func() time.Time { return frozen })
	fields := []string{"PROJECT_STATUS", "", "C:/Projects/Alice/Alice.rpp", "0", "7"}
	if playState != "" {
		fields = append(fields, playState, "0.000000")
	}
	reach.Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: fields})
	return reach
}

func pressWith(t *testing.T, playState string, reader *countingTrackStates) (ReadAloudRecording, *fakeRecorder) {
	t.Helper()
	host, ids := newReadAloudReaperHost(t)
	host.reachability = heartbeatWith(playState)
	recorder := &fakeRecorder{}
	result, err := readAloudRecordStartIn(context.Background(), host.services(), recorder, reader, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	return result, recorder
}

func TestRecordPressReadsNoTrackWhenTheHeartbeatKnowsTheTransport(t *testing.T) {
	reader := &countingTrackStates{}
	result, _ := pressWith(t, "0", reader)
	if result.Outcome != "started" || reader.reads != 0 {
		t.Fatalf("result %+v after %d track reads, want a started press that read no track", result, reader.reads)
	}
}

func TestRecordPressRefusesFromTheHeartbeatWithoutReadingATrack(t *testing.T) {
	for playState, want := range map[string]string{"4": "already_recording", "1": "playing"} {
		reader := &countingTrackStates{}
		result, recorder := pressWith(t, playState, reader)
		if result.Reason != want || reader.reads != 0 || len(recorder.calls) != 0 {
			t.Fatalf("play state %s: result %+v, %d track reads, calls %v; want %s with nothing read or armed", playState, result, reader.reads, recorder.calls, want)
		}
	}
}

func TestRecordPressAsksTheBridgeWhenTheHeartbeatCannotTellTheTransport(t *testing.T) {
	reader := &countingTrackStates{state: bridge.TrackState{Recording: true}}
	result, _ := pressWith(t, "", reader)
	if reader.reads != 1 || result.Reason != "already_recording" {
		t.Fatalf("result %+v after %d track reads, want the one read to say already_recording", result, reader.reads)
	}
}
