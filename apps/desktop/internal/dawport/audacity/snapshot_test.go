package audacity

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	abt "github.com/countrymanprime/narration-utils/shell/internal/audacitybridge/audacitybridgetest"
)

func TestSnapshotRecordsAudioTracksClipsAndLabels(t *testing.T) {
	session, server := newSession(t)
	server.With(func(p *abt.Project) {
		p.AddWaveTrack("Chapter 1", 0, 600)
		p.AddWaveTrack("Chapter 2", 5, 300)
		p.Tracks[1].Selected = true
		p.AddLabelTrack(LabelTrackName, abt.Label{Start: 10, End: 10, Text: "[nu:pickup open] first"}, abt.Label{Start: 0, End: 600, Text: "[nu:region] Chapter 1"})
	})
	at := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)
	snap, err := session.TakeSnapshot(t.Context(), at)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Version != SnapshotVersion || !snap.TakenAt.Equal(at) || len(snap.Tracks) != 2 || len(snap.Labels) != 2 {
		t.Fatalf("snapshot = %+v", snap)
	}
	if got := snap.Tracks[1]; got.Name != "Chapter 2" || !got.Selected || got.Start != 5 || got.End != 300 || len(got.Clips) != 1 || got.Clips[0].Start != 5 {
		t.Errorf("track 2 = %+v", got)
	}
	path := SnapshotPath(t.TempDir())
	if err := WriteSnapshot(path, snap); err != nil {
		t.Fatal(err)
	}
	back, err := ReadSnapshot(path)
	if err != nil || !snap.Same(back) {
		t.Fatalf("round trip = %+v, %v", back, err)
	}
	if !IsSnapshot(path) || IsSnapshot(filepath.Join(filepath.Dir(path), "x.rpp")) {
		t.Error("IsSnapshot")
	}
	// A selection change is not a change of the project; an edit is.
	moved := back
	moved.Tracks = append([]SnapshotTrack(nil), back.Tracks...)
	moved.Tracks[0].Selected = !moved.Tracks[0].Selected
	if !back.Same(moved) {
		t.Error("a selection change counted as a change")
	}
	moved.Tracks[0].End += 1
	if back.Same(moved) {
		t.Error("an edit did not count as a change")
	}
}

func TestSnapshotReaderMakesTheProjectModelTheOfflineReadersShare(t *testing.T) {
	snap := Snapshot{Version: SnapshotVersion, Tracks: []SnapshotTrack{
		{Index: 0, Name: "Chapter 1", Start: 0, End: 600, Selected: true, Clips: []SnapshotClip{{Start: 0, End: 300, Name: "a"}, {Start: 310.5, End: 600, Name: "b"}}},
		{Index: 2, Name: "Chapter 1", Start: 0, End: 50},
	}, Labels: []SnapshotLabel{
		{Track: 1, Start: 10, End: 10, Text: "[nu:pickup open] [proofer] re-read"},
		{Track: 1, Start: 20, End: 20, Text: "[nu:pickup done] fixed"},
		{Track: 1, Start: 0, End: 600, Text: "[nu:region] Chapter 1"},
		{Track: 1, Start: 30, End: 30, Text: "[nu:region] a cursor is no region"},
		{Track: 1, Start: 40, End: 40, Text: "[nu:f1] a finding"},
		{Track: 1, Start: 50, End: 50, Text: "my own note"},
	}}
	path := SnapshotPath(t.TempDir())
	if err := WriteSnapshot(path, snap); err != nil {
		t.Fatal(err)
	}
	project, err := SnapshotReader{}.ReadProject(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(project.Tracks) != 2 || project.Tracks[0].GUID != "audacity:Chapter 1" || project.Tracks[1].GUID != "audacity:Chapter 1#2" {
		t.Fatalf("tracks = %+v", project.Tracks)
	}
	first := project.Tracks[0]
	if !first.Selected || !first.Armed || first.Index != 0 || len(first.Items) != 2 {
		t.Errorf("track 0 = %+v", first)
	}
	item := first.Items[1]
	if item.GUID != "audacity:Chapter 1@310500" || item.Position != 310.5 || item.Length != 289.5 || !item.Supported || item.SourceAvailable || item.Active().GUID != item.GUID {
		t.Errorf("item = %+v", item)
	}
	// A track the snapshot has no clips for still has its span as one item.
	if second := project.Tracks[1]; len(second.Items) != 1 || second.Items[0].Position != 0 || second.Items[0].Length != 50 {
		t.Errorf("track 1 = %+v", second)
	}
	if len(project.Regions) != 1 || project.Regions[0].Name != "Chapter 1" || project.Regions[0].Start != 0 || project.Regions[0].End != 600 {
		t.Errorf("regions = %+v", project.Regions)
	}
	var markers []string
	for _, m := range project.Markers {
		markers = append(markers, m.Name)
	}
	if want := []string{"PICKUP: [proofer] re-read", "PICKUP_DONE: fixed"}; !reflect.DeepEqual(markers, want) {
		t.Errorf("markers = %q, want %q", markers, want)
	}
	// An item found by its id.
	if track, found, ok := project.ItemByGUID("audacity:Chapter 1@310500"); !ok || track.GUID != "audacity:Chapter 1" || found.Name != "b" {
		t.Errorf("ItemByGUID = %v %v %v", track, found, ok)
	}
}

func TestSnapshotRefusesWhatItCannotTrust(t *testing.T) {
	dir := t.TempDir()
	write := func(text string) string {
		path := filepath.Join(dir, SnapshotFile)
		if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
		return path
	}
	for name, text := range map[string]string{
		"not json":         "not json",
		"a newer version":  `{"version": 99, "tracks": [], "labels": []}`,
		"a bad track":      `{"version": 1, "tracks": [{"name": "A", "start": 5, "end": 1, "clips": []}], "labels": []}`,
		"a bad clip":       `{"version": 1, "tracks": [{"name": "A", "start": 0, "end": 10, "clips": [{"start": -1, "end": 2}]}], "labels": []}`,
		"a bad label":      `{"version": 1, "tracks": [], "labels": [{"start": 3, "end": 1, "text": "x"}]}`,
		"an unknown field": `{"version": 1, "tracks": [], "labels": [], "extra": true}`,
	} {
		_, err := ReadSnapshot(write(text))
		if name == "an unknown field" {
			if err != nil {
				t.Errorf("%s: %v (unknown fields are ignored so a later version can add them)", name, err)
			}
			continue
		}
		if err == nil {
			t.Errorf("%s was accepted", name)
		}
	}
	if _, err := ReadSnapshot(filepath.Join(dir, "none.json")); err == nil {
		t.Error("a missing file was accepted")
	}
	if _, err := (SnapshotReader{}).ReadProject(filepath.Join(dir, "none.json")); err == nil {
		t.Error("a missing file was read as a project")
	}
}

func TestTrackAndClipIDs(t *testing.T) {
	ids := TrackIDs([]string{"A", "B", "A", "A", ""})
	if want := []string{"audacity:A", "audacity:B", "audacity:A#2", "audacity:A#3", "audacity:"}; !reflect.DeepEqual(ids, want) {
		t.Errorf("ids = %q", ids)
	}
	id := ClipID("audacity:A#2", 12.3456)
	if id != "audacity:A#2@12346" {
		t.Errorf("clip id = %q", id)
	}
	if track, ms, ok := SplitClipID(id); !ok || track != "audacity:A#2" || ms != 12346 {
		t.Errorf("split = %q %d %v", track, ms, ok)
	}
	// A name with an at sign still splits at the last one.
	if track, ms, ok := SplitClipID(ClipID("audacity:a@b", 1)); !ok || track != "audacity:a@b" || ms != 1000 {
		t.Errorf("split with @ = %q %d %v", track, ms, ok)
	}
	for _, bad := range []string{"", "{GUID}", "audacity:A", "audacity:A@x", "A@5"} {
		if _, _, ok := SplitClipID(bad); ok {
			t.Errorf("%q split", bad)
		}
	}
	if strings.Contains(strings.Join(TrackIDs([]string{"x"}), ""), "\n") {
		t.Error("newline")
	}
}
