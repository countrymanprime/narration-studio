package bridge

import "context"

// ChapterSoloed is what solo_chapter did (narration_solo_chapter.lua): the chapter's track REAPER holds solo in place now, whether this call changed it
// (a track the narrator had soloed is left alone and reads false), and Waiting when REAPER was recording or playing an isolated track: nothing was
// touched and the solo is applied on REAPER's own first tick after.
type ChapterSoloed struct {
	TrackGUID string
	Changed   bool
	Waiting   bool
}

// SoloReleased is what solo_restore did: how many chapters it put back to the solo they had, and how many it kept because the narrator changed the
// solo since. Waiting is true when REAPER was recording or playing an isolated track: nothing was touched and it is put back on REAPER's first tick after.
type SoloReleased struct {
	Restored, Kept int
	Waiting        bool
}

// SoloChapter asks REAPER to solo the chapter's folder track in place, one write on that track, leaving every other track as it is (the other chapters
// go quiet, the chapter's own voices stay audible). The chapter put in place before is put back first. Nothing is changed while REAPER records. A track
// that is gone is a *TrackStaleError.
func (a *Actions) SoloChapter(ctx context.Context, trackGUID string) (ChapterSoloed, error) {
	events, err := a.request(ctx, "solo_chapter", []string{"CHAPTER_SOLOED", "TRACK_STALE"}, trackGUID)
	if err != nil {
		return ChapterSoloed{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "TRACK_STALE" {
		return ChapterSoloed{}, &TrackStaleError{GUID: event.Fields[2]}
	}
	return ChapterSoloed{TrackGUID: event.Fields[2], Changed: numberAt(event.Fields, 3) != 0, Waiting: numberAt(event.Fields, 4) != 0}, nil
}

// SoloRestore puts back the solo SoloChapter set: only on a track that still reads that solo, so one the narrator changed meanwhile is kept. While REAPER
// records it changes nothing and says so (Waiting).
func (a *Actions) SoloRestore(ctx context.Context) (SoloReleased, error) {
	events, err := a.request(ctx, "solo_restore", []string{"SOLO_RESTORED"})
	if err != nil {
		return SoloReleased{}, err
	}
	fields := events[len(events)-1].Fields
	return SoloReleased{Restored: int(numberAt(fields, 2)), Kept: int(numberAt(fields, 3)), Waiting: numberAt(fields, 4) != 0}, nil
}
