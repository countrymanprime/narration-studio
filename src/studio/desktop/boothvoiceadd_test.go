package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
	"desktop/internal/voicetracks"
)

const addedVoiceTrack = "{AAAAAAAA-0000-4000-8000-0000000000A1}"

// fakeChildCreator stands in for the track_create role with a parent (bridge.Actions.CreateChildTrack has its own tests, and the Lua
// harness the command). It answers the name it was asked for.
type fakeChildCreator struct {
	fakeCreator
	children [][2]string // name, parent
	childErr error
}

var _ dawport.ChildTrackCreator = (*fakeChildCreator)(nil)

func (f *fakeChildCreator) CreateChildTrack(_ context.Context, name, parentGUID string) (dawport.CreatedTrack, error) {
	f.children = append(f.children, [2]string{name, parentGUID})
	if f.childErr != nil {
		return dawport.CreatedTrack{}, f.childErr
	}
	return dawport.CreatedTrack{GUID: addedVoiceTrack, Name: name, Index: 3}, nil
}

// writeProject saves text as the project's .rpp, as REAPER does when the narrator saves.
func writeProject(t *testing.T, host *Host, text string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(host.config.projectFolder, "Alice.rpp"), []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

func boothVoiceAdd(t *testing.T, host *Host, creator dawport.TrackCreator, chapterID, name string, characters []string) BoothVoiceAdded {
	t.Helper()
	got, err := host.boothVoiceAddIn(context.Background(), host.services(), creator, createAvailable(), chapterID, name, characters)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func voiceSetup(t *testing.T, host *Host) voicetracks.State {
	t.Helper()
	state, err := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder}).Get()
	if err != nil {
		t.Fatal(err)
	}
	return state
}

func TestAddingAVoiceMakesAChildOfTheChaptersFolderAssignsItsCharactersAndChoosesIt(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	creator := &fakeChildCreator{}
	got := boothVoiceAdd(t, host, creator, ids[0], "  King\nof Hearts ", []string{"king", "king"})
	if got.Outcome != "added" || got.TrackGUID != addedVoiceTrack || got.Name != "King of Hearts" {
		t.Fatalf("got %+v", got)
	}
	if !reflect.DeepEqual(creator.children, [][2]string{{"King of Hearts", voiceFolderTrack}}) || len(creator.names) != 0 {
		t.Fatalf("children %v, top-level %v: want one child of the chapter's folder", creator.children, creator.names)
	}
	setup := voiceSetup(t, host)
	if !reflect.DeepEqual(setup.Tracks, []voicetracks.TrackAssignment{{Track: "King of Hearts", Characters: []string{"king"}}}) {
		t.Fatalf("assignments %+v", setup.Tracks)
	}
	// The saved project does not hold the track until the narrator saves, but this session knows it is a voice of the chapter: the next
	// take arms it, and BoothVoiceGet names it so the page can list it.
	fake := &fakeRecorder{}
	recordStartWithVoice(t, host, fake, ids[0])
	if fake.armGUID != addedVoiceTrack {
		t.Fatalf("armed %q, want the added voice", fake.armGUID)
	}
	voice := boothVoiceGet(t, host, ids[0])
	if voice.TrackGUID != addedVoiceTrack || !reflect.DeepEqual(voice.Added, []BoothVoiceTrack{{GUID: addedVoiceTrack, Name: "King of Hearts"}}) {
		t.Fatalf("get %+v", voice)
	}
	if other := boothVoiceGet(t, host, ids[1]); len(other.Added) != 0 {
		t.Fatalf("another chapter lists the added voice: %+v", other)
	}
	// It can be chosen away from and back to, as any voice can.
	if back := boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], voiceQueenTrack); back.Outcome != "selected" {
		t.Fatalf("got %+v", back)
	}
	if again := boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], addedVoiceTrack); again.Outcome != "selected" {
		t.Fatalf("choosing the added voice again: %+v", again)
	}
}

func TestAnAddedVoiceThatIsSavedIsListedOnceFromTheSavedProject(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	boothVoiceAdd(t, host, &fakeChildCreator{}, ids[0], "Extras", nil)
	saved := strings.Replace(voiceFolderRpp, `    NAME " narrator "
    ISBUS 2 -1
    TRACKID `+voiceNarratorTrack+`
  >`, `    NAME " narrator "
    ISBUS 0 0
    TRACKID `+voiceNarratorTrack+`
  >
  <TRACK `+addedVoiceTrack+`
    NAME "Extras"
    ISBUS 2 -1
    TRACKID `+addedVoiceTrack+`
  >`, 1)
	if saved == voiceFolderRpp {
		t.Fatal("the saved project did not change")
	}
	writeProject(t, host, saved)
	voices, _, err := chapterVoices(host.services(), voiceFolderTrack)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, voice := range voices {
		names = append(names, strings.TrimSpace(voice.Name))
	}
	if !reflect.DeepEqual(names, []string{"Queen", "narrator", "Extras"}) {
		t.Fatalf("voices %v, want the saved Extras once", names)
	}
	if got := boothVoiceGet(t, host, ids[0]); len(got.Added) != 0 {
		t.Fatalf("a saved voice is still listed as added: %+v", got.Added)
	}
}

func TestAnAddedVoiceAddsTheCharactersToATrackOfTheSameNameElsewhere(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	if _, err := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder}).SetTrackCharacters("Extras", []string{"cook"}); err != nil {
		t.Fatal(err)
	}
	boothVoiceAdd(t, host, &fakeChildCreator{}, ids[0], "Extras", []string{"king", "knave"})
	want := []voicetracks.TrackAssignment{{Track: "Extras", Characters: []string{"cook", "king", "knave"}}}
	if got := voiceSetup(t, host).Tracks; !reflect.DeepEqual(got, want) {
		t.Fatalf("assignments %+v, want %+v", got, want)
	}
}

func TestAddingAVoiceIsRefusedBeforeAnythingIsSent(t *testing.T) {
	tooMany := make([]string, voicetracks.MaxCharacters+1)
	for i := range tooMany {
		tooMany[i] = "c" + strings.Repeat("x", i)
	}
	cases := []struct {
		name, track, reason string
		characters          []string
		setup               func(*Host, []string) string // answers the chapter to add to
	}{
		{name: "a blank name", track: " \n\t", reason: boothVoiceNoName},
		{name: "the name of a voice it has", track: " QUEEN ", reason: boothVoiceNameTaken},
		{name: "the Narrator's name", track: "Narrator", reason: boothVoiceNameTaken},
		{name: "a name past the limit", track: strings.Repeat("é", voicetracks.MaxTrackName+1), reason: boothVoiceInvalid},
		{name: "too many characters", track: "Crowd", characters: tooMany, reason: boothVoiceInvalid},
		{name: "a blank character id", track: "Crowd", characters: []string{""}, reason: boothVoiceInvalid},
		{name: "during this app's take", track: "Crowd", reason: trackCreateRecording, setup: func(h *Host, ids []string) string {
			h.readAloudRecordingChapter = ids[0]
			return ids[0]
		}},
		{name: "a chapter that records on one track", track: "Crowd", reason: boothVoiceFlat, setup: func(h *Host, ids []string) string {
			linkChapter(t, h, ids[1], "{22222222-2222-4222-8222-222222222222}")
			return ids[1]
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
			chapter := ids[0]
			if tc.setup != nil {
				chapter = tc.setup(host, ids)
			}
			creator := &fakeChildCreator{}
			got := boothVoiceAdd(t, host, creator, chapter, tc.track, tc.characters)
			if got.Outcome != "refused" || got.Reason != tc.reason || got.Message == "" {
				t.Fatalf("got %+v, want refused %q", got, tc.reason)
			}
			if len(creator.children)+len(creator.names) != 0 {
				t.Fatalf("a refused add sent %v %v", creator.children, creator.names)
			}
			if len(voiceSetup(t, host).Tracks) != 0 {
				t.Fatal("a refused add assigned characters")
			}
		})
	}
	t.Run("a flat project", func(t *testing.T) {
		host, ids := newFlatBoothHost(t)
		creator := &fakeChildCreator{}
		if got := boothVoiceAdd(t, host, creator, ids[0], "Crowd", nil); got.Reason != boothVoiceFlat || len(creator.children) != 0 {
			t.Fatalf("got %+v", got)
		}
	})
}

func TestWhatTheEngineAnswersAnAddWithIsARefusalThatAssignsNothing(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		reason string
	}{
		{name: "REAPER records", err: bridge.ErrRecording, reason: trackCreateRecording},
		{name: "the folder is gone", err: &bridge.TrackStaleError{GUID: voiceFolderTrack}, reason: readAloudTrackMissing},
		{name: "the bridge went away", err: bridge.ErrUnavailable, reason: reaperStandalone},
		{name: "no answer", err: bridge.ErrNoAnswer, reason: reaperNotRunning},
		{name: "anything else", err: errors.New("disk full"), reason: refusedFailed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
			got := boothVoiceAdd(t, host, &fakeChildCreator{childErr: tc.err}, ids[0], "Crowd", []string{"king"})
			if got.Outcome != "refused" || got.Reason != tc.reason || !strings.Contains(got.Message, "REAPER") {
				t.Fatalf("got %+v, want refused %q naming the engine", got, tc.reason)
			}
			if len(voiceSetup(t, host).Tracks) != 0 || boothVoiceGet(t, host, ids[0]).TrackGUID != voiceNarratorTrack {
				t.Fatal("a failed add assigned characters or chose a voice")
			}
		})
	}
}

func TestAnEngineThatCannotAddAVoiceSaysSo(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	plain := &fakeCreator{}
	got, err := host.boothVoiceAddIn(context.Background(), host.services(), plain, createAvailable(), ids[0], "Crowd", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Reason != trackCreateUnsupported || len(plain.names) != 0 {
		t.Fatalf("got %+v, names %v: an engine with no folders must not add a top-level track", got, plain.names)
	}
	got, err = host.boothVoiceAddIn(context.Background(), host.services(), nil, dawport.Support{Reason: dawport.ReasonNotRunning}, ids[0], "Crowd", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Reason != reaperNotRunning {
		t.Fatalf("got %+v", got)
	}
}

func TestBoothVoiceAddedPayloadsMatchTheContract(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	answers := map[string]any{
		"added":      boothVoiceAdd(t, host, &fakeChildCreator{}, ids[0], "Extras", []string{"king", "knave"}),
		"name_taken": boothVoiceAdd(t, host, &fakeChildCreator{}, ids[0], "Queen", nil),
		"get_added":  boothVoiceGet(t, host, ids[0]),
	}
	contractfile.Check(t, "booth-voice-added", answers)
}

// The order the Booth sends during a take (#2839): an add while this app records is refused and sends nothing; once the take has stopped
// (ReadAloudRecordStop clears it, as REAPER's RECORD_ENDED does) the same add goes through.
func TestAnAddDuringTheTakeIsRefusedAndTheSameAddAfterTheStopGoesThrough(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	recorder := &fakeRecorder{}
	if started := recordStartWithVoice(t, host, recorder, ids[0]); started.Outcome != "started" {
		t.Fatalf("start %+v", started)
	}
	host.setReadAloudRecording(ids[0], recorder) // as ReadAloudRecordStart marks this app's take

	creator := &fakeChildCreator{}
	if during := boothVoiceAdd(t, host, creator, ids[0], "King of Hearts", []string{"king"}); during.Reason != trackCreateRecording || len(creator.children) != 0 {
		t.Fatalf("during the take: %+v, sent %v", during, creator.children)
	}
	host.clearReadAloudRecording()
	after := boothVoiceAdd(t, host, creator, ids[0], "King of Hearts", []string{"king"})
	if after.Outcome != "added" || len(creator.children) != 1 {
		t.Fatalf("after the stop: %+v, sent %v", after, creator.children)
	}
}

// syncChildCreator is fakeChildCreator for calls from several goroutines: each add gets its own GUID, and each call holds the engine for a
// moment, as REAPER's answer takes one.
type syncChildCreator struct {
	fakeCreator
	mu    sync.Mutex
	calls int
}

func (f *syncChildCreator) CreateChildTrack(_ context.Context, name, _ string) (dawport.CreatedTrack, error) {
	f.mu.Lock()
	f.calls++
	n := f.calls
	f.mu.Unlock()
	time.Sleep(20 * time.Millisecond)
	return dawport.CreatedTrack{GUID: fmt.Sprintf("{AAAAAAAA-0000-4000-8000-0000000000B%d}", n), Name: name, Index: 3}, nil
}

// Two adds of one name at once (two windows, a double press the page let through): one is added, the other sees it and is refused, and
// REAPER is asked once.
func TestTwoAddsOfOneNameAtOnceAddOneTrack(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	creator := &syncChildCreator{}
	answers := make([]BoothVoiceAdded, 2)
	var wg sync.WaitGroup
	for i := range answers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			got, err := host.boothVoiceAddIn(context.Background(), host.services(), creator, createAvailable(), ids[0], "Crowd", nil)
			if err != nil {
				t.Error(err)
			}
			answers[i] = got
		}()
	}
	wg.Wait()
	outcomes := []string{answers[0].Outcome + "/" + answers[0].Reason, answers[1].Outcome + "/" + answers[1].Reason}
	sort.Strings(outcomes)
	if !reflect.DeepEqual(outcomes, []string{"added/", "refused/" + boothVoiceNameTaken}) || creator.calls != 1 {
		t.Fatalf("outcomes %v, REAPER asked %d times; want one added, one name_taken, one call", outcomes, creator.calls)
	}
}
