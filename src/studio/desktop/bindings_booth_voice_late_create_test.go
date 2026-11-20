package main

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/dawport/dawporttest"
	"desktop/internal/voicetracks"
)

// #3645 (owner, real REAPER): adding a lane answers "REAPER didn't respond within 3 s", yet REAPER made the track. The host then knew nothing of it
// (boothVoiceAddOne remembers a voice only from the create's answer), so a Booth choice of the lane was refused as "not a voice of this chapter's
// folder" and the Booth fell back to the old lane until a live read happened to list it. A slow answer is not a failed create.

// lateChildCreator makes the track in the engine and then answers late, as a REAPER whose tick stalled does: the command ran, the answer missed
// the host's wait.
type lateChildCreator struct {
	fakeCreator
	made []string
}

var _ dawport.ChildTrackCreator = (*lateChildCreator)(nil)

func (f *lateChildCreator) CreateChildTrack(_ context.Context, name, _ string) (dawport.CreatedTrack, error) {
	f.made = append(f.made, name)
	return dawport.CreatedTrack{}, bridge.ErrNoAnswer
}

// listerAdapter is a fake DAW whose track list is lister's.
type listerAdapter struct {
	*dawporttest.Fake
	lister dawport.TrackLister
}

func (a listerAdapter) Role(capability dawport.Capability) any {
	if capability == dawport.CapTracksRead {
		return a.lister
	}
	return a.Fake.Role(capability)
}

// engineAfterCreate lists the voice folder's tracks as REAPER has them: the new last voice, name, inside the first chapter's folder is in the list
// only once creator has been sent the create, as in a REAPER that made the track after the host stopped waiting.
type engineAfterCreate struct {
	rpp     string
	name    string
	creator *lateChildCreator
}

func (e engineAfterCreate) ReadTracks(context.Context) (dawport.LiveTracks, error) {
	tracks := []dawport.LiveTrack{
		{Index: 0, GUID: voiceFolderTrack, Name: "Chapter 1", FolderDelta: 1},
		{Index: 1, GUID: voiceQueenTrack, Name: "Queen"},
		{Index: 2, GUID: voiceNarratorTrack, Name: "narrator"},
	}
	if len(e.creator.made) > 0 {
		tracks = append(tracks, dawport.LiveTrack{Index: 3, GUID: addedVoiceTrack, Name: e.name, FolderDelta: -1})
	} else {
		tracks[len(tracks)-1].FolderDelta = -1
	}
	tracks = append(tracks,
		dawport.LiveTrack{Index: len(tracks), GUID: "{22222222-2222-4222-8222-222222222222}", Name: "Chapter II"},
		dawport.LiveTrack{Index: len(tracks) + 1, GUID: voiceEmptyFolder, Name: "Chapter 2", FolderDelta: 1})
	return dawport.LiveTracks{ProjectPath: e.rpp, Total: len(tracks), Tracks: tracks}, nil
}

func hostWithLiveTracks(host *Host, lister dawport.TrackLister) hostServices {
	fake := dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Supported))
	svc := host.services()
	svc.dawPortResolver = dawport.NewResolver(dawport.ResolverConfig{
		Adapter: listerAdapter{Fake: fake, lister: lister},
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
	})
	return svc
}

// The create timed out, REAPER made the lane: the host reads the folder back and adopts the new voice, so the add answers "added" and the Booth
// chooses it. Red until the host does: it refuses with the create's timeout now.
func TestALaneCreateThatAnswersLateIsAdoptedFromTheLiveList(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	creator := &lateChildCreator{}
	svc := hostWithLiveTracks(host, engineAfterCreate{rpp: filepath.Join(host.config.projectFolder, "Alice.rpp"), name: "Crowd", creator: creator})
	got, err := host.boothVoiceAddIn(context.Background(), svc, creator, createAvailable(), ids[0], "Crowd", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Outcome != "added" || got.TrackGUID != addedVoiceTrack || got.Name != "Crowd" {
		t.Fatalf("got %+v, want the lane REAPER made adopted, not a refusal for a slow answer", got)
	}
	if len(creator.made) != 1 {
		t.Fatalf("the create was sent %d times, want once: a retry would make a second lane", len(creator.made))
	}
}

// Whatever the add answered, the lane must be choosable right after: a choice made while the live list cannot be read (it answers late too, so the
// host shows the saved project) must not be refused as "not a voice" for a lane the host itself created or adopted.
func TestAChoiceOfALaneTheHostJustAddedIsNotRefusedWhenTheLiveListIsLate(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	creator := &fakeChildCreator{}
	added := boothVoiceAdd(t, host, creator, ids[0], "Crowd", nil)
	if added.Outcome != "added" {
		t.Fatalf("got %+v, want added", added)
	}
	late := &fakeLister{err: bridge.ErrNoAnswer}
	svc := hostWithLiveTracks(host, late)
	got, err := host.boothVoiceSetIn(context.Background(), svc, &fakeLaneRecorder{}, ids[0], added.TrackGUID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Outcome != "selected" || got.TrackGUID != addedVoiceTrack {
		t.Fatalf("got %+v, want the lane chosen: the saved project not listing it yet is not proof it is absent", got)
	}
}

// A refusal for a stalled REAPER names the budget that ran out: the voice calls run under laneCommandTimeout, not 3 s.
func TestALaneArmThatRunsOutOfTimeDoesNotSayThreeSeconds(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeLaneRecorder{laneErr: context.DeadlineExceeded}
	got := boothVoiceSet(t, host, fake, ids[0], voiceQueenTrack)
	if got.Outcome != "selected" || got.Reason != "timeout" {
		t.Fatalf("got %+v, want the choice kept with the arm's timeout named", got)
	}
	if want := "3 seconds"; strings.Contains(got.Message, want) {
		t.Fatalf("message %q says %q, but a voice call waits %s in all (laneCommandTimeout)", got.Message, want, laneCommandTimeout)
	}
}

// Switching lanes against a REAPER that read the arm and has not confirmed it: the choice stands, the narrator is told the arm may not
// match (never "did not respond"), and the lane is listed as chosen by the next read.
func TestASlowArmKeepsTheChoiceAndSaysItMayNotMatch(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeLaneRecorder{laneErr: bridge.ErrAnswerLate}
	got := boothVoiceSet(t, host, fake, ids[0], voiceQueenTrack)
	if got.Outcome != "selected" || got.TrackGUID != voiceQueenTrack || got.Armed {
		t.Fatalf("got %+v, want the choice kept and not claimed armed", got)
	}
	if got.Message == "" || strings.Contains(strings.ToLower(got.Message), "didn't respond") {
		t.Fatalf("message %q", got.Message)
	}
	if again := boothVoiceGet(t, host, ids[0]); again.TrackGUID != voiceQueenTrack {
		t.Fatalf("the Booth records on %q, want the chosen lane", again.TrackGUID)
	}
}
