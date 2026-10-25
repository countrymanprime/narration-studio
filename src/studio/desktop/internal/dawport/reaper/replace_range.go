package reaper

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// rangeReplacer is the replace_range role over bridge's replace_range and restore_replacement, answering dawport types, which bridge
// cannot import.
type rangeReplacer struct {
	actions *bridge.Actions
	allowed func(dawport.Capability) error
}

var _ dawport.RangeReplacer = rangeReplacer{}

const (
	// messageReplaceScriptOutdated answers a script older than replace_range, which does not know the command.
	messageReplaceScriptOutdated = "The app's script in REAPER is older than this app and cannot replace audio, so nothing changed. Import the script again from this app's REAPER folder."
	messageReplaceBad            = "The words or their stretch are not a usable pair of times, so nothing changed."
	messageReplaceSourceStale    = "Their audio is no longer in the REAPER project. Choose it again."
	messageRestoreStale          = "Your audio for these words is no longer where the app left it in REAPER, so nothing changed. Use Edit > Undo in REAPER, or put it back by hand from the Cuts track."
)

// ImportTheirAudio puts the file at path on a new muted track named name, in one undo step (bridge's import_audio_track). The host
// sends only a file the narrator chose in the app's own file dialog.
func (r rangeReplacer) ImportTheirAudio(ctx context.Context, name, path string) (dawport.TheirAudio, error) {
	if r.allowed != nil {
		if refused, ok := dawport.RefusedFrom(r.allowed(dawport.CapReplaceRange)); ok {
			return dawport.TheirAudio{Result: refused}, nil
		}
	}
	got, err := r.actions.ImportAudioTrack(ctx, name, path)
	var refusal *bridge.RefusalError
	switch {
	case errors.Is(err, bridge.ErrBadReplacement):
		return dawport.TheirAudio{Result: dawport.Refused(badReplacementSentence(err))}, nil
	case errors.Is(err, bridge.ErrRecording):
		return dawport.TheirAudio{Result: dawport.Refused("REAPER is recording. Stop recording first.")}, nil
	case errors.Is(err, bridge.ErrScriptOutdated):
		return dawport.TheirAudio{Result: dawport.Refused(messageReplaceScriptOutdated)}, nil
	case errors.As(err, &refusal):
		return dawport.TheirAudio{Result: dawport.Refused(refusal.Sentence)}, nil
	case errors.Is(err, bridge.ErrExperimentalOff):
		return dawport.TheirAudio{Result: dawport.Refused(err.Error())}, nil
	case err != nil:
		return dawport.TheirAudio{}, err
	}
	return dawport.TheirAudio{Result: dawport.OK(fmt.Sprintf("Added %s's audio to REAPER on a muted track of its own.", strings.TrimSpace(name)), true).
		WithUndoSteps(got.UndoPoints), Track: got.TrackGUID, Item: got.ItemGUID, Length: got.Length}, nil
}

// ReplaceRange plays the request's stretch of their item in place of the narrator's words, in one undo step (bridge's
// replace_range). It asks allowed itself first, so a refusal is the capability's own sentence rather than bridge's ErrExperimentalOff.
func (r rangeReplacer) ReplaceRange(ctx context.Context, request dawport.ReplaceRangeRequest) (dawport.RangeReplaced, error) {
	if r.allowed != nil {
		if refused, ok := dawport.RefusedFrom(r.allowed(dawport.CapReplaceRange)); ok {
			return dawport.RangeReplaced{Result: refused}, nil
		}
	}
	got, err := r.actions.ReplaceRange(ctx, bridge.ReplaceRangeRequest{ItemGUID: request.ItemGUID, Start: request.Start, End: request.End,
		SourceGUID: request.SourceItemGUID, SourceStart: request.SourceStart, SourceEnd: request.SourceEnd, FadeMs: request.FadeMs,
		GainDB: request.GainDB, ID: request.ID})
	var stale *bridge.StaleError
	var refusal *bridge.RefusalError
	switch {
	case errors.As(err, &stale) && stale.Reason == "source":
		return dawport.RangeReplaced{Result: dawport.RefusedStale(messageReplaceSourceStale)}, nil
	case errors.As(err, &stale):
		return dawport.RangeReplaced{Result: dawport.RefusedStale("That passage's item is no longer in the REAPER project. Read the project again.")}, nil
	case errors.Is(err, bridge.ErrBadReplacement):
		return dawport.RangeReplaced{Result: dawport.Refused(badReplacementSentence(err))}, nil
	case errors.Is(err, bridge.ErrRecording):
		return dawport.RangeReplaced{Result: dawport.Refused("REAPER is recording. Stop recording first.")}, nil
	case errors.Is(err, bridge.ErrScriptOutdated):
		return dawport.RangeReplaced{Result: dawport.Refused(messageReplaceScriptOutdated)}, nil
	case errors.As(err, &refusal):
		return dawport.RangeReplaced{Result: dawport.Refused(refusal.Sentence)}, nil
	case errors.Is(err, bridge.ErrExperimentalOff):
		return dawport.RangeReplaced{Result: dawport.Refused(err.Error())}, nil
	case err != nil:
		return dawport.RangeReplaced{}, err
	}
	return dawport.RangeReplaced{Result: dawport.OK(replaceMessage(request.Words, request.Narrator), true).WithUndoSteps(got.UndoPoints),
		ReplacementItem: got.NewItemGUID, CutItem: got.CutItemGUID, Shift: got.Shift}, nil
}

// RestoreReplacement puts the narrator's audio back in place of the replacement, in one undo step (bridge's restore_replacement).
func (r rangeReplacer) RestoreReplacement(ctx context.Context, request dawport.RestoreRequest) (dawport.Result, error) {
	if r.allowed != nil {
		if refused, ok := dawport.RefusedFrom(r.allowed(dawport.CapReplaceRange)); ok {
			return refused, nil
		}
	}
	got, err := r.actions.RestoreReplacement(ctx, request.ReplacementItem, request.ID)
	var stale *bridge.StaleError
	var refusal *bridge.RefusalError
	switch {
	case errors.As(err, &stale):
		return dawport.RefusedStale(messageRestoreStale), nil
	case errors.Is(err, bridge.ErrBadReplacement):
		return dawport.Refused("The app has no record of that replacement, so nothing changed."), nil
	case errors.Is(err, bridge.ErrRecording):
		return dawport.Refused("REAPER is recording. Stop recording first."), nil
	case errors.Is(err, bridge.ErrScriptOutdated):
		return dawport.Refused(messageReplaceScriptOutdated), nil
	case errors.As(err, &refusal):
		return dawport.Refused(refusal.Sentence), nil
	case errors.Is(err, bridge.ErrExperimentalOff):
		return dawport.Refused(err.Error()), nil
	case err != nil:
		return dawport.Result{}, err
	}
	return dawport.OK(restoreMessage(request.Words), true).WithUndoSteps(got.UndoPoints), nil
}

// badReplacementSentence is the host's sentence for a request bridge refused before sending: the script's own sentence when it
// answered one, else messageReplaceBad.
func badReplacementSentence(err error) string {
	text := err.Error()
	if _, sentence, found := strings.Cut(text, bridge.ErrBadReplacement.Error()+": "); found && strings.HasSuffix(sentence, ".") &&
		strings.ToUpper(sentence[:1]) == sentence[:1] {
		return sentence
	}
	return messageReplaceBad
}

// replaceMessage words a replacement as the mock does ("Replaced 13 words with Eric Leach's audio in REAPER.").
func replaceMessage(words int, narrator string) string {
	whose := "the other narrator's"
	if name := strings.TrimSpace(narrator); name != "" {
		whose = name + "'s"
	}
	switch {
	case words <= 0:
		return fmt.Sprintf("Replaced the words with %s audio in REAPER.", whose)
	case words == 1:
		return fmt.Sprintf("Replaced 1 word with %s audio in REAPER.", whose)
	default:
		return fmt.Sprintf("Replaced %d words with %s audio in REAPER.", words, whose)
	}
}

func restoreMessage(words int) string {
	switch {
	case words <= 0:
		return "Put your audio back in REAPER."
	case words == 1:
		return "Put your audio back for 1 word in REAPER."
	default:
		return fmt.Sprintf("Put your audio back for %d words in REAPER.", words)
	}
}
