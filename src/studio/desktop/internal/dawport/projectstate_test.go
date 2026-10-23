package dawport

import (
	"testing"
	"time"
)

func savedAt(value string) *string { return &value }

// project-state-assembles-from-what-exists: the saved file's modification time (local date-time), the live-edit flag and
// the heartbeat transport, with playState stopped, playing or recording.
func TestNewProjectStateAssemblesFromWhatExists(t *testing.T) {
	saved := time.Date(2026, 9, 26, 8, 40, 31, 0, time.Local)
	cases := []struct {
		name string
		in   ProjectStateInput
		want ProjectState
	}{
		{"no transport", ProjectStateInput{KeepsSavedProject: true}, ProjectState{PlayState: PlayStopped}},
		{"saved and clean, stopped", ProjectStateInput{KeepsSavedProject: true, SavedAt: &saved, HasTransport: true, Transport: Transport{Position: 3}},
			ProjectState{SavedAt: savedAt("2026-09-26T08:40"), PlayState: PlayStopped}},
		{"saved with live changes, playing", ProjectStateInput{KeepsSavedProject: true, SavedAt: &saved, UnsavedChanges: true, HasTransport: true, Transport: Transport{Playing: true, Position: 12.5}},
			ProjectState{SavedAt: savedAt("2026-09-26T08:40"), UnsavedChanges: true, PlayState: PlayPlaying, PlayPosition: 12.5}},
		{"recording counts over playing", ProjectStateInput{KeepsSavedProject: true, SavedAt: &saved, HasTransport: true, Transport: Transport{Playing: true, Recording: true, Position: 40}},
			ProjectState{SavedAt: savedAt("2026-09-26T08:40"), PlayState: PlayRecording, PlayPosition: 40}},
		{"a paused recording is recording", ProjectStateInput{KeepsSavedProject: true, HasTransport: true, Transport: Transport{Recording: true, Position: 7}},
			ProjectState{PlayState: PlayRecording, PlayPosition: 7}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := NewProjectState(c.in); !equalProjectState(got, c.want) {
				t.Fatalf("NewProjectState(%+v) = %+v, want %+v", c.in, got, c.want)
			}
		})
	}
}

// no-saved-project-is-null: a DAW that keeps no saved project (the built-in recorder) never has savedAt or unsaved
// changes, and a project never saved (no modification time) has savedAt null.
func TestNewProjectStateWithoutASavedProjectIsNull(t *testing.T) {
	saved := time.Date(2026, 9, 26, 8, 40, 0, 0, time.Local)
	builtin := NewProjectState(ProjectStateInput{KeepsSavedProject: false, SavedAt: &saved, UnsavedChanges: true, HasTransport: true, Transport: Transport{Recording: true, Position: 2}})
	if builtin.SavedAt != nil || builtin.UnsavedChanges {
		t.Fatalf("a DAW that keeps no saved project = %+v, want savedAt null and no unsaved changes", builtin)
	}
	if builtin.PlayState != PlayRecording {
		t.Fatalf("the transport still reads without a saved project: %+v", builtin)
	}
	neverSaved := NewProjectState(ProjectStateInput{KeepsSavedProject: true, UnsavedChanges: true})
	if neverSaved.SavedAt != nil {
		t.Fatalf("a project never saved = %+v, want savedAt null", neverSaved)
	}
}

// play-position-is-not-trusted-as-an-anchor: the position is a display value sent only while playing or recording; stopped
// reads 0 whatever the last heartbeat said.
func TestNewProjectStatePositionOnlyWhileMoving(t *testing.T) {
	got := NewProjectState(ProjectStateInput{KeepsSavedProject: true, HasTransport: true, Transport: Transport{Position: 99}})
	if got.PlayPosition != 0 {
		t.Fatalf("stopped playPosition = %v, want 0", got.PlayPosition)
	}
}

func TestUnsavedTrackerFollowsTheEditCounterSinceTheLastSave(t *testing.T) {
	const rpp = "C:/Projects/Alice/Alice.rpp"
	first := time.Date(2026, 9, 26, 8, 40, 0, 0, time.UTC)
	later := first.Add(time.Minute)
	var tracker UnsavedTracker
	steps := []struct {
		name    string
		path    string
		saved   time.Time
		count   int
		counted bool
		want    bool
	}{
		{"the first count is the baseline", rpp, first, 7, true, false},
		{"an edit since", rpp, first, 8, true, true},
		{"still unsaved", rpp, first, 9, true, true},
		{"a save moves the modification time", rpp, later, 9, true, false},
		{"an edit after the save", rpp, later, 10, true, true},
		{"no counter: nothing is known", rpp, later, 0, false, false},
		{"a counter again is a new baseline", rpp, later, 10, true, false},
		{"the project reopened (the counter restarts)", rpp, later, 2, true, false},
		{"an edit after reopening", rpp, later, 3, true, true},
		{"another project", "C:/Projects/Bob/Bob.rpp", later, 3, true, false},
		{"never saved", "", time.Time{}, 4, true, false},
	}
	for _, s := range steps {
		if got := tracker.Observe(s.path, s.saved, s.count, s.counted); got != s.want {
			t.Fatalf("%s: Observe = %v, want %v", s.name, got, s.want)
		}
	}
}

func equalProjectState(a, b ProjectState) bool {
	if (a.SavedAt == nil) != (b.SavedAt == nil) || (a.SavedAt != nil && *a.SavedAt != *b.SavedAt) {
		return false
	}
	return a.UnsavedChanges == b.UnsavedChanges && a.PlayState == b.PlayState && a.PlayPosition == b.PlayPosition
}
