package main

import "testing"

func creditsRecordedLengths(t *testing.T, host *Host) map[string]map[string]any {
	t.Helper()
	raw, err := host.CreditsRecordedLengths()
	if err != nil {
		t.Fatal(err)
	}
	decoded := decodeBinding(t, raw)
	rows := make(map[string]map[string]any, len(decoded))
	for kind, row := range decoded {
		rows[kind] = row.(map[string]any)
	}
	return rows
}

func TestCreditsRecordedLengthsIsUnlinkedWithNoLink(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	got := creditsRecordedLengths(t, host)
	if got["opening"]["recordedUnavailable"] != "unlinked" || got["closing"]["recordedUnavailable"] != "unlinked" {
		t.Fatalf("credits recorded lengths with no link = %#v, want both unlinked", got)
	}
}

func TestCreditsRecordedLengthsIsTheConfirmedTrackSAudioInTheSavedProject(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	if _, err := host.ChapterTrackMapConfirm(chapterLinksTrack, "credits-opening"); err != nil {
		t.Fatal(err)
	}
	got := creditsRecordedLengths(t, host)
	// Chapter I's track (the one confirmed above) runs 0-10 and 12-17 s, whatever its playrate.
	if got["opening"]["recordedSeconds"] != 15.0 {
		t.Fatalf("credits-opening = %#v, want 15 s", got["opening"])
	}
	if got["closing"]["recordedUnavailable"] != "unlinked" {
		t.Fatalf("credits-closing = %#v, want unlinked (never linked)", got["closing"])
	}
}

// A credits id must never leak into a manuscript chapter's own recorded length, and vice versa.
func TestCreditsRecordedLengthsNeverLeaksIntoAManuscriptChaptersOwn(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	if _, err := host.ChapterTrackMapConfirm(chapterLinksTrack, "credits-opening"); err != nil {
		t.Fatal(err)
	}
	host.manuscript.SetRecordedLengths(recordedLengths(host.config.projectFolder, host.settings, host.manuscript))
	chapters, err := host.manuscript.Chapters()
	if err != nil {
		t.Fatal(err)
	}
	for _, chapter := range chapters {
		if chapter["id"].(string) == ids[0] && chapter["recordedUnavailable"] != "unlinked" {
			t.Fatalf("chapter %v = %#v, want still unlinked (its track went to credits-opening, not it)", ids[0], chapter)
		}
	}
}

// The Engine page's Chapter links rows for the opening and closing credits go through ChapterTrackSet and ChapterTrackUnlink,
// not only ChapterTrackMapConfirm: both must take a credits id, and the recorded length must follow the link.
func TestCreditsLinkSetAndUnlinkTakeACreditsIDAndMoveItsRecordedLength(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	for _, id := range []string{"credits-opening", "credits-closing"} {
		if _, err := host.ChapterTrackSet(id, chapterLinksTrack); err != nil {
			t.Fatalf("ChapterTrackSet(%s) = %v, want a link", id, err)
		}
	}
	got := creditsRecordedLengths(t, host)
	if got["closing"]["recordedSeconds"] != 15.0 || got["opening"]["recordedUnavailable"] != "unlinked" {
		t.Fatalf("after Set, credits lengths = %#v, want closing 15 s and opening unlinked (the track moved)", got)
	}
	if _, err := host.ChapterTrackUnlink("credits-closing"); err != nil {
		t.Fatalf("ChapterTrackUnlink(credits-closing) = %v", err)
	}
	if got := creditsRecordedLengths(t, host); got["closing"]["recordedUnavailable"] != "unlinked" {
		t.Fatalf("after Unlink, credits-closing = %#v, want unlinked", got["closing"])
	}
}
