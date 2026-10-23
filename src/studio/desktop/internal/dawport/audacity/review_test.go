package audacity

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"desktop/internal/audacitybridge"
	abt "desktop/internal/audacitybridge/audacitybridgetest"
	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// reviewFixture is a project folder with a manuscript, and an Audacity project with one selected audio track.
type reviewFixture struct {
	review  *Review
	server  *abt.Server
	project string
	got     []bridge.Event
}

func newReviewFixture(t *testing.T) *reviewFixture {
	t.Helper()
	server := abt.NewServer()
	client := audacitybridge.New(server.Transport(), audacitybridge.Options{Timeout: time.Second, PosixPaths: runtime.GOOS != "windows"})
	t.Cleanup(func() { _ = client.Close() })
	review := NewReview(NewSession(client))
	review.exported = func(string) error { return nil } // the fake writes no file
	project := t.TempDir()
	manuscript := filepath.Join(project, "narration-studio", "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(manuscript), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manuscript, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	server.With(func(p *abt.Project) {
		p.AddWaveTrack("Chapter 1", 10, 610)
		p.Tracks[0].Selected = true
	})
	f := &reviewFixture{review: review, server: server, project: project}
	review.Subscribe(dawport.Subscription{Tags: []string{"COMPARE_*", "ERROR"}, Handle: func(e bridge.Event) { f.got = append(f.got, e) }})
	return f
}

// wait dispatches until an event with tag arrives, and returns it.
func (f *reviewFixture) wait(t *testing.T, tag string) bridge.Event {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		_ = f.review.Dispatch()
		for _, e := range f.got {
			if e.Tag == tag {
				return e
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("no %s event; got %v", tag, f.got)
	return bridge.Event{}
}

func (f *reviewFixture) tags() []string {
	var out []string
	for _, e := range f.got {
		out = append(out, e.Tag)
	}
	return out
}

func (f *reviewFixture) results(t *testing.T, lines ...string) string {
	t.Helper()
	path := filepath.Join(f.project, "results.txt")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestPrepareExportsTheSelectedTrackAndListsItForTheComparison(t *testing.T) {
	f := newReviewFixture(t)
	if err := f.review.PrepareReview("run1", f.project); err != nil {
		t.Fatal(err)
	}
	e := f.wait(t, "COMPARE_PREPARED")
	// run, manifest, manuscript, track, diff, items
	if len(e.Fields) != 7 || e.RunID != "run1" || e.Fields[4] != "Chapter 1" || e.Fields[6] != "1" {
		t.Fatalf("event = %v", e.Fields)
	}
	manifest, manuscript, diff := e.Fields[2], e.Fields[3], e.Fields[5]
	if manuscript != filepath.Join(f.project, "narration-studio", "manuscript", "manuscript.json") {
		t.Errorf("manuscript = %q", manuscript)
	}
	if !strings.HasPrefix(diff, filepath.Join(f.project, "TranscriptCompare", "diffs")) || !strings.HasSuffix(diff, "_run1.diff") {
		t.Errorf("diff = %q", diff)
	}
	if info, err := os.Stat(filepath.Dir(diff)); err != nil || !info.IsDir() {
		t.Errorf("the diff folder was not made: %v", err)
	}
	raw, err := os.ReadFile(manifest)
	if err != nil {
		t.Fatal(err)
	}
	line := strings.TrimSpace(string(raw))
	parts := strings.Split(line, "|")
	if len(parts) != 4 || parts[0] != "0" || !strings.HasPrefix(parts[1], filepath.ToSlash(SessionFolder(f.project))) || parts[2] != "0.000000" || parts[3] != "600.000000" {
		t.Errorf("manifest line = %q", line)
	}
	f.server.With(func(p *abt.Project) {
		if len(p.Exports) != 1 {
			t.Fatalf("%d exports, want 1", len(p.Exports))
		}
		got := p.Exports[0]
		if !reflect.DeepEqual(got.Tracks, []string{"Chapter 1"}) || got.Start != 10 || got.End != 610 || got.NumChannels != 1 {
			t.Errorf("export = %+v", got)
		}
	})
}

func TestPrepareSaysWhatIsMissing(t *testing.T) {
	cases := []struct {
		name  string
		setup func(f *reviewFixture)
		says  string
	}{
		{"no manuscript", func(f *reviewFixture) { _ = os.RemoveAll(filepath.Join(f.project, "narration-studio")) }, "Import a manuscript"},
		{"no track selected", func(f *reviewFixture) { f.server.With(func(p *abt.Project) { p.Tracks[0].Selected = false }) }, "Select the chapter's audio track"},
		{"only a label track selected", func(f *reviewFixture) {
			f.server.With(func(p *abt.Project) {
				p.Tracks[0].Selected = false
				p.AddLabelTrack("Notes")
				p.Tracks[1].Selected = true
			})
		}, "Select the chapter's audio track"},
		{"an empty track", func(f *reviewFixture) {
			f.server.With(func(p *abt.Project) { p.Tracks[0].Start, p.Tracks[0].End = 0, 0 })
		}, "no audio"},
		{"Audacity closed", func(f *reviewFixture) { f.server.SetDown(true) }, "not reachable"},
		{"a dialog", func(f *reviewFixture) { f.server.Script(abt.FaultHang) }, "did not answer in time"},
		{"no project open", func(f *reviewFixture) { f.server.With(func(p *abt.Project) { p.NoProject = true }) }, "no project"},
	}
	for _, c := range cases {
		f := newReviewFixture(t)
		c.setup(f)
		if err := f.review.PrepareReview("run1", f.project); err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		e := f.wait(t, "ERROR")
		if !strings.Contains(e.Fields[2], c.says) {
			t.Errorf("%s: %q does not say %q", c.name, e.Fields[2], c.says)
		}
		for _, tag := range f.tags() {
			if tag == "COMPARE_PREPARED" {
				t.Errorf("%s: prepared anyway", c.name)
			}
		}
	}
}

func TestPrepareRefusesAnExportThatHoldsNoAudio(t *testing.T) {
	f := newReviewFixture(t)
	f.review.exported = nil // the real check: the fake wrote nothing
	_ = f.review.PrepareReview("run1", f.project)
	if e := f.wait(t, "ERROR"); !strings.Contains(e.Fields[2], "did not write the chapter's audio") {
		t.Errorf("error = %q", e.Fields[2])
	}
	small := filepath.Join(t.TempDir(), "a.wav")
	_ = os.WriteFile(small, make([]byte, 482), 0o600)
	if err := f.review.checkExport(small); err == nil || !strings.Contains(err.Error(), "no audio in it") {
		t.Errorf("a header-only file = %v", err)
	}
	big := filepath.Join(t.TempDir(), "b.wav")
	_ = os.WriteFile(big, make([]byte, 4096), 0o600)
	if err := f.review.checkExport(big); err != nil {
		t.Errorf("a file with audio = %v", err)
	}
}

const (
	misread = "MARKER|0|12.500|MISREAD|MISREAD: their/there|there|their|Chapter 1|3|ctx script|ctx audio|high|0.2"
	skipped = "MARKER|0|40.000|SKIPPED|SKIPPED: very|very||Chapter 1|5|s|a|low|"
)

func TestInspectQueuesAMarkerPerFindingAndRecognisesAnExistingLabel(t *testing.T) {
	f := newReviewFixture(t)
	_ = f.review.PrepareReview("run1", f.project)
	f.wait(t, "COMPARE_PREPARED")
	f.server.With(func(p *abt.Project) {
		p.AddLabelTrack(LabelTrackName, abt.Label{Start: 50, End: 50, Text: "[nu:f0-40000] SKIPPED: very"}, abt.Label{Start: 60, End: 60, Text: "my own note"})
	})
	results := f.results(t, "SUMMARY|2 discrepancy(s) found.", "DIFF|x", misread, skipped, "garbage line", "MARKER|x|y")
	f.got = nil
	_ = f.review.InspectFindings("run1", results)
	done := f.wait(t, "COMPARE_INSPECTED")
	if !reflect.DeepEqual(done.Fields, []string{"COMPARE_INSPECTED", "run1", "2 discrepancy(s) found.", "2", "1"}) {
		t.Errorf("inspected = %v", done.Fields)
	}
	var markers []bridge.Event
	for _, e := range f.got {
		if e.Tag == "COMPARE_MARKER" {
			markers = append(markers, e)
		}
	}
	if len(markers) != 2 {
		t.Fatalf("%d markers: %v", len(markers), f.tags())
	}
	// run, id, kind, name, doc, audio, projectTime, itemIndex, chapter, paragraph, scriptContext, audioContext, markerState,
	// existingName, srcpos, item guid, take guid, track guid
	want := []string{"COMPARE_MARKER", "run1", "0@12.500000", "MISREAD", "MISREAD: their/there", "there", "their", "22.500000", "0", "Chapter 1", "3", "ctx script", "ctx audio", "pending", "", "12.500000", "", "", ""}
	if !reflect.DeepEqual(markers[0].Fields, want) {
		t.Errorf("first marker = %q\nwant %q", markers[0].Fields, want)
	}
	if markers[1].Fields[13] != "existing" || markers[1].Fields[14] != "SKIPPED: very" {
		t.Errorf("the finding Audacity already carries = %q", markers[1].Fields)
	}
}

func TestExportAddsOnlyThePendingFindingsAndOnlyOnce(t *testing.T) {
	f := newReviewFixture(t)
	_ = f.review.PrepareReview("run1", f.project)
	f.wait(t, "COMPARE_PREPARED")
	results := f.results(t, "SUMMARY|2", misread, skipped)
	f.server.With(func(p *abt.Project) {
		p.AddLabelTrack(LabelTrackName, abt.Label{Start: 50, End: 50, Text: "[nu:f0-40000] SKIPPED: very"})
	})
	_ = f.review.InspectFindings("run1", results)
	f.wait(t, "COMPARE_INSPECTED")
	f.got = nil
	_ = f.review.ExportFindings("run1", results, dawport.MarkerColors{})
	end := f.wait(t, "COMPARE_EXPORTED")
	if !reflect.DeepEqual(end.Fields, []string{"COMPARE_EXPORTED", "run1", "1", "1"}) {
		t.Errorf("exported = %v", end.Fields)
	}
	f.server.With(func(p *abt.Project) {
		var texts []string
		for _, l := range p.AllLabels() {
			texts = append(texts, l.Text)
		}
		if !reflect.DeepEqual(texts, []string{"[nu:f0-12500] MISREAD: their/there", "[nu:f0-40000] SKIPPED: very"}) {
			t.Errorf("labels = %q", texts)
		}
		for _, l := range p.AllLabels() {
			if strings.Contains(l.Text, "f0-12500") && l.Start != 22.5 {
				t.Errorf("the finding's label is at %v, want 22.5 (track start 10 + 12.5)", l.Start)
			}
		}
	})
	exported := 0
	for _, e := range f.got {
		if e.Tag == "COMPARE_EXPORT_MARKER" && e.Fields[3] == "exported" {
			exported++
		}
	}
	if exported != 1 {
		t.Errorf("%d exported markers, want 1", exported)
	}
	// A second export of the same results adds nothing.
	f.got = nil
	_ = f.review.ExportFindings("run1", results, dawport.MarkerColors{})
	again := f.wait(t, "COMPARE_EXPORTED")
	// What this run exported is not counted again, as REAPER's export does not: only the one Audacity already carried is skipped.
	if again.Fields[2] != "0" || again.Fields[3] != "1" {
		t.Errorf("second export = %v", again.Fields)
	}
}

func TestNavigateSelectsTheTrackAndPutsTheCursorAtTheFinding(t *testing.T) {
	f := newReviewFixture(t)
	_ = f.review.PrepareReview("run1", f.project)
	f.wait(t, "COMPARE_PREPARED")
	results := f.results(t, "SUMMARY|1", misread)
	_ = f.review.InspectFindings("run1", results)
	f.wait(t, "COMPARE_INSPECTED")
	f.server.With(func(p *abt.Project) {
		p.AddWaveTrack("Chapter 2", 0, 100)
		p.Tracks[0].Selected = false
		p.Tracks[1].Selected = true
	})
	if err := f.review.NavigateToFinding("run1", "0@12.500000"); err != nil {
		t.Fatal(err)
	}
	f.server.With(func(p *abt.Project) {
		if !p.Tracks[0].Selected || p.Tracks[1].Selected || p.SelStart != 22.5 || p.SelEnd != 22.5 {
			t.Errorf("selected %v/%v, cursor %v-%v", p.Tracks[0].Selected, p.Tracks[1].Selected, p.SelStart, p.SelEnd)
		}
	})
	if err := f.review.NavigateToFinding("run1", "9@1.000000"); !errors.Is(err, ErrFindingGone) {
		t.Errorf("an unknown finding = %v", err)
	}
	if err := f.review.NavigateToFinding("nope", "0@12.500000"); !errors.Is(err, ErrFindingGone) {
		t.Errorf("an unknown run = %v", err)
	}
	f.server.With(func(p *abt.Project) { p.Tracks[0].Name = "Renamed" })
	if err := f.review.NavigateToFinding("run1", "0@12.500000"); !errors.Is(err, ErrFindingGone) {
		t.Errorf("the track was renamed = %v", err)
	}
	f.server.With(func(p *abt.Project) { p.Tracks[0].Name = "Chapter 2" })
	var sentence audacitybridge.Sentence
	if err := f.review.NavigateToFinding("run1", "0@12.500000"); err == nil || !errors.Is(err, ErrFindingGone) && !errors.As(err, &sentence) {
		t.Errorf("two tracks share the name = %v", err)
	}
}

func TestInspectAndExportSayWhenTheirInputIsGone(t *testing.T) {
	f := newReviewFixture(t)
	_ = f.review.InspectFindings("run9", filepath.Join(f.project, "none.txt"))
	if e := f.wait(t, "ERROR"); !strings.Contains(e.Fields[2], "context expired") {
		t.Errorf("unknown run = %q", e.Fields[2])
	}
	f.got = nil
	_ = f.review.PrepareReview("run1", f.project)
	f.wait(t, "COMPARE_PREPARED")
	f.got = nil
	_ = f.review.InspectFindings("run1", filepath.Join(f.project, "none.txt"))
	if e := f.wait(t, "ERROR"); !strings.Contains(e.Fields[2], "results were not found") {
		t.Errorf("no results file = %q", e.Fields[2])
	}
	f.got = nil
	_ = f.review.ExportFindings("run1", filepath.Join(f.project, "none.txt"), dawport.MarkerColors{})
	if e := f.wait(t, "ERROR"); !strings.Contains(e.Fields[2], "results were not found") {
		t.Errorf("no results file on export = %q", e.Fields[2])
	}
}

func TestOnlyTheLastRunsAreRemembered(t *testing.T) {
	f := newReviewFixture(t)
	for i := range maxRuns + 2 {
		f.review.remember(string(rune('a'+i)), &reviewRun{rows: map[string]*reviewRow{}})
	}
	if _, ok := f.review.run("a"); ok {
		t.Error("the oldest run is still remembered")
	}
	if _, ok := f.review.run(string(rune('a' + maxRuns + 1))); !ok {
		t.Error("the newest run is gone")
	}
}

func TestSafeNameKeepsAPathOutOfATrackName(t *testing.T) {
	for in, want := range map[string]string{"Chapter 1": "Chapter_1", `..\..\evil`: "evil", "": "track", "///": "track", "é ü": "track"} {
		if got := safeName(in); got != want {
			t.Errorf("safeName(%q) = %q, want %q", in, got, want)
		}
	}
}
