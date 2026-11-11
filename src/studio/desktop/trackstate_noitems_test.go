package main

import (
	"context"
	"testing"

	"desktop/internal/bridge"
)

// itemlessTrackStates is a reader with the itemless read, as the REAPER bridge has; it fails the test when the full read is used.
type itemlessTrackStates struct {
	t     *testing.T
	fake  fakeTrackStates
	reads int
}

func (r *itemlessTrackStates) ChapterTrackState(context.Context, string) (bridge.TrackState, error) {
	r.t.Helper()
	r.t.Error("the full read, with every item, was used where only the state is looked at")
	return bridge.TrackState{}, nil
}

func (r *itemlessTrackStates) ChapterTrackStateNoItems(ctx context.Context, guid string) (bridge.TrackState, error) {
	r.reads++
	return r.fake.ChapterTrackState(ctx, guid)
}

func TestRecordPressReadsTheTrackStateWithoutItsItems(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	reader := &itemlessTrackStates{t: t}
	result, err := readAloudRecordStartIn(context.Background(), host.services(), &fakeRecorder{}, reader, ids[0])
	if err != nil || result.Outcome != "started" || reader.reads != 1 {
		t.Fatalf("result %+v, err %v, itemless reads %d: want a started press with one itemless read", result, err, reader.reads)
	}
}

func TestRecordPressStillRefusesWhenTheItemlessReadSaysRecording(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	reader := &itemlessTrackStates{t: t, fake: fakeTrackStates{state: bridge.TrackState{Recording: true}}}
	result, err := readAloudRecordStartIn(context.Background(), host.services(), &fakeRecorder{}, reader, ids[0])
	if err != nil || result.Reason != "already_recording" {
		t.Fatalf("result %+v, err %v: want already_recording", result, err)
	}
}

func TestReaperStatePollReadsTheTrackStateWithoutItsItems(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	reader := &itemlessTrackStates{t: t, fake: fakeTrackStates{state: bridge.TrackState{TrackArmed: true, ArmedCount: 1}}}
	readState(t, host, reader, ids[0])
	if reader.reads != 1 {
		t.Fatalf("itemless reads = %d, want 1", reader.reads)
	}
}

func TestTeleprompterInputReadsTheTrackStateWithoutItsItems(t *testing.T) {
	reader := &itemlessTrackStates{t: t}
	readInput(t, connectedHost(), reader, &fakeDevices{})
	if reader.reads != 1 {
		t.Fatalf("itemless reads = %d, want 1", reader.reads)
	}
}
