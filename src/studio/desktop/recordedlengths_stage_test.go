package main

import "testing"

// The Record stage is the chapter's stored stage, not a reading of its track: a narrator can set it by hand on a chapter that has no
// link (ManuscriptSetChapterStatus checks only that the stage is one of the five). The Rec. column then says why nothing is measured (#2634).
func TestAStageSetByHandStandsWithNoLinkedTrack(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	if _, err := host.ManuscriptSetChapterStatus(ids[1], "editing"); err != nil {
		t.Fatal(err)
	}
	got := chapterRecorded(t, host)[ids[1]]
	if got["status"] != "editing" || got["recordedSeconds"] != nil || got["recordedUnavailable"] != "unlinked" {
		t.Fatalf("chapter = %#v, want stage editing with no length and recordedUnavailable unlinked", got)
	}
}
