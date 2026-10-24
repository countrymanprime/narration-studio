package guide

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"desktop/internal/process"
	"desktop/internal/settings"
)

func TestRefreshCuesRunsTheCuesCommandWithEachChapter(t *testing.T) {
	rig := newPreviewRig(t, "cues")
	got, err := rig.service.RefreshCues(context.Background(), "c1", "c 2")
	if err != nil || got != (CueCounts{Cues: 1}) {
		t.Fatalf("got %+v, %v", got, err)
	}
	raw, err := os.ReadFile(rig.log)
	if err != nil {
		t.Fatal(err)
	}
	line := strings.TrimSpace(string(raw))
	for _, want := range []string{"cues --guide " + rig.service.guidePath(), "--manuscript " + rig.service.manuscript(), "--chapter-id c1 --chapter-id c 2"} {
		if !strings.Contains(line, want) {
			t.Fatalf("command line %q lacks %q", line, want)
		}
	}
}

func TestACorrectionAfterARefreshFindsTheCueTheSidecarWrote(t *testing.T) {
	rig := newPreviewRig(t, "cues")
	if err := rig.service.CorrectCue("cue-missing", "e1"); err == nil {
		t.Fatal("a correction of a cue the file lacks must be refused")
	}
	if _, err := rig.service.RefreshCues(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := rig.service.CorrectCue("cue-new", "e1"); err != nil {
		t.Fatalf("the host edit read a stale Story Bible: %v", err)
	}
}

func TestRefreshCuesRefusesWhatItCannotRead(t *testing.T) {
	for _, mode := range []string{"cues-garbled", "fail"} {
		rig := newPreviewRig(t, mode)
		if _, err := rig.service.RefreshCues(context.Background()); err == nil {
			t.Fatalf("%s: no error", mode)
		}
	}
}

func TestRefreshCuesNeedsAProject(t *testing.T) {
	root := t.TempDir()
	s := New("", "unused", "", settings.New(root, root), process.NewSupervisor())
	if _, err := s.RefreshCues(context.Background()); err == nil || !strings.Contains(err.Error(), "import a manuscript first") {
		t.Fatalf("got %v", err)
	}
}

func TestParseCueCounts(t *testing.T) {
	for out, want := range map[string]CueCounts{"CUES|0|0": {}, "loading\nCUES|12|5\n": {Cues: 12, Attributed: 5}} {
		if got, err := parseCueCounts(out); err != nil || got != want {
			t.Fatalf("%q: got %+v, %v", out, got, err)
		}
	}
	for _, out := range []string{"", "CUES|1", "CUES|-1|0", "CUES|1|2", "EDITED|x"} {
		if _, err := parseCueCounts(out); err == nil {
			t.Fatalf("%q: no error", out)
		}
	}
}

// What the sidecar's cues command printed and wrote (testdata/cues-golden.json, written by test_character_cues.py) is read by the
// host's parser and its DialogueCues, and the two agree.
func TestCuesMatchTheGolden(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "cues-golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden struct {
		Cases []struct {
			Line         string          `json:"line"`
			DialogueCues json.RawMessage `json:"dialogue_cues"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &golden); err != nil || len(golden.Cases) < 2 {
		t.Fatalf("golden: %v, %d cases", err, len(golden.Cases))
	}
	for _, c := range golden.Cases {
		counts, err := parseCueCounts(c.Line)
		if err != nil {
			t.Fatal(err)
		}
		s := New(t.TempDir(), "", "", nil, nil)
		if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(s.guidePath(), []byte(`{"entities":[],"dialogue_cues":`+string(c.DialogueCues)+`}`), 0o600); err != nil {
			t.Fatal(err)
		}
		cues, err := s.DialogueCues()
		if err != nil {
			t.Fatal(err)
		}
		attributed := 0
		for _, cue := range cues {
			if cue.SpeakerEntityID != nil {
				attributed++
			}
		}
		if counts != (CueCounts{Cues: len(cues), Attributed: attributed}) {
			t.Fatalf("%q says %+v; the file holds %d cues, %d with a speaker", c.Line, counts, len(cues), attributed)
		}
	}
}

func TestSpeakerChaptersAreWhereTheEntrysNamesAppear(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", nil, nil)
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	document := `{"types":[{"name":"Character","colour":"green","speaks":true},{"name":"Place","colour":"blue","speaks":false}],"entities":[
		{"id":"ada","canonical_name":"Ada","category":"Character","occurrences":[{"chapterId":"c2"},{"chapterId":"c1"},{"chapterId":"c2"}],
		 "aliases":[{"text":"Lady Ada","occurrences":[{"chapterId":"c3"},{"chapterId":""}]}]},
		{"id":"spire","canonical_name":"Spire","category":"Place","occurrences":[{"chapterId":"c1"}]}]}`
	if err := os.WriteFile(s.guidePath(), []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string]struct {
		chapters []string
		speaks   bool
	}{"ada": {[]string{"c2", "c1", "c3"}, true}, "spire": {[]string{"c1"}, false}, "gone": {nil, false}} {
		chapters, speaks, err := s.SpeakerChapters(id)
		if err != nil || !slices.Equal(chapters, want.chapters) || speaks != want.speaks {
			t.Fatalf("%s: %v %v %v", id, chapters, speaks, err)
		}
	}
}
