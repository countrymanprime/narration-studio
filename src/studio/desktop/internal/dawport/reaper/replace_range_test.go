package reaper

import (
	"reflect"
	"testing"

	"desktop/internal/dawport"
)

const (
	replaceSource = "{00000004-0000-4000-8000-000000000004}"
	replaceNew    = "{00000011-0000-4000-8000-000000000011}"
	replaceCut    = "{00000009-0000-4000-8000-000000000009}"
)

func rangeReplacerAnswering(t *testing.T, answer func(command []string) [][]string) dawport.RangeReplacer {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, answer)
	return adapter.Role(dawport.CapReplaceRange).(dawport.RangeReplacer)
}

func replaceRequest(words int, narrator string) dawport.ReplaceRangeRequest {
	return dawport.ReplaceRangeRequest{
		RangeRequest:   dawport.RangeRequest{ChapterID: "ch-1", ItemGUID: cutItem, Start: 14, End: 16, Words: words},
		SourceItemGUID: replaceSource, SourceStart: 164.2, SourceEnd: 167.2, FadeMs: 10, GainDB: -3.5, ID: "r-0001", Narrator: narrator,
	}
}

// A replacement is one undo step (docs/reference/daw/capabilities.md#replace_range); the command gets both ranges, the fade, the
// level change and the id, and the answer names the new item for the way back.
func TestReplaceRangeReplacesTheWordsInOneUndoStep(t *testing.T) {
	var sent []string
	replacer := rangeReplacerAnswering(t, func(command []string) [][]string {
		sent = command
		return [][]string{{"RANGE_REPLACED", command[1], replaceNew, replaceCut, cutItem, "1.000000", "1"}}
	})
	for _, tc := range []struct {
		words    int
		narrator string
		message  string
	}{
		{13, "Eric Leach", "Replaced 13 words with Eric Leach's audio in REAPER."},
		{1, "Eric Leach", "Replaced 1 word with Eric Leach's audio in REAPER."},
		{0, "Eric Leach", "Replaced the words with Eric Leach's audio in REAPER."},
		{2, "", "Replaced 2 words with the other narrator's audio in REAPER."},
		{2, "  ", "Replaced 2 words with the other narrator's audio in REAPER."},
	} {
		got, err := replacer.ReplaceRange(t.Context(), replaceRequest(tc.words, tc.narrator))
		want := dawport.RangeReplaced{Result: dawport.OK(tc.message, true).WithUndoSteps(1), ReplacementItem: replaceNew, CutItem: replaceCut, Shift: 1}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("ReplaceRange = %+v, %v; want %+v", got, err, want)
		}
	}
	want := []string{"replace_range", cutItem, "14.000000", "16.000000", replaceSource, "164.200000|167.200000|10|-3.50|r-0001"}
	if !reflect.DeepEqual(append([]string{sent[0]}, sent[2:]...), want) {
		t.Errorf("command = %v, want %v after the run", sent, want)
	}
}

func TestReplaceRangeRefusals(t *testing.T) {
	already := "Those words are already replaced. Put your audio back first."
	for _, tc := range []struct {
		name   string
		answer []string
		want   dawport.Result
	}{
		{"stale words", []string{"ITEM_STALE", cutItem, "item"}, dawport.RefusedStale("That passage's item is no longer in the REAPER project. Read the project again.")},
		{"stale theirs", []string{"ITEM_STALE", replaceSource, "source"}, dawport.RefusedStale("Their audio is no longer in the REAPER project. Choose it again.")},
		{"recording", []string{"ERROR", "REAPER is recording. Stop recording first."}, dawport.Refused("REAPER is recording. Stop recording first.")},
		{"already", []string{"ERROR", already}, dawport.Refused(already)},
		{"bad level", []string{"ERROR", "The level change must be from -24 to 24 dB."}, dawport.Refused("The level change must be from -24 to 24 dB.")},
		{"older script", []string{"ERROR", "Unsupported workspace command"}, dawport.Refused(messageReplaceScriptOutdated)},
	} {
		replacer := rangeReplacerAnswering(t, func(command []string) [][]string {
			return [][]string{append([]string{tc.answer[0], command[1]}, tc.answer[1:]...)}
		})
		got, err := replacer.ReplaceRange(t.Context(), replaceRequest(2, "Eric Leach"))
		if err != nil || !reflect.DeepEqual(got, dawport.RangeReplaced{Result: tc.want}) {
			t.Errorf("%s: ReplaceRange = %+v, %v; want %+v", tc.name, got, err, tc.want)
		}
	}
}

func TestReplaceRangeRefusesABadRequestWithoutSendingIt(t *testing.T) {
	adapter, dir := newAdapter(t, func(dawport.Capability) error { return nil })
	replacer := adapter.Role(dawport.CapReplaceRange).(dawport.RangeReplacer)
	for name, change := range map[string]func(*dawport.ReplaceRangeRequest){
		"empty range":    func(r *dawport.ReplaceRangeRequest) { r.End = r.Start },
		"their own item": func(r *dawport.ReplaceRangeRequest) { r.SourceItemGUID = r.ItemGUID },
		"a level of 30":  func(r *dawport.ReplaceRangeRequest) { r.GainDB = 30 },
		"no id":          func(r *dawport.ReplaceRangeRequest) { r.ID = "" },
	} {
		bad := replaceRequest(2, "Eric Leach")
		change(&bad)
		got, err := replacer.ReplaceRange(t.Context(), bad)
		if err != nil || got.Result.OK || got.Result.Refused == "" || got.ReplacementItem != "" {
			t.Errorf("%s: ReplaceRange = %+v, %v", name, got, err)
		}
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused replacement wrote %d commands", n)
	}
}

func TestReplaceRangeIsGatedByTheResolverAndSendsNothingWhenRefused(t *testing.T) {
	sentence := "Experimental DAW actions are off. Turn them on in Settings to replace words with another narrator's audio."
	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: sentence}}
	})
	replacer := adapter.Role(dawport.CapReplaceRange).(dawport.RangeReplacer)
	got, err := replacer.ReplaceRange(t.Context(), replaceRequest(2, "Eric Leach"))
	if err != nil || !reflect.DeepEqual(got, dawport.RangeReplaced{Result: dawport.Refused(sentence)}) {
		t.Errorf("ReplaceRange with replace_range refused = %+v, %v", got, err)
	}
	restored, err := replacer.RestoreReplacement(t.Context(), dawport.RestoreRequest{ReplacementItem: replaceNew, ID: "r-0001", Words: 2})
	if err != nil || !reflect.DeepEqual(restored, dawport.Refused(sentence)) {
		t.Errorf("RestoreReplacement with replace_range refused = %+v, %v", restored, err)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused replacement wrote %d commands", n)
	}
}

func TestRestoreReplacementPutsTheAudioBackInOneUndoStep(t *testing.T) {
	var sent []string
	replacer := rangeReplacerAnswering(t, func(command []string) [][]string {
		sent = command
		return [][]string{{"REPLACEMENT_RESTORED", command[1], replaceCut, "-1.000000", "1"}}
	})
	got, err := replacer.RestoreReplacement(t.Context(), dawport.RestoreRequest{ReplacementItem: replaceNew, ID: "r-0001", Words: 13})
	if want := dawport.OK("Put your audio back for 13 words in REAPER.", true).WithUndoSteps(1); err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("RestoreReplacement = %+v, %v; want %+v", got, err, want)
	}
	if want := []string{"restore_replacement", replaceNew, "r-0001"}; !reflect.DeepEqual(append([]string{sent[0]}, sent[2:]...), want) {
		t.Errorf("command = %v, want %v after the run", sent, want)
	}
}

func TestRestoreReplacementRefusals(t *testing.T) {
	gone := "Your audio for these words is no longer where the app left it in REAPER, so nothing changed. Use Edit > Undo in REAPER, or put it back by hand from the Cuts track."
	for _, tc := range []struct {
		name   string
		answer []string
		want   dawport.Result
	}{
		{"item", []string{"ITEM_STALE", replaceNew, "item"}, dawport.RefusedStale(gone)},
		{"replacement", []string{"ITEM_STALE", replaceNew, "replacement"}, dawport.RefusedStale(gone)},
		{"cut", []string{"ITEM_STALE", replaceCut, "cut"}, dawport.RefusedStale(gone)},
		{"recording", []string{"ERROR", "REAPER is recording. Stop recording first."}, dawport.Refused("REAPER is recording. Stop recording first.")},
	} {
		replacer := rangeReplacerAnswering(t, func(command []string) [][]string {
			return [][]string{append([]string{tc.answer[0], command[1]}, tc.answer[1:]...)}
		})
		got, err := replacer.RestoreReplacement(t.Context(), dawport.RestoreRequest{ReplacementItem: replaceNew, ID: "r-0001", Words: 2})
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: RestoreReplacement = %+v, %v; want %+v", tc.name, got, err, tc.want)
		}
	}
}

func TestImportTheirAudioAddsATrackInOneUndoStep(t *testing.T) {
	var sent []string
	replacer := rangeReplacerAnswering(t, func(command []string) [][]string {
		sent = command
		return [][]string{{"AUDIO_TRACK_ADDED", command[1], "{00000003-0000-4000-8000-000000000003}", replaceSource, "796.500000", "1"}}
	})
	got, err := replacer.ImportTheirAudio(t.Context(), "Eric Leach", "/home/kara/Eric Leach.mp3")
	want := dawport.TheirAudio{Result: dawport.OK("Added Eric Leach's audio to REAPER on a muted track of its own.", true).WithUndoSteps(1),
		Track: "{00000003-0000-4000-8000-000000000003}", Item: replaceSource, Length: 796.5}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("ImportTheirAudio = %+v, %v; want %+v", got, err, want)
	}
	if want := []string{"import_audio_track", "Eric Leach", "/home/kara/Eric Leach.mp3"}; !reflect.DeepEqual(append([]string{sent[0]}, sent[2:]...), want) {
		t.Errorf("command = %v, want %v after the run", sent, want)
	}
}

func TestImportTheirAudioRefusals(t *testing.T) {
	for _, tc := range []struct {
		answer []string
		want   string
	}{
		{[]string{"ERROR", "That file is no longer there. Choose it again."}, "That file is no longer there. Choose it again."},
		{[]string{"ERROR", "Choose an audio file on this computer (WAV, FLAC, MP3, OGG or AIFF)."}, "Choose an audio file on this computer (WAV, FLAC, MP3, OGG or AIFF)."},
		{[]string{"ERROR", "REAPER is recording. Stop recording first."}, "REAPER is recording. Stop recording first."},
		{[]string{"ERROR", "Unsupported workspace command"}, messageReplaceScriptOutdated},
	} {
		replacer := rangeReplacerAnswering(t, func(command []string) [][]string {
			return [][]string{append([]string{tc.answer[0], command[1]}, tc.answer[1:]...)}
		})
		got, err := replacer.ImportTheirAudio(t.Context(), "Eric Leach", "/home/kara/x.mp3")
		if err != nil || !reflect.DeepEqual(got, dawport.TheirAudio{Result: dawport.Refused(tc.want)}) {
			t.Errorf("%v: ImportTheirAudio = %+v, %v", tc.answer, got, err)
		}
	}
}
