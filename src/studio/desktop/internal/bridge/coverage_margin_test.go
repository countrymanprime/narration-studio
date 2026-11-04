package bridge

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"testing"
)

// These pin the failure paths of the bridge client that no other test reached, so the package's coverage floor (96%) is cleared with room
// to spare instead of being met to the tenth of a percent by whichever tests happen to run.

func TestVoiceSampleRegionStaleErrorSaysWhatHappenedAndMatchesErrStale(t *testing.T) {
	err := error(&VoiceSampleRegionStaleError{Number: 3})
	if !strings.Contains(err.Error(), "no longer in the REAPER project") {
		t.Fatalf("message = %q", err.Error())
	}
	if !errors.Is(err, ErrStale) {
		t.Fatal("a stale voice sample region must match ErrStale")
	}
	if errors.Is(err, ErrRecording) {
		t.Fatal("a stale voice sample region is not a recording refusal")
	}
}

func TestReadVoiceSampleRegionsRefusesAnAnswerLongerThanItsCap(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		id := run(command)
		events := make([][]string, 0, MaxVoiceSampleRegions+2)
		for number := 1; number <= MaxVoiceSampleRegions+1; number++ {
			events = append(events, []string{"VOICE_SAMPLE_REGION", id, strconv.Itoa(number), "1.000000", "2.000000", sampleName})
		}
		return append(events, []string{"VOICE_SAMPLES_READ", id, strconv.Itoa(MaxVoiceSampleRegions + 1), "1"})
	})
	got, err := actions.ReadVoiceSampleRegions(context.Background())
	if err == nil || !strings.Contains(err.Error(), strconv.Itoa(MaxVoiceSampleRegions)) {
		t.Fatalf("err = %v, want a refusal naming the cap of %d", err, MaxVoiceSampleRegions)
	}
	if len(got.Regions) != 0 {
		t.Fatalf("a refused read returned %d regions", len(got.Regions))
	}
}

func TestReadVoiceSampleRegionsReportsREAPERsError(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "REAPER could not list the regions"}}
	})
	got, err := actions.ReadVoiceSampleRegions(context.Background())
	if err == nil || len(got.Regions) != 0 {
		t.Fatalf("got %+v, %v; want an error and no regions", got, err)
	}
}

func TestTrackStaleErrorSaysWhatHappenedAndMatchesErrStale(t *testing.T) {
	err := error(&TrackStaleError{GUID: testTrack})
	if !strings.Contains(err.Error(), "no longer in the REAPER project") {
		t.Fatalf("message = %q", err.Error())
	}
	if !errors.Is(err, ErrStale) {
		t.Fatal("a stale track must match ErrStale")
	}
}

func TestChapterFolderStateWithNoTrackSendsNothing(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, trackStateAnswer)
	for _, guid := range []string{"", "   "} {
		if _, err := actions.ChapterFolderState(context.Background(), guid); err == nil {
			t.Fatalf("ChapterFolderState(%q) = nil error, want a refusal", guid)
		}
	}
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a folder read with no track sent %v", got)
	}
}

func TestChapterTrackStateAnsweredForAnotherTrackIsAnError(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, trackStateAnswer) // always answers for testTrack
	other := "{00000009-0000-4000-8000-000000000009}"
	if _, err := actions.ChapterTrackState(context.Background(), other); err == nil || !strings.Contains(err.Error(), "another track") {
		t.Fatalf("err = %v, want a refusal to take another track's state", err)
	}
}

func TestSubscriptionWantsMatchesTagsPrefixesAndOwners(t *testing.T) {
	handle := func(Event) {}
	owned := func(runID string) bool { return runID == "mine" }
	cases := []struct {
		name  string
		sub   Subscription
		event Event
		want  bool
	}{
		{"exact tag", Subscription{Tags: []string{"A"}, Handle: handle}, Event{Tag: "A"}, true},
		{"prefix tag", Subscription{Tags: []string{"COMPARE_*"}, Handle: handle}, Event{Tag: "COMPARE_DONE"}, true},
		{"other tag", Subscription{Tags: []string{"A"}, Handle: handle}, Event{Tag: "B"}, false},
		{"prefix is not a substring match", Subscription{Tags: []string{"COMPARE_*"}, Handle: handle}, Event{Tag: "XCOMPARE_DONE"}, false},
		{"no handler", Subscription{Tags: []string{"A"}}, Event{Tag: "A"}, false},
		{"no tags", Subscription{Handle: handle}, Event{Tag: "A"}, false},
		{"owned run", Subscription{Tags: []string{"A"}, Handle: handle, Owns: owned}, Event{Tag: "A", RunID: "mine"}, true},
		{"someone else's run", Subscription{Tags: []string{"A"}, Handle: handle, Owns: owned}, Event{Tag: "A", RunID: "theirs"}, false},
		{"no run id reaches every owner filter", Subscription{Tags: []string{"A"}, Handle: handle, Owns: owned}, Event{Tag: "A"}, true},
		{"a run id with no owner filter", Subscription{Tags: []string{"A"}, Handle: handle}, Event{Tag: "A", RunID: "any"}, true},
	}
	for _, c := range cases {
		if got := c.sub.Wants(c.event); got != c.want {
			t.Errorf("%s: Wants = %v, want %v", c.name, got, c.want)
		}
	}
}
