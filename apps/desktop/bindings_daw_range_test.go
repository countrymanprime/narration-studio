package main

import (
	"context"
	"errors"
	"maps"
	"reflect"
	"slices"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
)

// DawDeleteRange (SND-6b) over a real coverage service and saved project: coverageProject's chapter with its one item
// "{ITEM-1}" at 0 s, its alignment stored with "Alice." heard from 1 to 1.5 s and "there." not heard
// (fakeAlignedCoverageSidecarWithSkip), and a fake cut_range role standing in for REAPER. What a token range resolves to is
// internal/passagetakes' own (range_test.go); what REAPER answers is dawport/reaper's (reaper_test.go). These cover the
// host's wiring: the resolver first, the mode and fade, the range looked up here, the edit log's cuts, and the answer.

type fakeRangeCutter struct {
	cut    []dawport.DeleteRangeRequest
	answer dawport.Result
	err    error
}

func (f *fakeRangeCutter) DeleteRange(_ context.Context, request dawport.DeleteRangeRequest) (dawport.Result, error) {
	f.cut = append(f.cut, request)
	return f.answer, f.err
}

// cutInREAPER is what dawport/reaper's rangeCutter answers a one-word cut: one undo step.
func cutInREAPER() dawport.Result {
	return dawport.OK("Deleted 1 word and their audio in REAPER.", true).WithUndoSteps(1)
}

// deleteRangeHost is hideTakesHost's coverage-backed launch over coverageProject, with the cut_range role and toggle.
func deleteRangeHost(t *testing.T, kind string, reach *daw.Reachability, role dawport.RangeCutter, toggle string) *Host {
	t.Helper()
	t.Setenv("APPDATA", t.TempDir())
	host := NewHost()
	host.coverageLauncher = fakeAlignedCoverageSidecarWithSkip()
	host.assets = newAssetRegistry(t.TempDir(), nil, whisperWithSmall(t, true), nil, nil)
	next := host.config
	next.projectFolder = coverageProject(t)
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
		if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapCutRange): &toggle}); err != nil {
			t.Fatal(err)
		}
	}
	client, err := bridge.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	host.mu.Lock()
	if kind != "" {
		host.bridge = client
	}
	host.reachability, host.rangeCutter = reach, role
	host.mu.Unlock()
	return host
}

// binding-answers-a-dawresult: the token resolves on the host to the item GUID and its project seconds, the role is sent
// those with the mode and fade, and the answer is the role's DawResult.
func TestDawDeleteRangeSendsTheResolvedItemAndSecondsAndAnswersADawResult(t *testing.T) {
	for _, mode := range []dawport.CutMode{dawport.CutClose, dawport.CutGap} {
		role := &fakeRangeCutter{answer: cutInREAPER()}
		host := deleteRangeHost(t, "REAPER", liveReachability(), role, "on")

		got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, string(mode), 12))

		if !reflect.DeepEqual(got, cutInREAPER()) {
			t.Fatalf("%s: DawDeleteRange = %+v, want %+v", mode, got, cutInREAPER())
		}
		want := []dawport.DeleteRangeRequest{{
			RangeRequest: dawport.RangeRequest{ChapterID: "c-0001", ItemGUID: "{ITEM-1}", Start: 1, End: 1.5, Words: 1},
			Mode:         mode, FadeMs: 12,
		}}
		if !reflect.DeepEqual(role.cut, want) {
			t.Fatalf("%s: sent %+v, want %+v", mode, role.cut, want)
		}
	}
}

// refusals-come-from-the-capability-or-the-host: the resolver's own sentence for each launch it refuses, checked first, and
// nothing sent for any of them.
func TestDawDeleteRangeRefusesWithTheResolversSentenceAndSendsNothing(t *testing.T) {
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
			role := &fakeRangeCutter{answer: cutInREAPER()}
			host := deleteRangeHost(t, c.kind, c.reach, role, c.toggle)
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapCutRange)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("cut_range support = %+v, want reason %s", support, c.reason)
			}

			got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "close", 0))

			if !reflect.DeepEqual(got, dawport.Refused(support.Message)) || len(role.cut) != 0 {
				t.Fatalf("DawDeleteRange = %+v, sent %v; want Refused(%q) and nothing sent", got, role.cut, support.Message)
			}
		})
	}
}

// An engine whose cut_range the resolver refuses for its own reason (Audacity before backups) answers that sentence.
func TestDawDeleteRangeAnswersAnEnginesOwnCutRangeReason(t *testing.T) {
	host := deleteRangeHost(t, "REAPER", liveReachability(), nil, "on")
	support := dawport.Support{Message: "Turn on backups before cutting audio in Audacity."}
	role := &fakeRangeCutter{answer: cutInREAPER()}
	got, err := dawDeleteRangeIn(t.Context(), host.services(), support, role, host.editLog(), "c-0001", 0, 0, "close", 0)
	if err != nil || !reflect.DeepEqual(got, dawport.Refused(support.Message)) || len(role.cut) != 0 {
		t.Fatalf("got %+v, %v; sent %v", got, err, role.cut)
	}
}

// page-sends-no-guid-time-or-path: the mode is close or gap and the fade 0 to 500 ms, refused with delete_range's own
// sentences otherwise; a chapter id that is a GUID, a time or a path is refused as a chapter with no alignment.
func TestDawDeleteRangeTakesAChapterTokensAModeAndAFadeOnly(t *testing.T) {
	role := &fakeRangeCutter{answer: cutInREAPER()}
	host := deleteRangeHost(t, "REAPER", liveReachability(), role, "on")
	for _, mode := range []string{"", "Close", "{ITEM-1}", "1.5", "C:/Projects/Alice/Alice.rpp", "delete"} {
		if got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, mode, 0)); !reflect.DeepEqual(got, dawport.Refused(cutBadModeSentence)) {
			t.Errorf("mode %q: %+v", mode, got)
		}
	}
	for _, fade := range []int{-1, 501} {
		if got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "gap", fade)); !reflect.DeepEqual(got, dawport.Refused(cutBadFadeSentence)) {
			t.Errorf("fade %d: %+v", fade, got)
		}
	}
	// A chapter the manuscript does not have has no stored alignment, so its tokens are the stale refusal.
	for _, id := range []string{"{ITEM-1}", "{TRACK-1}", "1.5", "C:/Projects/Alice/Alice.rpp"} {
		if got := decodeDawResult(t)(host.DawDeleteRange(id, 0, 0, "close", 0)); got.OK || got.Code != dawport.CodeStale {
			t.Errorf("DawDeleteRange(%q) = %+v, want a stale refusal", id, got)
		}
	}
	if len(role.cut) != 0 {
		t.Fatalf("sent %v", role.cut)
	}
	// The bridge refuses the same mode and fade in the same words, so either side reads alike.
	if _, err := (&bridge.Actions{}).DeleteRange(t.Context(), "{ITEM-1}", 1, 2, "x", 0); !errors.Is(err, bridge.ErrBadRange) {
		t.Fatalf("bridge mode check: %v", err)
	}
}

// words-without-audio-are-not-cut, and a stale token range: refused on the host with nothing sent; the stale one with code stale.
func TestDawDeleteRangeRefusesUnheardWordsAndAStaleRange(t *testing.T) {
	role := &fakeRangeCutter{answer: cutInREAPER()}
	host := deleteRangeHost(t, "REAPER", liveReachability(), role, "on")

	unheard := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 1, "close", 0))
	if unheard.OK || unheard.Code != "" || unheard.Refused != "These words weren't heard in the recording, so there's no audio to cut. Run the check again if the chapter has changed." {
		t.Fatalf("unheard = %+v", unheard)
	}
	for _, tokens := range [][2]int{{0, 2}, {1, 0}, {-1, 0}} {
		stale := decodeDawResult(t)(host.DawDeleteRange("c-0001", tokens[0], tokens[1], "close", 0))
		if stale.OK || stale.Changed || stale.Code != dawport.CodeStale {
			t.Fatalf("tokens %v: %+v, want a stale refusal", tokens, stale)
		}
	}
	if len(role.cut) != 0 {
		t.Fatalf("sent %v", role.cut)
	}
}

// words-without-audio-are-not-cut: words the edit log already holds as cut are a no-op, changed false, with nothing sent.
func TestDawDeleteRangeOfWordsAlreadyCutChangesNothing(t *testing.T) {
	role := &fakeRangeCutter{answer: cutInREAPER()}
	host := deleteRangeHost(t, "REAPER", liveReachability(), role, "on")
	one := 1
	if _, err := host.editLog().CutRecord("c-0001", editlog.CutRequest{
		ParagraphID: "p-000001", Keys: []string{"p-000001:0"}, Text: "Alice.", A: 1, B: 1.5, Off0: 1, Off1: 1.5,
		Mode: editlog.CutClose, Daw: "REAPER", GUID: "{ITEM-1}", UndoSteps: &one,
	}); err != nil {
		t.Fatal(err)
	}

	got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "close", 0))

	if !reflect.DeepEqual(got, dawport.OK(cutAlreadyCutSentence, false)) || len(role.cut) != 0 {
		t.Fatalf("DawDeleteRange = %+v, sent %v", got, role.cut)
	}
}

// The role's stale answer passes on with its code; an error it returns is worded as a refusal; no role refuses.
func TestDawDeleteRangePassesOnTheRolesAnswers(t *testing.T) {
	stale := dawport.RefusedStale("That passage's item is no longer in the REAPER project. Read the project again.")
	role := &fakeRangeCutter{answer: stale}
	host := deleteRangeHost(t, "REAPER", liveReachability(), role, "on")
	if got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "close", 0)); !reflect.DeepEqual(got, stale) {
		t.Fatalf("stale = %+v", got)
	}
	for _, err := range []error{bridge.ErrNoAnswer, bridge.ErrUnavailable, context.DeadlineExceeded, errors.New("boom")} {
		failing := &fakeRangeCutter{err: err}
		host := deleteRangeHost(t, "REAPER", liveReachability(), failing, "on")
		if got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "close", 0)); got.OK || got.Refused == "" {
			t.Errorf("%v: %+v, want a refusal", err, got)
		}
	}
	none := deleteRangeHost(t, "REAPER", liveReachability(), nil, "on")
	if got := decodeDawResult(t)(none.DawDeleteRange("c-0001", 0, 0, "close", 0)); got.OK || got.Refused == "" {
		t.Fatalf("no role: %+v, want a refusal", got)
	}
}

// TestDawDeleteRangeContractGoldenIsCurrent pins DawDeleteRange's answer: a close cut (one undo step), a gap cut, a stale
// token range, and the capability's refusal. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-delete-range-*.json.
func TestDawDeleteRangeContractGoldenIsCurrent(t *testing.T) {
	cases := map[string]struct {
		toggle      string
		mode        string
		first, last int
	}{
		"daw-delete-range-done":               {"on", "close", 0, 0},
		"daw-delete-range-gap":                {"on", "gap", 0, 0},
		"daw-delete-range-refused-stale":      {"on", "close", 0, 5},
		"daw-delete-range-refused-capability": {"", "close", 0, 0},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			role := &fakeRangeCutter{answer: cutInREAPER()}
			host := deleteRangeHost(t, "REAPER", liveReachability(), role, c.toggle)
			contractfile.Check(t, name, decodeDawResult(t)(host.DawDeleteRange("c-0001", c.first, c.last, c.mode, 12)))
		})
	}
}
