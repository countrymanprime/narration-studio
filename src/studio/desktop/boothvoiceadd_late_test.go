package main

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

const lateVoiceTrack = "{AAAAAAAA-0000-4000-8000-0000000000B7}"

// lateConfirmCreator is a REAPER that makes the track and confirms too late: the track is in the project (written as REAPER's list now
// holds it) and the answer is bridge.ErrAnswerLate.
type lateConfirmCreator struct {
	fakeChildCreator
	host  *Host
	t     *testing.T
	calls int
}

func (f *lateConfirmCreator) CreateChildTrack(ctx context.Context, name, parent string) (dawport.CreatedTrack, error) {
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
	creator := &lateConfirmCreator{host: host, t: t}
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

// An unconfirmed create whose read-back finds nothing (the list is as saved) must not be sent again by a second press of the same name.
func TestARetryAfterAnUnconfirmedCreateIsNotSentAgain(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	creator := &fakeChildCreator{childErr: bridge.ErrAnswerLate}
	if first := boothVoiceAdd(t, host, creator, ids[0], "King", nil); first.Outcome != "refused" {
		t.Fatalf("first = %+v", first)
	}
	second := boothVoiceAdd(t, host, creator, ids[0], "King", nil)
	if second.Outcome != "refused" || !strings.Contains(second.Message, "may already be there") || len(creator.children) != 1 {
		t.Fatalf("second = %+v after %d creates, want a refusal and no second create", second, len(creator.children))
	}
}

// Select-then-late-arrival: the narrator chose another voice while the add waited; the late voice is listed but the choice stands.
type choosingCreator struct {
	fakeChildCreator
	during func()
}

func (f *choosingCreator) CreateChildTrack(ctx context.Context, name, parent string) (dawport.CreatedTrack, error) {
	f.during()
	return f.fakeChildCreator.CreateChildTrack(ctx, name, parent)
}

func TestAnAddLandingLateDoesNotStealAChoiceMadeMeanwhile(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	creator := &choosingCreator{during: func() { host.boothVoices.choose(ids[0], voiceNarratorTrack) }}
	got := boothVoiceAdd(t, host, creator, ids[0], "King", nil)
	if got.Outcome != "added" || got.TrackGUID != addedVoiceTrack {
		t.Fatalf("got %+v", got)
	}
	if chosen := host.boothVoices.For(ids[0]); chosen != voiceNarratorTrack {
		t.Fatalf("chosen = %q, want the voice chosen while the add waited", chosen)
	}
	if listed := host.boothVoices.addedTo(voiceFolderTrack); len(listed) != 1 {
		t.Fatalf("the late voice is not listed: %v", listed)
	}
}

func TestAnAddLandingAfterATakeStartedDoesNotChooseItsLane(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	creator := &choosingCreator{during: func() {
		host.mu.Lock()
		host.readAloudRecordingChapter = ids[0]
		host.mu.Unlock()
	}}
	got := boothVoiceAdd(t, host, creator, ids[0], "King", nil)
	if got.Outcome != "added" || host.boothVoices.For(ids[0]) == addedVoiceTrack {
		t.Fatalf("got %+v, chosen %q: a take started, the add must not move its voice", got, host.boothVoices.For(ids[0]))
	}
}

// A lane that lands after the pending mark is adopted by the next press of its name, with its characters, not refused as name_taken.
func TestALaneThatLandsAfterThePendingMarkIsAdoptedOnRetry(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	creator := &fakeChildCreator{childErr: bridge.ErrAnswerLate}
	if first := boothVoiceAdd(t, host, creator, ids[0], "King", []string{"king"}); first.Outcome != "refused" {
		t.Fatalf("first = %+v", first)
	}
	late := &lateConfirmCreator{host: host, t: t}
	extra := fmt.Sprintf("  <TRACK %s\n    NAME %q\n    ISBUS 0 0\n    TRACKID %s\n  >\n", lateVoiceTrack, "King", lateVoiceTrack)
	writeProject(t, host, strings.Replace(voiceFolderRpp, "  <TRACK "+voiceNarratorTrack, extra+"  <TRACK "+voiceNarratorTrack, 1))
	got := boothVoiceAdd(t, host, late, ids[0], "King", []string{"king"})
	if got.Outcome != "added" || got.TrackGUID != lateVoiceTrack || late.calls != 0 {
		t.Fatalf("got %+v after %d creates, want the landed lane adopted with no create", got, late.calls)
	}
}

func TestThePendingBlockFoldsCaseAsTheNameCheckDoes(t *testing.T) {
	c := newBoothVoiceChoices()
	c.markPending("{F}", "Miſs")
	if !c.isPending("{f}", "MISS") {
		t.Fatal("MISS is not the pending Miſs")
	}
}

func TestAnExpiredPendingBlockIsDropped(t *testing.T) {
	c := newBoothVoiceChoices()
	c.mu.Lock()
	c.pending[pendingKey("{F}", "King")] = time.Now().Add(-pendingVoiceFor - time.Second)
	c.mu.Unlock()
	if c.isPending("{F}", "King") || len(c.pending) != 0 {
		t.Fatal("an expired mark is kept")
	}
}

func TestAnAddWhileATakeIsStartingIsRefused(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	host.mu.Lock()
	host.readAloudStarting++
	host.mu.Unlock()
	creator := &fakeChildCreator{}
	got := boothVoiceAdd(t, host, creator, ids[0], "King", nil)
	if got.Outcome != "refused" || len(creator.children) != 0 {
		t.Fatalf("got %+v, %d creates", got, len(creator.children))
	}
}

func TestAChoiceOfTheSameVoiceMadeDuringTheWaitStands(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	host.boothVoices.choose(ids[0], voiceNarratorTrack)
	creator := &choosingCreator{during: func() { host.boothVoices.choose(ids[0], voiceNarratorTrack) }}
	boothVoiceAdd(t, host, creator, ids[0], "King", nil)
	if chosen := host.boothVoices.For(ids[0]); chosen != voiceNarratorTrack {
		t.Fatalf("chosen = %q, want the voice pressed during the wait", chosen)
	}
}

func TestAQueuedAddWithNoTimeLeftSendsNothing(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	creator := &fakeChildCreator{}
	got, err := host.boothVoiceAddIn(ctx, host.services(), creator, createAvailable(), ids[0], "King", nil)
	if err != nil || got.Outcome != "refused" || len(creator.children) != 0 {
		t.Fatalf("got %+v err %v, %d creates", got, err, len(creator.children))
	}
}
