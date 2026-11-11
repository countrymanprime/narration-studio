package main

import (
	"desktop/internal/brand"
	"desktop/internal/chaptermatch"
	"desktop/internal/manuscript"
	"desktop/internal/recordedthrough"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// chapterLinksTrack is the Chapter I track in chapterTracksRpp; the other two
// are both named Chapter II.
const (
	chapterLinksTrack   = "{11111111-1111-4111-8111-111111111111}"
	chapterLinksTrackII = "{22222222-2222-4222-8222-222222222222}"
	chapterLinksTrackIJ = "{33333333-3333-4333-8333-333333333333}"
)

func mappingCount(t *testing.T, host *Host) []any {
	t.Helper()
	raw, err := host.ChapterTrackMapList()
	if err != nil {
		t.Fatal(err)
	}
	mappings, _ := decodeBinding(t, raw)["mappings"].([]any)
	return mappings
}

func TestChapterTrackSetReplacesTheChapterSLinkSoAChangeNeverLeavesTwo(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	if _, err := host.seedLink(chapterLinksTrackII, ids[1]); err != nil {
		t.Fatal(err)
	}
	raw, err := host.ChapterTrackSet(ids[1], chapterLinksTrackIJ)
	if err != nil {
		t.Fatal(err)
	}
	result := decodeBinding(t, raw)
	link, _ := result["link"].(map[string]any)
	if link["trackGuid"] != chapterLinksTrackIJ || link["chapterId"] != ids[1] || result["displaced"] != nil {
		t.Fatalf("ChapterTrackSet = %#v, want the new link and nothing displaced", result)
	}
	if mappings := mappingCount(t, host); len(mappings) != 1 {
		t.Fatalf("mappings = %#v, want exactly one link after the change", mappings)
	}
}

func TestChapterTrackSetNamesTheChapterThatLostTheTrack(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	if _, err := host.seedLink(chapterLinksTrack, ids[0]); err != nil {
		t.Fatal(err)
	}
	raw, err := host.ChapterTrackSet(ids[2], chapterLinksTrack)
	if err != nil {
		t.Fatal(err)
	}
	displaced, _ := decodeBinding(t, raw)["displaced"].(map[string]any)
	if displaced["chapterId"] != ids[0] || displaced["chapterTitle"] == "" {
		t.Fatalf("displaced = %#v, want Chapter I's old link", displaced)
	}
	mappings := mappingCount(t, host)
	if len(mappings) != 1 || mappings[0].(map[string]any)["chapterId"] != ids[2] {
		t.Fatalf("mappings = %#v, want only the moved link", mappings)
	}
}

func TestChapterTrackSetRefusesAnUnknownChapterOrNoTrack(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	if _, err := host.ChapterTrackSet("not-a-chapter", chapterLinksTrack); err == nil {
		t.Fatal("linking an unknown chapter succeeded")
	}
	if _, err := host.ChapterTrackSet(ids[0], ""); err == nil {
		t.Fatal("linking no track succeeded")
	}
	if mappings := mappingCount(t, host); len(mappings) != 0 {
		t.Fatalf("mappings = %#v, want nothing written by a refusal", mappings)
	}
}

func TestChapterTrackUnlinkClearsEveryLinkTheChapterHolds(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	for _, link := range [][2]string{{chapterLinksTrackII, ids[1]}, {chapterLinksTrackIJ, ids[1]}, {chapterLinksTrack, ids[0]}} {
		if _, err := host.seedLink(link[0], link[1]); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := host.ChapterTrackUnlink(ids[1])
	if err != nil {
		t.Fatal(err)
	}
	mappings, _ := decodeBinding(t, raw)["mappings"].([]any)
	if len(mappings) != 1 || mappings[0].(map[string]any)["chapterId"] != ids[0] {
		t.Fatalf("mappings = %#v, want only Chapter I's link", mappings)
	}
	if _, err := host.ChapterTrackUnlink("not-a-chapter"); err == nil {
		t.Fatal("unlinking an unknown chapter succeeded")
	}
}

func decodeLinks(t *testing.T, host *Host) chapterTrackLinks {
	t.Helper()
	raw, err := host.ChapterTrackLinks()
	if err != nil {
		t.Fatal(err)
	}
	var links chapterTrackLinks
	if err := json.Unmarshal([]byte(raw), &links); err != nil {
		t.Fatal(err)
	}
	return links
}

func TestChapterTrackLinksReadsEveryChapterAndTheTrackFactsFromOneProject(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	links := decodeLinks(t, host)
	if links.Project != linksProjectReady || links.SavedAt == "" || filepath.Base(links.ProjectFile) != "Alice.rpp" {
		t.Fatalf("project = %q %q %q, want the ready Alice.rpp", links.Project, links.ProjectFile, links.SavedAt)
	}
	if len(links.Chapters) != 3 || len(links.Tracks) != 3 {
		t.Fatalf("chapters = %d, tracks = %d, want 3 and 3", len(links.Chapters), len(links.Tracks))
	}
	want := map[string]string{ids[0]: "matched", ids[1]: "ambiguous", ids[2]: "none"}
	for _, row := range links.Chapters {
		if string(row.Status) != want[row.ChapterID] {
			t.Fatalf("%s status = %q, want %q", row.ChapterID, row.Status, want[row.ChapterID])
		}
	}
	if end := links.Chapters[0].RecordedEnd; end == nil || end.ProjectTime != 17 {
		t.Fatalf("Chapter I recordedEnd = %#v, want 17 s", end)
	}
	first := links.Tracks[0]
	if first.GUID != chapterLinksTrack || first.ItemCount != 2 || first.PlayableCount != 2 || first.MissingSourceCount != 0 {
		t.Fatalf("Chapter I track = %#v, want 2 playable items", first)
	}
	if first.Span == nil || first.Span.Start != 0 || first.Span.End != 17 || first.LinkedChapterID != "" {
		t.Fatalf("Chapter I span = %#v linked %q, want 0 to 17 and no link", first.Span, first.LinkedChapterID)
	}
	if links.Tracks[1].Span != nil || links.Tracks[1].ItemCount != 0 {
		t.Fatalf("empty track = %#v, want no span", links.Tracks[1])
	}
}

func TestChapterTrackLinksShowsAConflictAMissingAndARenamedTrack(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	for _, link := range [][2]string{{chapterLinksTrackII, ids[1]}, {chapterLinksTrackIJ, ids[1]}, {chapterLinksTrack, ids[2]}, {"{DEADBEEF-0000-4000-8000-000000000000}", ids[0]}} {
		if _, err := host.seedLink(link[0], link[1]); err != nil {
			t.Fatal(err)
		}
	}
	links := decodeLinks(t, host)
	byID := map[string]chapterTrackLink{}
	for _, row := range links.Chapters {
		byID[row.ChapterID] = row
	}
	if row := byID[ids[0]]; len(row.Links) != 1 || !hasWarning(row.Warnings, "confirmed-track-missing") {
		t.Fatalf("Chapter I = %#v, want its missing track's link and the warning", row)
	}
	if row := byID[ids[1]]; row.Status != "ambiguous" || len(row.Links) != 2 || !hasWarning(row.Warnings, "confirmed-links-conflict") {
		t.Fatalf("Chapter II = %#v, want both links as a conflict", row)
	}
	if row := byID[ids[2]]; row.Status != "confirmed" || !hasWarning(row.Warnings, "confirmed-track-renamed") {
		t.Fatalf("Chapter III = %#v, want confirmed to a track whose name no longer matches", row)
	}
	if links.Tracks[0].LinkedChapterID != ids[2] {
		t.Fatalf("Chapter I track linked to %q, want Chapter III", links.Tracks[0].LinkedChapterID)
	}
}

func hasWarning[W ~string](warnings []W, want string) bool {
	for _, warning := range warnings {
		if string(warning) == want {
			return true
		}
	}
	return false
}

func TestChapterTrackLinksReportsEachProjectStateWithoutFailing(t *testing.T) {
	host, _ := newTestHostForMapping(t)
	folder := host.config.projectFolder
	if links := decodeLinks(t, host); links.Project != linksProjectNone || len(links.Chapters) != 3 || links.Chapters[0].Status != "none" {
		t.Fatalf("no .rpp: %#v, want none with every chapter listed", links)
	}
	for _, name := range []string{"Alice.rpp", "Alice-alt.rpp"} {
		if err := os.WriteFile(filepath.Join(folder, name), []byte(chapterTracksRpp), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if links := decodeLinks(t, host); links.Project != linksProjectChoose || links.Message == "" || len(links.Tracks) != 0 {
		t.Fatalf("two .rpp files: %#v, want choose", links)
	}
	if err := os.Remove(filepath.Join(folder, "Alice-alt.rpp")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "Alice.rpp"), []byte("not a project"), 0o600); err != nil {
		t.Fatal(err)
	}
	if links := decodeLinks(t, host); links.Project != linksProjectError || links.Message == "" {
		t.Fatalf("unreadable .rpp: %#v, want error with a message", links)
	}
}

func TestChapterTrackLinksListsNarrationChaptersOnly(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	path := filepath.Join(host.config.projectFolder, brand.ProjectFolder, "manuscript", "manuscript.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	data["chapters"].([]any)[2].(map[string]any)["contentKind"] = "reference"
	edited, _ := json.Marshal(data)
	if err := os.WriteFile(path, edited, 0o600); err != nil {
		t.Fatal(err)
	}
	links := decodeLinks(t, host)
	if len(links.Chapters) != 2 || links.Chapters[1].ChapterID != ids[1] {
		t.Fatalf("chapters = %#v, want the reference chapter left out", links.Chapters)
	}
}

func TestChapterTrackLinksRefusesWithoutAManuscript(t *testing.T) {
	host := newTestHost(t)
	host.config.projectFolder = t.TempDir()
	if _, err := host.ChapterTrackLinks(); err == nil {
		t.Fatal("ChapterTrackLinks without a manuscript succeeded")
	}
}

// #3272: linking, unlinking and matching a chapter need its title, never its recorded length. The measured chapter list tokenizes the whole
// book and reads the project and the coverage results, so none of these may take it. Work done, not time: the providers it calls are counted.
func TestLinkingAndUnlinkingAChapterNeverTakesAMeasuredRead(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	var fractions, lengths, throughs int
	host.manuscript.SetRecordedFractions(func() map[string]float64 { fractions++; return nil })
	host.manuscript.SetRecordedLengths(func() map[string]manuscript.RecordedLength { lengths++; return nil })
	host.manuscript.SetRecordedThrough(func([]string, map[string]manuscript.RecordedLength) map[string]recordedthrough.Through {
		throughs++
		return nil
	})
	measured := func() int { return fractions + lengths + throughs }

	if _, err := host.manuscript.Chapters(); err != nil || measured() == 0 {
		t.Fatalf("the measured list did not call its providers (%d): the counters cannot see a measured read", measured())
	}
	before := measured()
	steps := map[string]func() error{
		"ChapterTrackSet":    func() error { _, err := host.ChapterTrackSet(ids[1], chapterLinksTrackIJ); return err },
		"ChapterTrackUnlink": func() error { _, err := host.ChapterTrackUnlink(ids[1]); return err },
		"ChapterTrackMatch":  func() error { _, err := host.ChapterTrackMatch(ids[0]); return err },
	}
	for _, name := range []string{"ChapterTrackSet", "ChapterTrackUnlink", "ChapterTrackMatch"} {
		if err := steps[name](); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if measured() != before {
			t.Fatalf("%s took a measured read of the chapter list (providers called %d times, want %d)", name, measured(), before)
		}
	}
}

// #3272: ChapterTrackLinks resolves every chapter against the saved project from one resolver, so each track and region name is matched against
// the titles once, not once per chapter (44 chapters against 64 tracks was about 0.9 s). Work done, not time.
func TestChapterTrackLinksMatchesEachNameOnceNotOncePerChapter(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	before := chaptermatch.TitleMatchCalls()
	links := decodeLinks(t, host)
	calls := chaptermatch.TitleMatchCalls() - before
	names := map[string]bool{}
	for _, track := range links.Tracks {
		names[track.Name] = true
	}
	limit := int64(len(names) + strings.Count(chapterTracksRpp, "MARKER"))
	if len(ids) < 2 || calls == 0 || calls > limit {
		t.Fatalf("%d chapters, %d distinct track names: %d title matches, want 1 to %d", len(ids), len(names), calls, limit)
	}
}
