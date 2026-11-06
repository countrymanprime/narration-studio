package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"desktop/internal/dawport"
	"desktop/internal/evidence"
	"desktop/internal/voicetracks"
)

// The guards on "Create a track for this chapter" the reviews of #2958 asked for: a chapter that already has a track is refused
// (already_linked, B2), two creates at once add one track (B2), a name another track already has is refused (name_taken, F2), and a
// link that cannot be saved after the DAW added the track says so and names the track (B6).

// blockingCreator holds CreateTrack until release is closed, so a test can start a second create while the first is in the DAW.
type blockingCreator struct {
	mu      sync.Mutex
	calls   int
	entered chan struct{}
	release chan struct{}
}

func (b *blockingCreator) CreateTrack(_ context.Context, name string) (dawport.CreatedTrack, error) {
	b.mu.Lock()
	b.calls++
	b.mu.Unlock()
	b.entered <- struct{}{}
	<-b.release
	return dawport.CreatedTrack{GUID: createdTrackGUID, Name: name, Index: 3}, nil
}

func TestChapterTrackCreateRefusesAChapterLinkedToATrackTheProjectHas(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	linkChapter(t, host, ids[1], "{22222222-2222-4222-8222-222222222222}")
	creator := &fakeCreator{}
	result := createTrack(t, host, creator, createAvailable(), ids[1])
	if result["outcome"] != "refused" || result["reason"] != "already_linked" {
		t.Fatalf("result = %v, want already_linked", result)
	}
	if message, _ := result["message"].(string); !strings.Contains(message, "“Chapter II”") {
		t.Fatalf("message %q does not name the linked track", message)
	}
	if len(creator.names) != 0 {
		t.Fatalf("the DAW was asked to add %q", creator.names)
	}
}

func TestChapterTrackCreateStillReplacesALinkToATrackThatIsGone(t *testing.T) {
	// A link to a track the project no longer has is "Track missing": creating one is how the link dialog fixes it.
	host, ids := newTestHostForChapterMatch(t)
	linkChapter(t, host, ids[1], "{DEADBEEF-0000-4000-8000-000000000000}")
	if result := createTrack(t, host, &fakeCreator{}, createAvailable(), ids[1]); result["outcome"] != "created" {
		t.Fatalf("result = %v", result)
	}
}

func TestChapterTrackCreateTwiceForOneChapterAddsOneTrack(t *testing.T) {
	// The second press reaches the host after the first linked the chapter: the track it made is not saved yet, but it is the chapter's.
	host, ids := newTestHostForChapterMatch(t)
	creator := &fakeCreator{index: 3}
	if first := createTrack(t, host, creator, createAvailable(), ids[2]); first["outcome"] != "created" {
		t.Fatalf("first = %v", first)
	}
	second := createTrack(t, host, creator, createAvailable(), ids[2])
	if second["outcome"] != "refused" || second["reason"] != "already_linked" {
		t.Fatalf("second = %v, want already_linked", second)
	}
	if len(creator.names) != 1 {
		t.Fatalf("the DAW was asked %d times, want once", len(creator.names))
	}
}

func TestTwoConcurrentCreatesForOneChapterAddOneTrack(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	creator := &blockingCreator{entered: make(chan struct{}, 2), release: make(chan struct{})}
	type answer struct {
		result any
		err    error
	}
	answers := make(chan answer, 2)
	press := func() {
		result, err := chapterTrackCreateIn(context.Background(), host.services(), creator, createAvailable(), ids[2])
		answers <- answer{result, err}
	}
	go press()
	<-creator.entered
	go press()
	// The second create waits for the first: it must not reach the DAW while the first is there.
	select {
	case <-creator.entered:
		t.Fatal("a second create reached the DAW while the first was still adding its track")
	case <-time.After(150 * time.Millisecond):
	}
	close(creator.release)
	outcomes := map[string]int{}
	for range 2 {
		got := <-answers
		if got.err != nil {
			t.Fatal(got.err)
		}
		switch result := got.result.(type) {
		case chapterTrackCreated:
			outcomes[result.Outcome]++
		case chapterTrackCreateRefusal:
			outcomes[result.Reason]++
		}
	}
	if outcomes["created"] != 1 || outcomes["already_linked"] != 1 || creator.calls != 1 {
		t.Fatalf("outcomes %v, DAW calls %d: want one created, one already_linked, one call", outcomes, creator.calls)
	}
}

// writeRpp replaces the test project's saved Alice.rpp with tracks named as given.
func writeRpp(t *testing.T, host *Host, names ...string) {
	t.Helper()
	var b strings.Builder
	b.WriteString("<REAPER_PROJECT 0.1 \"7.80/x64\" 1789000000\n")
	for i, name := range names {
		guid := "{A0000000-0000-4000-8000-00000000000" + string(rune('0'+i)) + "}"
		b.WriteString("  <TRACK " + guid + "\n    NAME \"" + name + "\"\n    TRACKID " + guid + "\n  >\n")
	}
	b.WriteString(">\n")
	if err := os.WriteFile(filepath.Join(host.config.projectFolder, "Alice.rpp"), []byte(b.String()), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestChapterTrackCreateRefusesANameATrackAlreadyHas(t *testing.T) {
	// Trimmed and case-insensitive: "  chapter ii: the POOL of tears " is the name the new track would get.
	host, ids := newTestHostForChapterMatch(t)
	writeRpp(t, host, "Chapter I", "  chapter ii: the POOL of tears ")
	creator := &fakeCreator{}
	result := createTrack(t, host, creator, createAvailable(), ids[1])
	if result["outcome"] != "refused" || result["reason"] != "name_taken" {
		t.Fatalf("result = %v, want name_taken", result)
	}
	message, _ := result["message"].(string)
	if !strings.Contains(message, "“chapter ii: the POOL of tears”") || !strings.Contains(message, "Link that one with the picker") {
		t.Fatalf("message %q", message)
	}
	if len(creator.names) != 0 {
		t.Fatalf("the DAW was asked to add %q", creator.names)
	}
}

func TestChapterTrackCreateInVoiceFoldersRefusesAFolderOfThatName(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	folder := host.config.projectFolder
	rpp := `<REAPER_PROJECT 0.1 "7.80/x64" 1789000000
  <TRACK {A0000000-0000-4000-8000-000000000001}
    NAME "Chapter II: The Pool of Tears"
    ISBUS 1 1
    TRACKID {A0000000-0000-4000-8000-000000000001}
  >
  <TRACK {A0000000-0000-4000-8000-000000000002}
    NAME "Narrator"
    ISBUS 2 -1
    TRACKID {A0000000-0000-4000-8000-000000000002}
  >
>
`
	if err := os.WriteFile(filepath.Join(folder, "Alice.rpp"), []byte(rpp), 0o600); err != nil {
		t.Fatal(err)
	}
	setLayout(t, host, voicetracks.LayoutFolders)
	creator := &fakeFolderCreator{}
	result := createTrack(t, host, creator, createAvailable(), ids[1])
	if result["outcome"] != "refused" || result["reason"] != "name_taken" {
		t.Fatalf("result = %v, want name_taken", result)
	}
	if message, _ := result["message"].(string); !strings.Contains(message, "folder") {
		t.Fatalf("message %q does not say folder", message)
	}
	if len(creator.folders) != 0 {
		t.Fatalf("the DAW was asked to add %q", creator.folders)
	}
}

func TestChapterTrackCreateWhoseLinkCannotBeSavedNamesTheNewTrack(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	saved := setChapterLink
	t.Cleanup(func() { setChapterLink = saved })
	setChapterLink = func(*evidence.MappingStore, string, string, string, string) (evidence.ChapterLinkSet, error) {
		return evidence.ChapterLinkSet{}, errors.New("the disk is full")
	}
	result := createTrack(t, host, &fakeCreator{index: 3}, createAvailable(), ids[1])
	if result["outcome"] != "refused" || result["reason"] != "link_failed" {
		t.Fatalf("result = %v, want link_failed", result)
	}
	message, _ := result["message"].(string)
	for _, want := range []string{"“Chapter II: The Pool of Tears”", "the disk is full", "link it"} {
		if !strings.Contains(message, want) {
			t.Errorf("message %q lacks %q", message, want)
		}
	}
	if strings.Contains(message, "could not be added") || strings.Contains(message, "could not add") {
		t.Errorf("message %q says the track was not added, but it was", message)
	}
}
