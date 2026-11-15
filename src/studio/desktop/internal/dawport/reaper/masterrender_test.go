package reaper

import (
	"context"
	"desktop/internal/brand"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

func renderer(a *Adapter) dawport.FXRenderer {
	return a.Role(dawport.CapRenderWithFX).(dawport.FXRenderer)
}

// render_with_fx carries the run, the approval, the run folder and the regions, one per line (narration_master_render.lua).
func TestRenderWithFXWritesTheApprovalTheFolderAndTheRegions(t *testing.T) {
	adapter, dir := newAdapter(t, nil)
	render := dawport.FXRender{Regions: []string{"Chapter 2", "Chapter 1"}, OutputFolder: "C:/p/" + brand.ProjectFolder + "/mastering/run1",
		Approval: "0123456789abcdef0123456789abcdef"}
	if err := renderer(adapter).RenderWithFX("r1", render); err != nil {
		t.Fatalf("RenderWithFX: %v", err)
	}
	want := [][]string{{"render_with_fx", "r1", render.Approval, render.OutputFolder, "Chapter 2\nChapter 1"}}
	if got := sentCommands(t, dir); !slices.EqualFunc(got, want, slices.Equal) {
		t.Errorf("wrote %q, want %q", got, want)
	}
}

// The adapter refuses a request the bridge would refuse anyway before anything is written: no approval, no folder, no region, or a
// region name that would split into two.
func TestRenderWithFXRefusesAnIncompleteRequestAndWritesNothing(t *testing.T) {
	ok := dawport.FXRender{Regions: []string{"Chapter 1"}, OutputFolder: "C:/p/" + brand.ProjectFolder + "/mastering/run1", Approval: "0123456789abcdef0123456789abcdef"}
	for name, tc := range map[string]struct {
		change func(*dawport.FXRender)
		want   error
	}{
		"no approval":           {func(r *dawport.FXRender) { r.Approval = "" }, ErrNoApproval},
		"no folder":             {func(r *dawport.FXRender) { r.OutputFolder = "" }, ErrBadRender},
		"no region":             {func(r *dawport.FXRender) { r.Regions = nil }, ErrBadRender},
		"an empty region":       {func(r *dawport.FXRender) { r.Regions = []string{""} }, ErrBadRender},
		"a region with a break": {func(r *dawport.FXRender) { r.Regions = []string{"Chapter\n1"} }, ErrBadRender},
	} {
		t.Run(name, func(t *testing.T) {
			adapter, dir := newAdapter(t, nil)
			render := ok
			tc.change(&render)
			if err := renderer(adapter).RenderWithFX("r1", render); !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if got := sentCommands(t, dir); len(got) != 0 {
				t.Errorf("wrote %q", got)
			}
		})
	}
}

// fakeBridgeFiles is the file access the fake REAPER uses. A test swaps a call for one that fails once, the way Windows fails a read or an
// append while a virus scanner, an indexer or the host's own handle still holds the file (a sharing violation).
type fakeBridgeFiles struct {
	readFile  func(name string) ([]byte, error)
	appendLog func(name, lines string) error
}

var osFakeBridgeFiles = fakeBridgeFiles{
	readFile: os.ReadFile,
	appendLog: func(name, lines string) error {
		log, err := os.OpenFile(name, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
		if err != nil {
			return err
		}
		_, werr := log.WriteString(lines)
		if cerr := log.Close(); werr == nil {
			werr = cerr
		}
		return werr
	},
}

// answerOnce is one pass of the fake REAPER over dir's commands folder: each command file not in answered gets answer's lines appended to
// events.log, in one write. A command is answered once and only once it has been both read and answered: one whose read or append failed
// stays out of answered and is tried again on the next pass. (Marking it first left it unanswered for good, and the host waited its whole
// answer timeout for a reply that was never coming: TestReadMasterChainIs... and TestFXRangeRefusals each ran 60 s on Windows, #3492.)
// Each failure goes to report (the test's log, shown when the test fails), so a Windows run that hangs again says which call failed.
// It returns how many commands it could not answer on this pass.
func answerOnce(dir string, answered map[string]bool, files fakeBridgeFiles, report func(format string, args ...any), answer func(command []string) [][]string) (failed int) {
	paths, _ := filepath.Glob(filepath.Join(dir, "commands", "*.cmd"))
	for _, path := range paths {
		if answered[path] {
			continue
		}
		raw, err := files.readFile(path)
		if err != nil {
			report("the fake bridge could not read %s, will try again: %v", filepath.Base(path), err)
			failed++
			continue
		}
		fields, _ := bridge.DecodeFields(strings.TrimSuffix(string(raw), "\n"))
		var lines strings.Builder
		for _, line := range answer(fields[1:]) {
			lines.WriteString(bridge.EncodeFields(line) + "\n")
		}
		if err := files.appendLog(filepath.Join(dir, "events.log"), lines.String()); err != nil {
			report("the fake bridge could not answer %s, will try again: %v", filepath.Base(path), err)
			failed++
			continue
		}
		answered[path] = true
	}
	return failed
}

// answerCommands plays REAPER for one session: each command it finds gets answer's lines appended to events.log, and the client is
// dispatched, as the host's loop would, until the test ends.
func answerCommands(t *testing.T, client *bridge.Client, dir string, answer func(command []string) [][]string) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	t.Cleanup(func() { cancel(); <-done })
	go func() {
		defer close(done)
		answered := map[string]bool{}
		for ctx.Err() == nil {
			// t.Logf is safe here: the cleanup above waits for this goroutine before the test is over.
			answerOnce(dir, answered, osFakeBridgeFiles, t.Logf, answer)
			_ = client.Dispatch()
			time.Sleep(5 * time.Millisecond)
		}
	}()
}

// A command the fake could not read, or could not answer, on one pass is answered on a later one, and exactly once (#3492).
func TestTheFakeBridgeAnswersACommandItCouldNotReadOrAnswerAtFirst(t *testing.T) {
	_, dir := newClient(t)
	command := filepath.Join(dir, "commands", "00000000.cmd")
	if err := os.WriteFile(command, []byte(bridge.EncodeFields([]string{"1", "some_command", "run1"})+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	reads, appends := 0, 0
	files := fakeBridgeFiles{
		readFile: func(name string) ([]byte, error) {
			if reads++; reads == 1 {
				return nil, errors.New("sharing violation")
			}
			return os.ReadFile(name)
		},
		appendLog: func(name, lines string) error {
			if appends++; appends == 1 {
				return errors.New("sharing violation")
			}
			return osFakeBridgeFiles.appendLog(name, lines)
		},
	}
	answered := map[string]bool{}
	answer := func(command []string) [][]string { return [][]string{{"DONE", command[1]}} }
	var reported []string
	report := func(format string, args ...any) { reported = append(reported, fmt.Sprintf(format, args...)) }
	for pass, wantFailed := range []int{1, 1, 0, 0} {
		if got := answerOnce(dir, answered, files, report, answer); got != wantFailed {
			t.Fatalf("pass %d: %d commands unanswered, want %d", pass+1, got, wantFailed)
		}
	}
	if len(reported) != 2 {
		t.Errorf("reported %q, want one line for the failed read and one for the failed answer", reported)
	}
	log, err := os.ReadFile(filepath.Join(dir, "events.log"))
	if err != nil {
		t.Fatal(err)
	}
	if want := bridge.EncodeFields([]string{"DONE", "run1"}) + "\n"; string(log) != want {
		t.Errorf("events.log = %q, want %q (one answer)", log, want)
	}
}

func TestReadMasterChainIsTheBridgesListInTheDAWPortsShape(t *testing.T) {
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"MASTER_CHAIN_TRACK", command[1], "{00000001-0000-4000-8000-000000000001}", "Voice", "1", "2", "7:1:2"},
			{"MASTER_CHAIN_FX", command[1], "{00000001-0000-4000-8000-000000000001}", "Voice", "VST: ReaEQ (Cockos)", "0", "2:3:4"},
			{"MASTER_CHAIN_TRACK", command[1], "master", "MASTER", "0", "0", "7:5:6"},
			{"MASTER_CHAIN_FX", command[1], "master", "MASTER", "VST: ReaLimit (Cockos)", "1", "0:7:11"},
			{"MASTER_CHAIN_READ", command[1], "2", "0", "2"},
		}
	})
	got, err := adapter.Role(dawport.CapMasterChainRead).(dawport.MasterChainReader).ReadMasterChain(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	want := dawport.MasterChain{
		Tracks: []dawport.TrackFX{{TrackGUID: "{00000001-0000-4000-8000-000000000001}", Name: "Voice", Mix: dawport.TrackMix{Mute: true, Solo: 2, Mix: "7:1:2"},
			FX: []dawport.FXSlot{{Name: "VST: ReaEQ (Cockos)", Params: "2:3:4"}}}},
		Master:    []dawport.FXSlot{{Name: "VST: ReaLimit (Cockos)", Enabled: true, Params: "0:7:11"}},
		MasterMix: dawport.TrackMix{Mix: "7:5:6"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

// master_chain_read goes through bridge.Actions' gate like every command: with no gate, refused and nothing written.
func TestReadMasterChainIsGatedByTheResolver(t *testing.T) {
	adapter, dir := newAdapter(t, nil)
	if _, err := adapter.Role(dawport.CapMasterChainRead).(dawport.MasterChainReader).ReadMasterChain(t.Context()); !errors.Is(err, bridge.ErrNotGated) {
		t.Fatalf("err = %v, want ErrNotGated", err)
	}
	if got := sentCommands(t, dir); len(got) != 0 {
		t.Errorf("wrote %q", got)
	}
}

// An older script's chain reaches the port marked SettingsUnread, so the mastering row can refuse it (#2995).
func TestReadMasterChainCarriesAnOlderScriptsMark(t *testing.T) {
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"MASTER_CHAIN_FX", command[1], "master", "MASTER", "VST: ReaLimit (Cockos)", "1"},
			{"MASTER_CHAIN_READ", command[1], "1", "0"},
		}
	})
	got, err := adapter.Role(dawport.CapMasterChainRead).(dawport.MasterChainReader).ReadMasterChain(t.Context())
	if err != nil || !got.SettingsUnread {
		t.Fatalf("got %+v, %v; want the chain marked SettingsUnread", got, err)
	}
}
