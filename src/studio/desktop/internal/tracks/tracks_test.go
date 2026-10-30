package tracks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiscoverFindsTopLevelRppOnly(t *testing.T) {
	folder := t.TempDir()
	write := func(name string) {
		if err := os.WriteFile(filepath.Join(folder, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("Novel.RPP")
	write("Novel.rpp-bak")
	write("notes.txt")
	if err := os.MkdirAll(filepath.Join(folder, "Backups"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "Backups", "Novel-bak1.RPP"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	found, err := Discover(folder)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || found[0] != filepath.Join(folder, "Novel.RPP") {
		t.Fatalf("found = %#v, want exactly [%s]", found, filepath.Join(folder, "Novel.RPP"))
	}
}

func TestDiscoverReturnsEveryRppWhenMoreThanOne(t *testing.T) {
	folder := t.TempDir()
	for _, name := range []string{"Draft.rpp", "Final.rpp"} {
		if err := os.WriteFile(filepath.Join(folder, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	found, err := Discover(folder)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 2 {
		t.Fatalf("found = %#v, want 2 entries", found)
	}
}

func TestDiscoverOnMissingFolderReturnsError(t *testing.T) {
	if _, err := Discover(filepath.Join(t.TempDir(), "does-not-exist")); err == nil {
		t.Fatal("want an error for a missing folder")
	}
}

func TestParseReturnsTracksInFileOrder(t *testing.T) {
	project, err := Parse(filepath.Join("testdata", "basic.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	if len(project.Tracks) != 3 {
		t.Fatalf("len(Tracks) = %d, want 3", len(project.Tracks))
	}
	names := []string{project.Tracks[0].Name, project.Tracks[1].Name, project.Tracks[2].Name}
	want := []string{"Chapter 1", "Click Track", "Chapter 2"}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("Tracks[%d].Name = %q, want %q", i, names[i], want[i])
		}
	}
}

func TestParseResolvesAvailableWaveSource(t *testing.T) {
	project, err := Parse(filepath.Join("testdata", "basic.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	track := project.Tracks[0]
	if len(track.Items) != 1 {
		t.Fatalf("len(Items) = %d, want 1", len(track.Items))
	}
	item := track.Items[0]
	want := filepath.Join("testdata", "media", "ch1_take1.wav")
	if item.SourceFile != want {
		t.Fatalf("SourceFile = %q, want %q", item.SourceFile, want)
	}
	if !item.SourceAvailable {
		t.Fatal("want SourceAvailable = true for a file that exists on disk")
	}
	if !item.Supported {
		t.Fatal("want Supported = true for a WAVE source")
	}
	if item.Position != 0 || item.Length != 12.5 {
		t.Fatalf("Position/Length = %v/%v, want 0/12.5", item.Position, item.Length)
	}
}

func TestParseFlagsMissingSourceAsUnavailable(t *testing.T) {
	project, err := Parse(filepath.Join("testdata", "basic.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	item := project.Tracks[2].Items[0]
	if item.SourceAvailable {
		t.Fatal("want SourceAvailable = false for a file that does not exist on disk")
	}
	if !item.Supported {
		t.Fatal("a WAVE source that is merely missing on disk is still a supported kind")
	}
}

func TestParseFlagsMidiItemAsUnsupported(t *testing.T) {
	project, err := Parse(filepath.Join("testdata", "basic.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	item := project.Tracks[1].Items[0]
	if item.Supported {
		t.Fatal("want Supported = false for a MIDI source")
	}
	if item.SourceFile != "" {
		t.Fatalf("SourceFile = %q, want empty for a MIDI source with no FILE attribute", item.SourceFile)
	}
}

func TestParseDecodesMuteSoloAndCustomColor(t *testing.T) {
	project, err := Parse(filepath.Join("testdata", "basic.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	if project.Tracks[0].Muted {
		t.Fatal("Chapter 1 should not be muted")
	}
	if !project.Tracks[1].Muted {
		t.Fatal("Click Track should be muted")
	}
	// PEAKCOL 17919243 = 0x0111CB0B: custom-color flag (0x1000000) set,
	// packing red=0x0B, green=0xCB, blue=0x11 (COLORREF order).
	if got := project.Tracks[0].Color; got != "#0BCB11" {
		t.Fatalf("Color = %q, want #0BCB11", got)
	}
	if got := project.Tracks[1].Color; got != "" {
		t.Fatalf("Color = %q, want empty for PEAKCOL 0 (no custom color)", got)
	}
}

func TestParseReadsARecordArmedTrackAndIgnoresAnItemsSelection(t *testing.T) {
	path := filepath.Join(t.TempDir(), "armed.rpp")
	text := "<REAPER_PROJECT 0.1 \"7.80/x64\" 1\n" +
		"  <TRACK {A}\n    NAME \"Chapter 2\"\n    SEL 0\n    REC 1 0 1 0 0 0 0 0\n" +
		"    <ITEM\n      POSITION 0\n      LENGTH 1\n      SEL 1\n    >\n  >\n" +
		"  <TRACK {B}\n    NAME \"Chapter 3\"\n  >\n>\n"
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
	project, err := Parse(path)
	if err != nil {
		t.Fatal(err)
	}
	if !project.Tracks[0].Armed || project.Tracks[0].Selected {
		t.Fatalf("Chapter 2 = armed %v selected %v, want armed only", project.Tracks[0].Armed, project.Tracks[0].Selected)
	}
	if project.Tracks[1].Armed || project.Tracks[1].Selected {
		t.Fatal("a track without SEL or REC lines is neither selected nor armed")
	}
}

func TestParseOnNonProjectFileReturnsError(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "not-a-project.rpp")
	if err := os.WriteFile(path, []byte("this is not REAPER project text\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Parse(path); err == nil {
		t.Fatal("want an error for a file with no REAPER_PROJECT chunk")
	}
}

func TestParseOnMissingFileReturnsError(t *testing.T) {
	if _, err := Parse(filepath.Join(t.TempDir(), "missing.rpp")); err == nil {
		t.Fatal("want an error for a file that does not exist")
	}
}

func TestTokenizeHandlesEachSafeStringDelimiter(t *testing.T) {
	tests := []struct {
		line string
		want []string
	}{
		{`NAME "hello world"`, []string{"NAME", "hello world"}},
		{`NAME 'has "quotes"'`, []string{"NAME", `has "quotes"`}},
		{"NAME `has \"both' kinds`", []string{"NAME", `has "both' kinds`}},
		{"POSITION 0 1", []string{"POSITION", "0", "1"}},
	}
	for _, test := range tests {
		got := tokenize(test.line)
		if len(got) != len(test.want) {
			t.Fatalf("tokenize(%q) = %#v, want %#v", test.line, got, test.want)
		}
		for i := range got {
			if got[i] != test.want[i] {
				t.Fatalf("tokenize(%q) = %#v, want %#v", test.line, got, test.want)
			}
		}
	}
}

// folders-handmade.rpp is written by hand from REAPER's documented ISBUS line, not recorded: see testdata/README.md.
func TestParseReadsFolderDepth(t *testing.T) {
	project, err := Parse(filepath.Join("testdata", "folders-handmade.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	want := []struct {
		name   string
		depth  int
		folder bool
	}{
		{"Intro", 0, false},
		{"Book", 0, true},
		{"Part 1", 1, true},
		{"Ch 1", 2, false},
		{"Ch 2", 2, false}, // closes two levels at once
		{"Empty folder", 0, true},
		{"Spare", 1, false},
		{"Appendix", 0, false},
	}
	if len(project.Tracks) != len(want) {
		t.Fatalf("got %d tracks, want %d", len(project.Tracks), len(want))
	}
	for i, w := range want {
		got := project.Tracks[i]
		if got.Name != w.name || got.Depth != w.depth || got.IsFolder != w.folder {
			t.Errorf("track %d = %q depth %d folder %v, want %q depth %d folder %v", i, got.Name, got.Depth, got.IsFolder, w.name, w.depth, w.folder)
		}
	}
}

func TestParseFolderDepthSurvivesMalformedLines(t *testing.T) {
	cases := map[string]struct {
		lines []string
		depth []int
	}{
		"no ISBUS line":           {[]string{""}, []int{0, 0}},
		"unparsable delta":        {[]string{"ISBUS 1 x"}, []int{0, 0}},
		"missing delta":           {[]string{"ISBUS 1"}, []int{0, 0}},
		"closes more than opened": {[]string{"ISBUS 2 -3"}, []int{0, 0}},
		"folder never closed":     {[]string{"ISBUS 1 1"}, []int{0, 1}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			var body strings.Builder
			body.WriteString("<REAPER_PROJECT 0.1 \"7.80/win64\" 0\n")
			for _, line := range []string{c.lines[0], ""} {
				body.WriteString("  <TRACK {A}\n    NAME \"t\"\n    " + line + "\n  >\n")
			}
			path := filepath.Join(t.TempDir(), "p.rpp")
			if err := os.WriteFile(path, []byte(body.String()+">\n"), 0o600); err != nil {
				t.Fatal(err)
			}
			project, err := Parse(path)
			if err != nil {
				t.Fatal(err)
			}
			for i, want := range c.depth {
				if project.Tracks[i].Depth != want {
					t.Errorf("track %d depth = %d, want %d", i, project.Tracks[i].Depth, want)
				}
			}
		})
	}
}
