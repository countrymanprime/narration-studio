package main

import (
	"context"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// #3043: the edit commands plan from the chapter's audio read through its folder, and the ones that move the audio after the edit are refused while
// the chapter's audio is on several voice tracks (narration_range.lua, narration_takes.lua and narration_replace.lua shift one track only).

const (
	voiceA = "{AAAAAAAA-0000-4000-8000-0000000000A1}"
	voiceB = "{BBBBBBBB-0000-4000-8000-0000000000B1}"
)

func TestVoiceTracksWithAudioCountsDistinctTracksAndIgnoresMutedAndEmptyItems(t *testing.T) {
	muted := true
	for name, c := range map[string]struct {
		items []dawport.TrackItem
		want  int
	}{
		"none":                   {nil, 0},
		"a flat track":           {[]dawport.TrackItem{{Length: 5}, {Length: 3}}, 1},
		"one voice, two items":   {[]dawport.TrackItem{{TrackGUID: voiceA, Length: 5}, {TrackGUID: voiceA, Length: 3}}, 1},
		"two voices":             {[]dawport.TrackItem{{TrackGUID: voiceA, Length: 5}, {TrackGUID: voiceB, Length: 3}}, 2},
		"case does not matter":   {[]dawport.TrackItem{{TrackGUID: voiceA, Length: 5}, {TrackGUID: strings.ToLower(voiceA), Length: 3}}, 1},
		"a muted item is silent": {[]dawport.TrackItem{{TrackGUID: voiceA, Length: 5}, {TrackGUID: voiceB, Length: 3, Muted: &muted}}, 1},
		"an empty item":          {[]dawport.TrackItem{{TrackGUID: voiceA, Length: 5}, {TrackGUID: voiceB, Length: 0}}, 1},
	} {
		if got := voiceTracksWithAudio(c.items); got != c.want {
			t.Errorf("%s: %d, want %d", name, got, c.want)
		}
	}
}

func TestRippleRefusalNamesTheEditAndTheDAW(t *testing.T) {
	got := rippleRefusal("REAPER", "Shortening a gap")
	if got.OK || got.Refused == "" || !strings.Contains(got.Refused, "shortening a gap would move the audio") || !strings.Contains(got.Refused, "in REAPER") {
		t.Fatalf("%+v", got)
	}
}

// folderReader answers the folder read with items on two voices, and the one-track read with nothing (a folder has no items of its own).
type folderReader struct{ asked []string }

func (f *folderReader) ChapterTrackState(_ context.Context, guid string) (bridge.TrackState, error) {
	f.asked = append(f.asked, "track:"+guid)
	return bridge.TrackState{TrackGUID: guid}, nil
}

func (f *folderReader) ChapterFolderState(_ context.Context, guid string) (bridge.TrackState, error) {
	f.asked = append(f.asked, "folder:"+guid)
	return bridge.TrackState{TrackGUID: guid, ItemsTotal: 2, Items: []bridge.TrackItem{
		{ItemGUID: "i1", Length: 5, TrackGUID: voiceA},
		{ItemGUID: "i2", Length: 5, TrackGUID: voiceB},
	}}, nil
}

func TestChapterItemsReadAsksForTheFolderSoAVoicesItemIsPlannedWhereItIs(t *testing.T) {
	reader := &folderReader{}
	state, err := chapterItemsRead(t.Context(), reader, "{F}")
	if err != nil {
		t.Fatal(err)
	}
	if len(reader.asked) != 1 || reader.asked[0] != "folder:{F}" || len(state.Items) != 2 || state.Items[1].TrackGUID != voiceB {
		t.Fatalf("asked %v, items %+v; want the folder read with each item's track", reader.asked, state.Items)
	}
}

func twoVoiceItems() []dawport.TrackItem {
	items := splitItems()
	items[0].TrackGUID, items[1].TrackGUID = voiceA, voiceB
	return items
}

func TestShorteningAGapOnSeveralVoicesSendsTheChaptersFolderSoEveryVoiceMovesUp(t *testing.T) {
	role := &fakeRangeCutter{answer: trimInREAPER()}
	items := twoVoiceItems()
	got, err := dawTrimRangeInFolder(t.Context(), "REAPER", available(), role, splitTrack(&items, nil, nil), voiceFolderTrack, "c-0001", splitItem, 12.5, 14, 6)
	if err != nil || !got.OK || len(role.cut) != 1 || role.cut[0].ChapterTrack != voiceFolderTrack || role.cut[0].Mode != dawport.CutClose {
		t.Fatalf("%+v, %v, sent %+v; want a close cut carrying the folder", got, err, role.cut)
	}
}

func TestShorteningAGapOnSeveralVoicesWithNoFolderToNameIsRefusedAndSendsNothing(t *testing.T) {
	role := &fakeRangeCutter{answer: trimInREAPER()}
	items := twoVoiceItems()
	got, err := dawTrimRangeIn(t.Context(), "REAPER", available(), role, splitTrack(&items, nil, nil), "c-0001", splitItem, 12.5, 14, 6)
	if err != nil || got.OK || !strings.Contains(got.Refused, "more than one voice track") || len(role.cut) != 0 {
		t.Fatalf("%+v, %v, sent %+v; want a refusal and nothing sent", got, err, role.cut)
	}
}

func TestShorteningAGapOnAFlatChapterSendsNoFolder(t *testing.T) {
	role := &fakeRangeCutter{answer: trimInREAPER()}
	items := splitItems()
	got, err := dawTrimRangeIn(t.Context(), "REAPER", available(), role, splitTrack(&items, nil, nil), "c-0001", splitItem, 12.5, 14, 6)
	if err != nil || !got.OK || len(role.cut) != 1 || role.cut[0].ChapterTrack != "" {
		t.Fatalf("%+v, %v, sent %+v", got, err, role.cut)
	}
}

func TestStackingAndUnstackingAreRefusedOnSeveralVoicesAndSendNothing(t *testing.T) {
	for _, unstack := range []bool{false, true} {
		stacker := &fakeStacker{answer: stackedInREAPER()}
		sources := newFakeStackSources()
		sources.live[0].TrackGUID, sources.live[1].TrackGUID = voiceA, voiceB
		got := restack(t, stacker, sources, []string{stackPassage}, unstack)
		if got.OK || !strings.Contains(got.Refused, "more than one voice track") || len(stacker.stacked)+len(stacker.unstacked) != 0 {
			t.Errorf("unstack %v: %+v, sent %+v %+v", unstack, got, stacker.stacked, stacker.unstacked)
		}
	}
}

func TestStackingOnOneVoiceOfAFolderGoesThrough(t *testing.T) {
	stacker := &fakeStacker{answer: stackedInREAPER()}
	sources := newFakeStackSources()
	sources.live[0].TrackGUID, sources.live[1].TrackGUID = voiceA, voiceA
	if got := restack(t, stacker, sources, []string{stackPassage}, false); !got.OK || len(stacker.stacked) != 1 {
		t.Fatalf("%+v, sent %+v", got, stacker.stacked)
	}
}

func TestAClosingCutSendsTheChaptersFolderAndAGapCutDoesNot(t *testing.T) {
	role := &fakeRangeCutter{answer: cutInREAPER()}
	host := deleteRangeHost(t, "REAPER", liveReachability(), role)
	svc := host.services()
	was := chapterFolderOf
	chapterFolderOf = func(hostServices, string) string { return voiceFolderTrack }
	t.Cleanup(func() { chapterFolderOf = was })
	closed, err := dawDeleteRangeIn(t.Context(), svc, dawport.Support{Available: true}, role, host.editLog(), "c-0001", 0, 0, string(dawport.CutClose), 12, 0, false)
	if err != nil || !closed.OK || len(role.cut) != 1 || role.cut[0].ChapterTrack != voiceFolderTrack {
		t.Fatalf("close: %+v, %v, sent %+v; want the folder", closed, err, role.cut)
	}
	gap, err := dawDeleteRangeIn(t.Context(), svc, dawport.Support{Available: true}, role, host.editLog(), "c-0001", 0, 0, string(dawport.CutGap), 12, 0, false)
	if err != nil || !gap.OK || len(role.cut) != 2 || role.cut[1].ChapterTrack != "" {
		t.Fatalf("gap: %+v, %v, sent %+v; want no folder (a gap moves nothing)", gap, err, role.cut)
	}
}

func TestReplacingAndPuttingBackSendTheChaptersFolder(t *testing.T) {
	f := newReplaceFixture(t)
	f.deps.folder = func(string) string { return voiceFolderTrack }
	answer, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 6)
	if err != nil || !answer.Result.OK || len(f.replacer.replaced) != 1 || f.replacer.replaced[0].ChapterTrack != voiceFolderTrack {
		t.Fatalf("replace: %+v, %v, sent %+v; want the folder", answer.Result, err, f.replacer.replaced)
	}
	back, err := dawRestoreReplacementIn(t.Context(), f.deps, replaceChapter, "r-0123456789ab")
	if err != nil || !back.Result.OK || len(f.replacer.restored) != 1 || f.replacer.restored[0].ChapterTrack != voiceFolderTrack {
		t.Fatalf("restore: %+v, %v, sent %+v; want the folder", back.Result, err, f.replacer.restored)
	}
}

func TestReplacingOnAPlainTrackSendsNoFolder(t *testing.T) {
	f := newReplaceFixture(t)
	if answer, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 6); err != nil || !answer.Result.OK ||
		f.replacer.replaced[0].ChapterTrack != "" {
		t.Fatalf("%+v, %v, sent %+v", answer.Result, err, f.replacer.replaced)
	}
}
