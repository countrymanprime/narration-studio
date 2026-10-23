package audacity

import (
	"context"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// The steps and sentences of a cut and an effect on a range.
const (
	stepSelectWords    = "Select the words' audio"
	stepDeleteWords    = "Delete it"
	stepCloseUp        = "Close up the gap"
	stepDeleteLeaveGap = "Delete it, leaving silence in its place"
	stepSplitEnds      = "Split at both ends"

	messageRangeBad     = "That stretch has no track, start and end Audacity can use, so nothing was changed."
	messageRangeOutside = "That stretch is outside the track's audio in Audacity, so nothing was changed."
	messageCutMode      = "Audacity can cut words by closing up the gap or by leaving one, so nothing was changed."
	messageNoRoomTone   = "Audacity has no room tone to fill a cut with, so nothing was changed. Leave the gap silent or close it up."
	messageCutPadAll    = "The pad leaves nothing of those words to cut, so nothing was changed."
	messageNoMacro      = "Choose one of your Audacity macros for the effect. Its name can only hold letters, digits, spaces, hyphens and underscores."
	messageRemoveFX     = "Audacity cannot take an effect off part of a track. Put the audio back from the backup made before it, in Backups on the Editing page."
)

// rangeTrack checks a range request and backs up the range: the track it names (by name), the backup's refusal or nothing. ok is
// false when the call stops with result or err.
func (s *steps) rangeTrack(ctx context.Context, request dawport.RangeRequest, label string) (audacitybridge.TrackInfo, dawport.Result, bool, error) {
	none := audacitybridge.TrackInfo{}
	if !backupText(request.ItemGUID) || !backupText(request.ChapterID) || !finite(request.Start) || !finite(request.End) ||
		request.Start < 0 || request.End <= request.Start {
		return none, dawport.Refused(messageRangeBad), false, nil
	}
	tracks, err := s.client.Tracks(ctx)
	if err != nil {
		return none, dawport.Result{}, false, err
	}
	track, refusal, ok := oneTrack(tracks, request.ItemGUID)
	if !ok {
		return none, refusal, false, nil
	}
	if !track.HasRange || request.Start < track.Start-stepTolerance || request.End > track.End+stepTolerance {
		return none, dawport.Refused(messageRangeOutside), false, nil
	}
	answer, ok, err := s.backUp(ctx, dawport.BackupRequest{
		GUID: request.ItemGUID, ChapterID: request.ChapterID, Start: request.Start, End: request.End, Label: label,
	})
	if !ok {
		return none, answer, false, err
	}
	return track, dawport.Result{}, true, nil
}

// words is "3 words", or "the words" when the request did not count them.
func words(n int) string {
	if n < 1 {
		return "the words"
	}
	return plural(n, "word", "words")
}

// DeleteRange backs up the range, selects it on its track and deletes it. Mode close is one Delete, which takes the audio out and
// moves the audio after it up; mode gap is a SplitDelete, which leaves the range silent, since Audacity has no room tone to fill it
// with, and a request for room tone is refused. One undo point each. Labels after a close-up cut move with the audio only while
// Sync-Lock is on, and it starts off, so they drift by the cut's length (docs/reference/daw/audacity-3.md). The pad is taken off each
// end of the range before anything is sent. Audacity makes no fade at the edges, so FadeMs is not used.
func (s *steps) DeleteRange(ctx context.Context, request dawport.DeleteRangeRequest) (dawport.Result, error) {
	if !s.canBackUp() {
		return dawport.Refused(backupsSentence(dawport.CapCutRange)), nil
	}
	if request.Mode != dawport.CutClose && request.Mode != dawport.CutGap {
		return dawport.Refused(messageCutMode), nil
	}
	if request.RoomTone {
		return dawport.Refused(messageNoRoomTone), nil
	}
	padded, ok := request.Padded()
	if !ok {
		return dawport.Refused(messageCutPadAll), nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	track, answer, ok, err := s.rangeTrack(ctx, padded, "Cut "+words(request.Words))
	if !ok {
		return answer, err
	}
	var e edits
	if err := s.selectRange(ctx, track.Index, padded.Start, padded.End); err != nil {
		return dawport.Result{}, err
	}
	e.did(stepSelectWords, 0)
	if request.Mode == dawport.CutGap {
		if err := s.do(ctx, "SplitDelete"); err != nil {
			return dawport.Result{}, err
		}
		e.did(stepDeleteLeaveGap, 1)
	} else {
		// One Delete takes the audio out and moves what follows up, with Sync-Lock on or off. A SplitDelete first would leave a gap that
		// the Delete after it cannot close with Sync-Lock off, which is how Audacity starts (src/studio/tests/audacity3/real/edits, A3-T18). The
		// audio of the clips after the cut moves only while clips may move other clips, which the edit turns on for itself.
		restore, err := s.clipsMove(ctx)
		if err != nil {
			return dawport.Result{}, err
		}
		defer restore()
		if err := s.do(ctx, "Delete"); err != nil {
			return dawport.Result{}, err
		}
		e.did(stepDeleteWords, 1)
		e.did(stepCloseUp, 0)
	}
	return e.done("Deleted " + words(request.Words) + " and their audio in Audacity."), nil
}

// ApplyFXToRange backs up the range, selects it, splits the clip at both ends (Split) and applies the narrator's macro to the
// selection by its name (Macro_<name>, see audacitybridge.Client.ApplyMacro), one of the chains Audacity listed. A name the pipe cannot carry is refused before anything is
// sent. One undo point for the split and one for the macro; a macro of several effects may add more, which the owner's pass checks.
func (s *steps) ApplyFXToRange(ctx context.Context, request dawport.FXRangeRequest) (dawport.Result, error) {
	if !s.canBackUp() {
		return dawport.Refused(backupsSentence(dawport.CapFXRange)), nil
	}
	if request.ChainName == "" || audacitybridge.CheckMacroName(request.ChainName) != nil {
		return dawport.Refused(messageNoMacro), nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	track, answer, ok, err := s.rangeTrack(ctx, request.RangeRequest,
		"Add "+request.ChainName+" to "+words(request.Words))
	if !ok {
		return answer, err
	}
	var e edits
	if err := s.selectRange(ctx, track.Index, request.Start, request.End); err != nil {
		return dawport.Result{}, err
	}
	e.did(stepSelectWords, 0)
	if err := s.do(ctx, "Split"); err != nil {
		return dawport.Result{}, err
	}
	e.did(stepSplitEnds, 1)
	if err := s.client.ApplyMacro(ctx, request.ChainName); err != nil {
		return dawport.Result{}, err
	}
	e.did("Apply the macro "+request.ChainName, 1)
	return e.done("Added " + request.ChainName + " to " + words(request.Words) + " in Audacity."), nil
}

// RemoveFXFromRange is refused: Audacity's effects change the audio itself, so the way back is the backup made before.
func (*steps) RemoveFXFromRange(context.Context, string, string) (dawport.Result, error) {
	return dawport.Refused(messageRemoveFX), nil
}
