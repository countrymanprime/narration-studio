package audacity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// An Audacity project is a SQLite file (.aup3) the app does not read, and scripting reports no project path, so the saved project
// the rest of the app reads offline (the track list, the chapter links, the recorded lengths, the regions and pickup markers the
// readiness signals count) is a snapshot: whenever Audacity answers, the host writes the tracks, clips and labels GetInfo reports
// into narration-utils/audacity-snapshot.json, and SnapshotReader turns that file into the same tracks.Project a REAPER .rpp
// becomes (docs/reference/daw/audacity-3.md, "The snapshot"). It is only as fresh as the last time Audacity was answering.

// SnapshotFile is the snapshot's file name inside the project's narration-utils folder.
const SnapshotFile = "audacity-snapshot.json"

// SnapshotVersion is the file's schema version; a newer one is refused, never read as this one.
const SnapshotVersion = 1

// SnapshotPath is where the project's snapshot lives.
func SnapshotPath(project string) string {
	return filepath.Join(project, "narration-utils", SnapshotFile)
}

// IsSnapshot reports whether path names a snapshot file, which is how the offline readers tell it from a REAPER .rpp.
func IsSnapshot(path string) bool { return filepath.Base(path) == SnapshotFile }

// Snapshot is what GetInfo reported at TakenAt: the audio tracks with their clips, and every label.
type Snapshot struct {
	Version int             `json:"version"`
	TakenAt time.Time       `json:"takenAt"`
	Tracks  []SnapshotTrack `json:"tracks"`
	Labels  []SnapshotLabel `json:"labels"`
}

// SnapshotTrack is one audio track. Index is its place among all the project's tracks, as GetInfo numbers them.
type SnapshotTrack struct {
	Index    int            `json:"index"`
	Name     string         `json:"name"`
	Selected bool           `json:"selected"`
	Start    float64        `json:"start"`
	End      float64        `json:"end"`
	Channels int            `json:"channels"`
	Clips    []SnapshotClip `json:"clips"`
}

// SnapshotClip is one clip of a track, in project seconds.
type SnapshotClip struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Name  string  `json:"name"`
}

// SnapshotLabel is one label on a label track.
type SnapshotLabel struct {
	Track int     `json:"track"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Text  string  `json:"text"`
}

// TakeSnapshot reads the project's tracks, clips and labels (three GetInfo commands).
func (s *Session) TakeSnapshot(ctx context.Context, now time.Time) (Snapshot, error) {
	infos, err := s.client.Tracks(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	clips, err := s.client.Clips(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	labels, err := s.client.Labels(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	snap := Snapshot{Version: SnapshotVersion, TakenAt: now.UTC(), Tracks: []SnapshotTrack{}, Labels: []SnapshotLabel{}}
	for _, t := range infos {
		if t.Kind != "wave" {
			continue
		}
		track := SnapshotTrack{Index: t.Index, Name: t.Name, Selected: t.Selected, Start: t.Start, End: t.End, Channels: t.Channels, Clips: []SnapshotClip{}}
		for _, c := range clips {
			if c.Track == t.Index {
				track.Clips = append(track.Clips, SnapshotClip{Start: c.Start, End: c.End, Name: c.Name})
			}
		}
		snap.Tracks = append(snap.Tracks, track)
	}
	for _, l := range labels {
		snap.Labels = append(snap.Labels, SnapshotLabel{Track: l.Track, Start: l.Start, End: l.End, Text: l.Text})
	}
	return snap, nil
}

// Same reports whether two snapshots describe the same project, ignoring when they were taken and which track is selected.
func (a Snapshot) Same(b Snapshot) bool {
	a.TakenAt, b.TakenAt = time.Time{}, time.Time{}
	for i := range a.Tracks {
		a.Tracks[i].Selected = false
	}
	for i := range b.Tracks {
		b.Tracks[i].Selected = false
	}
	x, errA := json.Marshal(a)
	y, errB := json.Marshal(b)
	return errA == nil && errB == nil && string(x) == string(y)
}

// WriteSnapshot writes snap to path through a temporary file and a rename, so a reader never sees half of it.
func WriteSnapshot(path string, snap Snapshot) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(snap, "", " ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".audacity-snapshot-*.tmp")
	if err != nil {
		return err
	}
	_, werr := tmp.Write(data)
	cerr := tmp.Close()
	if err := errors.Join(werr, cerr); err != nil {
		_ = os.Remove(tmp.Name())
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		_ = os.Remove(tmp.Name())
		return err
	}
	return nil
}

// maxSnapshotBytes bounds what the reader takes: a long book is some thousand clips and labels, far under this.
const maxSnapshotBytes = 32 << 20

// ReadSnapshot reads and checks a snapshot file: a newer version, a non-finite time or an inverted range is refused.
func ReadSnapshot(path string) (Snapshot, error) {
	info, err := os.Stat(path)
	if err != nil {
		return Snapshot{}, err
	}
	if info.Size() > maxSnapshotBytes {
		return Snapshot{}, fmt.Errorf("the Audacity snapshot is too large to read (%d bytes)", info.Size())
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Snapshot{}, err
	}
	var snap Snapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		return Snapshot{}, fmt.Errorf("the Audacity snapshot could not be read: %w", err)
	}
	if snap.Version > SnapshotVersion {
		return Snapshot{}, fmt.Errorf("the Audacity snapshot was written by a newer version of this app (version %d)", snap.Version)
	}
	finite := func(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 }
	for _, t := range snap.Tracks {
		if !finite(t.Start) || !finite(t.End) || t.End < t.Start {
			return Snapshot{}, fmt.Errorf("the Audacity snapshot has a track (%q) with a bad time range", t.Name)
		}
		for _, c := range t.Clips {
			if !finite(c.Start) || !finite(c.End) || c.End < c.Start {
				return Snapshot{}, fmt.Errorf("the Audacity snapshot has a clip on %q with a bad time range", t.Name)
			}
		}
	}
	for _, l := range snap.Labels {
		if !finite(l.Start) || !finite(l.End) || l.End < l.Start {
			return Snapshot{}, errors.New("the Audacity snapshot has a label with a bad time range")
		}
	}
	return snap, nil
}

// Audacity gives a track no id, so the app makes one from what is stable: the track's name, and for a second track of the same name
// its place among them. A clip's id is its track's id and its start in milliseconds. A caller finds the track or clip again by
// reading the project and matching the id, and refuses (stale) when no one matches.
const (
	trackIDPrefix = "audacity:"
	clipIDMark    = "@"
)

// TrackIDs names each of tracks, in order: `audacity:<name>`, with `#2`, `#3` for a name that repeats.
func TrackIDs(names []string) []string {
	seen := map[string]int{}
	ids := make([]string, len(names))
	for i, name := range names {
		seen[name]++
		ids[i] = trackIDPrefix + name
		if seen[name] > 1 {
			ids[i] += fmt.Sprintf("#%d", seen[name])
		}
	}
	return ids
}

// ClipID is the id of the clip on trackID that starts at start seconds.
func ClipID(trackID string, start float64) string {
	return fmt.Sprintf("%s%s%d", trackID, clipIDMark, int64(math.Round(start*1000)))
}

// SplitClipID returns the track id and start (milliseconds) of a clip id; ok is false for any other string.
func SplitClipID(id string) (trackID string, startMs int64, ok bool) {
	i := strings.LastIndex(id, clipIDMark)
	if i < 0 || !strings.HasPrefix(id, trackIDPrefix) {
		return "", 0, false
	}
	var ms int64
	if _, err := fmt.Sscanf(id[i+1:], "%d", &ms); err != nil {
		return "", 0, false
	}
	return id[:i], ms, true
}

// regionLabel marks a range label as a chapter or credits region the app made (see Regions).
var regionPrefix = "[nu:region] "

// SnapshotReader is the project_read role over a snapshot file (dawport.ProjectReader).
type SnapshotReader struct{}

var _ dawport.ProjectReader = SnapshotReader{}

// ReadProject turns the snapshot at path into the project model the offline readers share: audio tracks with their clips as items, the
// regions the app made as regions, and the pickup labels as `PICKUP:` and `PICKUP_DONE:` markers (the names REAPER's convention gives
// them, which the proofing readiness signals read). An audio clip has no source file the app can open, so an item is Supported but
// not SourceAvailable: a reader that needs the audio asks Audacity to export it.
func (SnapshotReader) ReadProject(path string) (tracks.Project, error) {
	snap, err := ReadSnapshot(path)
	if err != nil {
		return tracks.Project{}, err
	}
	names := make([]string, len(snap.Tracks))
	for i, t := range snap.Tracks {
		names[i] = t.Name
	}
	ids := TrackIDs(names)
	project := tracks.Project{Path: path, Tracks: []tracks.Track{}}
	for i, t := range snap.Tracks {
		track := tracks.Track{GUID: ids[i], Index: t.Index, Name: t.Name, Selected: t.Selected, Armed: t.Selected, Items: []tracks.Item{}}
		clips := t.Clips
		if len(clips) == 0 && t.End > t.Start {
			clips = []SnapshotClip{{Start: t.Start, End: t.End, Name: t.Name}}
		}
		for _, c := range clips {
			id := ClipID(ids[i], c.Start)
			track.Items = append(track.Items, tracks.Item{
				Position: c.Start, Length: c.End - c.Start, Name: c.Name,
				SourceKind: "audacity", SourceAvailable: false, Supported: true,
				GUID: id, TakeGUID: id, PlayRate: 1,
				Takes: []tracks.Take{{GUID: id, Name: c.Name, SourceKind: "audacity", Supported: true, Active: true, PlayRate: 1}},
			})
		}
		project.Tracks = append(project.Tracks, track)
	}
	regionIndex, markerIndex := 0, 0
	for _, l := range snap.Labels {
		if title, ok := strings.CutPrefix(l.Text, regionPrefix); ok && l.End > l.Start {
			regionIndex++
			project.Regions = append(project.Regions, tracks.Region{Index: regionIndex, Name: title, Start: l.Start, End: l.End})
			continue
		}
		if open, tag, note, ok := ParsePickupLabel(l.Text); ok {
			markerIndex++
			body := note
			if tag != "" {
				body = "[" + tag + "] " + note
			}
			name := "PICKUP_DONE: " + body
			if open {
				name = "PICKUP: " + body
			}
			project.Markers = append(project.Markers, tracks.Marker{Index: markerIndex, Name: name, Position: l.Start})
		}
	}
	return project, nil
}
