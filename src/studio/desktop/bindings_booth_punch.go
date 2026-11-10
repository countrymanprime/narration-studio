package main

import (
	"context"
	"strings"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/coverage"
	"desktop/internal/dawport"
	"desktop/internal/tracks"
	"desktop/internal/wordtimes"
)

// The Booth's punch target (docs/prds/booth-voice-tracks.prd.md, "Continue-from and punch-and-roll across voices"): where a passage the
// narrator is about to re-read was recorded before, so the take can record over exactly that. It is read from the stored alignment pushed
// through the items the DAW has now (the word-times table), never from a text-length estimate.

const (
	boothPunchNoAlignment = "no_alignment" // the chapter has no recording check to read the passage from
	boothPunchStale       = "stale"        // the check no longer matches the recording or the text
	boothPunchNoDAW       = "no_daw"       // the DAW's items cannot be read now

	boothPunchTimeout = 5 * time.Second
)

// BoothPunch is BoothPunchTarget's answer. Outcome is "found" (the passage plays from Start to End, project seconds, on TrackGUID, the track
// named TrackName), "never_recorded" (nothing of it was heard: record on, do not punch) or "refused" (Reason and Message say why; nothing is guessed).
type BoothPunch struct {
	Outcome   string   `json:"outcome"`
	Reason    string   `json:"reason,omitempty"`
	Message   string   `json:"message,omitempty"`
	TrackGUID string   `json:"trackGuid,omitempty"`
	TrackName string   `json:"trackName,omitempty"`
	Start     *float64 `json:"start,omitempty"`
	End       *float64 `json:"end,omitempty"`
}

var boothPunchSentences = map[string]string{
	boothPunchNoAlignment:        "This passage cannot be found in the earlier recording because the chapter has not been checked yet. Run the recording check in Proof, or record on from the end.",
	boothPunchStale:              "The recording or the text has changed since the chapter was last checked, so where this passage was recorded is not known. Run the recording check in Proof again.",
	boothPunchNoDAW:              "The audio engine is not answering, so where this passage was recorded cannot be read. Check that it is open, then try again.",
	wordtimes.PunchNoWords:       "That passage is not in the chapter's last recording check, so where it was recorded is not known.",
	wordtimes.PunchNotInProject:  "Part of this passage was cut, trimmed or muted in the project, so there is no single spot to record over. Place the cursor yourself and record from there.",
	wordtimes.PunchSeveralVoices: "This passage was recorded on more than one voice track, so there is no single track to record over. Pick the line on one voice, or place the cursor yourself.",
}

func boothPunchRefused(reason string) BoothPunch {
	return BoothPunch{Outcome: wordtimes.PunchRefused, Reason: reason, Message: boothPunchSentences[reason]}
}

// boothPunchFor is the rule over already-read inputs: the words of paragraphID from fromWord to toWord (inclusive, 0-based in the paragraph),
// placed in the project by state (the items of the chapter's link, and of every voice inside it for a folder), found on the track whose item plays
// them. link is the chapter's linked track, the track of an item the DAW listed without one.
func boothPunchFor(view coverage.AlignmentView, saved tracks.Project, state bridge.TrackState, link, paragraphID string, fromWord, toWord int) BoothPunch {
	if len(view.Tokens) == 0 {
		return boothPunchRefused(boothPunchNoAlignment)
	}
	if view.NeedsAlignAgain {
		return boothPunchRefused(boothPunchStale)
	}
	first, last := -1, -1
	for _, token := range view.Tokens {
		if token.ParagraphID != nil && *token.ParagraphID == paragraphID && token.Word >= fromWord && token.Word <= toWord {
			if first < 0 {
				first = token.Index
			}
			last = token.Index
		}
	}
	if first < 0 {
		return boothPunchRefused(wordtimes.PunchNoWords)
	}
	itemTrack := make(map[string]string, len(state.Items))
	for _, item := range state.Items {
		track := item.TrackGUID
		if track == "" {
			track = link
		}
		itemTrack[item.ItemGUID] = track
	}
	punch := wordtimes.PunchTarget(wordtimes.TableOf(view, saved, state), itemTrack, first, last)
	switch punch.Outcome {
	case wordtimes.PunchFound:
		out := BoothPunch{Outcome: punch.Outcome, TrackGUID: punch.Track, Start: &punch.Start, End: &punch.End}
		for _, track := range saved.Tracks {
			if strings.EqualFold(track.GUID, punch.Track) {
				out.TrackName = track.Name
			}
		}
		return out
	case wordtimes.PunchRefused:
		return boothPunchRefused(punch.Reason)
	}
	return BoothPunch{Outcome: punch.Outcome}
}

// BoothPunchTarget answers where the words of paragraphID from fromWord to toWord (inclusive, 0-based in the paragraph) of chapterID were
// recorded before: the project seconds the passage plays from and to, and the track holding it (the voice that read it, in a chapter folder).
// "never_recorded" says nothing of it was heard, so the take should continue, not punch; "refused" carries a sentence and nothing is guessed (no
// recording check, a stale one, the DAW not answering, part of the passage cut, or several voices). Read-only.
func (h *Host) BoothPunchTarget(chapterID, paragraphID string, fromWord, toWord int) (string, error) {
	// A press that starts from a chosen phrase asks this first: its line on the record-press timeline starts here.
	h.timeline.Join("punch_lookup")
	defer h.timeline.Note("punch_looked_up")
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), boothPunchTimeout)
	defer cancel()
	if svc.coverage == nil {
		return encodeBinding(boothPunchRefused(boothPunchNoAlignment), nil)
	}
	view, err := svc.coverage.Alignment(chapterID, coverageSettings(svc.settings).Alignment)
	if err != nil {
		return encodeBinding(boothPunchRefused(boothPunchNoAlignment), nil)
	}
	link, refused, err := readAloudTrackGUID(svc, chapterID)
	if err != nil {
		return "", err
	}
	if refused != nil {
		return encodeBinding(BoothPunch{Outcome: wordtimes.PunchRefused, Reason: refused.Reason, Message: refused.Message}, nil)
	}
	state, ok := h.liveTrackState(ctx, svc, resolver.Support(dawport.CapTrackState), chapterID)
	if !ok {
		return encodeBinding(boothPunchRefused(boothPunchNoDAW), nil)
	}
	saved, _ := selectedProject(svc)
	return encodeBinding(boothPunchFor(view, saved, state, link, paragraphID, fromWord, toWord), nil)
}
