package audacity

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-studio/shell/internal/audacitybridge"
	abt "github.com/countrymanprime/narration-studio/shell/internal/audacitybridge/audacitybridgetest"
	"github.com/countrymanprime/narration-studio/shell/internal/bridge"
	"github.com/countrymanprime/narration-studio/shell/internal/dawport"
)

func placesProject(t *testing.T) (*Session, *abt.Server) {
	t.Helper()
	session, server := newSession(t)
	server.With(func(p *abt.Project) {
		p.AddWaveTrack("Chapter 1", 0, 600)
		p.AddWaveTrack("Chapter 2", 0, 450)
		p.AddWaveTrack("Chapter 1", 0, 50) // the same name again
		p.AddLabelTrack(LabelTrackName)
	})
	return session, server
}

func TestSelectTrackSelectsOnlyThatTrackByItsID(t *testing.T) {
	session, server := placesProject(t)
	server.With(func(p *abt.Project) { p.Tracks[0].Selected = true })
	got, err := session.SelectTrack(t.Context(), "audacity:Chapter 1#2")
	if err != nil || got.TrackGUID != "audacity:Chapter 1#2" {
		t.Fatalf("SelectTrack = %+v, %v", got, err)
	}
	server.With(func(p *abt.Project) {
		var sel []bool
		for _, tr := range p.Tracks {
			sel = append(sel, tr.Selected)
		}
		if !reflect.DeepEqual(sel, []bool{false, false, true, false}) {
			t.Errorf("selected = %v", sel)
		}
	})
	var stale *bridge.TrackStaleError
	if _, err := session.SelectTrack(t.Context(), "audacity:Gone"); !errors.As(err, &stale) || !errors.Is(err, bridge.ErrStale) {
		t.Errorf("a track that is gone = %v", err)
	}
	// Renaming a track makes its old id stale rather than pointing at another track.
	server.With(func(p *abt.Project) { p.Tracks[1].Name = "Renamed" })
	if _, err := session.SelectTrack(t.Context(), "audacity:Chapter 2"); !errors.As(err, &stale) {
		t.Errorf("a renamed track = %v", err)
	}
}

func TestReadPlaceNamesTheOneSelectedAudioTrackAndTheCursor(t *testing.T) {
	session, server := placesProject(t)
	ctx := t.Context()
	if place, err := session.ReadPlace(ctx); err != nil || place.TrackID != "" || place.Selected != 0 || place.Cursor != 0 {
		t.Errorf("nothing selected = %+v, %v", place, err)
	}
	server.With(func(p *abt.Project) {
		p.Tracks[1].Selected = true
		p.Tracks[3].Selected = true // a label track does not count
		p.SelStart, p.SelEnd = 12.5, 30
	})
	if place, err := session.ReadPlace(ctx); err != nil || place.TrackID != "audacity:Chapter 2" || place.Selected != 1 || place.Cursor != 12.5 {
		t.Errorf("one track = %+v, %v", place, err)
	}
	server.With(func(p *abt.Project) { p.Tracks[0].Selected = true })
	if place, err := session.ReadPlace(ctx); err != nil || place.TrackID != "" || place.Selected != 2 {
		t.Errorf("two tracks = %+v, %v", place, err)
	}
}

func TestGoToSelectsTheTrackAndPutsTheCursorAtItsEndOrATime(t *testing.T) {
	session, server := placesProject(t)
	ctx := t.Context()
	if err := session.GoTo(ctx, "audacity:Chapter 2", dawport.PlaceTarget{End: true}); err != nil {
		t.Fatal(err)
	}
	server.With(func(p *abt.Project) {
		if !p.Tracks[1].Selected || p.Tracks[0].Selected || p.SelStart != 450 || p.SelEnd != 450 {
			t.Errorf("selected %v/%v, cursor %v-%v", p.Tracks[0].Selected, p.Tracks[1].Selected, p.SelStart, p.SelEnd)
		}
	})
	if err := session.GoTo(ctx, "audacity:Chapter 1", dawport.PlaceTarget{Seconds: 123.5}); err != nil {
		t.Fatal(err)
	}
	server.With(func(p *abt.Project) {
		if p.SelStart != 123.5 || !p.Tracks[0].Selected {
			t.Errorf("cursor %v, track 0 selected %v", p.SelStart, p.Tracks[0].Selected)
		}
	})
	if err := session.GoTo(ctx, "", dawport.PlaceTarget{}); err == nil {
		t.Error("no track accepted")
	}
	if err := session.GoTo(ctx, "audacity:Chapter 1", dawport.PlaceTarget{Seconds: -1}); !errors.Is(err, audacitybridge.ErrInvalidValue) {
		t.Errorf("a negative time = %v", err)
	}
	var stale *bridge.TrackStaleError
	if err := session.GoTo(ctx, "audacity:Gone", dawport.PlaceTarget{}); !errors.As(err, &stale) {
		t.Errorf("a track that is gone = %v", err)
	}
}

func TestChapterTrackStateReadsTheTrackAndWhatTheAppStarted(t *testing.T) {
	session, server := placesProject(t)
	ctx := t.Context()
	server.With(func(p *abt.Project) { p.Tracks[1].Selected = true; p.SelStart, p.SelEnd = 7, 7 })
	state, err := session.ChapterTrackState(ctx, "audacity:Chapter 2")
	if err != nil {
		t.Fatal(err)
	}
	if !state.TrackArmed || state.ArmedCount != 1 || state.EditCursor != 7 || state.Playing || state.Recording || state.PlayState != 0 || state.ProjectPath != "" || state.ItemsTotal != 1 {
		t.Errorf("state = %+v", state)
	}
	if len(state.Items) != 1 || state.Items[0].ItemGUID != "audacity:Chapter 2@0" || state.Items[0].Length != 450 || state.Items[0].PlayRate != 1 {
		t.Errorf("items = %+v", state.Items)
	}
	// Without a track: the selection and the cursor only.
	bare, err := session.ChapterTrackState(ctx, "")
	if err != nil || bare.TrackGUID != "" || bare.ArmedCount != 1 || len(bare.Items) != 0 {
		t.Errorf("bare = %+v, %v", bare, err)
	}
	// A loop the app started is the only play state it can know of; a recording makes navigation refuse.
	session.transport.set(true, false)
	if state, _ = session.ChapterTrackState(ctx, "audacity:Chapter 2"); !state.Playing || state.PlayState != 1 {
		t.Errorf("playing = %+v", state)
	}
	session.transport.set(true, true)
	if state, _ = session.ChapterTrackState(ctx, "audacity:Chapter 2"); !state.Recording || state.PlayState != 5 {
		t.Errorf("recording = %+v", state)
	}
	target := 5.0
	if _, err := session.Navigate(ctx, dawport.Target{SourceStart: &target}); !errors.Is(err, bridge.ErrRecording) {
		t.Errorf("navigating while recording = %v", err)
	}
	if _, err := session.Loop(ctx, dawport.Target{SourceStart: &target}); !errors.Is(err, bridge.ErrRecording) {
		t.Errorf("looping while recording = %v", err)
	}
	if _, err := session.StopLoop(ctx); !errors.Is(err, bridge.ErrRecording) {
		t.Errorf("stopping a loop while recording = %v", err)
	}
	var stale *bridge.TrackStaleError
	if _, err := session.ChapterTrackState(ctx, "audacity:Gone"); !errors.As(err, &stale) {
		t.Errorf("a track that is gone = %v", err)
	}
}

func TestLoopAndStopKeepTheAppsPlayStateInStep(t *testing.T) {
	session, _ := placesProject(t)
	ctx := t.Context()
	target := 100.0
	if _, err := session.Loop(ctx, dawport.Target{SourceStart: &target}); err != nil {
		t.Fatal(err)
	}
	if playing, recording := session.transport.snapshot(); !playing || recording {
		t.Errorf("after a loop: playing=%v recording=%v", playing, recording)
	}
	if _, err := session.StopLoop(ctx); err != nil {
		t.Fatal(err)
	}
	if playing, recording := session.transport.snapshot(); playing || recording {
		t.Errorf("after stop: playing=%v recording=%v", playing, recording)
	}
}

func regionRows(rows ...dawport.Region) []dawport.Region { return rows }

func TestCreateRegionsMakesRangeLabelsOnceAndMovesThemOnUpdate(t *testing.T) {
	session, server := placesProject(t)
	ctx := t.Context()
	rows := regionRows(dawport.Region{Start: 0, End: 600, Title: "Chapter 1"}, dawport.Region{Start: 600, End: 1050, Title: "Chapter 2"})
	got, err := session.CreateRegions(ctx, rows, "FF0000", false)
	if err != nil || got != (dawport.RegionsCreated{Created: 2}) {
		t.Fatalf("first = %+v, %v", got, err)
	}
	var labels []abt.Label
	server.With(func(p *abt.Project) { labels = p.AllLabels() })
	want := []abt.Label{{Start: 0, End: 600, Text: "[nu:region] Chapter 1"}, {Start: 600, End: 1050, Text: "[nu:region] Chapter 2"}}
	if !reflect.DeepEqual(labels, want) {
		t.Errorf("labels = %+v", labels)
	}
	// The same rows again: nothing new, within the tolerance.
	again := regionRows(dawport.Region{Start: 0.005, End: 600, Title: "Chapter 1"}, rows[1])
	if got, err := session.CreateRegions(ctx, again, "", false); err != nil || got != (dawport.RegionsCreated{Existing: 2}) {
		t.Errorf("second = %+v, %v", got, err)
	}
	// Without update a moved chapter makes a second region; with it, the one is moved.
	moved := regionRows(dawport.Region{Start: 0, End: 640, Title: "Chapter 1"})
	if got, _ := session.CreateRegions(ctx, moved, "", true); got != (dawport.RegionsCreated{Updated: 1}) {
		t.Errorf("update = %+v", got)
	}
	server.With(func(p *abt.Project) { labels = p.AllLabels() })
	if len(labels) != 2 || labels[0].End != 640 || labels[0].Text != "[nu:region] Chapter 1" {
		t.Errorf("after the move = %+v", labels)
	}
	// A title two labels hold is left alone.
	server.With(func(p *abt.Project) {
		p.Tracks[3].Labels = append(p.Tracks[3].Labels, abt.Label{Start: 700, End: 800, Text: "[nu:region] Chapter 2"})
	})
	if got, _ := session.CreateRegions(ctx, regionRows(dawport.Region{Start: 1, End: 2, Title: "Chapter 2"}), "", true); got != (dawport.RegionsCreated{Ambiguous: 1}) {
		t.Errorf("ambiguous = %+v", got)
	}
}

func TestCreateRegionsCountsWhatItCannotUseAndRefusesABadColour(t *testing.T) {
	session, server := placesProject(t)
	ctx := t.Context()
	bad := regionRows(
		dawport.Region{Start: 5, End: 5, Title: "empty range"},
		dawport.Region{Start: 9, End: 3, Title: "backwards"},
		dawport.Region{Start: -1, End: 3, Title: "negative"},
		dawport.Region{Start: 0, End: 10, Title: "   "},
		dawport.Region{Start: 0, End: 10, Title: "Café \"quoted\" 🦎 שלום"},
	)
	got, err := session.CreateRegions(ctx, bad, "", false)
	if err != nil || got.Invalid != 4 || got.Created != 1 {
		t.Fatalf("got %+v, %v", got, err)
	}
	var texts []string
	server.With(func(p *abt.Project) {
		for _, l := range p.AllLabels() {
			texts = append(texts, l.Text)
		}
	})
	if len(texts) != 1 || !strings.HasPrefix(texts[0], "[nu:region] Café ”quoted” 🦎") {
		t.Errorf("labels = %q", texts)
	}
	for _, colour := range []string{"red", "FF00", "GG0000", "#FF0000"} {
		if _, err := session.CreateRegions(ctx, nil, colour, false); !errors.Is(err, bridge.ErrBadRegions) {
			t.Errorf("colour %q = %v", colour, err)
		}
	}
	server.SetDown(true)
	if _, err := session.CreateRegions(ctx, regionRows(dawport.Region{Start: 0, End: 1, Title: "x"}), "", false); err == nil {
		t.Error("closed Audacity did not fail")
	}
}
