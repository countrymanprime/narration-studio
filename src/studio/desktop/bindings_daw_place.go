package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/bridge"
	"github.com/countrymanprime/narration-studio/shell/internal/dawport"
)

// placeTimeout bounds one read of the narrator's place or one move to a chapter: both are a single quick request to the DAW.
const placeTimeout = 3 * time.Second

// The two ways DawGoToChapter puts the cursor on a chapter's track: at the end of what is recorded, or at a time in project seconds.
const (
	goToEnd = "end"
	goToAt  = "at"
)

const (
	placeBadTimeSentence  = "The place to go to is not a usable number of seconds."
	placeUnknownSentence  = "The place to go to must be the end of the chapter's track or a time."
	placeNotReadSentence  = "%s could not say where you are: %s."
	placeNotMovedSentence = "%s could not move to the chapter: %s."
	placeNoAnswerSentence = "%s did not answer within %d seconds."
)

// PlaceResult is DawPlace's answer: where the narrator is in the DAW project, as the app knows it. OK is false with the sentence in
// Message when the DAW was not asked or could not say. ChapterID names the chapter whose linked track is the one selected, and is empty
// when no track, several tracks, or a track no chapter is linked to is selected; Cursor is the DAW's edit cursor in project seconds.
type PlaceResult struct {
	OK        bool    `json:"ok"`
	Message   string  `json:"message"`
	ChapterID string  `json:"chapterId"`
	Selected  int     `json:"selected"`
	Cursor    float64 `json:"cursor"`
}

// DawPlace reads which chapter's track the narrator is on in the DAW and where their cursor is, so the Booth opens there. It changes
// nothing in the DAW. The page never sees a track id: the host maps the selected track back to a chapter through the confirmed
// chapter-track links, so the same call serves any DAW whose follow_position role answers.
func (h *Host) DawPlace() (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), placeTimeout)
	defer cancel()
	return encodeBinding(dawPlaceIn(ctx, svc, readAloudAdapterName(svc), resolver.Support(dawport.CapFollowPosition), svc.placeFollower), nil)
}

// dawPlaceIn is DawPlace with the launch's follow_position support and role given. follower is nil with no live adapter.
func dawPlaceIn(ctx context.Context, svc hostServices, name string, support dawport.Support, follower dawport.PlaceFollower) PlaceResult {
	if !support.Available {
		return PlaceResult{Message: support.Message}
	}
	if follower == nil {
		return PlaceResult{Message: readAloudConnectionRefusal(name, reaperStandalone).Message}
	}
	place, err := follower.ReadPlace(ctx)
	if err != nil {
		return PlaceResult{Message: placeRefusal(name, false, err)}
	}
	result := PlaceResult{OK: true, Selected: place.Selected, Cursor: place.Cursor}
	if place.TrackID != "" {
		result.ChapterID = chapterOfTrack(svc, place.TrackID)
	}
	return result
}

// chapterOfTrack is the chapter linked to trackID, or "" when no chapter is, or when the links cannot be read: the Booth then opens
// where it would have opened anyway, instead of the narrator being told about a lookup they did not ask for.
func chapterOfTrack(svc hostServices, trackID string) string {
	documentID, store, err := mappingContext(svc)
	if err != nil {
		return ""
	}
	mappings, err := store.List(documentID)
	if err != nil {
		return ""
	}
	for _, mapping := range mappings {
		if sameTrackID(mapping.TrackGUID, trackID) {
			return mapping.ChapterID
		}
	}
	return ""
}

// sameTrackID compares two engine track ids the way the bridge does: braces and case do not matter.
func sameTrackID(a, b string) bool {
	trim := func(id string) string { return strings.ToUpper(strings.Trim(strings.TrimSpace(id), "{}")) }
	return trim(a) != "" && trim(a) == trim(b)
}

// DawGoToChapter selects chapterID's linked track in the DAW and puts its cursor at where: "end" (the end of what is recorded on the
// track, seconds ignored) or "at" (that many project seconds). The page sends the chapter id, never a track id: the track is the
// chapter's link, read here. The answer is a DawResult: the capability's own sentence when the resolver refuses it, a chapter with no
// or several links, a time that is not a number of seconds, or a track the DAW no longer has, each with nothing moved. A chapter the
// manuscript does not have is an error. It starts and seeks no playback and adds no undo step.
func (h *Host) DawGoToChapter(chapterID, where string, seconds float64) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), placeTimeout)
	defer cancel()
	result, err := dawGoToChapterIn(ctx, svc, readAloudAdapterName(svc), resolver.Support(dawport.CapFollowPosition), svc.placeFollower, chapterID, where, seconds)
	return encodeBinding(result, err)
}

func dawGoToChapterIn(ctx context.Context, svc hostServices, name string, support dawport.Support, follower dawport.PlaceFollower, chapterID, where string, seconds float64) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	var target dawport.PlaceTarget
	switch where {
	case goToEnd:
		target.End = true
	case goToAt:
		if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 {
			return dawport.Refused(placeBadTimeSentence), nil
		}
		target.Seconds = seconds
	default:
		return dawport.Refused(placeUnknownSentence), nil
	}
	track, unlinked, err := readAloudTrackGUID(svc, chapterID)
	if err != nil {
		return dawport.Result{}, err
	}
	if unlinked != nil {
		return dawport.Refused(unlinked.Message), nil
	}
	if follower == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	if err := follower.GoTo(ctx, track, target); err != nil {
		return dawport.Refused(placeRefusal(name, true, err)), nil
	}
	return dawport.Result{OK: true, Changed: true}, nil
}

// placeRefusal words an error the role returned rather than answered: a capability refusal, a track the DAW no longer has, the bridge
// not answering, or no answer in time.
func placeRefusal(name string, moving bool, err error) string {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused.Message
	}
	var stale *bridge.TrackStaleError
	switch {
	case errors.As(err, &stale):
		return fmt.Sprintf("The track linked to this chapter is no longer in the %s project. Link it again in the audio engine panel.", name)
	case errors.Is(err, bridge.ErrNoAnswer):
		return readAloudConnectionRefusal(name, reaperNotRunning).Message
	case errors.Is(err, bridge.ErrUnavailable):
		return readAloudConnectionRefusal(name, reaperStandalone).Message
	case errors.Is(err, bridge.ErrExperimentalOff):
		return err.Error()
	case errors.Is(err, context.DeadlineExceeded):
		return fmt.Sprintf(placeNoAnswerSentence, name, int(placeTimeout.Seconds()))
	case moving:
		return fmt.Sprintf(placeNotMovedSentence, name, err.Error())
	}
	return fmt.Sprintf(placeNotReadSentence, name, err.Error())
}
