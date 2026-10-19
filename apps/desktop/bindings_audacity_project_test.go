package main

import (
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"os"
	"path/filepath"
	"strings"
	"testing"

	abt "github.com/countrymanprime/narration-utils/shell/internal/audacitybridge/audacitybridgetest"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/audacity"
)

func TestTheHeartbeatWritesTheAudacitySnapshotOnlyWhenTheProjectChanged(t *testing.T) {
	f := newAudacityReviewHost(t)
	folder := f.host.services().config.projectFolder
	path := audacity.SnapshotPath(folder)
	// newAudacityReviewHost checked once with Audacity answering: the snapshot is there.
	first, err := os.Stat(path)
	if err != nil {
		t.Fatalf("no snapshot after the first check: %v", err)
	}
	snap, err := audacity.ReadSnapshot(path)
	if err != nil || len(snap.Tracks) != 1 || snap.Tracks[0].Name != "Chapter 1" {
		t.Fatalf("snapshot = %+v, %v", snap, err)
	}
	// A check with nothing changed leaves the file alone; a selection change is not a change.
	f.server.With(func(p *abt.Project) { p.Tracks[0].Selected = !p.Tracks[0].Selected })
	f.check(t)
	if again, _ := os.Stat(path); !again.ModTime().Equal(first.ModTime()) {
		t.Error("an unchanged project rewrote the snapshot")
	}
	f.server.With(func(p *abt.Project) { p.AddWaveTrack("Chapter 2", 0, 300) })
	f.check(t)
	if snap, err = audacity.ReadSnapshot(path); err != nil || len(snap.Tracks) != 2 {
		t.Errorf("after adding a track: %+v, %v", snap, err)
	}
	// With Audacity closed nothing is written and the last snapshot stays.
	f.server.SetDown(true)
	f.check(t)
	if snap, err = audacity.ReadSnapshot(path); err != nil || len(snap.Tracks) != 2 {
		t.Errorf("after closing Audacity: %+v, %v", snap, err)
	}
}

func TestAnAudacityProjectsTracksAreTheSnapshotsAndNotAnRppSearch(t *testing.T) {
	f := newAudacityReviewHost(t)
	svc := f.host.services()
	candidates, selected, err := discoverProjectFiles(svc.config.projectFolder, svc.settings)
	if err != nil {
		t.Fatal(err)
	}
	path := audacity.SnapshotPath(svc.config.projectFolder)
	if len(candidates) != 1 || candidates[0] != path || selected != path {
		t.Fatalf("candidates %v, selected %q", candidates, selected)
	}
	project, err := f.host.tracksList()
	if err != nil || len(project.Tracks) != 1 || project.Tracks[0].GUID != "audacity:Chapter 1" || len(project.Tracks[0].Items) != 1 {
		t.Fatalf("tracks = %+v, %v", project, err)
	}
	// A project that chose another engine does not read a snapshot left from when it was Audacity.
	other := "reaper"
	if err := svc.settings.Save(recordingSettingsTool, "project", map[string]*string{recordingEngineKey: &other}); err != nil {
		t.Fatal(err)
	}
	if _, selected, _ = discoverProjectFiles(svc.config.projectFolder, svc.settings); selected == path {
		t.Error("a REAPER project read an Audacity snapshot")
	}
}

func TestAProjectWithNoChoiceAndNoRppReadsItsSnapshot(t *testing.T) {
	f := newAudacityReviewHost(t)
	svc := f.host.services()
	if err := svc.settings.Save(recordingSettingsTool, "project", map[string]*string{recordingEngineKey: nil}); err != nil {
		t.Fatal(err)
	}
	if selected := audacitySnapshotFor(svc.config.projectFolder, svc.settings); selected == "" {
		t.Error("a project with no engine choice and no .rpp did not find its snapshot")
	}
	if err := os.WriteFile(filepath.Join(svc.config.projectFolder, "Book.rpp"), []byte("<REAPER_PROJECT 0.1 \"7.0\" 1\n>\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if selected := audacitySnapshotFor(svc.config.projectFolder, svc.settings); selected != "" {
		t.Errorf("a folder with an .rpp and no engine choice read the snapshot: %q", selected)
	}
}

func TestSelectInAudacityAndGoToAChapterUseTheAudacityRoles(t *testing.T) {
	f := newAudacityReviewHost(t)
	f.server.With(func(p *abt.Project) {
		p.AddWaveTrack("Chapter 2", 0, 300)
		p.Tracks[0].Selected = false
	})
	svc := f.host.services()
	selector := trackSelectorFrom(svc)
	if selector == nil {
		t.Fatal("no track-select role for an Audacity project")
	}
	result, err := trackSelectInReaperIn(t.Context(), svc, selector, "audacity:Chapter 2")
	if err != nil || result.Outcome != "selected" || result.TrackGUID != "audacity:Chapter 2" {
		t.Fatalf("select = %+v, %v", result, err)
	}
	f.server.With(func(p *abt.Project) {
		if p.Tracks[0].Selected || !p.Tracks[1].Selected {
			t.Errorf("selected %v/%v", p.Tracks[0].Selected, p.Tracks[1].Selected)
		}
	})
	gone, err := trackSelectInReaperIn(t.Context(), svc, selector, "audacity:Gone")
	if err != nil || gone.Outcome != "refused" || !strings.Contains(gone.Message, "no longer in the Audacity project") || strings.Contains(gone.Message, "REAPER") {
		t.Errorf("stale select = %+v, %v", gone, err)
	}
	if svc.placeFollower == nil {
		t.Fatal("no follow-position role for an Audacity project")
	}
	place, err := svc.placeFollower.ReadPlace(t.Context())
	if err != nil || place.TrackID != "audacity:Chapter 2" || place.Selected != 1 {
		t.Errorf("place = %+v, %v", place, err)
	}
}

func TestInAudacityWordsKeepsTheSwitchesName(t *testing.T) {
	for in, want := range map[string]string{
		"This track is no longer in the REAPER project.":                        "This track is no longer in the Audacity project.",
		"Turn on Experimental REAPER actions in Settings. REAPER is not there.": "Turn on Experimental REAPER actions in Settings. Audacity is not there.",
		"": "",
		"Experimental REAPER actions, then REAPER, then Experimental REAPER actions and REAPER": "Experimental REAPER actions, then Audacity, then Experimental REAPER actions and Audacity",
	} {
		if got := inAudacityWords(in); got != want {
			t.Errorf("%q = %q, want %q", in, got, want)
		}
	}
}

func TestChapterRegionsForAnAudacityProjectAreRangeLabels(t *testing.T) {
	f := newAudacityReviewHost(t)
	svc := f.host.services()
	creator, err := dawport.Role[dawport.RegionWriter](svc.dawPortResolver, dawport.CapRegions)
	if err != nil {
		t.Fatalf("no regions role: %v", err)
	}
	got, err := creator.CreateRegions(t.Context(), []dawport.Region{{Start: 10, End: 610, Title: "Chapter 1"}}, "", false)
	if err != nil || got.Created != 1 {
		t.Fatalf("created = %+v, %v", got, err)
	}
	var labels []abt.Label
	f.server.With(func(p *abt.Project) { labels = p.AllLabels() })
	if len(labels) != 1 || labels[0].Text != "[nu:region] Chapter 1" || labels[0].Start != 10 || labels[0].End != 610 {
		t.Fatalf("labels = %+v", labels)
	}
	// The next snapshot reads it back as a region, so the chapter-regions plan sees it as existing.
	f.check(t)
	project, err := f.host.tracksList()
	if err != nil || len(project.Regions) != 1 || project.Regions[0].Name != "Chapter 1" {
		t.Errorf("regions read back = %+v, %v", project.Regions, err)
	}
}
