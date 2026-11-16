package voicetracks

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"desktop/internal/persist"
)

func newService(t *testing.T) (*Service, string) {
	t.Helper()
	project := t.TempDir()
	return New(Config{Project: project}), project
}

func TestAProjectWithNoFileIsFlatWithNoAssignments(t *testing.T) {
	service, _ := newService(t)
	got, err := service.Get()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, State{Layout: LayoutFlat, NarratorCharacter: "", Tracks: []TrackAssignment{}, NarratorGUIDs: []string{}, NotVoiceGUIDs: []string{}}) {
		t.Fatalf("got %+v", got)
	}
}

func TestTheLayoutIsSavedAndReadBack(t *testing.T) {
	service, project := newService(t)
	if _, err := service.SetLayout(LayoutFolders); err != nil {
		t.Fatal(err)
	}
	got, _ := New(Config{Project: project}).Get()
	if got.Layout != LayoutFolders {
		t.Fatalf("layout = %q", got.Layout)
	}
	if _, err := service.SetLayout("nested"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("an unknown layout: err = %v, want ErrInvalid", err)
	}
}

func TestATracksCharactersAreSetReplacedAndClearedByTrackName(t *testing.T) {
	service, _ := newService(t)
	if _, err := service.SetTrackCharacters("Gardeners", []string{"two", "five", "seven", "five"}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetTrackCharacters("Queen", []string{"queen-of-hearts"}); err != nil {
		t.Fatal(err)
	}
	got, _ := service.Get()
	want := []TrackAssignment{{Track: "Gardeners", Characters: []string{"two", "five", "seven"}, GUIDs: []string{}}, {Track: "Queen", Characters: []string{"queen-of-hearts"}, GUIDs: []string{}}}
	if !reflect.DeepEqual(got.Tracks, want) {
		t.Fatalf("tracks = %+v, want %+v (in name order, a repeated id once)", got.Tracks, want)
	}
	got, err := service.SetTrackCharacters("Gardeners", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Tracks) != 1 || got.Tracks[0].Track != "Queen" {
		t.Fatalf("after clearing Gardeners: %+v", got.Tracks)
	}
}

func TestATrackNameIsMatchedAsREAPERShowsItTrimmed(t *testing.T) {
	service, _ := newService(t)
	got, err := service.SetTrackCharacters("  Gardeners \t", []string{"two"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Tracks[0].Track != "Gardeners" {
		t.Fatalf("track = %q", got.Tracks[0].Track)
	}
}

func TestBadTrackNamesAndCharacterIDsAreRefusedAndNothingIsWritten(t *testing.T) {
	service, project := newService(t)
	for _, name := range []string{"", "   ", "a\nb", strings.Repeat("x", MaxTrackName+1)} {
		if _, err := service.SetTrackCharacters(name, []string{"two"}); !errors.Is(err, ErrInvalid) {
			t.Fatalf("track %q: err = %v, want ErrInvalid", name, err)
		}
	}
	for _, ids := range [][]string{{""}, {"a\tb"}, {strings.Repeat("c", MaxCharacterID+1)}, make([]string, MaxCharacters+1)} {
		if _, err := service.SetTrackCharacters("Gardeners", ids); !errors.Is(err, ErrInvalid) {
			t.Fatalf("ids %q: err = %v, want ErrInvalid", ids, err)
		}
	}
	if _, err := os.Stat(File(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused change wrote the file: %v", err)
	}
}

func TestTheNarratorCharacterIsSetAndCleared(t *testing.T) {
	service, _ := newService(t)
	got, err := service.SetNarratorCharacter("alice")
	if err != nil || got.NarratorCharacter != "alice" {
		t.Fatalf("got %+v, %v", got, err)
	}
	got, err = service.SetNarratorCharacter("")
	if err != nil || got.NarratorCharacter != "" {
		t.Fatalf("cleared: got %+v, %v", got, err)
	}
	if _, err := service.SetNarratorCharacter("a\nb"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("err = %v, want ErrInvalid", err)
	}
}

func TestEmojiAndRightToLeftNamesAreKeptExactly(t *testing.T) {
	service, project := newService(t)
	if _, err := service.SetTrackCharacters("Ūna 🐉 הדרקון", []string{"dragon-🐉"}); err != nil {
		t.Fatal(err)
	}
	got, _ := New(Config{Project: project}).Get()
	if got.Tracks[0].Track != "Ūna 🐉 הדרקון" || got.Tracks[0].Characters[0] != "dragon-🐉" {
		t.Fatalf("got %+v", got.Tracks)
	}
}

func TestACorruptFileIsKeptAsideAndTheProjectStartsFlat(t *testing.T) {
	service, project := newService(t)
	if err := os.MkdirAll(filepath.Dir(File(project)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(File(project), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := service.Get()
	if err != nil || got.Layout != LayoutFlat {
		t.Fatalf("got %+v, %v", got, err)
	}
	kept, _ := filepath.Glob(File(project) + ".corrupt-*")
	if len(kept) != 1 {
		t.Fatalf("the corrupt file was not kept aside: %v", kept)
	}
}

func TestAFileWithAnUnknownLayoutOrABadTrackIsCorrupt(t *testing.T) {
	for _, body := range []string{
		`{"schemaVersion":1,"layout":"nested","narratorCharacter":"","tracks":{}}`,
		`{"schemaVersion":1,"layout":"flat","narratorCharacter":"","tracks":{"":{"characters":["a"]}}}`,
		`{"schemaVersion":1,"layout":"flat","narratorCharacter":"","tracks":{"A":{"characters":[""]}}}`,
	} {
		service, project := newService(t)
		_ = os.MkdirAll(filepath.Dir(File(project)), 0o755)
		_ = os.WriteFile(File(project), []byte(body), 0o600)
		got, err := service.Get()
		if err != nil || got.Layout != LayoutFlat || len(got.Tracks) != 0 {
			t.Fatalf("%s: got %+v, %v", body, got, err)
		}
	}
}

func TestAFileFromANewerAppIsRefusedAndNeverOverwritten(t *testing.T) {
	service, project := newService(t)
	_ = os.MkdirAll(filepath.Dir(File(project)), 0o755)
	newer := []byte(`{"schemaVersion":2,"layout":"folders"}`)
	_ = os.WriteFile(File(project), newer, 0o600)
	if _, err := service.Get(); !errors.Is(err, ErrNewer) {
		t.Fatalf("read: err = %v, want ErrNewer", err)
	}
	if _, err := service.SetLayout(LayoutFlat); !errors.Is(err, ErrNewer) {
		t.Fatalf("write: err = %v, want ErrNewer", err)
	}
	if kept, _ := os.ReadFile(File(project)); string(kept) != string(newer) {
		t.Fatalf("the newer file was overwritten: %s", kept)
	}
}

func TestWithNoProjectNothingIsSaved(t *testing.T) {
	service := New(Config{Reporter: &persist.Reporter{}})
	if got, err := service.Get(); err != nil || got.Layout != LayoutFlat {
		t.Fatalf("got %+v, %v", got, err)
	}
	if _, err := service.SetLayout(LayoutFolders); !errors.Is(err, ErrNoProject) {
		t.Fatalf("err = %v, want ErrNoProject", err)
	}
}

func TestAddingCharactersToATrackKeepsTheOnesItHad(t *testing.T) {
	service, _ := newService(t)
	if _, err := service.SetTrackCharacters("Extras", []string{"duchess", "cook"}); err != nil {
		t.Fatal(err)
	}
	got, err := service.AddTrackCharacters(" Extras ", []string{"cook", "king", "king"})
	if err != nil {
		t.Fatal(err)
	}
	want := []TrackAssignment{{Track: "Extras", Characters: []string{"duchess", "cook", "king"}, GUIDs: []string{}}}
	if !reflect.DeepEqual(got.Tracks, want) {
		t.Fatalf("got %+v, want %+v", got.Tracks, want)
	}
	// A track with none yet gets the ones given; none given changes nothing.
	got, _ = service.AddTrackCharacters("King", []string{"king"})
	if len(got.Tracks) != 2 || got.Tracks[1].Track != "King" {
		t.Fatalf("got %+v", got.Tracks)
	}
	got, _ = service.AddTrackCharacters("Queen", nil)
	if len(got.Tracks) != 2 {
		t.Fatalf("an empty add made an assignment: %+v", got.Tracks)
	}
	if _, err := service.AddTrackCharacters("", []string{"king"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a blank name: %v", err)
	}
	if _, err := service.AddTrackCharacters("Extras", []string{""}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a blank id: %v", err)
	}
}

func TestAddingPastTheLimitOfCharactersIsRefused(t *testing.T) {
	service, _ := newService(t)
	ids := make([]string, MaxCharacters)
	for i := range ids {
		ids[i] = "c" + strings.Repeat("x", i%5) + string(rune('a'+i%26)) + string(rune('a'+i/26))
	}
	if _, err := service.SetTrackCharacters("Extras", ids); err != nil {
		t.Fatal(err)
	}
	if _, err := service.AddTrackCharacters("Extras", []string{"one-more"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("got %v, want refused", err)
	}
	if _, err := service.AddTrackCharacters("Extras", ids[:3]); err != nil {
		t.Fatalf("adding ones it has: %v", err)
	}
}

func learnSetup(t *testing.T) *Service {
	t.Helper()
	service := New(Config{Project: t.TempDir()})
	if _, err := service.SetTrackCharacters("Lead", []string{"lead-id"}); err != nil {
		t.Fatal(err)
	}
	return service
}

func guidsOf(t *testing.T, service *Service, name string) []string {
	t.Helper()
	state, err := service.Get()
	if err != nil {
		t.Fatal(err)
	}
	for _, track := range state.Tracks {
		if track.Track == name {
			return track.GUIDs
		}
	}
	return nil
}

func TestLearnRecordsTheTracksCarryingAnAssignmentAndKeepsThemThroughARename(t *testing.T) {
	service := learnSetup(t)
	if changed, err := service.Learn([]Seen{{GUID: "{A}", Name: "Lead"}, {GUID: "{B}", Name: "Lead"}, {GUID: "{C}", Name: "Other"}}); err != nil || !changed {
		t.Fatalf("learn changed=%v err=%v", changed, err)
	}
	if got := guidsOf(t, service, "Lead"); !reflect.DeepEqual(got, []string{"{a}", "{b}"}) {
		t.Fatalf("guids = %v", got)
	}
	// {A} is renamed to a name no assignment has: it keeps Lead's assignment; {B} is unchanged.
	if changed, err := service.Learn([]Seen{{GUID: "{A}", Name: "Lead 2"}, {GUID: "{B}", Name: "Lead"}, {GUID: "{C}", Name: "Other"}}); err != nil || changed {
		t.Fatalf("a rename to an unassigned name changed the file: changed=%v err=%v", changed, err)
	}
	if got := guidsOf(t, service, "Lead"); !reflect.DeepEqual(got, []string{"{a}", "{b}"}) {
		t.Fatalf("a rename lost the assignment: %v", got)
	}
}

func TestLearnMovesATrackRenamedToAnotherAssignmentsName(t *testing.T) {
	service := learnSetup(t)
	if _, err := service.SetTrackCharacters("Queen", []string{"queen-id"}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Learn([]Seen{{GUID: "{A}", Name: "Lead"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Learn([]Seen{{GUID: "{A}", Name: "Queen"}}); err != nil {
		t.Fatal(err)
	}
	if got := guidsOf(t, service, "Queen"); !reflect.DeepEqual(got, []string{"{a}"}) {
		t.Fatalf("queen guids = %v", got)
	}
	if got := guidsOf(t, service, "Lead"); len(got) != 0 {
		t.Fatalf("lead still holds the track: %v", got)
	}
}

func TestLearnKeepsTracksNotInThisListAndNeverForgetsOnAnEmptyRead(t *testing.T) {
	service := learnSetup(t)
	if _, err := service.Learn([]Seen{{GUID: "{A}", Name: "Lead"}, {GUID: "{B}", Name: "Lead"}}); err != nil {
		t.Fatal(err)
	}
	if changed, err := service.Learn(nil); err != nil || changed {
		t.Fatalf("an empty read changed the file: changed=%v err=%v", changed, err)
	}
	if _, err := service.Learn([]Seen{{GUID: "{B}", Name: "Lead"}}); err != nil {
		t.Fatal(err)
	}
	if got := guidsOf(t, service, "Lead"); !reflect.DeepEqual(got, []string{"{a}", "{b}"}) {
		t.Fatalf("guids = %v", got)
	}
}

func TestTheNarratorTrackStaysTheNarratorWhenRenamed(t *testing.T) {
	service := New(Config{Project: t.TempDir()})
	if _, err := service.SetLayout(LayoutFolders); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Learn([]Seen{{GUID: "{N}", Name: "Narrator"}, {GUID: "{X}", Name: "Alice"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Learn([]Seen{{GUID: "{N}", Name: "Storyteller"}, {GUID: "{X}", Name: "Alice"}}); err != nil {
		t.Fatal(err)
	}
	state, err := service.Get()
	if err != nil {
		t.Fatal(err)
	}
	if !state.IsNarrator("{N}", "Storyteller") || state.IsNarrator("{X}", "Alice") || !state.IsNarrator("{x}", "narrator") {
		t.Fatalf("narrator state %+v", state)
	}
}

func TestAnOlderFileWithNoGuidsReadsAndIsRepairedOnTheFirstLearn(t *testing.T) {
	dir := t.TempDir()
	raw := `{"schemaVersion":1,"layout":"folders","narratorCharacter":"","tracks":{"Lead":{"characters":["lead-id"]}}}`
	if err := os.MkdirAll(filepath.Dir(File(dir)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(File(dir), []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	service := New(Config{Project: dir})
	if got := guidsOf(t, service, "Lead"); len(got) != 0 {
		t.Fatalf("older file guids = %v", got)
	}
	if _, err := service.Learn([]Seen{{GUID: "{A}", Name: "Lead"}}); err != nil {
		t.Fatal(err)
	}
	if got := guidsOf(t, service, "Lead"); !reflect.DeepEqual(got, []string{"{a}"}) {
		t.Fatalf("repaired guids = %v", got)
	}
}

func TestLearnMakesNoFileAndLeavesACorruptOrNewerOneAlone(t *testing.T) {
	dir := t.TempDir()
	service := New(Config{Project: dir})
	if changed, err := service.Learn([]Seen{{GUID: "{N}", Name: "Narrator"}}); err != nil || changed {
		t.Fatalf("learn on a project with no setup: changed=%v err=%v", changed, err)
	}
	if _, err := os.Stat(File(dir)); !os.IsNotExist(err) {
		t.Fatalf("a file was made: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(File(dir)), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{"{not json", `{"schemaVersion":99,"layout":"folders","tracks":{}}`} {
		if err := os.WriteFile(File(dir), []byte(raw), 0o600); err != nil {
			t.Fatal(err)
		}
		if changed, err := service.Learn([]Seen{{GUID: "{N}", Name: "Narrator"}}); err != nil || changed {
			t.Fatalf("learn on %q: changed=%v err=%v", raw, changed, err)
		}
		if got, _ := os.ReadFile(File(dir)); string(got) != raw {
			t.Fatalf("file %q was rewritten to %q", raw, got)
		}
	}
}

func TestANamedNarratorIsPreferredToARememberedOne(t *testing.T) {
	state := State{NarratorGUIDs: []string{"{n}"}}
	if !state.IsNarrator("{N}", "Bob") || !state.IsNarrator("{x}", "narrator") || state.IsNarrator("{x}", "Alice") {
		t.Fatalf("IsNarrator wrong for %+v", state)
	}
	if NamedNarrator("Bob") || !NamedNarrator(" Narrator ") {
		t.Fatal("NamedNarrator wrong")
	}
}

// #3331: a track marked as not a voice is kept by GUID, lower case, once; it needs no characters and does not disturb them.
func TestATrackIsMarkedAsNotAVoiceByGUIDAndUnmarked(t *testing.T) {
	service, project := newService(t)
	state, err := service.SetNotVoice("  {AB-1}  ", true)
	if err != nil || !reflect.DeepEqual(state.NotVoiceGUIDs, []string{"{ab-1}"}) {
		t.Fatalf("marked: %+v, %v", state.NotVoiceGUIDs, err)
	}
	if state, _ = service.SetNotVoice("{ab-1}", true); len(state.NotVoiceGUIDs) != 1 {
		t.Fatalf("marking twice: %v", state.NotVoiceGUIDs)
	}
	if state, _ = service.SetNotVoice("{CD-2}", true); !reflect.DeepEqual(state.NotVoiceGUIDs, []string{"{ab-1}", "{cd-2}"}) {
		t.Fatalf("two marks, in order: %v", state.NotVoiceGUIDs)
	}
	if !state.IsNotVoice("{AB-1}") || state.IsNotVoice("{EF-3}") {
		t.Fatalf("IsNotVoice disagrees with %v", state.NotVoiceGUIDs)
	}
	if state, _ = service.SetNotVoice("{ab-1}", false); !reflect.DeepEqual(state.NotVoiceGUIDs, []string{"{cd-2}"}) {
		t.Fatalf("unmarked: %v", state.NotVoiceGUIDs)
	}
	if state, _ = service.SetNotVoice("{not-marked}", false); len(state.NotVoiceGUIDs) != 1 {
		t.Fatalf("unmarking a track that was not marked changed %v", state.NotVoiceGUIDs)
	}
	raw, _ := os.ReadFile(File(project))
	if !strings.Contains(string(raw), `"notVoices"`) {
		t.Fatalf("the mark is not in the file: %s", raw)
	}
}

func TestAMarkNeedsAValidGUIDAndIsBounded(t *testing.T) {
	service, _ := newService(t)
	for _, bad := range []string{"", "   ", "a\nb", strings.Repeat("x", MaxGUID+1)} {
		if _, err := service.SetNotVoice(bad, true); !errors.Is(err, ErrInvalid) {
			t.Fatalf("%q: err = %v, want ErrInvalid", bad, err)
		}
	}
	for i := 0; i < MaxGUIDs; i++ {
		if _, err := service.SetNotVoice("{g-"+strings.Repeat("0", 4)+"-"+itoa(i)+"}", true); err != nil {
			t.Fatalf("mark %d: %v", i, err)
		}
	}
	if _, err := service.SetNotVoice("{one-too-many}", true); !errors.Is(err, ErrInvalid) {
		t.Fatalf("past the limit: err = %v, want ErrInvalid", err)
	}
}

func itoa(n int) string { return strconv.Itoa(n) }

func TestAFileWithABadNotVoiceGUIDIsCorruptAndAnOlderFileHasNone(t *testing.T) {
	service, project := newService(t)
	_ = os.MkdirAll(filepath.Dir(File(project)), 0o755)
	_ = os.WriteFile(File(project), []byte(`{"schemaVersion":1,"layout":"flat","narratorCharacter":"","tracks":{},"notVoices":["UPPER"]}`), 0o600)
	if got, err := service.Get(); err != nil || len(got.NotVoiceGUIDs) != 0 {
		t.Fatalf("a mark that is not lower case: %+v, %v", got, err)
	}
	older, olderProject := newService(t)
	_ = os.MkdirAll(filepath.Dir(File(olderProject)), 0o755)
	_ = os.WriteFile(File(olderProject), []byte(`{"schemaVersion":1,"layout":"folders","narratorCharacter":"","tracks":{}}`), 0o600)
	if got, err := older.Get(); err != nil || got.NotVoiceGUIDs == nil || len(got.NotVoiceGUIDs) != 0 {
		t.Fatalf("a file written before the mark: %+v, %v (want an empty list, never null)", got.NotVoiceGUIDs, err)
	}
}

// Learn reads the project's tracks and rewrites the file; a mark must come through it untouched, even for a track the project lacks now.
func TestLearnKeepsTheMarks(t *testing.T) {
	service, _ := newService(t)
	if _, err := service.SetTrackCharacters("Lead", []string{"lead-id"}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetNotVoice("{gone}", true); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Learn([]Seen{{GUID: "{A}", Name: "Lead"}}); err != nil {
		t.Fatal(err)
	}
	if got, _ := service.Get(); !reflect.DeepEqual(got.NotVoiceGUIDs, []string{"{gone}"}) {
		t.Fatalf("Learn changed the marks: %v", got.NotVoiceGUIDs)
	}
}
