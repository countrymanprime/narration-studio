package main

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

const lateVoiceTrack = "{AAAAAAAA-0000-4000-8000-0000000000B7}"

// lateChildCreator is a REAPER that makes the track and confirms too late: the track is in the project (written as REAPER's list now
// holds it) and the answer is bridge.ErrAnswerLate.
type lateChildCreator struct {
	fakeChildCreator
	host  *Host
	t     *testing.T
	calls int
}

func (f *lateChildCreator) CreateChildTrack(ctx context.Context, name, parent string) (dawport.CreatedTrack, error) {
	f.calls++
	f.children = append(f.children, [2]string{name, parent})
	extra := fmt.Sprintf("  <TRACK %s\n    NAME %q\n    ISBUS 0 0\n    TRACKID %s\n  >\n", lateVoiceTrack, name, lateVoiceTrack)
	writeProject(f.t, f.host, strings.Replace(voiceFolderRpp, "  <TRACK "+voiceNarratorTrack, extra+"  <TRACK "+voiceNarratorTrack, 1))
	return dawport.CreatedTrack{}, bridge.ErrAnswerLate
}

// #3645: a create REAPER read and confirmed late is not a failure and not lost: the host reads the folder back, adopts the track that
// is new, chooses it, and a second press of the same name is the name-taken refusal, not a second track.
func TestAVoiceREAPERConfirmsLateIsAdoptedByReadingBack(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	creator := &lateChildCreator{host: host, t: t}
	got := boothVoiceAdd(t, host, creator, ids[0], "King", []string{"king"})
	if got.Outcome != "added" || got.TrackGUID != lateVoiceTrack || got.Name != "King" {
		t.Fatalf("got %+v, want the track REAPER made adopted", got)
	}
	if voice := boothVoiceGet(t, host, ids[0]); voice.TrackGUID != lateVoiceTrack {
		t.Fatalf("the Booth records on %q, want the adopted voice", voice.TrackGUID)
	}
	again := boothVoiceAdd(t, host, creator, ids[0], "King", []string{"king"})
	if again.Outcome != "refused" || again.Reason != boothVoiceNameTaken || creator.calls != 1 {
		t.Fatalf("second press = %+v after %d creates, want name_taken and no second create", again, creator.calls)
	}
}

// A create REAPER read, never confirmed and with no new track to find is a refusal, nothing is chosen, and the narrator is not told it worked.
func TestALateCreateWithNothingToFindIsARefusal(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	creator := &fakeChildCreator{childErr: bridge.ErrAnswerLate}
	got := boothVoiceAdd(t, host, creator, ids[0], "King", nil)
	if got.Outcome != "refused" {
		t.Fatalf("got %+v", got)
	}
	if voice := boothVoiceGet(t, host, ids[0]); voice.TrackGUID == "" || voice.TrackGUID == lateVoiceTrack {
		t.Fatalf("voice = %+v", voice)
	}
}

func TestALateCreateWordsItSelfAsMaybeThereNotAsNotAnswering(t *testing.T) {
	refusal := trackCreateError("REAPER", "Chapter 3", bridge.ErrAnswerLate, "track")
	if refusal.Reason != refusedFailed || !strings.Contains(refusal.Message, "may already be there") || strings.Contains(refusal.Message, "not answering") {
		t.Fatalf("refusal = %+v", refusal)
	}
}
