package dawport

import "time"

// ProjectState is the DAW project as last saved against the live one (the DawProjectState binding and its
// daw_project_state_changed event, apps/desktop/bindings_daw_projectstate.go). It is assembled from what the host already
// has, with no command of its own: the saved file's modification time (a host-side stat), REAPER's edit counter and
// transport from the heartbeat (ADR 0211, ADR 0305).
type ProjectState struct {
	// SavedAt is when the project file was last written, as a local date and time to the minute ("2006-01-02T15:04"), or
	// nil when the DAW keeps no saved project or this one was never saved.
	SavedAt *string `json:"savedAt"`
	// UnsavedChanges is true when the DAW has edits its saved file does not have yet.
	UnsavedChanges bool `json:"unsavedChanges"`
	// PlayState is PlayStopped, PlayPlaying or PlayRecording.
	PlayState string `json:"playState"`
	// PlayPosition is project seconds as of the last heartbeat (about 1.5 s apart), 0 while stopped. It is for display:
	// nothing anchors a word to it.
	PlayPosition float64 `json:"playPosition"`
}

// The play states ProjectState.PlayState holds.
const (
	PlayStopped   = "stopped"
	PlayPlaying   = "playing"
	PlayRecording = "recording"
)

// savedAtLayout is the mock's local date-time to the minute (docs/research/mockups/studio-next/src/fixtures/daw.ts).
const savedAtLayout = "2006-01-02T15:04"

// ProjectStateInput is what NewProjectState reads. The caller gathers it from the heartbeat, a stat of the saved file and
// an UnsavedTracker.
type ProjectStateInput struct {
	// KeepsSavedProject is false for a DAW with no project file (the built-in recorder): SavedAt and UnsavedChanges are
	// then ignored.
	KeepsSavedProject bool
	// SavedAt is the saved file's modification time, nil when there is none.
	SavedAt *time.Time
	// UnsavedChanges is the tracker's answer.
	UnsavedChanges bool
	// Transport is the heartbeat's transport; HasTransport is false when none is known.
	Transport    Transport
	HasTransport bool
}

// NewProjectState assembles the payload. Recording wins over playing (REAPER's play bit is set while recording too).
func NewProjectState(in ProjectStateInput) ProjectState {
	state := ProjectState{PlayState: PlayStopped}
	if in.KeepsSavedProject {
		if in.SavedAt != nil {
			formatted := in.SavedAt.Local().Format(savedAtLayout)
			state.SavedAt = &formatted
		}
		state.UnsavedChanges = in.UnsavedChanges
	}
	if !in.HasTransport {
		return state
	}
	switch {
	case in.Transport.Recording:
		state.PlayState = PlayRecording
	case in.Transport.Playing:
		state.PlayState = PlayPlaying
	default:
		return state
	}
	state.PlayPosition = in.Transport.Position
	return state
}

// UnsavedTracker answers whether the DAW has edits its saved file does not have, from the edit counter the heartbeat
// carries. Neither the heartbeat's nor chapter_track_state's "unsaved" field says this: both mean "never saved" (an
// empty .rpp path). The counter rises on every edit, saved or not, so the tracker keeps a baseline, taken at the first
// count it sees and again whenever the saved file's modification time moves (a save), and counts any other value as
// unsaved edits. The same rule chaptersync_watch.go uses for unsavedEdits (ADR 0210). A tracker is not safe for
// concurrent use; the caller holds its own lock.
type UnsavedTracker struct {
	path    string
	savedAt time.Time
	base    int
	hasBase bool
	unsaved bool
}

// Observe records one look: path and savedAt are the open project's saved file and its modification time (path empty
// when never saved), count and counted the heartbeat's edit counter. A different path, a moved modification time, a
// missing counter or a counter that went down (the project reopened) start a new baseline.
func (t *UnsavedTracker) Observe(path string, savedAt time.Time, count int, counted bool) bool {
	switch {
	case path == "" || !counted:
		*t = UnsavedTracker{}
		return false
	case !t.hasBase || path != t.path || !savedAt.Equal(t.savedAt) || count < t.base:
		*t = UnsavedTracker{path: path, savedAt: savedAt, base: count, hasBase: true}
		return false
	case count != t.base:
		t.unsaved = true
	}
	return t.unsaved
}
