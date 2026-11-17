package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

const soloNotQuietedSentence = "%s could not quiet the other chapters: %s."

// DawSoloChapter soloes chapterID's linked track in the DAW while the narrator records that chapter, so every other chapter is quiet and not touched
// (#3428, the owner's choice of "solo in place on the chapter"). It is one change on one track: the chapter's own voices stay audible and are never
// muted, a track the narrator already soloed or muted stays as it is, and the chapter put in place before is put back first. It adds no undo step and
// changes nothing while the DAW records or plays an isolated track (the DAW does it right after). The page sends it when it enters a chapter with
// Booth.follow_chapter_in_daw on; DawSoloRestore puts it back. An engine that cannot do this (Audacity) answers as done with nothing changed. A DAW that
// does not answer, a chapter with no or several links and a track the DAW no longer has are refused with the sentence and nothing changed.
func (h *Host) DawSoloChapter(chapterID string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), placeTimeout)
	defer cancel()
	return encodeBinding(dawSoloChapterIn(ctx, svc, readAloudAdapterName(svc), resolver.Support(dawport.CapFollowPosition), svc.placeFollower, chapterID))
}

func dawSoloChapterIn(ctx context.Context, svc hostServices, name string, support dawport.Support, follower dawport.PlaceFollower, chapterID string) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
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
	soloer, ok := follower.(dawport.ChapterSoloer)
	if !ok {
		return dawport.Result{OK: true}, nil
	}
	soloed, err := soloer.SoloChapter(ctx, track)
	if err != nil {
		return soloRefusal(name, err), nil
	}
	return dawport.Result{OK: true, Changed: soloed.Changed}, nil
}

// DawSoloRestore puts back the solo DawSoloChapter set, when the narrator leaves the chapter's recording or turns the switch off: only the tracks it
// soloed, and only where the narrator has not changed the solo since. It does not look at the switch, so it works after the switch was turned off. While
// the DAW records it touches nothing and the DAW puts it back itself once the recording stops. A DAW with nothing to put back answers as done.
func (h *Host) DawSoloRestore() (string, error) {
	svc := h.services()
	ctx, cancel := context.WithTimeout(context.Background(), placeTimeout)
	defer cancel()
	return encodeBinding(dawSoloRestoreIn(ctx, readAloudAdapterName(svc), svc.placeFollower), nil)
}

func dawSoloRestoreIn(ctx context.Context, name string, follower dawport.PlaceFollower) dawport.Result {
	soloer, ok := follower.(dawport.ChapterSoloer)
	if follower == nil || !ok {
		return dawport.Result{OK: true}
	}
	released, err := soloer.SoloRestore(ctx)
	if err != nil {
		return soloRefusal(name, err)
	}
	return dawport.Result{OK: true, Changed: released.Restored > 0}
}

// soloRefusal words the error a solo or a restore returned. A script from before these commands never soloed anything, so there is nothing to put
// back and nothing to say.
func soloRefusal(name string, err error) dawport.Result {
	if errors.Is(err, bridge.ErrScriptOutdated) {
		return dawport.Result{OK: true}
	}
	if refused, ok := dawport.RefusedFrom(err); ok {
		return dawport.Refused(refused.Message)
	}
	var stale *bridge.TrackStaleError
	if errors.As(err, &stale) || errors.Is(err, bridge.ErrNoAnswer) || errors.Is(err, bridge.ErrUnavailable) || errors.Is(err, context.DeadlineExceeded) {
		return dawport.Refused(placeRefusal(name, true, err))
	}
	return dawport.Refused(fmt.Sprintf(soloNotQuietedSentence, name, err.Error()))
}

// shutdownSoloTimeout bounds the restore at shutdown: one quick request to a DAW that is answering.
const shutdownSoloTimeout = 2 * time.Second

// restoreSoloOnShutdown is ServiceShutdown's best-effort restore of the solo DawSoloChapter set. A DAW that is recording keeps it until the recording
// stops and puts it back itself; one that cannot be reached has the ledger, which puts it back at the bridge's next start.
func (h *Host) restoreSoloOnShutdown() {
	svc := h.services()
	if svc.placeFollower == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), shutdownSoloTimeout)
	defer cancel()
	dawSoloRestoreIn(ctx, readAloudAdapterName(svc), svc.placeFollower)
}
