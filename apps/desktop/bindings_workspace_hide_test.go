package main

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// WorkspaceHideTakes (SND-5b) over a real coverage service and saved project: coverageProject's chapter with its one item
// "{ITEM-1}" rewritten to hold two takes, "{TAKE-A}" and the active "{TAKE-B}", and a fake takes role standing in for REAPER.
// What the passage and candidate resolve to is internal/passagetakes' own (hide_test.go); these cover the host's wiring.

const (
	hideKeepA = "take:{ITEM-1}:{TAKE-A}"
	hideKeepB = "take:{ITEM-1}:{TAKE-B}"
)

type fakeTakeSelector struct {
	hidden    [][2]string
	activated [][2]string
	answer    dawport.Result
}

func (f *fakeTakeSelector) SetActiveTake(_ context.Context, itemGUID, takeGUID string) (dawport.ActiveTakeSet, error) {
	f.activated = append(f.activated, [2]string{itemGUID, takeGUID})
	return dawport.ActiveTakeSet{Changed: true}, nil
}

func (f *fakeTakeSelector) HideTakes(_ context.Context, itemGUID, keepTakeGUID string) (dawport.Result, error) {
	f.hidden = append(f.hidden, [2]string{itemGUID, keepTakeGUID})
	return f.answer, nil
}

// twoTakeCoverageProject is coverageProject with its item holding two takes, the second active.
func twoTakeCoverageProject(t *testing.T) string {
	t.Helper()
	project := coverageProject(t)
	for _, name := range []string{"media/a.wav", "media/b.wav"} {
		if err := os.WriteFile(filepath.Join(project, filepath.FromSlash(name)), []byte("RIFF audio"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	rpp := `<REAPER_PROJECT 0.1 "7.80/win64" 1789970042 0
  <TRACK {TRACK-1}
    NAME "Chapter One"
    TRACKID {TRACK-1}
    <ITEM
      POSITION 0
      LENGTH 4
      IGUID {ITEM-1}
      NAME "a"
      SOFFS 0
      PLAYRATE 1 1 0 -1 0 0.0025
      GUID {TAKE-A}
      <SOURCE WAVE
        FILE "media/a.wav"
      >
      TAKE SEL
      NAME "b"
      SOFFS 0
      PLAYRATE 1 1 0 -1 0 0.0025
      GUID {TAKE-B}
      <SOURCE WAVE
        FILE "media/b.wav"
      >
    >
  >
>
`
	if err := os.WriteFile(filepath.Join(project, "book.rpp"), []byte(rpp), 0o600); err != nil {
		t.Fatal(err)
	}
	return project
}

// hideTakesHost is a REAPER launch over twoTakeCoverageProject with the chapter's alignment stored, a bridge client, the
// given reachability and takes role, and the takes capability set to toggle ("" leaves it on auto, Experimental and off).
func hideTakesHost(t *testing.T, kind string, reach *daw.Reachability, role dawport.TakeSelector, toggle string) *Host {
	t.Helper()
	t.Setenv("APPDATA", t.TempDir())
	host := NewHost()
	host.coverageLauncher = fakeAlignedCoverageSidecarWithSkip()
	host.assets = newAssetRegistry(t.TempDir(), nil, whisperWithSmall(t, true), nil, nil)
	next := host.config
	next.projectFolder = twoTakeCoverageProject(t)
	next.comparePython, next.compareBackend = "python-sidecar", "compare.py"
	next.daw = kind
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()
	// The finished check starts a chaptersync:state read of the project folder; Windows cannot remove the folder while it runs.
	host.chapterSyncEmits.Wait()
	if toggle != "" {
		if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapTakes): &toggle}); err != nil {
			t.Fatal(err)
		}
	}
	client, err := bridge.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	// The attached project's chapter-sync watcher reads host.services() already, so the swap goes under h.mu.
	host.mu.Lock()
	if kind != "" {
		host.bridge = client
	}
	host.reachability, host.takeSelector = reach, role
	host.mu.Unlock()
	return host
}

// decodeDawResult decodes a binding's DawResult answer: decodeDawResult(t)(host.WorkspaceHideTakes(...)).
func decodeDawResult(t *testing.T) func(string, error) dawport.Result {
	return func(raw string, err error) dawport.Result {
		t.Helper()
		result := bindingAnswer[dawport.Result](t)(raw, err)
		if result.UndoSteps < 0 || result.UndoSteps > dawport.MaxUndoSteps || result.OK == (result.Refused != "") {
			t.Fatalf("not a dawResult: %+v", result)
		}
		return result
	}
}

// binding-answers-a-dawresult: the passage and the kept candidate resolve on the host to the item and take GUIDs the role
// is sent, and the answer is the role's DawResult.
func TestWorkspaceHideTakesSendsThePassagesItemAndKeptTakeAndAnswersADawResult(t *testing.T) {
	muted := dawport.OK("Muted 1 other take in REAPER. It is still in the project.", true)
	role := &fakeTakeSelector{answer: muted}
	host := hideTakesHost(t, "REAPER", liveReachability(), role, "on")

	got := decodeDawResult(t)(host.WorkspaceHideTakes("c-0001", 0, 0, hideKeepA))

	if !reflect.DeepEqual(got, muted) || got.UndoSteps != 1 {
		t.Fatalf("WorkspaceHideTakes = %+v, want %+v", got, muted)
	}
	if want := [][2]string{{"{ITEM-1}", "{TAKE-A}"}}; !reflect.DeepEqual(role.hidden, want) {
		t.Fatalf("sent %v, want %v", role.hidden, want)
	}
}

// refusals-come-from-the-capability-or-the-host: the resolver's own sentence for each launch it refuses, the stale sentence for
// a passage or candidate the stored alignment no longer holds, and nothing sent for any of them.
func TestWorkspaceHideTakesRefusesWithTheResolversSentenceAndSendsNothing(t *testing.T) {
	notAnswering := daw.NewReachability(nil)
	for name, c := range map[string]struct {
		kind   string
		reach  *daw.Reachability
		toggle string
		reason dawport.Reason
	}{
		"standalone":        {"", liveReachability(), "on", dawport.ReasonStandalone},
		"not answering":     {"REAPER", notAnswering, "on", dawport.ReasonNotRunning},
		"experimental off":  {"REAPER", liveReachability(), "", dawport.ReasonExperimentalOff},
		"toggle turned off": {"REAPER", liveReachability(), "off", dawport.ReasonTurnedOff},
	} {
		t.Run(name, func(t *testing.T) {
			role := &fakeTakeSelector{answer: dawport.OK("muted", true)}
			host := hideTakesHost(t, c.kind, c.reach, role, c.toggle)
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapTakes)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("takes support = %+v, want reason %s", support, c.reason)
			}

			got := decodeDawResult(t)(host.WorkspaceHideTakes("c-0001", 0, 0, hideKeepA))

			if !reflect.DeepEqual(got, dawport.Refused(support.Message)) || len(role.hidden) != 0 {
				t.Fatalf("WorkspaceHideTakes = %+v, sent %v; want Refused(%q) and nothing sent", got, role.hidden, support.Message)
			}
		})
	}
}

func TestWorkspaceHideTakesRefusesAStaleCandidateAsStaleAndSendsNothing(t *testing.T) {
	role := &fakeTakeSelector{answer: dawport.OK("muted", true)}
	host := hideTakesHost(t, "REAPER", liveReachability(), role, "on")

	got := decodeDawResult(t)(host.WorkspaceHideTakes("c-0001", 0, 0, "take:{ITEM-1}:{TAKE-GONE}"))

	if got.OK || got.Changed || got.Code != dawport.CodeStale || len(role.hidden) != 0 {
		t.Fatalf("WorkspaceHideTakes = %+v, sent %v", got, role.hidden)
	}
}

// A token range outside the stored alignment is the caller's error, as for WorkspaceTakes and WorkspaceUseTake.
func TestWorkspaceHideTakesOutsideTheAlignmentIsTheCallersError(t *testing.T) {
	role := &fakeTakeSelector{}
	host := hideTakesHost(t, "REAPER", liveReachability(), role, "on")
	if _, err := host.WorkspaceHideTakes("c-0001", 0, 9, hideKeepA); err == nil || len(role.hidden) != 0 {
		t.Fatalf("err = %v, sent %v", err, role.hidden)
	}
}

// page-sends-no-guid: a GUID-shaped id, a bare take GUID, a path or a REAPER action name is looked up among the
// candidates the host offers, and refused as stale: nothing the page sends is passed on as it is.
func TestWorkspaceHideTakesLooksUpTheCandidateRatherThanTrustingIt(t *testing.T) {
	role := &fakeTakeSelector{answer: dawport.OK("muted", true)}
	host := hideTakesHost(t, "REAPER", liveReachability(), role, "on")
	for _, id := range []string{"{TAKE-A}", "{ITEM-1}", "take:{ITEM-2}:{TAKE-A}", "media/a.wav", "C:/Projects/book.rpp", "_RS_HIDE_TAKES", "hide_takes"} {
		got := decodeDawResult(t)(host.WorkspaceHideTakes("c-0001", 0, 0, id))
		if got.OK || got.Code != dawport.CodeStale {
			t.Errorf("%q: WorkspaceHideTakes = %+v, want a stale refusal", id, got)
		}
	}
	if len(role.hidden) != 0 {
		t.Fatalf("sent %v for ids the host never offered", role.hidden)
	}
	if got := decodeDawResult(t)(host.WorkspaceHideTakes("c-0001", 0, 0, hideKeepB)); !got.OK || len(role.hidden) != 1 || role.hidden[0][1] != "{TAKE-B}" {
		t.Fatalf("an offered id: %+v, sent %v", got, role.hidden)
	}
}

// TestDawHideTakesContractGoldenIsCurrent pins WorkspaceHideTakes' answer: other takes muted (one undo step), nothing to mute,
// and a capability refusal. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-hide-takes-*.json.
func TestDawHideTakesContractGoldenIsCurrent(t *testing.T) {
	cases := []struct {
		name, toggle string
		answer       dawport.Result
	}{
		{"daw-hide-takes-done", "on", dawport.OK("Muted 1 other take in REAPER. It is still in the project.", true)},
		{"daw-hide-takes-nothing", "on", dawport.OK("No other take to mute in REAPER.", false)},
		{"daw-hide-takes-refused", "", dawport.OK("never sent", true)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			host := hideTakesHost(t, "REAPER", liveReachability(), &fakeTakeSelector{answer: c.answer}, c.toggle)
			raw, err := host.WorkspaceHideTakes("c-0001", 0, 0, hideKeepB)
			contractfile.Check(t, c.name, decodeDawResult(t)(raw, err))
		})
	}
}
