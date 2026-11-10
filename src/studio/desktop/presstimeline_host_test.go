package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/daw"
	"desktop/internal/presstimeline"
)

// onTimeline is a context carrying a timeline that is always on, and the lines it wrote.
func onTimeline() (context.Context, *[]string) {
	written := &[]string{}
	timeline := presstimeline.New(func() bool { return true }, time.Now, func(line string) error {
		*written = append(*written, line)
		return nil
	})
	return presstimeline.With(context.Background(), timeline), written
}

func TestARecordStartAtAPunchWritesItsStepsToTheTimeline(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	ctx, written := onTimeline()
	fake := &fakeRecorder{started: bridge.RecordStarted{Position: 30}}

	if _, err := readAloudRecordStartAtIn(ctx, host.services(), fake, &fakeStartPuncher{recorder: fake}, &fakeTrackStates{}, ids[0], 30); err != nil {
		t.Fatal(err)
	}

	if len(*written) != 1 {
		t.Fatalf("lines = %q, want one", *written)
	}
	line := (*written)[0]
	for _, step := range []string{"outcome=started", " record_call=", " track_state=", " armed=", " punched=", " recording="} {
		if !strings.Contains(line, step) {
			t.Fatalf("line %q has no %q", line, step)
		}
	}
	if strings.Contains(line, ids[0]) || strings.Contains(line, readAloudTrack) {
		t.Fatalf("line %q names the chapter or the track", line)
	}
}

func TestARefusedRecordStartWritesItsReason(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	ctx, written := onTimeline()

	if _, err := readAloudRecordStartIn(ctx, host.services(), &fakeRecorder{}, &fakeTrackStates{state: bridge.TrackState{Playing: true}}, ids[0]); err != nil {
		t.Fatal(err)
	}

	if len(*written) != 1 || !strings.Contains((*written)[0], "outcome=playing") {
		t.Fatalf("lines = %q, want one with the refusal", *written)
	}
}

func TestTheTimelineIsOnOnlyWhileREAPERsHeartbeatSaysSo(t *testing.T) {
	reach := daw.NewReachability(nil)
	if timingSwitchedOn(reach) {
		t.Fatal("on before any heartbeat")
	}
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "1", "0", "0.000000", "1"}})
	if !timingSwitchedOn(reach) {
		t.Fatal("off after a heartbeat that says on")
	}
	if timingSwitchedOn(nil) {
		t.Fatal("on with no heartbeat role")
	}
}

func TestATimelineLineIsAppendedToTheSessionFolder(t *testing.T) {
	dir := t.TempDir()
	for _, line := range []string{"a\n", "b\n"} {
		if err := appendTimelineLine(dir, line); err != nil {
			t.Fatal(err)
		}
	}
	got, err := os.ReadFile(filepath.Join(dir, recordTimelineFile))
	if err != nil || string(got) != "a\nb\n" {
		t.Fatalf("file = %q, %v", got, err)
	}
	if err := appendTimelineLine("", "c\n"); err != nil {
		t.Fatalf("no session folder: %v, want nothing written and no error", err)
	}
}

// The steps before the DAW is asked that no timeline line showed (#3221): the Start from here lookup, the model check and the project
// check just before the start tone. A press that passes through them shows each on its line; the project check outside a press shows none.
func TestAPressLineShowsTheLookupTheModelCheckAndTheProjectCheckBeforeTheTone(t *testing.T) {
	host := newTestHost(t)
	written := []string{}
	host.timeline = presstimeline.New(func() bool { return true }, time.Now, func(line string) error {
		written = append(written, line)
		return nil
	})

	host.Bootstrap() // the page's own call between presses
	if _, err := host.BoothPunchTarget("c-1", "p-1", 0, 1); err != nil {
		t.Fatal(err)
	}
	_, _ = host.AssetsList()
	host.Bootstrap()
	host.timeline.Finish("recording", "started")

	if len(written) != 1 {
		t.Fatalf("lines = %q, want one", written)
	}
	line, last := written[0], -1
	for _, step := range []string{" punch_lookup=", " punch_looked_up=", " assets_list=", " bootstrap_call=", " bootstrapped=", " recording="} {
		at := strings.Index(line, step)
		if at < 0 || at < last {
			t.Fatalf("line %q has no %q after the step before it", line, step)
		}
		last = at
	}
	if strings.Count(line, "bootstrap_call=") != 1 {
		t.Fatalf("line %q holds the project check made between presses", line)
	}
}
