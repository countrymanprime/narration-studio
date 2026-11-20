package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

const soloNotQuietedSentence = "%s could not quiet the other chapters: %s."

// soloLeftSentence is what the narrator is told, once, when a solo that may be on could not be taken off (the page shows it as a toast): what may stay
// silent and what to do. It is said only when something may be soloed, and it does not say when the narrator left: the DAW may have gone away mid-visit.
// The page sends the restore again when the DAW can follow again, and the DAW's own ledger puts it back the next time its bridge starts.
const soloLeftSentence = "%s could not take the solo off the chapter's track, so the other chapters may stay silent. Unsolo it in %s."

// soloDebt is what the host knows of the solo it asked the DAW for. started counts the solos asked for (counted just before the request, since one that
// timed out may still have landed) and through is the count a restore the DAW answered covered, so a solo started while a restore was in flight is never
// forgotten. owed is set when a restore that may have had something to take off failed or reached no DAW that can do it. The shutdown restore is sent
// only when something may be soloed, so a session that never used the feature asks the DAW for nothing.
type soloDebt struct {
	started, through atomic.Int64
	owed             atomic.Bool
}

func (d *soloDebt) mayBeSoloed() bool { return d.started.Load() > d.through.Load() || d.owed.Load() }

// start is called just before a solo is asked for.
func (d *soloDebt) start() {
	if d != nil {
		d.started.Add(1)
	}
}

// restore asks for the restore and records the answer. The mark is read before the ask, so a solo started during it stays owed. A failure, or a DAW
// that cannot do it, keeps the debt and is reported with the sentence only when something may be soloed; with nothing soloed it is not reported at all.
func (d *soloDebt) restore(ctx context.Context, name string, follower dawport.PlaceFollower) dawport.Result {
	mark := d.started.Load()
	pending := d.mayBeSoloed()
	result, reached := restoreSolo(ctx, name, follower)
	if reached && result.OK {
		for {
			seen := d.through.Load()
			if seen >= mark || d.through.CompareAndSwap(seen, mark) {
				break
			}
		}
		d.owed.Store(false)
		return result
	}
	if !pending {
		return dawport.Result{OK: true}
	}
	d.owed.Store(true)
	if reached {
		return result
	}
	return dawport.Refused(fmt.Sprintf(soloLeftSentence, name, name))
}

// DawSoloChapter soloes chapterID's linked track in the DAW while the narrator has that chapter open in the Booth, so every other chapter is quiet and not touched
// (#3428, solo in place on the chapter, chosen from the owner's A2). It is one change on one track: the chapter's own voices stay audible and are never
// muted, a track the narrator already soloed or muted stays as it is, and the chapter put in place before is put back first. It adds no undo step and
// changes nothing while the DAW records or plays an isolated track (the DAW does it right after). The page sends it when it enters a chapter with
// Booth.follow_chapter_in_daw on; DawSoloRestore puts it back. An engine that cannot do this (Audacity) answers as done with nothing changed. A DAW that
// does not answer, a chapter with no or several links and a track the DAW no longer has are refused with the sentence and nothing changed.
func (h *Host) DawSoloChapter(chapterID string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), placeTimeout)
	defer cancel()
	return encodeBinding(dawSoloChapterWith(ctx, svc, readAloudAdapterName(svc), resolver.Support(dawport.CapFollowPosition), svc.placeFollower, chapterID, &h.solo))
}

func dawSoloChapterIn(ctx context.Context, svc hostServices, name string, support dawport.Support, follower dawport.PlaceFollower, chapterID string) (dawport.Result, error) {
	return dawSoloChapterWith(ctx, svc, name, support, follower, chapterID, nil)
}

// dawSoloChapterWith is dawSoloChapterIn that counts the solo it asks for on debt (nil for none).
func dawSoloChapterWith(ctx context.Context, svc hostServices, name string, support dawport.Support, follower dawport.PlaceFollower, chapterID string, debt *soloDebt) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	track, unlinked, err := readAloudTrackGUID(svc, chapterID)
	if err != nil {
		return dawport.Result{}, err
	}
	if unlinked != nil {
		// The chapter before is put back, so the other chapters are not left quiet for a chapter that cannot be soloed.
		putBackBefore(ctx, follower)
		return dawport.Refused(unlinked.Message), nil
	}
	if follower == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	soloer, ok := follower.(dawport.ChapterSoloer)
	if !ok {
		return dawport.Result{OK: true}, nil
	}
	debt.start()
	soloed, err := soloer.SoloChapter(ctx, track)
	if err != nil {
		return soloRefusal(name, err), nil
	}
	return dawport.Result{OK: true, Changed: soloed.Changed}, nil
}

// putBackBefore asks the role to put back the chapter soloed before, ignoring the answer: the caller is refusing the next chapter anyway.
func putBackBefore(ctx context.Context, follower dawport.PlaceFollower) {
	if soloer, ok := follower.(dawport.ChapterSoloer); ok && follower != nil {
		_, _ = soloer.SoloRestore(ctx)
	}
}

// DawSoloRestore puts back the solo DawSoloChapter set, when the narrator leaves the Booth or turns the switch off: only the tracks it
// soloed, and only where the narrator has not changed the solo since. It does not look at the switch, so it works after the switch was turned off. While
// the DAW records it touches nothing and the DAW puts it back itself once the recording stops. A DAW with nothing to put back answers as done.
func (h *Host) DawSoloRestore() (string, error) {
	svc := h.services()
	ctx, cancel := context.WithTimeout(context.Background(), placeTimeout)
	defer cancel()
	return encodeBinding(h.solo.restore(ctx, readAloudAdapterName(svc), svc.placeFollower), nil)
}

// dawSoloRestoreIn is the restore without the debt: the result, for the goldens and the tests.
func dawSoloRestoreIn(ctx context.Context, name string, follower dawport.PlaceFollower) dawport.Result {
	result, _ := restoreSolo(ctx, name, follower)
	return result
}

// restoreSolo asks the role to put back the solo. reached is false when there is no follower or it has no role (Audacity, or the roles were rebuilt on a
// project change): nothing was asked, and the caller keeps what is owed.
func restoreSolo(ctx context.Context, name string, follower dawport.PlaceFollower) (result dawport.Result, reached bool) {
	soloer, ok := follower.(dawport.ChapterSoloer)
	if follower == nil || !ok {
		return dawport.Result{OK: true}, false
	}
	released, err := soloer.SoloRestore(ctx)
	if err != nil {
		if refused := soloRefusal(name, err); !refused.OK {
			return dawport.Refused(fmt.Sprintf(soloLeftSentence, name, name)), true
		}
		return dawport.Result{OK: true}, true
	}
	return dawport.Result{OK: true, Changed: released.Restored > 0}, true
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
	return dawport.Refused(fmt.Sprintf(soloNotQuietedSentence, name, strings.TrimRight(err.Error(), ".")))
}

// shutdownSoloTimeout bounds the restore at shutdown: one quick request to a DAW that is answering.
const shutdownSoloTimeout = 2 * time.Second

// restoreSoloOnShutdown is ServiceShutdown's best-effort restore of the solo DawSoloChapter set. A DAW that is recording keeps it until the recording
// stops and puts it back itself; one that cannot be reached has the ledger, which puts it back at the bridge's next start.
func (h *Host) restoreSoloOnShutdown() {
	svc := h.services()
	if svc.placeFollower == nil || !h.solo.mayBeSoloed() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), shutdownSoloTimeout)
	defer cancel()
	h.solo.restore(ctx, readAloudAdapterName(svc), svc.placeFollower)
}
