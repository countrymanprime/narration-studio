package main

import (
	"reflect"
	"strings"
	"testing"

	abt "github.com/countrymanprime/narration-utils/shell/internal/audacitybridge/audacitybridgetest"
	"github.com/countrymanprime/narration-utils/shell/internal/findings"
)

// newAudacityReviewHost is an Audacity project whose Audacity answers (a project with one audio track, 10 to 610 s), with the
// Experimental switch on and one finding from a comparison: at 22.5 s of the project, 12.5 s into the track.
func newAudacityReviewHost(t *testing.T) *audacityLinkFixture {
	t.Helper()
	f := newAudacityLinkFixture(t)
	f.write(t, "[Module]\nmod-script-pipe=1\n")
	*f.running = true
	f.server.With(func(p *abt.Project) {
		p.AddWaveTrack("Chapter 1", 10, 610)
		p.Tracks[0].Selected = true
	})
	on := "true"
	if err := f.host.saveSettings("DAW", "global", map[string]*string{"experimental_reaper_actions": &on}); err != nil {
		t.Fatal(err)
	}
	finding := audioFinding("heard", "", seconds(12.5), seconds(12.5))
	finding.TimeRange = &findings.TimeRange{Start: 22.5, End: 22.5, SourceStart: seconds(12.5), SourceEnd: seconds(12.5)}
	finding.Source = findings.Source{File: "x.wav"}
	noTime := finding
	noTime.ID, noTime.TimeRange = "no-time", nil
	if _, err := f.host.services().findings.SaveAnalyzerFindings("transcript-compare", "chapter-1", []findings.Finding{finding, noTime}); err != nil {
		t.Fatal(err)
	}
	f.check(t)
	return f
}

func TestAudacityFindingsGoToPutTheCursorAtTheFindingsProjectTime(t *testing.T) {
	f := newAudacityReviewHost(t)
	got := bindingAnswer[FindingNavigation](t)(f.host.FindingsGoTo("heard"))
	if got.Outcome != "navigated" || got.ProjectTime == nil || *got.ProjectTime != 22.5 {
		t.Fatalf("got %+v", got)
	}
	f.server.With(func(p *abt.Project) {
		if p.SelStart != 22.5 || p.SelEnd != 22.5 {
			t.Errorf("cursor at %v-%v", p.SelStart, p.SelEnd)
		}
	})
	status := bindingAnswer[ReaperStatus](t)(f.host.FindingsReaperStatus())
	if status.Connection != reaperConnected {
		t.Errorf("status = %+v", status)
	}
}

func TestAudacityFindingsLoopAndStop(t *testing.T) {
	f := newAudacityReviewHost(t)
	got := bindingAnswer[FindingNavigation](t)(f.host.FindingsLoop("heard"))
	if got.Outcome != "looping" || got.LoopStart == nil || *got.LoopStart >= 22.5 || *got.LoopEnd <= 22.5 {
		t.Fatalf("loop = %+v", got)
	}
	status := bindingAnswer[ReaperStatus](t)(f.host.FindingsReaperStatus())
	if status.LoopingFindingID != "heard" {
		t.Errorf("looping = %q", status.LoopingFindingID)
	}
	f.server.With(func(p *abt.Project) {
		if !p.Looping {
			t.Error("Audacity is not looping")
		}
	})
	stopped := bindingAnswer[FindingNavigation](t)(f.host.FindingsStopLoop())
	if stopped.Outcome != "stopped" {
		t.Errorf("stop = %+v", stopped)
	}
	f.server.With(func(p *abt.Project) {
		if p.Looping || p.Playing {
			t.Errorf("still playing: %+v", p)
		}
	})
}

func TestAudacityFindingsAreRefusedInAudacitysWords(t *testing.T) {
	f := newAudacityReviewHost(t)
	cases := []struct {
		name string
		call func() (string, error)
		says string
	}{
		{"a finding with no time", func() (string, error) { return f.host.FindingsGoTo("no-time") }, "no place in the Audacity project"},
		{"one read of a grouped finding", func() (string, error) { return f.host.FindingsGoToRead("heard", 0) }, "keeps no separate takes"},
		{"one read to loop", func() (string, error) { return f.host.FindingsLoopRead("heard", 0) }, "keeps no separate takes"},
	}
	for _, c := range cases {
		got := bindingAnswer[FindingNavigation](t)(c.call())
		if got.Outcome != "refused" || !strings.Contains(got.Message, c.says) || strings.Contains(got.Message, "REAPER") {
			t.Errorf("%s: %+v", c.name, got)
		}
	}
	f.server.SetDown(true)
	f.check(t)
	got := bindingAnswer[FindingNavigation](t)(f.host.FindingsGoTo("heard"))
	if got.Outcome != "refused" || got.Reason != reaperNotRunning || !strings.Contains(got.Message, "Audacity") || strings.Contains(got.Message, "REAPER") {
		t.Errorf("Audacity gone: %+v", got)
	}
	if status := bindingAnswer[ReaperStatus](t)(f.host.FindingsReaperStatus()); status.Connection != reaperNotRunning || !strings.Contains(status.Message, "Audacity") {
		t.Errorf("status = %+v", status)
	}
}

func TestAudacityNavigationNeedsTheExperimentalSwitch(t *testing.T) {
	f := newAudacityReviewHost(t)
	off := "false"
	if err := f.host.saveSettings("DAW", "global", map[string]*string{"experimental_reaper_actions": &off}); err != nil {
		t.Fatal(err)
	}
	got := bindingAnswer[FindingNavigation](t)(f.host.FindingsGoTo("heard"))
	if got.Outcome != "refused" || !strings.Contains(got.Message, "Experimental") {
		t.Fatalf("got %+v", got)
	}
	f.server.With(func(p *abt.Project) {
		if p.SelStart != 0 {
			t.Errorf("the cursor moved to %v anyway", p.SelStart)
		}
	})
}

func TestAudacityFindingsAddMarkerWritesALabelAtTheFindingsTime(t *testing.T) {
	f := newAudacityReviewHost(t)
	got := bindingAnswer[FindingMarker](t)(f.host.FindingsAddMarker("heard"))
	if got.Outcome != "added" || got.Name == "" {
		t.Fatalf("got %+v", got)
	}
	var labels []abt.Label
	f.server.With(func(p *abt.Project) { labels = p.AllLabels() })
	if len(labels) != 1 || labels[0].Start != 22.5 || labels[0].Text != got.Name {
		t.Fatalf("labels = %+v, marker %+v", labels, got)
	}
	again := bindingAnswer[FindingMarker](t)(f.host.FindingsAddMarker("heard"))
	if again.Outcome != "existing" {
		t.Errorf("a second marker = %+v", again)
	}
	if none := bindingAnswer[FindingMarker](t)(f.host.FindingsAddMarker("no-time")); none.Outcome != "refused" || none.Reason != refusedNoSourceTime {
		t.Errorf("no time = %+v", none)
	}
}

func TestAudacityReviewIsGatedByTheResolver(t *testing.T) {
	f := newAudacityReviewHost(t)
	review := f.host.services().transcript
	if review == nil {
		t.Fatal("the project has no transcript service")
	}
	off := "false"
	if err := f.host.saveSettings("DAW", "global", map[string]*string{"experimental_reaper_actions": &off}); err != nil {
		t.Fatal(err)
	}
	gated := f.host.gatedAudacityReview(f.host.services().audacity)
	err := gated.PrepareReview("run1", f.host.config.projectFolder)
	if err == nil || !strings.Contains(err.Error(), "Experimental") {
		t.Fatalf("with the switch off: %v", err)
	}
	if err := gated.NavigateToFinding("run1", "x"); err == nil {
		t.Error("navigating was allowed with the switch off")
	}
	on := "true"
	_ = f.host.saveSettings("DAW", "global", map[string]*string{"experimental_reaper_actions": &on})
	if err := gated.PrepareReview("run1", f.host.config.projectFolder); err != nil {
		t.Errorf("with the switch on: %v", err)
	}
	if !reflect.DeepEqual(f.host.services().audacity != nil, true) {
		t.Error("the project lost its connection")
	}
}
