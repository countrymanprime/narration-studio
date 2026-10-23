package main

import (
	"context"
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/zerocross"
)

// workspaceSnapHost is a host whose chapter c-0001 was checked over workspacePeaksProject (a 220 Hz sine at 8 kHz on
// item {ITEM-1}, a crossing every ~2.27 ms), with the project folder for tests that change its files.
func workspaceSnapHost(t *testing.T) (*Host, string) {
	t.Helper()
	project := workspacePeaksProject(t)
	host := coverageHost(t, project, true, fakeAlignedCoverageSidecar())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()
	return host, project
}

// spyDecoder records every window asked for and answers it from the real file.
type spyDecoder struct{ paths []string }

func (s *spyDecoder) Window(ctx context.Context, path string, start, length float64) (zerocross.Window, error) {
	s.paths = append(s.paths, path)
	return zerocross.FileDecoder{}.Window(ctx, path, start, length)
}

func TestWorkspaceSnapMovesACutToTheNearestCrossingInSourceSeconds(t *testing.T) {
	host, _ := workspaceSnapHost(t)

	got := bindingAnswer[WorkspaceSnapResult](t)(host.WorkspaceSnap("c-0001", "{ITEM-1}", 1.0013))

	if got.Outcome != snapOutcomeSnapped || got.Reason != "" || got.ChapterID != "c-0001" || got.ItemGUID != "{ITEM-1}" {
		t.Fatalf("got = %+v", got)
	}
	if math.Abs(got.Moved) > zerocross.MaxShift || got.Moved == 0 || math.Abs(got.Time-got.SourceTime-got.Moved) > 1e-12 {
		t.Fatalf("moved = %v to %v", got.Moved, got.Time)
	}
	if frame := got.Time * 8000; math.Abs(frame-math.Round(frame)) > 1e-6 {
		t.Fatalf("time %v is not on an 8 kHz sample", got.Time)
	}
}

func TestWorkspaceSnapRefusesAStaleOrMissingItemAndReadsNothing(t *testing.T) {
	host, project := workspaceSnapHost(t)

	cases := []struct {
		name, chapter, item, reason string
	}{
		{"an item the project no longer has", "c-0001", "{ITEM-GONE}", refusedStale},
		{"a chapter with no checked track", "c-0002", "{ITEM-1}", refusedNoTrack},
		// binding-takes-no-path: a path-shaped GUID is an unknown item, never opened.
		{"a path-shaped item guid", "c-0001", filepath.Join(project, "media", "take.wav"), refusedStale},
		{"a relative path", "c-0001", "media/take.wav", refusedStale},
	}
	for _, c := range cases {
		spy := &spyDecoder{}
		got := bindingAnswer[WorkspaceSnapResult](t)(host.workspaceSnap(spy, c.chapter, c.item, 1.5))
		if got.Outcome != snapOutcomeRefused || got.Reason != c.reason || got.Message == "" || got.Time != 1.5 || got.Moved != 0 {
			t.Fatalf("%s: got = %+v", c.name, got)
		}
		if len(spy.paths) != 0 {
			t.Fatalf("%s: read %v", c.name, spy.paths)
		}
	}

	if err := os.Remove(filepath.Join(project, "media", "take.wav")); err != nil {
		t.Fatal(err)
	}
	spy := &spyDecoder{}
	got := bindingAnswer[WorkspaceSnapResult](t)(host.workspaceSnap(spy, "c-0001", "{ITEM-1}", 1.5))
	if got.Outcome != snapOutcomeRefused || got.Reason != refusedSnapNoAudio || got.Message != messageSnapNoSource || len(spy.paths) != 0 {
		t.Fatalf("missing file: got = %+v, read %v", got, spy.paths)
	}
}

func TestWorkspaceSnapOfAnAudioWindowItCannotUseLeavesTheTime(t *testing.T) {
	host, project := workspaceSnapHost(t)
	wav := filepath.Join(project, "media", "take.wav")

	// Past the 4 s source's end.
	got := bindingAnswer[WorkspaceSnapResult](t)(host.WorkspaceSnap("c-0001", "{ITEM-1}", 9))
	if got.Outcome != snapOutcomeRefused || got.Reason != refusedSnapNoAudio || got.Time != 9 {
		t.Fatalf("past the end: %+v", got)
	}

	// The placeholder bytes coverageProject writes: a file, but not a WAV.
	if err := os.WriteFile(wav, []byte("RIFF audio"), 0o600); err != nil {
		t.Fatal(err)
	}
	got = bindingAnswer[WorkspaceSnapResult](t)(host.WorkspaceSnap("c-0001", "{ITEM-1}", 1))
	if got.Outcome != snapOutcomeRefused || got.Reason != refusedSnapNoAudio || got.Message != messageSnapNotWAV {
		t.Fatalf("not a WAV: %+v", got)
	}
}

func TestWorkspaceSnapRefusesABadTimeAndNoProject(t *testing.T) {
	host, _ := workspaceSnapHost(t)
	for _, bad := range []float64{-1, math.NaN(), math.Inf(1)} {
		if _, err := host.WorkspaceSnap("c-0001", "{ITEM-1}", bad); !errors.Is(err, zerocross.ErrBadTime) {
			t.Fatalf("snap(%v) err = %v", bad, err)
		}
	}
	if _, err := NewHost().WorkspaceSnap("c-0001", "{ITEM-1}", 1); err != errNoProject {
		t.Fatalf("no project err = %v", err)
	}
}
