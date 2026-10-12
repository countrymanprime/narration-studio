package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"unicode"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/passagetakes"
	"github.com/countrymanprime/narration-utils/shell/internal/runlog"
)

// fxRangeTimeout bounds one apply_fx_range or remove_fx_range request, with the list_fx_chains read before an apply: each is
// a single undo block in REAPER, like delete_range.
const fxRangeTimeout = deleteRangeTimeout

const (
	// fxRangeBadChainSentence is apply_fx_range's and remove_fx_range's own answer for a chain REAPER does not list
	// (bridge's badChainSentence), so the page reads the same words whichever side refused.
	fxRangeBadChainSentence = "That FX chain is not in the FXChains folder REAPER lists."
	// The range's refusals in an effect's words: passagetakes.ResolveRange words these two for a cut.
	fxRangeNotHeardSentence = "These words weren't heard in the recording, so there's no audio to put an effect on. Run the check again if the chapter has changed."
	fxRangeNoTimeSentence   = "These words have no time in their audio to put an effect on."
	// fxRangeNotOnItemSentence answers a removal REAPER found nothing to take off: the piece the chain went on is a new item,
	// which the alignment names only after the chapter is checked again.
	fxRangeNotOnItemSentence = "%s is not on the item these words were checked in, so nothing changed. If you added it since the last check, run the check again so the app finds the piece it is on."
)

// DawApplyFxToRange puts one of the narrator's saved FX chains on the words firstToken..lastToken of chapterID's stored
// alignment (SND-6c, ADR 0860 point 3; the Studio Next mock's applyFxToRange): the DAW splits the item at both ends of the
// range and puts the chain on the middle piece, with fadeMs at each new seam. The page sends a chapter id, two token
// indices, a chain name and the fade, never a GUID, a time or a path: the item and its project seconds are resolved here
// from the stored alignment and the saved project (ADR 0242; threat model row 5f), one item per request (ADR 0705), and
// the chain must be one the DAW's own list (WorkspaceListFXChains, the list the Add FX menu shows) names. The answer is a
// DawResult (ADR 0810): the fx_range capability's own sentence when the resolver refuses it, checked first; then a fade
// apply_fx_range does not take; then the range's refusals (words not heard, two items, and a range or item that is stale
// with code stale); then a chain the DAW does not list. Nothing is sent to the DAW on any of them.
func (h *Host) DawApplyFxToRange(chapterID string, firstToken int, lastToken int, chainName string, fadeMs int) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fxRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("apply_fx_range", "chapter_id", chapterID)
	result, err := dawApplyFxToRangeIn(ctx, svc, resolver.Support(dawport.CapFXRange), svc.rangeFX, fxChainNamesOf(svc), chapterID, firstToken, lastToken, chainName, fadeMs)
	endFxRangeRun(run, result, err)
	return encodeBinding(result, err)
}

// DawRemoveFxFromRange takes the chain chainName off the words firstToken..lastToken of chapterID's stored alignment and
// joins the piece back to the audio either side (the mock's removeFxFromRange), resolved as DawApplyFxToRange resolves
// them. The name is not checked against the DAW's list, so a chain deleted from FXChains since it went on still comes off;
// it must still be a plain chain name, never a path, and REAPER takes off only the FX its own record on the piece names.
// The same capability and range refusals as DawApplyFxToRange; a piece that does not carry the chain answers ok with
// changed false. The piece is a new item after the apply, so the alignment names it only once the chapter is checked again.
func (h *Host) DawRemoveFxFromRange(chapterID string, firstToken int, lastToken int, chainName string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fxRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("remove_fx_range", "chapter_id", chapterID)
	result, err := dawRemoveFxFromRangeIn(ctx, svc, resolver.Support(dawport.CapFXRange), svc.rangeFX, chapterID, firstToken, lastToken, chainName)
	endFxRangeRun(run, result, err)
	return encodeBinding(result, err)
}

func endFxRangeRun(run *runlog.Run, result dawport.Result, err error) {
	switch {
	case err != nil:
		run.End("error")
	case result.Refused != "":
		run.End("refused")
	default:
		run.End("ok")
	}
}

// fxChainNames reads the DAW's own chain list: the names, and whether the list was cut short.
type fxChainNames func(ctx context.Context) (names []string, truncated bool, err error)

// fxChainNamesOf is WorkspaceListFXChains' read over svc's fx_chains role. A refused fx_chains capability is its
// *dawport.NotSupportedError, so the page reads that capability's sentence.
func fxChainNamesOf(svc hostServices) fxChainNames {
	return func(ctx context.Context) ([]string, bool, error) {
		if svc.dawPortResolver == nil {
			return nil, false, bridge.ErrUnavailable
		}
		role, err := dawport.Role[dawport.FXManager](svc.dawPortResolver, dawport.CapFXChains)
		if err != nil {
			return nil, false, err
		}
		chains, err := role.ListFXChains(ctx)
		return chains.Names, chains.Truncated, err
	}
}

// dawApplyFxToRangeIn is DawApplyFxToRange with the launch's fx_range support, role and chain list given. applier is nil
// with no live adapter.
func dawApplyFxToRangeIn(ctx context.Context, svc hostServices, support dawport.Support, applier dawport.RangeFXApplier, chains fxChainNames,
	chapterID string, firstToken, lastToken int, chainName string, fadeMs int) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if fadeMs < 0 || fadeMs > bridge.MaxCutFadeMs {
		return dawport.Refused(cutBadFadeSentence), nil
	}
	resolved, refused, err := resolveFxRange(svc, chapterID, firstToken, lastToken)
	if err != nil || refused != nil {
		return refusedOr(refused), err
	}
	name := readAloudAdapterName(svc)
	if applier == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	names, truncated, err := chains(ctx)
	if err != nil {
		return fxRangeRefusal(name, err), nil
	}
	// list_fx_chains stops at 500 chains and apply_fx_range accepts one past that, checking REAPER's own listing itself.
	if !slices.Contains(names, chainName) && (!truncated || !plainChainName(chainName)) {
		return dawport.Refused(fxRangeBadChainSentence), nil
	}
	result, err := applier.ApplyFXToRange(ctx, dawport.FXRangeRequest{RangeRequest: resolved.Request, ChainID: chainName, ChainName: chainName, FadeMs: fadeMs})
	if err != nil {
		return fxRangeRefusal(name, err), nil
	}
	return result, nil
}

// dawRemoveFxFromRangeIn is DawRemoveFxFromRange with the launch's fx_range support and role given.
func dawRemoveFxFromRangeIn(ctx context.Context, svc hostServices, support dawport.Support, applier dawport.RangeFXApplier,
	chapterID string, firstToken, lastToken int, chainName string) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	resolved, refused, err := resolveFxRange(svc, chapterID, firstToken, lastToken)
	if err != nil || refused != nil {
		return refusedOr(refused), err
	}
	if !plainChainName(chainName) {
		return dawport.Refused(fxRangeBadChainSentence), nil
	}
	name := readAloudAdapterName(svc)
	if applier == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	result, err := applier.RemoveFXFromRange(ctx, resolved.Request.ItemGUID, chainName)
	if err != nil {
		return fxRangeRefusal(name, err), nil
	}
	if result.OK && !result.Changed {
		return dawport.OK(fmt.Sprintf(fxRangeNotOnItemSentence, chainName), false), nil
	}
	return result, nil
}

func refusedOr(refused *dawport.Result) dawport.Result {
	if refused == nil {
		return dawport.Result{}
	}
	return *refused
}

// resolveFxRange resolves the token range as DawDeleteRange does (passagetakes.ResolveRange), first refusing in an
// effect's words the two refusals ResolveRange words for a cut: a word nothing was heard for, and a range with no time.
func resolveFxRange(svc hostServices, chapterID string, first, last int) (passagetakes.CutRange, *dawport.Result, error) {
	if svc.coverage == nil {
		return passagetakes.CutRange{}, nil, errNoProject
	}
	view, err := svc.coverage.Alignment(chapterID, coverageSettings(svc.settings).Alignment)
	if err != nil {
		return passagetakes.CutRange{}, nil, err
	}
	if refused := fxRangeUnplayable(view, first, last); refused != nil {
		return passagetakes.CutRange{}, refused, nil
	}
	resolved, refused := passagetakes.ResolveRange(view, chapterID, first, last)
	return resolved, refused, nil
}

// fxRangeUnplayable is the refusal for a range inside the alignment that holds a word not heard, or whose first word has no
// start or last word no end; nil otherwise, including for a range outside the alignment, which ResolveRange answers stale.
func fxRangeUnplayable(view coverage.AlignmentView, first, last int) *dawport.Result {
	if first < 0 || last < first || last >= len(view.Tokens) {
		return nil
	}
	tokens := view.Tokens[first : last+1]
	for _, token := range tokens {
		if token.Item == nil {
			refused := dawport.Refused(fxRangeNotHeardSentence)
			return &refused
		}
	}
	if start, end := tokens[0].Start, tokens[len(tokens)-1].End; start == nil || end == nil || !(*end > *start) {
		refused := dawport.Refused(fxRangeNoTimeSentence)
		return &refused
	}
	return nil
}

// plainChainName is a chain name as list_fx_chains could list it, bridge's rule for apply_fx_range and remove_fx_range:
// a relative name under FXChains ending .RfxChain, with no backslash, colon or control character and no empty, "." or ".."
// part. It keeps a path or an action name from reaching the bridge.
func plainChainName(chain string) bool {
	if !strings.HasSuffix(strings.ToLower(chain), ".rfxchain") || strings.ContainsAny(chain, `\:`) || strings.ContainsFunc(chain, unicode.IsControl) {
		return false
	}
	for _, part := range strings.Split(chain, "/") {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	return true
}

// fxRangeRefusal words an error the role or the chain list returned rather than answered: the role answers its own
// refusals as a Result, so these are a capability refusal, the bridge not answering, or no answer in time.
func fxRangeRefusal(name string, err error) dawport.Result {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused
	}
	switch {
	case errors.Is(err, bridge.ErrNoAnswer):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperNotRunning).Message)
	case errors.Is(err, bridge.ErrUnavailable):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message)
	case errors.Is(err, bridge.ErrBadChainName):
		return dawport.Refused(fxRangeBadChainSentence)
	case errors.Is(err, context.DeadlineExceeded):
		return dawport.Refused(fmt.Sprintf("%s did not answer the effect within %d seconds. Check the project before trying again.", name, int(fxRangeTimeout.Seconds())))
	}
	return dawport.Refused(fmt.Sprintf("%s could not change the effect on the words: %s.", name, err.Error()))
}

const (
	// fxRangeNoEditorSentence answers an edit on an engine whose fx_range role keeps no live effect to read or change.
	fxRangeNoEditorSentence = "%s cannot read or change an effect on words."
	// fxRangeNoSettingSentence and fxRangeBadValueSentence are fx_range_set_param's own answers for a setting the effect does
	// not have and a value that is not a number (narration_range.lua), so the page reads the same words whichever side refused.
	fxRangeNoSettingSentence = "That effect has no such setting."
	fxRangeBadValueSentence  = "The value for that setting is not a number."
)

// DawFxRangeParams reads the settings of the chain chainName on the words firstToken..lastToken of chapterID's stored alignment
// (SN-E104; the mock's effect inspector), resolved as DawApplyFxToRange resolves them: the DAW finds the piece the chain went on
// from the answer it gave the apply, or, after the chapter is checked again, from the item the words resolve to. The page sends a
// chapter id, two token indices and a chain name, never a GUID or a path. The answer is the DawFxRangeParams payload: a DawResult
// (ADR 0810) with the settings, whether the list was cut short and whether the chain is bypassed; a refusal has no settings. The
// same capability and range refusals as DawRemoveFxFromRange, then a chain the DAW no longer has on those words, with code stale.
func (h *Host) DawFxRangeParams(chapterID string, firstToken int, lastToken int, chainName string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fxRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("fx_range_params", "chapter_id", chapterID)
	settings, err := dawFxRangeParamsIn(ctx, svc, resolver.Support(dawport.CapFXRange), svc.rangeFX, chapterID, firstToken, lastToken, chainName)
	endFxRangeRun(run, settings.Result, err)
	return encodeBinding(settings, err)
}

// DawSetFxRangeParam sets setting index of effect fx of the chain chainName on the words (both as DawFxRangeParams numbers them)
// to value, in one undo step of the DAW's own; a setting already at the value answers changed false. The same refusals as
// DawFxRangeParams, then a setting the effect does not have and a value outside its range, each with a sentence.
func (h *Host) DawSetFxRangeParam(chapterID string, firstToken int, lastToken int, chainName string, fx int, index int, value float64) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fxRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("fx_range_set_param", "chapter_id", chapterID)
	result, err := dawFxRangeEditIn(ctx, svc, resolver.Support(dawport.CapFXRange), svc.rangeFX, chapterID, firstToken, lastToken, chainName,
		func(editor dawport.RangeFXEditor, target dawport.FXRangeTarget) (dawport.Result, error) {
			if fx < 0 || index < 0 {
				return dawport.Refused(fxRangeNoSettingSentence), nil
			}
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return dawport.Refused(fxRangeBadValueSentence), nil
			}
			return editor.SetFXRangeParam(ctx, target, fx, index, value)
		})
	endFxRangeRun(run, result, err)
	return encodeBinding(result, err)
}

// DawBypassFxRange bypasses every effect of the chain chainName on the words (bypass true) or turns them back on, in one undo step
// of the DAW's own; a chain already as asked answers changed false. The same refusals as DawFxRangeParams.
func (h *Host) DawBypassFxRange(chapterID string, firstToken int, lastToken int, chainName string, bypass bool) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fxRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("fx_range_bypass", "chapter_id", chapterID)
	result, err := dawFxRangeEditIn(ctx, svc, resolver.Support(dawport.CapFXRange), svc.rangeFX, chapterID, firstToken, lastToken, chainName,
		func(editor dawport.RangeFXEditor, target dawport.FXRangeTarget) (dawport.Result, error) {
			return editor.BypassFXRange(ctx, target, bypass)
		})
	endFxRangeRun(run, result, err)
	return encodeBinding(result, err)
}

// dawFxRangeParamsIn is DawFxRangeParams with the launch's fx_range support and role given.
func dawFxRangeParamsIn(ctx context.Context, svc hostServices, support dawport.Support, applier dawport.RangeFXApplier,
	chapterID string, firstToken, lastToken int, chainName string) (dawport.FXRangeSettings, error) {
	var settings dawport.FXRangeSettings
	result, err := dawFxRangeEditIn(ctx, svc, support, applier, chapterID, firstToken, lastToken, chainName,
		func(editor dawport.RangeFXEditor, target dawport.FXRangeTarget) (dawport.Result, error) {
			var err error
			settings, err = editor.FXRangeParams(ctx, target)
			return settings.Result, err
		})
	if err != nil || !result.OK {
		return dawport.FXRangeSettings{Result: result, Settings: []dawport.FXSetting{}}, err
	}
	if settings.Settings == nil {
		settings.Settings = []dawport.FXSetting{}
	}
	return settings, nil
}

// dawFxRangeEditIn runs edit against the fx_range role's RangeFXEditor for the words, after the checks the three bindings share:
// the capability first, the range, a plain chain name, then a role that can edit. A role's error is worded as a refusal.
func dawFxRangeEditIn(ctx context.Context, svc hostServices, support dawport.Support, applier dawport.RangeFXApplier,
	chapterID string, firstToken, lastToken int, chainName string,
	edit func(dawport.RangeFXEditor, dawport.FXRangeTarget) (dawport.Result, error)) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	resolved, refused, err := resolveFxRange(svc, chapterID, firstToken, lastToken)
	if err != nil || refused != nil {
		return refusedOr(refused), err
	}
	if !plainChainName(chainName) {
		return dawport.Refused(fxRangeBadChainSentence), nil
	}
	name := readAloudAdapterName(svc)
	if applier == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	editor, ok := applier.(dawport.RangeFXEditor)
	if !ok {
		return dawport.Refused(fmt.Sprintf(fxRangeNoEditorSentence, name)), nil
	}
	result, err := edit(editor, dawport.FXRangeTarget{RangeRequest: resolved.Request, ChainName: chainName})
	if err != nil {
		return fxRangeRefusal(name, err), nil
	}
	return result, nil
}
