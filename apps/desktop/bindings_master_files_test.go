package main

import (
	"maps"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/measure"
)

// MasterPlayQuietest and MasterOpenInDaw (SN-M97) over filesHost (bindings_daw_files_test.go) with a finished measurement of
// its picked file. The file roles' own refusals are bindings_daw_files_test.go's; these cover the run's file id and the stretch.

// lastRun makes host's last measurement one finished run of files.
func lastRun(host *Host, files ...MeasureFileResult) {
	host.mu.Lock()
	defer host.mu.Unlock()
	host.measureJob = &measureJob{id: "measure-1", phase: "success", files: files}
}

// measuredFile is path measured as a file of duration seconds whose quietest window starts at quietest (nil: none found).
func measuredFile(path string, duration float64, quietest *float64) MeasureFileResult {
	report := measure.Report{DurationSeconds: duration, NoiseFloorStartSeconds: quietest}
	if quietest != nil {
		report.NoiseFloordBFS = floatPtr(-66.8)
	}
	return MeasureFileResult{Path: path, Name: filepath.Base(path), Status: measureFileMeasured, Report: &report}
}

func TestMasterPlayQuietestPlaysTheFiveSecondsAroundTheQuietestWindow(t *testing.T) {
	for name, c := range map[string]struct {
		duration, quietest float64
		want               dawport.FilePreview
	}{
		// The 0.5 s window from 12 s is centred: 12.25 - 2.5.
		"centred":           {duration: 600, quietest: 12, want: dawport.FilePreview{Start: 9.75, Length: 5}},
		"clamped at start":  {duration: 600, quietest: 0, want: dawport.FilePreview{Start: 0, Length: 5}},
		"clamped at end":    {duration: 30, quietest: 29.5, want: dawport.FilePreview{Start: 25, Length: 5}},
		"shorter than 5 s":  {duration: 3, quietest: 1, want: dawport.FilePreview{Start: 0, Length: 3}},
		"exactly 5 s long":  {duration: 5, quietest: 2, want: dawport.FilePreview{Start: 0, Length: 5}},
		"window at the end": {duration: 600, quietest: 597.5, want: dawport.FilePreview{Start: 595, Length: 5}},
	} {
		t.Run(name, func(t *testing.T) {
			role := &fakeFiles{}
			host, path := filesHost(t, "REAPER", liveReachability(), role, "on")
			lastRun(host, measuredFile(path, c.duration, &c.quietest))

			got := decodeDawResult(t)(host.MasterPlayQuietest(path))

			c.want.Path = path
			if !reflect.DeepEqual(role.previews, []dawport.FilePreview{c.want}) {
				t.Fatalf("sent %+v, want %+v", role.previews, c.want)
			}
			if !got.OK || got.Changed || got.UndoSteps != 0 {
				t.Fatalf("MasterPlayQuietest = %+v, want OK with nothing changed", got)
			}
		})
	}
	role := &fakeFiles{}
	host, path := filesHost(t, "REAPER", liveReachability(), role, "on")
	lastRun(host, measuredFile(path, 600, floatPtr(12)))
	if got, want := decodeDawResult(t)(host.MasterPlayQuietest(path)), dawport.OK("Playing the quietest 5 s of Chapter 01.wav, from 9.75 s.", false); !reflect.DeepEqual(got, want) {
		t.Fatalf("MasterPlayQuietest = %+v, want %+v", got, want)
	}
}

func TestMasterOpenInDawShowsAFileOfTheLastRun(t *testing.T) {
	role := &fakeFiles{}
	host, path := filesHost(t, "REAPER", liveReachability(), role, "on")
	// A file the run could not measure is still a file of the run: it can be shown, though it has no quiet stretch to play.
	lastRun(host, MeasureFileResult{Path: path, Name: filepath.Base(path), Status: measureFileFailed, Error: "not a WAV"})

	got := decodeDawResult(t)(host.MasterOpenInDaw(path))

	if want := dawport.OK("Showing Chapter 01.wav in REAPER.", false); !reflect.DeepEqual(got, want) {
		t.Fatalf("MasterOpenInDaw = %+v, want %+v", got, want)
	}
	if !reflect.DeepEqual(role.reveals, []string{path}) {
		t.Fatalf("sent %v", role.reveals)
	}
}

// The id is a file of the host's last measurement: a file picked in this session but not in that run, a path never picked, and
// any id before a run are refused with the stale code, and nothing reaches the DAW.
func TestMasterPlayQuietestAndOpenInDawRefuseAFileNotInTheLastRun(t *testing.T) {
	role := &fakeFiles{}
	host, path := filesHost(t, "REAPER", liveReachability(), role, "on")
	other := filepath.Join(filepath.Dir(path), "Chapter 02.wav")
	host.mu.Lock()
	host.measurePicked[other] = true
	host.mu.Unlock()
	refused := dawport.RefusedStale(masterNotInRunSentence)
	calls := map[string]func(string) (string, error){"play": host.MasterPlayQuietest, "open": host.MasterOpenInDaw}

	for name, call := range calls {
		if got := decodeDawResult(t)(call(path)); !reflect.DeepEqual(got, refused) {
			t.Errorf("%s with no run = %+v, want %+v", name, got, refused)
		}
	}
	lastRun(host, measuredFile(path, 600, floatPtr(12)))
	for name, call := range calls {
		for _, id := range []string{other, "", "Chapter 01.wav", filepath.Join(filepath.Dir(path), "Elsewhere", "Chapter 01.wav")} {
			if got := decodeDawResult(t)(call(id)); !reflect.DeepEqual(got, refused) {
				t.Errorf("%s %q = %+v, want %+v", name, id, got, refused)
			}
		}
	}
	if role.sent() != 0 {
		t.Fatalf("sent %+v for files not in the last run", role)
	}
}

// A file of the run with no quietest window (digital silence) or not measured says so; no time is invented (ADR 0015).
func TestMasterPlayQuietestRefusesAFileWithNoQuietestWindow(t *testing.T) {
	role := &fakeFiles{}
	host, path := filesHost(t, "REAPER", liveReachability(), role, "on")
	for _, file := range []MeasureFileResult{
		measuredFile(path, 600, nil),
		{Path: path, Name: filepath.Base(path), Status: measureFileFailed, Error: "not a WAV"},
		{Path: path, Name: filepath.Base(path), Status: measureFileCancelled},
	} {
		lastRun(host, file)
		want := dawport.Refused("Chapter 01.wav has no quiet stretch to play: the measurement found no room tone in it.")
		if file.Report == nil {
			want = dawport.Refused("Chapter 01.wav was not measured, so there is no quiet stretch to play.")
		}
		if got := decodeDawResult(t)(host.MasterPlayQuietest(path)); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: MasterPlayQuietest = %+v, want %+v", file.Status, got, want)
		}
	}
	if role.sent() != 0 {
		t.Fatalf("sent %+v with no stretch to play", role)
	}
}

// The capability's sentence comes before the file id, as for the file bindings.
func TestMasterFileBindingsRefuseWithTheCapabilitySentenceFirst(t *testing.T) {
	role := &fakeFiles{}
	host, path := filesHost(t, "REAPER", liveReachability(), role, "off")
	resolver, _ := host.dawResolverFor(host.services())
	for capability, call := range map[dawport.Capability]func(string) (string, error){
		dawport.CapFilePreview: host.MasterPlayQuietest,
		dawport.CapFileReveal:  host.MasterOpenInDaw,
	} {
		want := dawport.Refused(resolver.Support(capability).Message)
		if got := decodeDawResult(t)(call(path + ".not-in-the-run.wav")); !reflect.DeepEqual(got, want) {
			t.Errorf("%s = %+v, want %+v", capability, got, want)
		}
	}
	if role.sent() != 0 {
		t.Fatalf("sent %+v while refused", role)
	}
}

// TestMasterFileContractGoldenIsCurrent pins the two bindings' answers. UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/master-file-*.json.
func TestMasterFileContractGoldenIsCurrent(t *testing.T) {
	cases := map[string]func(host *Host, path string) (string, error){
		"master-file-play-quietest":      func(h *Host, p string) (string, error) { return h.MasterPlayQuietest(p) },
		"master-file-opened":             func(h *Host, p string) (string, error) { return h.MasterOpenInDaw(p) },
		"master-file-refused-not-in-run": func(h *Host, p string) (string, error) { return h.MasterOpenInDaw(p + ".other.wav") },
		"master-file-refused-no-quiet-stretch": func(h *Host, p string) (string, error) {
			lastRun(h, measuredFile(p, 600, nil))
			return h.MasterPlayQuietest(p)
		},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		t.Run(name, func(t *testing.T) {
			host, path := filesHost(t, "REAPER", liveReachability(), &fakeFiles{}, "on")
			lastRun(host, measuredFile(path, 600, floatPtr(12)))
			contractfile.Check(t, name, decodeDawResult(t)(cases[name](host, path)))
		})
	}
}
