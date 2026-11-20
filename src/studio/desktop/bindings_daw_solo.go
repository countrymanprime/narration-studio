package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

const soloNotQuietedSentence = "%s could not quiet the other chapters: %s."

// soloLeftSentence is what the narrator is told, once, when a solo that may be on could not be taken off (the page shows it as a toast): what may stay
// silent and what to do. It is said only when something may be soloed, and it does not say when the narrator left: the DAW may have gone away mid-visit.
// The page sends the restore again when the DAW can follow again, and the DAW's own ledger puts it back the next time its bridge starts.
const soloLeftSentence = "%s could not take the solo off the chapter's track, so the other chapters may stay silent. Unsolo it in %s if they are still silent."

// soloDebt is what the host knows of the solo it asked the DAW for, under one mutex. pending holds the solos that may be on, by the number each was
// asked under: false while the DAW has not answered yet (a solo that is in flight when a restore is answered may still land, so that restore does not cover
// it), true once it answered or timed out (one that timed out may still have landed). A restore the DAW answered covers the answered solos asked before it;
// a solo the DAW answered it did not do is cancelled. owed is set when a restore that may have had something to take off failed or reached no DAW that
// can do it. The shutdown restore is sent only when something may be soloed, so a session that never used the feature asks the DAW for nothing.
type soloDebt struct {
	mu sync.Mutex
	// +checklocks:mu
	next int64
	// +checklocks:mu
	pending map[int64]bool
	// +checklocks:mu
	owed bool
}

func (d *soloDebt) mayBeSoloed() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return len(d.pending) > 0 || d.owed
}

func (d *soloDebt) isOwed() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.owed
}

// start is called just before a solo is asked for and answers the number it was asked under.
func (d *soloDebt) start() int64 {
	if d == nil {
		return 0
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	d.next++
	if d.pending == nil {
		d.pending = map[int64]bool{}
	}
	d.pending[d.next] = false
	return d.next
}

// answered records that the DAW answered the solo (or that the wait for it ended): from now a restore asked after it covers it.
func (d *soloDebt) answered(seq int64) {
	if d == nil {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if _, on := d.pending[seq]; on {
		d.pending[seq] = true
	}
}

// cancel takes back a solo the DAW answered it did not do.
func (d *soloDebt) cancel(seq int64) {
	if d == nil {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.pending, seq)
}

// restore asks for the restore and records the answer. The mark is read before the ask: only the answered solos up to it are covered by a restore that
// went through. A failure, or a DAW that cannot do it, keeps the debt and is reported with the sentence only when something may be soloed.
func (d *soloDebt) restore(ctx context.Context, name string, follower dawport.PlaceFollower) dawport.Result {
	d.mu.Lock()
	mark := d.next
	pending := len(d.pending) > 0 || d.owed
	d.mu.Unlock()
	result, reached := restoreSolo(ctx, name, follower)
	d.mu.Lock()
	defer d.mu.Unlock()
	if reached && result.OK {
		for seq, answered := range d.pending {
			if seq <= mark && answered {
				delete(d.pending, seq)
			}
		}
		d.owed = false
		return result
	}
	if !pending {
		return dawport.Result{OK: true}
	}
	// A failure answered after a later restore went through owes nothing the later one did not already take off.
	if len(d.pending) > 0 {
		d.owed = true
	}
	if len(d.pending) == 0 && !d.owed {
		return dawport.Result{OK: true}
	}
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
		if debt != nil {
			debt.restore(ctx, name, follower)
		} else {
			putBackBefore(ctx, follower)
		}
		return dawport.Refused(unlinked.Message), nil
	}
	if follower == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	soloer, ok := follower.(dawport.ChapterSoloer)
	if !ok {
		return dawport.Result{OK: true}, nil
	}
	seq := debt.start()
	soloed, err := soloer.SoloChapter(ctx, track)
	if err != nil {
		if errors.Is(err, bridge.ErrNoAnswer) || errors.Is(err, bridge.ErrUnavailable) || errors.Is(err, context.DeadlineExceeded) {
			// The DAW did not answer: the solo may still have landed, so it stays owed.
			debt.answered(seq)
		} else {
			// The DAW answered with an error (the track is gone, its ledger cannot be written): nothing was soloed by this call.
			debt.cancel(seq)
		}
		return soloRefusal(name, err), nil
	}
	debt.answered(seq)
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
