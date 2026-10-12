package main

import (
	"context"
	"errors"
	"maps"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// DawPreviewFileRange, DawStopFilePreview and DawRevealFile (SN-B98) over a host with a bridge, fake file roles standing in for
// REAPER, and the file_preview and file_reveal capabilities toggled. What REAPER answers is bridge's and the harness's own
// (media_file_test.go, media_file_test.lua); these cover the host's wiring: the resolver first, then a path the narrator
// picked to measure, then the role.

type fakeFiles struct {
	previews []dawport.FilePreview
	stops    int
	reveals  []string
	err      error
	stopped  bool
}

func (f *fakeFiles) PreviewFileRange(_ context.Context, preview dawport.FilePreview) (dawport.FilePreviewStarted, error) {
	f.previews = append(f.previews, preview)
	if f.err != nil {
		return dawport.FilePreviewStarted{}, f.err
	}
	return dawport.FilePreviewStarted{Path: preview.Path, Start: preview.Start, Length: min(preview.Length, 8)}, nil
}

func (f *fakeFiles) StopFilePreview(context.Context) (dawport.FilePreviewStopped, error) {
	f.stops++
	return dawport.FilePreviewStopped{Stopped: f.stopped}, f.err
}

func (f *fakeFiles) RevealFile(_ context.Context, path string) (dawport.FileRevealed, error) {
	f.reveals = append(f.reveals, path)
	return dawport.FileRevealed{Path: path}, f.err
}

func (f *fakeFiles) sent() int { return len(f.previews) + f.stops + len(f.reveals) }

// filesHost is a host launched for kind ("" standalone) with a bridge client, the given reachability and file roles, both file
// capabilities set to toggle ("" leaves them on auto, Experimental and off), and one file the narrator picked to measure,
// "Chapter 01.wav", whose path it returns.
func filesHost(t *testing.T, kind string, reach *daw.Reachability, role *fakeFiles, toggle string) (*Host, string) {
	t.Helper()
	t.Setenv("APPDATA", t.TempDir())
	host, _ := newReadAloudReaperHost(t)
	if toggle != "" {
		for _, c := range []dawport.Capability{dawport.CapFilePreview, dawport.CapFileReveal} {
			if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(c): &toggle}); err != nil {
				t.Fatal(err)
			}
		}
	}
	client, err := bridge.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "Chapter 01.wav")
	if err := os.WriteFile(path, []byte("RIFF....WAVE"), 0o600); err != nil {
		t.Fatal(err)
	}
	host.mu.Lock()
	host.config.daw = kind
	if kind != "" {
		host.bridge = client
	}
	host.reachability = reach
	if role != nil {
		host.filePreviewer, host.fileRevealer = role, role
	}
	host.measurePicked = map[string]bool{path: true}
	host.mu.Unlock()
	return host, path
}

func TestDawPreviewFileRangePlaysAPickedFileAndAnswersADawResult(t *testing.T) {
	role := &fakeFiles{}
	host, path := filesHost(t, "REAPER", liveReachability(), role, "on")

	got := decodeDawResult(t)(host.DawPreviewFileRange(path, 12.5, 5))

	want := dawport.OK("Playing 5.0 s of Chapter 01.wav from 12.5 s.", false)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("DawPreviewFileRange = %+v, want %+v", got, want)
	}
	if wantSent := []dawport.FilePreview{{Path: path, Start: 12.5, Length: 5}}; !reflect.DeepEqual(role.previews, wantSent) {
		t.Fatalf("sent %v, want %v", role.previews, wantSent)
	}
}

func TestDawStopFilePreviewSaysWhetherAnythingWasPlaying(t *testing.T) {
	role := &fakeFiles{stopped: true}
	host, _ := filesHost(t, "REAPER", liveReachability(), role, "on")
	if got := decodeDawResult(t)(host.DawStopFilePreview()); !reflect.DeepEqual(got, dawport.OK(fileStoppedSentence, false)) {
		t.Fatalf("DawStopFilePreview = %+v", got)
	}
	role.stopped = false
	if got := decodeDawResult(t)(host.DawStopFilePreview()); !reflect.DeepEqual(got, dawport.OK(fileNothingPlayingSentence, false)) {
		t.Fatalf("DawStopFilePreview with nothing playing = %+v", got)
	}
}

func TestDawRevealFileShowsAPickedFileInTheEngine(t *testing.T) {
	role := &fakeFiles{}
	host, path := filesHost(t, "REAPER", liveReachability(), role, "on")
	got := decodeDawResult(t)(host.DawRevealFile(path))
	if want := dawport.OK("Showing Chapter 01.wav in REAPER.", false); !reflect.DeepEqual(got, want) {
		t.Fatalf("DawRevealFile = %+v, want %+v", got, want)
	}
	if !reflect.DeepEqual(role.reveals, []string{path}) {
		t.Fatalf("sent %v", role.reveals)
	}
}

// The resolver's own sentence for each launch it refuses, checked first, and nothing sent for any of them.
func TestTheFileBindingsRefuseWithTheResolversSentenceAndSendNothing(t *testing.T) {
	for name, c := range map[string]struct {
		kind   string
		reach  *daw.Reachability
		toggle string
		reason dawport.Reason
	}{
		"standalone":        {"", liveReachability(), "on", dawport.ReasonStandalone},
		"not answering":     {"REAPER", daw.NewReachability(nil), "on", dawport.ReasonNotRunning},
		"experimental off":  {"REAPER", liveReachability(), "", dawport.ReasonExperimentalOff},
		"toggle turned off": {"REAPER", liveReachability(), "off", dawport.ReasonTurnedOff},
	} {
		t.Run(name, func(t *testing.T) {
			role := &fakeFiles{}
			host, path := filesHost(t, c.kind, c.reach, role, c.toggle)
			resolver, _ := host.dawResolverFor(host.services())
			for capability, call := range map[dawport.Capability]func() (string, error){
				dawport.CapFilePreview: func() (string, error) { return host.DawPreviewFileRange(path, 0, 5) },
				dawport.CapFileReveal:  func() (string, error) { return host.DawRevealFile(path) },
			} {
				support := resolver.Support(capability)
				if support.Available || support.Reason != c.reason {
					t.Fatalf("%s support = %+v, want reason %s", capability, support, c.reason)
				}
				if got := decodeDawResult(t)(call()); !reflect.DeepEqual(got, dawport.Refused(support.Message)) {
					t.Fatalf("%s = %+v, want Refused(%q)", capability, got, support.Message)
				}
			}
			if got := decodeDawResult(t)(host.DawStopFilePreview()); got.OK {
				t.Fatalf("DawStopFilePreview = %+v, want a refusal", got)
			}
			if role.sent() != 0 {
				t.Fatalf("sent %+v while refused", role)
			}
		})
	}
}

// Only a path the narrator picked to measure in this session is played or shown, and only an audio file that is there; the
// stretch is checked before anything is sent.
func TestTheFileBindingsCheckThePathAndStretchOnTheHostAndSendNothing(t *testing.T) {
	role := &fakeFiles{}
	host, path := filesHost(t, "REAPER", liveReachability(), role, "on")
	other := filepath.Join(filepath.Dir(path), "Other.wav")
	if err := os.WriteFile(other, []byte("RIFF"), 0o600); err != nil {
		t.Fatal(err)
	}
	text := filepath.Join(filepath.Dir(path), "notes.txt")
	if err := os.WriteFile(text, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	gone := filepath.Join(filepath.Dir(path), "Gone.wav")
	host.mu.Lock()
	host.measurePicked[text], host.measurePicked[gone] = true, true
	host.mu.Unlock()
	paths := map[string]string{
		other:                  fileNotPickedSentence,
		"":                     fileNotPickedSentence,
		"Chapter 01.wav":       fileNotPickedSentence,
		`\\server\share\a.wav`: fileNotPickedSentence,
		text:                   fileNotAudioSentence,
		gone:                   fileGoneSentence,
	}
	for p, sentence := range paths {
		if got := decodeDawResult(t)(host.DawPreviewFileRange(p, 0, 5)); !reflect.DeepEqual(got, dawport.Refused(sentence)) {
			t.Errorf("preview %q = %+v, want Refused(%q)", p, got, sentence)
		}
		if got := decodeDawResult(t)(host.DawRevealFile(p)); !reflect.DeepEqual(got, dawport.Refused(sentence)) {
			t.Errorf("reveal %q = %+v, want Refused(%q)", p, got, sentence)
		}
	}
	for _, stretch := range [][2]float64{{-1, 5}, {math.NaN(), 5}, {math.Inf(1), 5}, {0, 0}, {0, -1}, {0, 61}, {0, math.Inf(1)}} {
		if got := decodeDawResult(t)(host.DawPreviewFileRange(path, stretch[0], stretch[1])); !reflect.DeepEqual(got, dawport.Refused(fileBadStretchSentence)) {
			t.Errorf("stretch %v = %+v", stretch, got)
		}
	}
	if role.sent() != 0 {
		t.Fatalf("sent %+v for refused requests", role)
	}
}

// What the engine refuses is worded by the host, naming the engine the resolver drives.
func TestTheFileBindingsWordWhatTheEngineRefused(t *testing.T) {
	cases := map[error]string{
		bridge.ErrPreviewPastEnd:      filePastEndSentence,
		bridge.ErrMediaFileGone:       fileGoneSentence,
		bridge.ErrRecording:           "REAPER is recording. Stop recording first.",
		bridge.ErrPreviewUnsupported:  "Playing part of a file needs the SWS extension in REAPER.",
		bridge.ErrMediaFileUnreadable: "REAPER could not open the file to play it.",
		bridge.ErrNoAnswer:            "REAPER is not answering. Check that REAPER is open and the Narration Utils action is running, then try again.",
		bridge.ErrScriptOutdated:      "The Narration Utils script in REAPER is older than this app. Import it again from this app's REAPER folder.",
		errors.New("something else"):  "REAPER could not do that: something else.",
	}
	for err, sentence := range cases {
		role := &fakeFiles{err: err}
		host, path := filesHost(t, "REAPER", liveReachability(), role, "on")
		if got := decodeDawResult(t)(host.DawPreviewFileRange(path, 0, 5)); !reflect.DeepEqual(got, dawport.Refused(sentence)) {
			t.Errorf("%v: DawPreviewFileRange = %+v, want Refused(%q)", err, got, sentence)
		}
	}
	role := &fakeFiles{err: bridge.ErrRevealUnsupported}
	host, path := filesHost(t, "REAPER", liveReachability(), role, "on")
	if got := decodeDawResult(t)(host.DawRevealFile(path)); got.Refused != "This version of REAPER cannot show a file in its own file browser." {
		t.Fatalf("DawRevealFile = %+v", got)
	}
}

// A launch whose resolver allows the capabilities but that has no file role (no live adapter) refuses rather than failing.
func TestTheFileBindingsWithNoRoleAreRefused(t *testing.T) {
	host, path := filesHost(t, "REAPER", liveReachability(), nil, "on")
	for name, raw := range map[string]func() (string, error){
		"preview": func() (string, error) { return host.DawPreviewFileRange(path, 0, 5) },
		"stop":    host.DawStopFilePreview,
		"reveal":  func() (string, error) { return host.DawRevealFile(path) },
	} {
		if got := decodeDawResult(t)(raw()); got.OK || got.Refused == "" {
			t.Errorf("%s = %+v, want a refusal", name, got)
		}
	}
}

// TestDawFileContractGoldenIsCurrent pins the file bindings' answers. UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/daw-file-*.json.
func TestDawFileContractGoldenIsCurrent(t *testing.T) {
	cases := map[string]func(host *Host, path string) (string, error){
		"daw-file-preview-playing":     func(h *Host, p string) (string, error) { return h.DawPreviewFileRange(p, 12.5, 5) },
		"daw-file-preview-stopped":     func(h *Host, _ string) (string, error) { return h.DawStopFilePreview() },
		"daw-file-revealed":            func(h *Host, p string) (string, error) { return h.DawRevealFile(p) },
		"daw-file-refused-not-picked":  func(h *Host, p string) (string, error) { return h.DawRevealFile(p + ".other.wav") },
		"daw-file-refused-bad-stretch": func(h *Host, p string) (string, error) { return h.DawPreviewFileRange(p, 0, 90) },
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		t.Run(name, func(t *testing.T) {
			host, path := filesHost(t, "REAPER", liveReachability(), &fakeFiles{stopped: true}, "on")
			contractfile.Check(t, name, decodeDawResult(t)(cases[name](host, path)))
		})
	}
}
