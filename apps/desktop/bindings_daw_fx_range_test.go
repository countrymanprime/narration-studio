package main

import (
	"context"
	"encoding/json"
	"errors"
	"maps"
	"math"
	"reflect"
	"slices"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/passagetakes"
)

// DawApplyFxToRange and DawRemoveFxFromRange (SND-6c) over deleteRangeHost's coverage-backed launch: coverageProject's
// chapter with its one item "{ITEM-1}" at 0 s, "Alice." heard from 1 to 1.5 s and "there." not heard, and a fake fx_range
// role standing in for REAPER. What a token range resolves to is internal/passagetakes' own (range_test.go); what REAPER
// answers is dawport/reaper's (reaper_test.go). These cover the host's wiring: the resolver first, the fade, the range
// looked up here, the chain checked against the DAW's own list, and the answer.

const fxRangeChain = "Podcast Voice.RfxChain"

type fakeRangeFX struct {
	applied []dawport.FXRangeRequest
	removed [][2]string
	answer  dawport.Result
	err     error
}

func (f *fakeRangeFX) ApplyFXToRange(_ context.Context, request dawport.FXRangeRequest) (dawport.Result, error) {
	f.applied = append(f.applied, request)
	return f.answer, f.err
}

func (f *fakeRangeFX) RemoveFXFromRange(_ context.Context, itemGUID, chainName string) (dawport.Result, error) {
	f.removed = append(f.removed, [2]string{itemGUID, chainName})
	return f.answer, f.err
}

func (f *fakeRangeFX) sent() int { return len(f.applied) + len(f.removed) }

// chainOnInREAPER and chainOffInREAPER are what dawport/reaper's rangeFXApplier answers: one undo step each.
func chainOnInREAPER() dawport.Result {
	return dawport.OK("Added Podcast Voice.RfxChain to 1 word in REAPER.", true).WithUndoSteps(1)
}

func chainOffInREAPER() dawport.Result {
	return dawport.OK("Podcast Voice.RfxChain taken off in REAPER.", true).WithUndoSteps(1)
}

// listing is the DAW's chain list as fxChainNamesOf reads it.
func listing(names ...string) fxChainNames {
	return func(context.Context) ([]string, bool, error) { return names, false, nil }
}

// fxRangeHost is deleteRangeHost with the fx_range role and toggle.
func fxRangeHost(t *testing.T, kind string, reach *daw.Reachability, role dawport.RangeFXApplier, toggle string) *Host {
	t.Helper()
	host := deleteRangeHost(t, kind, reach, nil, "")
	if toggle != "" {
		if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapFXRange): &toggle}); err != nil {
			t.Fatal(err)
		}
	}
	host.mu.Lock()
	host.rangeFX = role
	host.mu.Unlock()
	return host
}

func fxRangeSupport(t *testing.T, host *Host) dawport.Support {
	t.Helper()
	resolver, _ := host.dawResolverFor(host.services())
	return resolver.Support(dawport.CapFXRange)
}

func applyFx(t *testing.T, host *Host, role dawport.RangeFXApplier, chains fxChainNames, first, last int, chain string, fadeMs int) dawport.Result {
	t.Helper()
	got, err := dawApplyFxToRangeIn(t.Context(), host.services(), fxRangeSupport(t, host), role, chains, "c-0001", first, last, chain, fadeMs)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// bindings-answer-a-dawresult: the token resolves on the host to the item GUID and its project seconds, the role is sent
// those with the chain and the fade, and the answer is the role's DawResult with one undo step.
func TestDawApplyFxToRangeSendsTheResolvedItemSecondsAndChainAndAnswersADawResult(t *testing.T) {
	role := &fakeRangeFX{answer: chainOnInREAPER()}
	host := fxRangeHost(t, "REAPER", liveReachability(), role, "on")

	got := applyFx(t, host, role, listing("Other.RfxChain", fxRangeChain), 0, 0, fxRangeChain, 10)

	if !reflect.DeepEqual(got, chainOnInREAPER()) || got.UndoSteps != 1 {
		t.Fatalf("DawApplyFxToRange = %+v, want %+v", got, chainOnInREAPER())
	}
	want := []dawport.FXRangeRequest{{
		RangeRequest: dawport.RangeRequest{ChapterID: "c-0001", ItemGUID: "{ITEM-1}", Start: 1, End: 1.5, Words: 1},
		ChainID:      fxRangeChain, ChainName: fxRangeChain, FadeMs: 10,
	}}
	if !reflect.DeepEqual(role.applied, want) {
		t.Fatalf("sent %+v, want %+v", role.applied, want)
	}
}

func TestDawRemoveFxFromRangeSendsTheResolvedItemAndChainAndAnswersADawResult(t *testing.T) {
	role := &fakeRangeFX{answer: chainOffInREAPER()}
	host := fxRangeHost(t, "REAPER", liveReachability(), role, "on")

	got := decodeDawResult(t)(host.DawRemoveFxFromRange("c-0001", 0, 0, fxRangeChain))

	if !reflect.DeepEqual(got, chainOffInREAPER()) || got.UndoSteps != 1 {
		t.Fatalf("DawRemoveFxFromRange = %+v, want %+v", got, chainOffInREAPER())
	}
	if want := [][2]string{{"{ITEM-1}", fxRangeChain}}; !reflect.DeepEqual(role.removed, want) {
		t.Fatalf("sent %v, want %v", role.removed, want)
	}
}

// A piece that does not carry the chain changes nothing, and the answer says the alignment names the piece only after a
// new check.
func TestDawRemoveFxFromRangeOfAnItemWithoutTheChainChangesNothingAndSaysToCheckAgain(t *testing.T) {
	role := &fakeRangeFX{answer: dawport.OK("Podcast Voice.RfxChain is not on that piece in REAPER, so nothing changed.", false)}
	host := fxRangeHost(t, "REAPER", liveReachability(), role, "on")

	got := decodeDawResult(t)(host.DawRemoveFxFromRange("c-0001", 0, 0, fxRangeChain))

	want := dawport.OK("Podcast Voice.RfxChain is not on the item these words were checked in, so nothing changed. If you added it since the last check, run the check again so the app finds the piece it is on.", false)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("DawRemoveFxFromRange = %+v, want %+v", got, want)
	}
}

// chain-name-is-checked-on-the-host: an apply's chain must be one the DAW's own list returned; an unknown name, a path or an
// action name is refused with the bad-chain sentence and nothing is sent. A removal takes a plain chain name only.
func TestDawFxRangeRefusesAChainTheDAWDoesNotListAndSendsNothing(t *testing.T) {
	role := &fakeRangeFX{answer: chainOnInREAPER()}
	host := fxRangeHost(t, "REAPER", liveReachability(), role, "on")
	notListed := dawport.Refused(fxRangeBadChainSentence)
	for _, chain := range []string{"", "Unknown.RfxChain", "voice/radio.rfxchain", "../reaper.ini", `C:\FXChains\Voice\Radio.RfxChain`, "/etc/Radio.RfxChain", "40001", "_SWS_ABOUT"} {
		if got := applyFx(t, host, role, listing(fxRangeChain), 0, 0, chain, 0); !reflect.DeepEqual(got, notListed) {
			t.Errorf("apply %q: %+v", chain, got)
		}
	}
	for _, chain := range []string{"", "../x.RfxChain", `C:\x.RfxChain`, "Voice//Radio.RfxChain", "40001", "Radio.RfxChain\n"} {
		if got := decodeDawResult(t)(host.DawRemoveFxFromRange("c-0001", 0, 0, chain)); !reflect.DeepEqual(got, notListed) {
			t.Errorf("remove %q: %+v", chain, got)
		}
	}
	if role.sent() != 0 {
		t.Fatalf("sent %v and %v", role.applied, role.removed)
	}
	// list_fx_chains stops at 500: past that, a plain name goes on to REAPER, which checks its own listing; a path never does.
	cut := func(context.Context) ([]string, bool, error) { return []string{fxRangeChain}, true, nil }
	if got := applyFx(t, host, role, cut, 0, 0, "../reaper.ini", 0); !reflect.DeepEqual(got, notListed) || role.sent() != 0 {
		t.Fatalf("a path past a cut-short list: %+v, sent %v", got, role.applied)
	}
	if got := applyFx(t, host, role, cut, 0, 0, "Late/Chain.RfxChain", 0); !reflect.DeepEqual(got, chainOnInREAPER()) || len(role.applied) != 1 {
		t.Fatalf("a plain name past a cut-short list: %+v, sent %v", got, role.applied)
	}
}

// The list read's own refusal is the page's answer: the fx_chains capability's sentence, or REAPER not answering.
func TestDawApplyFxToRangeAnswersTheChainListsRefusal(t *testing.T) {
	role := &fakeRangeFX{answer: chainOnInREAPER()}
	host := fxRangeHost(t, "REAPER", liveReachability(), role, "on")
	off := &dawport.NotSupportedError{Capability: dawport.CapFXChains, Support: dawport.Support{Message: "FX chains are switched off in Settings."}}
	for err, want := range map[error]string{off: off.Support.Message, bridge.ErrNoAnswer: "", bridge.ErrUnavailable: ""} {
		failing := func(context.Context) ([]string, bool, error) { return nil, false, err }
		got := applyFx(t, host, role, failing, 0, 0, fxRangeChain, 0)
		if got.OK || got.Refused == "" || (want != "" && got.Refused != want) {
			t.Errorf("%v: %+v", err, got)
		}
	}
	if role.sent() != 0 {
		t.Fatalf("sent %v", role.applied)
	}
	if _, _, err := fxChainNamesOf(hostServices{})(t.Context()); !errors.Is(err, bridge.ErrUnavailable) {
		t.Fatalf("no resolver: %v", err)
	}
}

// refusals-come-from-the-capability-or-the-host: the resolver's own sentence for each launch it refuses, checked first, and
// nothing sent for any of them.
func TestDawFxRangeRefusesWithTheResolversSentenceAndSendsNothing(t *testing.T) {
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
			role := &fakeRangeFX{answer: chainOnInREAPER()}
			host := fxRangeHost(t, c.kind, c.reach, role, c.toggle)
			support := fxRangeSupport(t, host)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("fx_range support = %+v, want reason %s", support, c.reason)
			}

			applied := decodeDawResult(t)(host.DawApplyFxToRange("c-0001", 0, 0, fxRangeChain, 0))
			removed := decodeDawResult(t)(host.DawRemoveFxFromRange("c-0001", 0, 0, fxRangeChain))

			want := dawport.Refused(support.Message)
			if !reflect.DeepEqual(applied, want) || !reflect.DeepEqual(removed, want) || role.sent() != 0 {
				t.Fatalf("apply %+v, remove %+v, sent %d; want Refused(%q) and nothing sent", applied, removed, role.sent(), support.Message)
			}
		})
	}
}

// A DAW without fx_range (Audacity before backups) answers its own sentence.
func TestDawFxRangeAnswersAnEnginesOwnFxRangeReason(t *testing.T) {
	host := fxRangeHost(t, "REAPER", liveReachability(), nil, "on")
	support := dawport.Support{Message: "Turn on backups before adding an effect to words in Audacity."}
	role := &fakeRangeFX{answer: chainOnInREAPER()}
	applied, err := dawApplyFxToRangeIn(t.Context(), host.services(), support, role, listing(fxRangeChain), "c-0001", 0, 0, fxRangeChain, 0)
	if err != nil || !reflect.DeepEqual(applied, dawport.Refused(support.Message)) {
		t.Fatalf("apply %+v, %v", applied, err)
	}
	removed, err := dawRemoveFxFromRangeIn(t.Context(), host.services(), support, role, "c-0001", 0, 0, fxRangeChain)
	if err != nil || !reflect.DeepEqual(removed, dawport.Refused(support.Message)) || role.sent() != 0 {
		t.Fatalf("remove %+v, %v; sent %d", removed, err, role.sent())
	}
}

// The fade is 0 to 500 ms, refused in apply_fx_range's own sentence otherwise.
func TestDawApplyFxToRangeTakesAFadeFrom0To500(t *testing.T) {
	role := &fakeRangeFX{answer: chainOnInREAPER()}
	host := fxRangeHost(t, "REAPER", liveReachability(), role, "on")
	for _, fade := range []int{-1, 501} {
		if got := applyFx(t, host, role, listing(fxRangeChain), 0, 0, fxRangeChain, fade); !reflect.DeepEqual(got, dawport.Refused(cutBadFadeSentence)) {
			t.Errorf("fade %d: %+v", fade, got)
		}
	}
	if role.sent() != 0 {
		t.Fatalf("sent %v", role.applied)
	}
}

// Words not heard are refused in an effect's words; a stale token range, or a chapter id that is a GUID, a time or a path,
// is refused with code stale. Nothing is sent for any of them.
func TestDawFxRangeRefusesUnheardWordsAndAStaleRange(t *testing.T) {
	role := &fakeRangeFX{answer: chainOnInREAPER()}
	host := fxRangeHost(t, "REAPER", liveReachability(), role, "on")

	unheard := applyFx(t, host, role, listing(fxRangeChain), 0, 1, fxRangeChain, 0)
	if !reflect.DeepEqual(unheard, dawport.Refused(fxRangeNotHeardSentence)) {
		t.Fatalf("unheard = %+v", unheard)
	}
	if got := decodeDawResult(t)(host.DawRemoveFxFromRange("c-0001", 0, 1, fxRangeChain)); !reflect.DeepEqual(got, unheard) {
		t.Fatalf("unheard removal = %+v", got)
	}
	for _, tokens := range [][2]int{{0, 2}, {1, 0}, {-1, 0}} {
		stale := applyFx(t, host, role, listing(fxRangeChain), tokens[0], tokens[1], fxRangeChain, 0)
		if stale.OK || stale.Changed || stale.Code != dawport.CodeStale {
			t.Fatalf("tokens %v: %+v, want a stale refusal", tokens, stale)
		}
		if got := decodeDawResult(t)(host.DawRemoveFxFromRange("c-0001", tokens[0], tokens[1], fxRangeChain)); got.Code != dawport.CodeStale {
			t.Fatalf("removal, tokens %v: %+v, want a stale refusal", tokens, got)
		}
	}
	for _, id := range []string{"{ITEM-1}", "1.5", "C:/Projects/Alice/Alice.rpp"} {
		if got := decodeDawResult(t)(host.DawApplyFxToRange(id, 0, 0, fxRangeChain, 0)); got.OK || got.Code != dawport.CodeStale {
			t.Errorf("DawApplyFxToRange(%q) = %+v, want a stale refusal", id, got)
		}
	}
	if role.sent() != 0 {
		t.Fatalf("sent %v and %v", role.applied, role.removed)
	}
}

// A range across two items (two takes' worth of audio) is refused with the reason; words with no time in an effect's words.
func TestFxRangeResolvesAsTheCutDoesInAnEffectsWords(t *testing.T) {
	item := func(i int) *int { return &i }
	at := func(s float64) *float64 { return &s }
	paragraph := "p-1"
	view := coverage.AlignmentView{
		Tokens: []coverage.TokenLine{
			{Index: 0, ParagraphID: &paragraph, Word: 0, Item: item(0), Start: at(1), End: at(2)},
			{Index: 1, ParagraphID: &paragraph, Word: 1, Item: item(1), Start: at(1), End: at(2)},
			{Index: 2, ParagraphID: &paragraph, Word: 2, Item: item(1), Start: nil, End: at(3)},
		},
		Items: []coverage.AlignmentItem{
			{Index: 0, ItemGUID: "{ITEM-1}", Live: true, Length: 5},
			{Index: 1, ItemGUID: "{ITEM-2}", Live: true, Position: 10, Length: 5},
		},
	}
	if refused := fxRangeUnplayable(view, 0, 1); refused != nil {
		t.Fatalf("two heard words refused here: %+v", refused)
	}
	if _, refused := passagetakes.ResolveRange(view, "c-1", 0, 1); refused == nil || refused.Code != "" ||
		refused.Refused != "These words cross two REAPER items. Select words from one item at a time." {
		t.Fatalf("two items: %+v", refused)
	}
	if refused := fxRangeUnplayable(view, 2, 2); refused == nil || !reflect.DeepEqual(*refused, dawport.Refused(fxRangeNoTimeSentence)) {
		t.Fatalf("no time: %+v", refused)
	}
	if refused := fxRangeUnplayable(view, 1, 5); refused != nil {
		t.Fatalf("a range outside the alignment is ResolveRange's to refuse: %+v", refused)
	}
}

// The role's stale answer passes on with its code; an error it returns is worded as a refusal; no role refuses.
func TestDawFxRangePassesOnTheRolesAnswers(t *testing.T) {
	stale := dawport.RefusedStale("That passage's item is no longer in the REAPER project. Read the project again.")
	role := &fakeRangeFX{answer: stale}
	host := fxRangeHost(t, "REAPER", liveReachability(), role, "on")
	if got := applyFx(t, host, role, listing(fxRangeChain), 0, 0, fxRangeChain, 0); !reflect.DeepEqual(got, stale) {
		t.Fatalf("stale apply = %+v", got)
	}
	if got := decodeDawResult(t)(host.DawRemoveFxFromRange("c-0001", 0, 0, fxRangeChain)); !reflect.DeepEqual(got, stale) {
		t.Fatalf("stale removal = %+v", got)
	}
	for _, err := range []error{bridge.ErrNoAnswer, bridge.ErrUnavailable, bridge.ErrBadChainName, context.DeadlineExceeded, errors.New("boom")} {
		failing := &fakeRangeFX{err: err}
		host := fxRangeHost(t, "REAPER", liveReachability(), failing, "on")
		if got := applyFx(t, host, failing, listing(fxRangeChain), 0, 0, fxRangeChain, 0); got.OK || got.Refused == "" {
			t.Errorf("%v: apply %+v, want a refusal", err, got)
		}
		if got := decodeDawResult(t)(host.DawRemoveFxFromRange("c-0001", 0, 0, fxRangeChain)); got.OK || got.Refused == "" {
			t.Errorf("%v: remove %+v, want a refusal", err, got)
		}
	}
	none := fxRangeHost(t, "REAPER", liveReachability(), nil, "on")
	if got := decodeDawResult(t)(none.DawApplyFxToRange("c-0001", 0, 0, fxRangeChain, 0)); got.OK || got.Refused == "" {
		t.Fatalf("no role: apply %+v, want a refusal", got)
	}
	if got := decodeDawResult(t)(none.DawRemoveFxFromRange("c-0001", 0, 0, fxRangeChain)); got.OK || got.Refused == "" {
		t.Fatalf("no role: remove %+v, want a refusal", got)
	}
}

// TestDawFxRangeContractGoldenIsCurrent pins the two bindings' answers: a chain put on one word (one undo step), the
// capability's refusal, and a chain taken off (one undo step). UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/daw-*-fx-range-*.json.
func TestDawFxRangeContractGoldenIsCurrent(t *testing.T) {
	cases := map[string]struct {
		toggle string
		remove bool
	}{
		"daw-apply-fx-range-done":    {"on", false},
		"daw-apply-fx-range-refused": {"", false},
		"daw-remove-fx-range-done":   {"on", true},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			if c.remove {
				role := &fakeRangeFX{answer: chainOffInREAPER()}
				host := fxRangeHost(t, "REAPER", liveReachability(), role, c.toggle)
				contractfile.Check(t, name, decodeDawResult(t)(host.DawRemoveFxFromRange("c-0001", 0, 0, fxRangeChain)))
				return
			}
			role := &fakeRangeFX{answer: chainOnInREAPER()}
			host := fxRangeHost(t, "REAPER", liveReachability(), role, c.toggle)
			contractfile.Check(t, name, applyFx(t, host, role, listing(fxRangeChain), 0, 0, fxRangeChain, 10))
		})
	}
}

// DawFxRangeParams, DawSetFxRangeParam and DawBypassFxRange (SN-E104) over the same launch: the words resolve to "{ITEM-1}" from 1
// to 1.5 s, and a fake editor stands in for REAPER's fx_range role.

type fakeRangeFXEditor struct {
	fakeRangeFX
	targets  []dawport.FXRangeTarget
	set      [][3]float64
	bypassed []bool
	settings dawport.FXRangeSettings
}

func (f *fakeRangeFXEditor) FXRangeParams(_ context.Context, target dawport.FXRangeTarget) (dawport.FXRangeSettings, error) {
	f.targets = append(f.targets, target)
	return f.settings, f.err
}

func (f *fakeRangeFXEditor) SetFXRangeParam(_ context.Context, target dawport.FXRangeTarget, fx, index int, value float64) (dawport.Result, error) {
	f.targets = append(f.targets, target)
	f.set = append(f.set, [3]float64{float64(fx), float64(index), value})
	return f.answer, f.err
}

func (f *fakeRangeFXEditor) BypassFXRange(_ context.Context, target dawport.FXRangeTarget, bypass bool) (dawport.Result, error) {
	f.targets = append(f.targets, target)
	f.bypassed = append(f.bypassed, bypass)
	return f.answer, f.err
}

// gainSetting is what REAPER's fx_range role reads for a chain with one gain setting.
func gainSetting() dawport.FXRangeSettings {
	return dawport.FXRangeSettings{
		Result:   dawport.OK("Read 1 setting of Podcast Voice.RfxChain in REAPER.", false),
		Settings: []dawport.FXSetting{{FX: 0, FXName: "VST: ReaEQ (Cockos)", Index: 0, Name: "Gain", Value: -6, Min: -24, Max: 24, Formatted: "-6.0 dB"}},
	}
}

func decodeFxSettings(t *testing.T) func(string, error) dawport.FXRangeSettings {
	t.Helper()
	return func(payload string, err error) dawport.FXRangeSettings {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var got dawport.FXRangeSettings
		if err := json.Unmarshal([]byte(payload), &got); err != nil {
			t.Fatal(err)
		}
		return got
	}
}

func fxEditHost(t *testing.T, editor *fakeRangeFXEditor, toggle string) *Host {
	t.Helper()
	var role dawport.RangeFXApplier
	if editor != nil {
		role = editor
	}
	return fxRangeHost(t, "REAPER", liveReachability(), role, toggle)
}

func TestDawFxRangeEditsSendTheResolvedRangeAndChainAndAnswer(t *testing.T) {
	editor := &fakeRangeFXEditor{settings: gainSetting()}
	host := fxEditHost(t, editor, "on")

	got := decodeFxSettings(t)(host.DawFxRangeParams("c-0001", 0, 0, fxRangeChain))
	if !reflect.DeepEqual(got, gainSetting()) {
		t.Fatalf("DawFxRangeParams = %+v, want %+v", got, gainSetting())
	}
	editor.answer = dawport.OK("Set Podcast Voice.RfxChain to -3.0 dB in REAPER. Undo it there in one step.", true)
	if got := decodeDawResult(t)(host.DawSetFxRangeParam("c-0001", 0, 0, fxRangeChain, 0, 0, -3)); !reflect.DeepEqual(got, editor.answer) || got.UndoSteps != 1 {
		t.Fatalf("DawSetFxRangeParam = %+v", got)
	}
	editor.answer = dawport.OK("Podcast Voice.RfxChain bypassed in REAPER. Undo it there in one step.", true)
	if got := decodeDawResult(t)(host.DawBypassFxRange("c-0001", 0, 0, fxRangeChain, true)); !reflect.DeepEqual(got, editor.answer) {
		t.Fatalf("DawBypassFxRange = %+v", got)
	}
	target := dawport.FXRangeTarget{RangeRequest: dawport.RangeRequest{ChapterID: "c-0001", ItemGUID: "{ITEM-1}", Start: 1, End: 1.5, Words: 1}, ChainName: fxRangeChain}
	if want := []dawport.FXRangeTarget{target, target, target}; !reflect.DeepEqual(editor.targets, want) {
		t.Fatalf("targets = %+v, want %+v", editor.targets, want)
	}
	if !reflect.DeepEqual(editor.set, [][3]float64{{0, 0, -3}}) || !reflect.DeepEqual(editor.bypassed, []bool{true}) {
		t.Fatalf("set %v, bypassed %v", editor.set, editor.bypassed)
	}
}

func TestDawFxRangeEditsRefuseWithTheResolversSentenceAndSendNothing(t *testing.T) {
	for _, toggle := range []string{"", "off"} {
		editor := &fakeRangeFXEditor{settings: gainSetting()}
		host := fxEditHost(t, editor, toggle)
		support := fxRangeSupport(t, host)
		want := dawport.Refused(support.Message)
		params := decodeFxSettings(t)(host.DawFxRangeParams("c-0001", 0, 0, fxRangeChain))
		set := decodeDawResult(t)(host.DawSetFxRangeParam("c-0001", 0, 0, fxRangeChain, 0, 0, 1))
		bypass := decodeDawResult(t)(host.DawBypassFxRange("c-0001", 0, 0, fxRangeChain, true))
		if support.Available || !reflect.DeepEqual(params.Result, want) || params.Settings == nil || len(params.Settings) != 0 ||
			!reflect.DeepEqual(set, want) || !reflect.DeepEqual(bypass, want) || len(editor.targets) != 0 {
			t.Fatalf("toggle %q: params %+v, set %+v, bypass %+v, sent %d", toggle, params, set, bypass, len(editor.targets))
		}
	}
}

func TestDawFxRangeEditsRefuseABadRangeChainOrSettingAndSendNothing(t *testing.T) {
	editor := &fakeRangeFXEditor{settings: gainSetting()}
	host := fxEditHost(t, editor, "on")
	if got := decodeFxSettings(t)(host.DawFxRangeParams("c-0001", 0, 2, fxRangeChain)); got.Result.Code != dawport.CodeStale || len(got.Settings) != 0 {
		t.Errorf("stale range: %+v", got)
	}
	if got := decodeDawResult(t)(host.DawBypassFxRange("c-0001", 0, 1, fxRangeChain, true)); !reflect.DeepEqual(got, dawport.Refused(fxRangeNotHeardSentence)) {
		t.Errorf("unheard words: %+v", got)
	}
	for _, chain := range []string{"../reaper.ini", `C:\x.RfxChain`, "VST: ReaEQ (Cockos)"} {
		if got := decodeDawResult(t)(host.DawSetFxRangeParam("c-0001", 0, 0, chain, 0, 0, 1)); !reflect.DeepEqual(got, dawport.Refused(fxRangeBadChainSentence)) {
			t.Errorf("chain %q: %+v", chain, got)
		}
	}
	for _, setting := range [][2]int{{-1, 0}, {0, -1}} {
		if got := decodeDawResult(t)(host.DawSetFxRangeParam("c-0001", 0, 0, fxRangeChain, setting[0], setting[1], 1)); !reflect.DeepEqual(got, dawport.Refused(fxRangeNoSettingSentence)) {
			t.Errorf("setting %v: %+v", setting, got)
		}
	}
	editor.answer = dawport.OK("Set.", true)
	if got, err := dawFxRangeEditIn(t.Context(), host.services(), fxRangeSupport(t, host), editor, "c-0001", 0, 0, fxRangeChain,
		func(e dawport.RangeFXEditor, target dawport.FXRangeTarget) (dawport.Result, error) {
			return e.SetFXRangeParam(t.Context(), target, 0, 0, 1)
		}); err != nil || !got.OK {
		t.Errorf("a good edit through the shared checks = %+v, %v", got, err)
	}
	editor.targets = nil
	if got := decodeDawResult(t)(host.DawSetFxRangeParam("c-0001", 0, 0, fxRangeChain, 0, 0, math.Inf(1))); !reflect.DeepEqual(got, dawport.Refused(fxRangeBadValueSentence)) {
		t.Errorf("infinite value: %+v", got)
	}
	if len(editor.targets) != 0 {
		t.Fatalf("sent %+v", editor.targets)
	}
}

// An engine whose fx_range role keeps no live effect, or no role at all, refuses; a role's error is worded as a refusal; a stale
// answer passes on with its code.
func TestDawFxRangeEditsPassOnTheRolesAnswers(t *testing.T) {
	applyOnly := fxRangeHost(t, "REAPER", liveReachability(), &fakeRangeFX{answer: chainOnInREAPER()}, "on")
	if got := decodeDawResult(t)(applyOnly.DawBypassFxRange("c-0001", 0, 0, fxRangeChain, true)); got.OK || got.Refused != "REAPER cannot read or change an effect on words." {
		t.Errorf("no editor: %+v", got)
	}
	none := fxEditHost(t, nil, "on")
	if got := decodeFxSettings(t)(none.DawFxRangeParams("c-0001", 0, 0, fxRangeChain)); got.Result.OK || got.Result.Refused == "" {
		t.Errorf("no role: %+v", got)
	}
	gone := dawport.RefusedStale("That effect is no longer on those words in REAPER. Check the chapter again so the app finds where it is.")
	stale := &fakeRangeFXEditor{fakeRangeFX: fakeRangeFX{answer: gone}, settings: dawport.FXRangeSettings{Result: gone}}
	host := fxEditHost(t, stale, "on")
	if got := decodeFxSettings(t)(host.DawFxRangeParams("c-0001", 0, 0, fxRangeChain)); !reflect.DeepEqual(got.Result, gone) || got.Settings == nil {
		t.Errorf("stale params: %+v", got)
	}
	if got := decodeDawResult(t)(host.DawSetFxRangeParam("c-0001", 0, 0, fxRangeChain, 0, 0, 1)); !reflect.DeepEqual(got, gone) {
		t.Errorf("stale set: %+v", got)
	}
	for _, err := range []error{bridge.ErrNoAnswer, context.DeadlineExceeded, errors.New("boom")} {
		failing := &fakeRangeFXEditor{fakeRangeFX: fakeRangeFX{err: err}}
		host := fxEditHost(t, failing, "on")
		if got := decodeFxSettings(t)(host.DawFxRangeParams("c-0001", 0, 0, fxRangeChain)); got.Result.OK || got.Result.Refused == "" || got.Settings == nil {
			t.Errorf("%v: params %+v", err, got)
		}
		if got := decodeDawResult(t)(host.DawBypassFxRange("c-0001", 0, 0, fxRangeChain, false)); got.OK || got.Refused == "" {
			t.Errorf("%v: bypass %+v", err, got)
		}
	}
}

// TestDawFxRangeEditsContractGoldenIsCurrent pins the edits' answers: the settings read, the capability's refusal of a read, a
// setting changed and a chain bypassed (one undo step each), and a chain no longer on the words (code stale). UPDATE_CONTRACTS=1
// rewrites tests/fixtures/contracts/daw-fx-range-{params,bypass}-*.json.
func TestDawFxRangeEditsContractGoldenIsCurrent(t *testing.T) {
	gone := dawport.RefusedStale("That effect is no longer on those words in REAPER. Check the chapter again so the app finds where it is.")
	cases := map[string]func(t *testing.T) any{
		"daw-fx-range-params-done": func(t *testing.T) any {
			settings := gainSetting()
			settings.Bypassed = true
			return decodeFxSettings(t)(fxEditHost(t, &fakeRangeFXEditor{settings: settings}, "on").DawFxRangeParams("c-0001", 0, 0, fxRangeChain))
		},
		"daw-fx-range-params-refused": func(t *testing.T) any {
			return decodeFxSettings(t)(fxEditHost(t, &fakeRangeFXEditor{settings: gainSetting()}, "").DawFxRangeParams("c-0001", 0, 0, fxRangeChain))
		},
		"daw-fx-range-params-set-done": func(t *testing.T) any {
			editor := &fakeRangeFXEditor{fakeRangeFX: fakeRangeFX{answer: dawport.OK("Set Podcast Voice.RfxChain to -3.0 dB in REAPER. Undo it there in one step.", true)}}
			return decodeDawResult(t)(fxEditHost(t, editor, "on").DawSetFxRangeParam("c-0001", 0, 0, fxRangeChain, 0, 0, -3))
		},
		"daw-fx-range-bypass-done": func(t *testing.T) any {
			editor := &fakeRangeFXEditor{fakeRangeFX: fakeRangeFX{answer: dawport.OK("Podcast Voice.RfxChain bypassed in REAPER. Undo it there in one step.", true)}}
			return decodeDawResult(t)(fxEditHost(t, editor, "on").DawBypassFxRange("c-0001", 0, 0, fxRangeChain, true))
		},
		"daw-fx-range-bypass-refused-stale": func(t *testing.T) any {
			editor := &fakeRangeFXEditor{fakeRangeFX: fakeRangeFX{answer: gone}}
			return decodeDawResult(t)(fxEditHost(t, editor, "on").DawBypassFxRange("c-0001", 0, 0, fxRangeChain, false))
		},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		t.Run(name, func(t *testing.T) { contractfile.Check(t, name, cases[name](t)) })
	}
}
