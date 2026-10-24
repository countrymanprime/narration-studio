package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/coverage"
	"desktop/internal/dawport"
	"desktop/internal/dawport/dawporttest"
	"desktop/internal/manuscript"
	"desktop/internal/settings"
)

const createdTrackGUID = "{00000003-0000-4000-8000-000000000003}"

// fakeCreator stands in for the track_create role (bridge.Actions and audacity.Session have their own tests, and the Lua
// harness the command). It answers the name it was asked for, as REAPER does for a trimmed one-line name.
type fakeCreator struct {
	names []string
	index int
	err   error
}

var _ dawport.TrackCreator = (*fakeCreator)(nil)

func (f *fakeCreator) CreateTrack(_ context.Context, name string) (dawport.CreatedTrack, error) {
	f.names = append(f.names, name)
	if f.err != nil {
		return dawport.CreatedTrack{}, f.err
	}
	return dawport.CreatedTrack{GUID: createdTrackGUID, Name: name, Index: f.index}, nil
}

func createAvailable() dawport.Support { return dawport.Support{Available: true} }

func createTrack(t *testing.T, host *Host, creator dawport.TrackCreator, support dawport.Support, chapterID string) map[string]any {
	t.Helper()
	answer, err := chapterTrackCreateIn(context.Background(), host.services(), creator, support, chapterID)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := encodeBinding(answer, nil)
	if err != nil {
		t.Fatal(err)
	}
	return decodeBinding(t, raw)
}

func TestChapterTrackCreateNamesTheTrackAfterTheChapterAndLinksIt(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	creator := &fakeCreator{index: 3}
	result := createTrack(t, host, creator, createAvailable(), ids[1])

	if len(creator.names) != 1 || creator.names[0] != "Chapter II: The Pool of Tears" {
		t.Fatalf("asked for %q, want the chapter's display title", creator.names)
	}
	if result["outcome"] != "created" {
		t.Fatalf("result = %v", result)
	}
	track, _ := result["track"].(map[string]any)
	if track["guid"] != createdTrackGUID || track["name"] != "Chapter II: The Pool of Tears" || track["index"] != float64(3) {
		t.Fatalf("track = %v", track)
	}
	link, _ := result["link"].(map[string]any)
	if link["trackGuid"] != createdTrackGUID || link["chapterId"] != ids[1] {
		t.Fatalf("link = %v", link)
	}
	if displaced, present := result["displaced"]; !present || displaced != nil {
		t.Fatalf("displaced = %v (present %v), want null", displaced, present)
	}
	for _, absent := range []string{"reason", "message"} {
		if _, present := result[absent]; present {
			t.Errorf("a created answer carries %q", absent)
		}
	}
	// The link is the one ChapterTrackSet would have written: the chapter's links now name the new track.
	_, links, err := chapterLinksFor(host.services(), ids[1])
	if err != nil || len(links) != 1 || links[0] != createdTrackGUID {
		t.Fatalf("links = %v, %v", links, err)
	}
}

func TestChapterTrackCreateReplacesTheChaptersOldLink(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	linkChapter(t, host, ids[0], "{DEADBEEF-0000-4000-8000-000000000000}")
	createTrack(t, host, &fakeCreator{}, createAvailable(), ids[0])
	_, links, err := chapterLinksFor(host.services(), ids[0])
	if err != nil || len(links) != 1 || links[0] != createdTrackGUID {
		t.Fatalf("links = %v, %v", links, err)
	}
}

func TestChapterTrackCreateTwiceAddsTwoTracks(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	creator := &fakeCreator{}
	createTrack(t, host, creator, createAvailable(), ids[0])
	createTrack(t, host, creator, createAvailable(), ids[0])
	if len(creator.names) != 2 {
		t.Fatalf("asked %d times, want 2: the binding does not dedupe", len(creator.names))
	}
}

func TestChapterTrackCreateForAChapterNotInTheManuscriptIsAnError(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	creator := &fakeCreator{}
	if _, err := chapterTrackCreateIn(context.Background(), host.services(), creator, createAvailable(), "c-9999"); err == nil {
		t.Fatal("want an error for a chapter the manuscript does not have")
	}
	if len(creator.names) != 0 {
		t.Fatalf("a track was added for an unknown chapter: %v", creator.names)
	}
}

func TestChapterTrackCreateNamesACreditsTrackAfterItsTitle(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	for kind, title := range creditsScriptTitles {
		creator := &fakeCreator{}
		id := coverage.CreditsChapterID(kind)
		result := createTrack(t, host, creator, createAvailable(), id)
		if result["outcome"] != "created" || len(creator.names) != 1 || creator.names[0] != title {
			t.Fatalf("%s: asked %v, result %v", kind, creator.names, result)
		}
		link, _ := result["link"].(map[string]any)
		if link["chapterId"] != id || link["chapterTitle"] != title {
			t.Fatalf("%s: link = %v", kind, link)
		}
	}
}

// newTestHostWithTitles is a host over a manuscript whose chapter headings are titles, in book order.
func newTestHostWithTitles(t *testing.T, titles ...string) (*Host, []string) {
	t.Helper()
	var book strings.Builder
	for _, title := range titles {
		book.WriteString("# " + title + "\n\nThe words of this chapter, read aloud by the narrator.\n\n")
	}
	source := filepath.Join(t.TempDir(), "book.md")
	if err := os.WriteFile(source, []byte(book.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	project := t.TempDir()
	service := manuscript.New(project)
	job := service.Begin(source)
	if _, err := service.Preview(job.ID, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Commit(job.ID, false, manuscript.Choices{}); err != nil {
		t.Fatal(err)
	}
	chapters, err := service.Chapters()
	if err != nil {
		t.Fatal(err)
	}
	host := &Host{settings: settings.New(t.TempDir(), project), manuscript: service}
	host.config.projectFolder = project
	ids := make([]string, 0, len(chapters))
	for _, chapter := range chapters {
		ids = append(ids, chapter["id"].(string))
	}
	return host, ids
}

func TestChapterTrackCreateKeepsEmojiAndRightToLeftTitles(t *testing.T) {
	titles := []string{"Chapter 7 \U0001F30A The Sea", "\u05E4\u05E8\u05E7 \u05D0: \u05D4\u05D9\u05DD", "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644"}
	host, ids := newTestHostWithTitles(t, titles...)
	if len(ids) != len(titles) {
		t.Fatalf("chapters = %d, want %d", len(ids), len(titles))
	}
	for i, id := range ids {
		creator := &fakeCreator{}
		result := createTrack(t, host, creator, createAvailable(), id)
		if len(creator.names) != 1 || creator.names[0] != titles[i] {
			t.Fatalf("asked %q, want %q", creator.names, titles[i])
		}
		if track, _ := result["track"].(map[string]any); track["name"] != titles[i] {
			t.Fatalf("track = %v", track)
		}
	}
}

func TestChapterTrackCreateRefusals(t *testing.T) {
	cases := []struct {
		label   string
		kind    dawport.Kind
		creator dawport.TrackCreator
		support dawport.Support
		reason  string
		message string
	}{
		{"no engine connected", dawport.KindREAPER, nil, dawport.Support{Reason: dawport.ReasonStandalone}, "standalone",
			"REAPER is not connected to this app, so no track can be added. Start REAPER, then try again."},
		{"engine not answering", dawport.KindREAPER, nil, dawport.Support{Reason: dawport.ReasonNotRunning}, "not_running",
			"REAPER is not answering, so no track can be added. Check that REAPER is open, then try again."},
		{"experimental off", dawport.KindREAPER, nil, dawport.Support{Reason: dawport.ReasonExperimentalOff}, "experimental_off",
			"Adding tracks is an experimental action. Turn on Experimental DAW actions in Settings to use it."},
		{"turned off", dawport.KindREAPER, nil, dawport.Support{Reason: dawport.ReasonTurnedOff}, "experimental_off",
			"Adding a track for a chapter is turned off in Settings. Turn it on there to use it."},
		{"engine has no such role", dawport.KindAudacity, nil, dawport.Support{Reason: dawport.ReasonUnsupported}, "unsupported",
			"Audacity cannot add a track for a chapter from this app. Add a track named “Chapter I: Down the Rabbit-Hole” in Audacity, then link it."},
		{"not yet available", dawport.KindAudacity, nil, dawport.Support{Reason: dawport.ReasonNotYet}, "unsupported",
			"Audacity cannot add a track for a chapter from this app. Add a track named “Chapter I: Down the Rabbit-Hole” in Audacity, then link it."},
		{"recording", dawport.KindREAPER, &fakeCreator{err: bridge.ErrRecording}, createAvailable(), "recording",
			"REAPER is recording. Stop the take, then create the track."},
		{"recording in Audacity", dawport.KindAudacity, &fakeCreator{err: bridge.ErrRecording}, createAvailable(), "recording",
			"Audacity is recording. Stop the take, then create the track."},
		{"gate refused at send", dawport.KindREAPER, &fakeCreator{err: bridge.ErrExperimentalOff}, createAvailable(), "experimental_off",
			"Adding tracks is an experimental action. Turn on Experimental DAW actions in Settings to use it."},
		{"bridge gone", dawport.KindREAPER, &fakeCreator{err: bridge.ErrUnavailable}, createAvailable(), "standalone",
			"REAPER is not connected to this app, so no track can be added. Start REAPER, then try again."},
		{"no answer", dawport.KindREAPER, &fakeCreator{err: bridge.ErrNoAnswer}, createAvailable(), "not_running",
			"REAPER is not answering, so no track can be added. Check that REAPER is open, then try again."},
		{"failed", dawport.KindREAPER, &fakeCreator{err: errors.New("the script is older than this app.")}, createAvailable(), "failed",
			"REAPER could not add the track: the script is older than this app. Add a track named “Chapter I: Down the Rabbit-Hole” in REAPER, then link it."},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			host, ids := newTestHostForChapterMatch(t)
			host.dawPortResolver = dawport.NewResolver(dawport.ResolverConfig{Adapter: dawporttest.NewFake(c.kind, dawporttest.Levels(dawport.Experimental))})
			result := createTrack(t, host, c.creator, c.support, ids[0])
			if result["outcome"] != "refused" || result["reason"] != c.reason || result["message"] != c.message {
				t.Fatalf("result = %v\nwant reason %q, message %q", result, c.reason, c.message)
			}
			for _, absent := range []string{"link", "track", "mappings", "documentId", "displaced"} {
				if _, present := result[absent]; present {
					t.Errorf("a refusal carries %q", absent)
				}
			}
			if _, links, err := chapterLinksFor(host.services(), ids[0]); err != nil || len(links) != 0 {
				t.Errorf("a refusal linked the chapter: %v, %v", links, err)
			}
		})
	}
}

func TestChapterTrackCreateRefusalsNameTheAdapterNotReaper(t *testing.T) {
	for _, reason := range []dawport.Reason{dawport.ReasonStandalone, dawport.ReasonNotRunning, dawport.ReasonUnsupported, dawport.ReasonFailed} {
		if got := trackCreateUnavailable("Audacity", "Chapter 1", dawport.Support{Reason: reason}); strings.Contains(got.Message, "REAPER") {
			t.Errorf("%s: %q names REAPER", reason, got.Message)
		}
	}
	if got := trackCreateError("Audacity", "Chapter 1", bridge.ErrRecording); strings.Contains(got.Message, "REAPER") || !strings.Contains(got.Message, "Audacity") {
		t.Errorf("recording: %q", got.Message)
	}
	source, err := os.ReadFile("chaptertrackcreate.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range strings.Split(string(source), "\n") {
		if trimmed := strings.TrimSpace(line); !strings.HasPrefix(trimmed, "//") && strings.Contains(line, "REAPER") {
			t.Errorf("chaptertrackcreate.go spells REAPER outside a comment: %s", trimmed)
		}
	}
}

func TestTrackCreatorFromComesFromTheResolver(t *testing.T) {
	fake := dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Experimental))
	on := dawport.NewResolver(dawport.ResolverConfig{
		Adapter:      fake,
		Runtime:      func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
		Experimental: func() bool { return true },
	})
	creator, support := trackCreatorFrom(hostServices{dawPortResolver: on})
	if creator == nil || !support.Available {
		t.Fatalf("creator = %v, support = %+v", creator, support)
	}
	if _, err := creator.CreateTrack(context.Background(), "Chapter 1"); err != nil {
		t.Fatal(err)
	}
	if calls := fake.Calls(); len(calls) != 1 || calls[0] != "track_create.CreateTrack" {
		t.Fatalf("the creator did not come from the resolver: calls = %v", calls)
	}

	off := dawport.NewResolver(dawport.ResolverConfig{
		Adapter: fake,
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
	})
	if creator, support := trackCreatorFrom(hostServices{dawPortResolver: off}); creator != nil || support.Reason != dawport.ReasonExperimentalOff {
		t.Fatalf("experimental off: creator = %v, support = %+v", creator, support)
	}
	down := dawport.NewResolver(dawport.ResolverConfig{Adapter: fake, Experimental: func() bool { return true }})
	if creator, support := trackCreatorFrom(hostServices{dawPortResolver: down}); creator != nil || support.Reason != dawport.ReasonStandalone {
		t.Fatalf("no bridge: creator = %v, support = %+v", creator, support)
	}
	if creator, support := trackCreatorFrom(hostServices{}); creator != nil || support.Reason != dawport.ReasonStandalone {
		t.Fatalf("no resolver: creator = %v, support = %+v", creator, support)
	}
}

func TestChapterTrackCreateAnswerIsJSON(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("APPDATA", appData)
	t.Setenv("USERPROFILE", appData)
	host := newTestHost(t)
	if _, err := host.ChapterTrackCreate("c-0001"); err == nil {
		t.Fatal("a host with no project must answer an error, not a refusal")
	}
}

// go-goldens: UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/chapter-track-create-created.json and
// chapter-track-create-refused.json, the two shapes ChapterTrackCreate answers.
func TestContractChapterTrackCreate(t *testing.T) {
	pin := func(t *testing.T, name, folder string, answer any) {
		t.Helper()
		raw, err := encodeBinding(answer, nil)
		if err != nil {
			t.Fatal(err)
		}
		var payload any
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			t.Fatal(err)
		}
		stable, err := contractfile.PortablePaths(payload, folder, "C:/Projects/Alice")
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, stable)
	}
	host, ids := newTestHostForChapterMatch(t)
	folder := host.config.projectFolder
	created, err := chapterTrackCreateIn(context.Background(), host.services(), &fakeCreator{index: 3}, createAvailable(), ids[1])
	if err != nil {
		t.Fatal(err)
	}
	pin(t, "chapter-track-create-created", folder, created)

	host.dawPortResolver = dawport.NewResolver(dawport.ResolverConfig{Adapter: dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Experimental))})
	refused, err := chapterTrackCreateIn(context.Background(), host.services(), &fakeCreator{err: bridge.ErrRecording}, createAvailable(), ids[1])
	if err != nil {
		t.Fatal(err)
	}
	pin(t, "chapter-track-create-refused", folder, refused)
}
