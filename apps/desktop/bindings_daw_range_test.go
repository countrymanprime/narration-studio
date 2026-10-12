package main

import (
	"context"
	"errors"
	"maps"
	"math"
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

		got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, string(mode), 12, 0, false))

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

			got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "close", 0, 0, false))

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
	got, err := dawDeleteRangeIn(t.Context(), host.services(), support, role, host.editLog(), "c-0001", 0, 0, "close", 0, 0, false)
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
		if got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, mode, 0, 0, false)); !reflect.DeepEqual(got, dawport.Refused(cutBadModeSentence)) {
			t.Errorf("mode %q: %+v", mode, got)
		}
	}
	for _, fade := range []int{-1, 501} {
		if got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "gap", fade, 0, false)); !reflect.DeepEqual(got, dawport.Refused(cutBadFadeSentence)) {
			t.Errorf("fade %d: %+v", fade, got)
		}
	}
	// A chapter the manuscript does not have has no stored alignment, so its tokens are the stale refusal.
	for _, id := range []string{"{ITEM-1}", "{TRACK-1}", "1.5", "C:/Projects/Alice/Alice.rpp"} {
		if got := decodeDawResult(t)(host.DawDeleteRange(id, 0, 0, "close", 0, 0, false)); got.OK || got.Code != dawport.CodeStale {
			t.Errorf("DawDeleteRange(%q) = %+v, want a stale refusal", id, got)
		}
	}
	if len(role.cut) != 0 {
		t.Fatalf("sent %v", role.cut)
	}
	// The bridge refuses the same mode and fade in the same words, so either side reads alike.
	if _, err := (&bridge.Actions{}).DeleteRange(t.Context(), "{ITEM-1}", 1, 2, "x", 0, 0, false); !errors.Is(err, bridge.ErrBadRange) {
		t.Fatalf("bridge mode check: %v", err)
	}
}

// words-without-audio-are-not-cut, and a stale token range: refused on the host with nothing sent; the stale one with code stale.
func TestDawDeleteRangeRefusesUnheardWordsAndAStaleRange(t *testing.T) {
	role := &fakeRangeCutter{answer: cutInREAPER()}
	host := deleteRangeHost(t, "REAPER", liveReachability(), role, "on")

	unheard := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 1, "close", 0, 0, false))
	if unheard.OK || unheard.Code != "" || unheard.Refused != "These words weren't heard in the recording, so there's no audio to cut. Run the check again if the chapter has changed." {
		t.Fatalf("unheard = %+v", unheard)
	}
	for _, tokens := range [][2]int{{0, 2}, {1, 0}, {-1, 0}} {
		stale := decodeDawResult(t)(host.DawDeleteRange("c-0001", tokens[0], tokens[1], "close", 0, 0, false))
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

	got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "close", 0, 0, false))

	if !reflect.DeepEqual(got, dawport.OK(cutAlreadyCutSentence, false)) || len(role.cut) != 0 {
		t.Fatalf("DawDeleteRange = %+v, sent %v", got, role.cut)
	}
}

// The role's stale answer passes on with its code; an error it returns is worded as a refusal; no role refuses.
func TestDawDeleteRangePassesOnTheRolesAnswers(t *testing.T) {
	stale := dawport.RefusedStale("That passage's item is no longer in the REAPER project. Read the project again.")
	role := &fakeRangeCutter{answer: stale}
	host := deleteRangeHost(t, "REAPER", liveReachability(), role, "on")
	if got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "close", 0, 0, false)); !reflect.DeepEqual(got, stale) {
		t.Fatalf("stale = %+v", got)
	}
	for _, err := range []error{bridge.ErrNoAnswer, bridge.ErrUnavailable, context.DeadlineExceeded, errors.New("boom")} {
		failing := &fakeRangeCutter{err: err}
		host := deleteRangeHost(t, "REAPER", liveReachability(), failing, "on")
		if got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "close", 0, 0, false)); got.OK || got.Refused == "" {
			t.Errorf("%v: %+v, want a refusal", err, got)
		}
	}
	none := deleteRangeHost(t, "REAPER", liveReachability(), nil, "on")
	if got := decodeDawResult(t)(none.DawDeleteRange("c-0001", 0, 0, "close", 0, 0, false)); got.OK || got.Refused == "" {
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
			contractfile.Check(t, name, decodeDawResult(t)(host.DawDeleteRange("c-0001", c.first, c.last, c.mode, 12, 0, false)))
		})
	}
}

// SN-E97: the pad and the room tone reach the role as they were asked for; a pad outside 0 to 500 ms, room tone with "close", or
// a pad that leaves nothing of the words is refused in delete_range's words with nothing sent. That Audacity takes the pad and
// refuses room tone is dawport/audacity's TestDeleteRangeTakesThePadAndRefusesRoomTone; that REAPER lays it,
// integrations/reaper/tests/range_test.lua.
func TestDeleteRangeSendsPadAndRoomToneAndAudacityRefusesRoomTone(t *testing.T) {
	role := &fakeRangeCutter{answer: cutInREAPER()}
	host := deleteRangeHost(t, "REAPER", liveReachability(), role, "on")
	got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, "gap", 12, 100, true))
	if !reflect.DeepEqual(got, cutInREAPER()) {
		t.Fatalf("DawDeleteRange = %+v", got)
	}
	want := []dawport.DeleteRangeRequest{{
		RangeRequest: dawport.RangeRequest{ChapterID: "c-0001", ItemGUID: "{ITEM-1}", Start: 1, End: 1.5, Words: 1},
		Mode:         dawport.CutGap, FadeMs: 12, PadMs: 100, RoomTone: true,
	}}
	if !reflect.DeepEqual(role.cut, want) {
		t.Fatalf("sent %+v, want %+v", role.cut, want)
	}
	role.cut = nil
	for _, c := range []struct {
		mode     string
		pad      int
		roomTone bool
		want     string
	}{
		{"gap", -1, false, cutBadPadSentence},
		{"gap", 501, false, cutBadPadSentence},
		{"close", 0, true, cutRoomToneSentence},
		{"gap", 250, false, cutPadAllSentence},
	} {
		if got := decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, c.mode, 0, c.pad, c.roomTone)); !reflect.DeepEqual(got, dawport.Refused(c.want)) {
			t.Errorf("%+v: %+v, want Refused(%q)", c, got, c.want)
		}
	}
	if len(role.cut) != 0 {
		t.Fatalf("sent %v", role.cut)
	}
}

// TestDawDeleteRangePadContractGoldenIsCurrent pins DawDeleteRange's answer with a pad and room tone: a padded gap cut filled
// with room tone, the host's refusal of room tone for a cut that closes up, and the engine's refusal when the chapter has no
// room tone. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-delete-range-pad*.json.
func TestDawDeleteRangePadContractGoldenIsCurrent(t *testing.T) {
	noRoomTone := dawport.Refused("This chapter has no room tone marked in REAPER. Mark a stretch of room tone on its track with a region named Room tone.")
	cases := map[string]struct {
		mode   string
		answer dawport.Result
	}{
		"daw-delete-range-pad-room-tone":            {"gap", cutInREAPER()},
		"daw-delete-range-pad-refused-close":        {"close", cutInREAPER()},
		"daw-delete-range-pad-refused-no-room-tone": {"gap", noRoomTone},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			role := &fakeRangeCutter{answer: c.answer}
			host := deleteRangeHost(t, "REAPER", liveReachability(), role, "on")
			contractfile.Check(t, name, decodeDawResult(t)(host.DawDeleteRange("c-0001", 0, 0, c.mode, 12, 100, true)))
		})
	}
}

// DawTrimRange (SN-E112): Clean up's Gaps. The item comes from the page and is looked up on the chapter's track as the DAW reports it
// now (splitItems: the item at 10 s for 10 s and a later one); the gap must lie inside it. What REAPER does with the request is
// delete_range's (range_test.lua, section 8).

// trimInREAPER is what dawport/reaper's rangeCutter answers a cut of no words: one undo step.
func trimInREAPER() dawport.Result {
	return dawport.OK("Deleted the words and their audio in REAPER.", true).WithUndoSteps(1)
}

func trimGap(t *testing.T, cutter dawport.RangeCutter, itemID string, start, end float64, fadeMs int) dawport.Result {
	t.Helper()
	items := splitItems()
	got, err := dawTrimRangeIn(t.Context(), "REAPER", available(), cutter, splitTrack(&items, nil, nil), "c-0001", itemID, start, end, fadeMs)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// The item id resolves on the host to the item the track reports now (braces and case aside), the gap is sent as a close cut with
// no words, pad or room tone, and the answer says what was shortened.
func TestDawTrimRangeSendsTheItemTheHostReadAsACloseCutAndAnswersADawResult(t *testing.T) {
	for _, id := range []string{splitItem, "c0000001-0000-4000-8000-000000000001"} {
		role := &fakeRangeCutter{answer: trimInREAPER()}
		got := trimGap(t, role, id, 12.5, 14, 6)
		want := dawport.OK("Shortened the gap in REAPER.", true).WithUndoSteps(1)
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: DawTrimRange = %+v, want %+v", id, got, want)
		}
		sent := []dawport.DeleteRangeRequest{{RangeRequest: dawport.RangeRequest{ChapterID: "c-0001", ItemGUID: splitItem, Start: 12.5, End: 14},
			Mode: dawport.CutClose, FadeMs: 6}}
		if !reflect.DeepEqual(role.cut, sent) {
			t.Fatalf("%s: sent %+v, want %+v", id, role.cut, sent)
		}
	}
}

// An item the track no longer holds, a take GUID in place of an item, or a gap outside the item is refused stale; times or a fade
// out of bounds are refused; nothing is sent for any of them.
func TestDawTrimRangeRefusesWhatTheTrackNoLongerHoldsAndSendsNothing(t *testing.T) {
	for name, c := range map[string]struct {
		id         string
		start, end float64
		fade       int
		stale      bool
	}{
		"gone":            {"{C0000009-0000-4000-8000-000000000009}", 12, 13, 6, true},
		"a take GUID":     {splitTake, 12, 13, 6, true},
		"empty":           {"", 12, 13, 6, true},
		"before the item": {splitItem, 9, 11, 6, true},
		"after the item":  {splitItem, 19, 21, 6, true},
		"reversed":        {splitItem, 13, 12, 6, false},
		"empty gap":       {splitItem, 12, 12, 6, false},
		"negative":        {splitItem, -1, 12, 6, false},
		"endless":         {splitItem, 12, math.Inf(1), 6, false},
		"not a number":    {splitItem, math.NaN(), 12, 6, false},
		"negative fade":   {splitItem, 12, 13, -1, false},
		"long fade":       {splitItem, 12, 13, bridge.MaxCutFadeMs + 1, false},
	} {
		role := &fakeRangeCutter{answer: trimInREAPER()}
		got := trimGap(t, role, c.id, c.start, c.end, c.fade)
		if got.OK || got.Refused == "" || (got.Code == dawport.CodeStale) != c.stale || len(role.cut) != 0 {
			t.Errorf("%s: %+v, sent %v; want a refusal (stale %v) and nothing sent", name, got, role.cut, c.stale)
		}
	}
}

// The role's refusals pass through as they are; an error it or the track read returned is a refusal in a sentence; a track refusal is
// the answer; no role is the connection refusal; an engine's own cut_range reason (Audacity before backups) is checked first.
func TestDawTrimRangePassesOnTheRolesAnswers(t *testing.T) {
	stale := dawport.RefusedStale("That passage's item is no longer in the REAPER project. Read the project again.")
	if got := trimGap(t, &fakeRangeCutter{answer: stale}, splitItem, 12, 13, 6); !reflect.DeepEqual(got, stale) {
		t.Fatalf("stale = %+v", got)
	}
	unchanged := dawport.OK("Nothing to cut.", false)
	if got := trimGap(t, &fakeRangeCutter{answer: unchanged}, splitItem, 12, 13, 6); !reflect.DeepEqual(got, unchanged) {
		t.Fatalf("unchanged = %+v", got)
	}
	for _, err := range []error{bridge.ErrNoAnswer, bridge.ErrUnavailable, bridge.ErrExperimentalOff, context.DeadlineExceeded, &bridge.TrackStaleError{}, errors.New("boom")} {
		if got := trimGap(t, &fakeRangeCutter{err: err}, splitItem, 12, 13, 6); got.OK || got.Refused == "" {
			t.Errorf("%v: %+v, want a refusal", err, got)
		}
		items := splitItems()
		got, _ := dawTrimRangeIn(t.Context(), "REAPER", available(), &fakeRangeCutter{}, splitTrack(&items, nil, err), "c-0001", splitItem, 12, 13, 6)
		if got.OK || got.Refused == "" {
			t.Errorf("track read %v: %+v, want a refusal", err, got)
		}
	}
	noLink := dawport.Refused("Link this chapter to a track first.")
	items := splitItems()
	role := &fakeRangeCutter{}
	if got, _ := dawTrimRangeIn(t.Context(), "REAPER", available(), role, splitTrack(&items, &noLink, nil), "c-0001", splitItem, 12, 13, 6); !reflect.DeepEqual(got, noLink) || len(role.cut) != 0 {
		t.Fatalf("a track refusal = %+v, sent %v", got, role.cut)
	}
	if got, err := dawTrimRangeIn(t.Context(), "REAPER", available(), nil, splitTrack(&items, nil, nil), "c-0001", splitItem, 12, 13, 6); err != nil || got.OK || got.Refused == "" {
		t.Fatalf("no role = %+v, %v", got, err)
	}
	backups := dawport.Support{Message: "Turn on backups before cutting audio in Audacity."}
	if got, _ := dawTrimRangeIn(t.Context(), "Audacity", backups, role, splitTrack(&items, nil, nil), "c-0001", splitItem, 12, 13, 6); !reflect.DeepEqual(got, dawport.Refused(backups.Message)) || len(role.cut) != 0 {
		t.Fatalf("an engine's own reason = %+v, sent %v", got, role.cut)
	}
}

// The cut_range capability's own sentence for each launch the resolver refuses, checked first, and nothing sent.
func TestDawTrimRangeRefusesWithTheResolversSentenceAndSendsNothing(t *testing.T) {
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
			role := &fakeRangeCutter{answer: trimInREAPER()}
			host := deleteRangeHost(t, c.kind, c.reach, role, c.toggle)
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapCutRange)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("cut_range support = %+v, want reason %s", support, c.reason)
			}
			got := decodeDawResult(t)(host.DawTrimRange("c-0001", splitItem, 12, 13, 6))
			if !reflect.DeepEqual(got, dawport.Refused(support.Message)) || len(role.cut) != 0 {
				t.Fatalf("DawTrimRange = %+v, sent %v; want Refused(%q)", got, role.cut, support.Message)
			}
		})
	}
}

// TestDawTrimRangeContractGoldenIsCurrent pins DawTrimRange's answers: a gap shortened in REAPER (one undo step), the stale refusal of
// a gap no longer in its item, and the cut_range capability's refusal. UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/daw-trim-range-*.json.
func TestDawTrimRangeContractGoldenIsCurrent(t *testing.T) {
	refusedCapability := dawport.Support{Message: "Experimental REAPER actions are off. Turn them on in Settings to cut words and audio."}
	cases := map[string]struct {
		support dawport.Support
		start   float64
	}{
		"daw-trim-range-done":               {available(), 12.5},
		"daw-trim-range-refused-stale":      {available(), 21},
		"daw-trim-range-refused-capability": {refusedCapability, 12.5},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			items := splitItems()
			got, err := dawTrimRangeIn(t.Context(), "REAPER", c.support, &fakeRangeCutter{answer: trimInREAPER()}, splitTrack(&items, nil, nil),
				"c-0001", splitItem, c.start, c.start+1.5, 6)
			if err != nil {
				t.Fatal(err)
			}
			contractfile.Check(t, name, got)
		})
	}
}
