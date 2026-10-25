package main

import (
	"context"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/coverage"
	"desktop/internal/dawport"
	"desktop/internal/editlog"
	"desktop/internal/measure"
	"desktop/internal/persist"
)

const (
	replaceChapter    = "c-0001"
	replaceMine       = "{A0000001-0000-4000-8000-000000000001}"
	replaceTheirTrack = "{B0000001-0000-4000-8000-000000000001}"
	replaceTheirItem  = "{B0000002-0000-4000-8000-000000000002}"
	replaceNewItem    = "{C0000001-0000-4000-8000-000000000001}"
	replaceCutItem    = "{C0000002-0000-4000-8000-000000000002}"
)

// fakeReplacer records the requests it was sent and answers what it is given.
type fakeReplacer struct {
	imported []string
	replaced []dawport.ReplaceRangeRequest
	restored []dawport.RestoreRequest
	answer   dawport.RangeReplaced
	restore  dawport.Result
	err      error
}

func (f *fakeReplacer) ImportTheirAudio(_ context.Context, name, path string) (dawport.TheirAudio, error) {
	f.imported = append(f.imported, name+"|"+path)
	if f.err != nil {
		return dawport.TheirAudio{}, f.err
	}
	return dawport.TheirAudio{Result: dawport.OK("Added "+name+"'s audio.", true).WithUndoSteps(1), Track: replaceTheirTrack,
		Item: replaceTheirItem, Length: 120}, nil
}

func (f *fakeReplacer) ReplaceRange(_ context.Context, request dawport.ReplaceRangeRequest) (dawport.RangeReplaced, error) {
	f.replaced = append(f.replaced, request)
	return f.answer, f.err
}

func (f *fakeReplacer) RestoreReplacement(_ context.Context, request dawport.RestoreRequest) (dawport.Result, error) {
	f.restored = append(f.restored, request)
	return f.restore, f.err
}

// replaceBook is the chapter "“Off with her head!” the Queen shouted." / "The soldiers were silent.".
func replaceBook() editlog.Book {
	return editlog.Book{Chapters: []string{replaceChapter}, Lines: []editlog.Line{
		{ChapterID: replaceChapter, ID: "p-000001", Index: 0, Text: "“Off with her head!” the Queen shouted."},
		{ChapterID: replaceChapter, ID: "p-000002", Index: 1, Text: "The soldiers were silent."},
	}}
}

// replaceView: "the Queen shouted." (tokens 4 to 6, words 4 to 6 of p-000001) heard at 12 to 14 s of the recording on my item, which
// sits at 10 s and plays the recording from 0 s; token 7 was not heard.
func replaceView() coverage.AlignmentView {
	paragraph := "p-000001"
	item := 0
	token := func(index, word int, start, end float64, heard bool) coverage.TokenLine {
		line := coverage.TokenLine{Index: index, Word: word, ParagraphID: &paragraph, Status: "read"}
		if heard {
			line.Item, line.Start, line.End = &item, &start, &end
		}
		return line
	}
	tokens := []coverage.TokenLine{}
	for i := 0; i < 4; i++ {
		tokens = append(tokens, token(i, i, float64(i), float64(i)+0.5, true))
	}
	tokens = append(tokens, token(4, 4, 2, 2.5, true), token(5, 5, 2.5, 3.2, true), token(6, 6, 3.2, 4, true), token(7, 0, 0, 0, false))
	return coverage.AlignmentView{Tokens: tokens, Items: []coverage.AlignmentItem{
		{Index: 0, ItemGUID: replaceMine, Live: true, TakeGUID: "{T}", Position: 10, Length: 30, PlayRate: 1},
	}}
}

type replaceFixture struct {
	deps     replaceDeps
	replacer *fakeReplacer
	file     editlog.NarratorFile
	project  string
	measured *float64
}

// newReplaceFixture: a project naming Eric Leach, with one file of his (a WAV on disk, 120 s long) already in REAPER on his track.
func newReplaceFixture(t *testing.T) *replaceFixture {
	t.Helper()
	project := t.TempDir()
	book := replaceBook()
	log := editlog.New(editlog.Config{Project: project, Manuscript: func() (editlog.Book, error) { return book, nil }, Reporter: &persist.Reporter{}})
	if _, err := log.NarratorAdd("Eric Leach"); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "Eric Leach ch1.wav")
	if err := os.WriteFile(path, []byte("RIFF....WAVE audio"), 0o600); err != nil {
		t.Fatal(err)
	}
	facts, refusal, err := theirFileFacts(path)
	if err != nil || refusal != "" {
		t.Fatalf("theirFileFacts = %q, %v", refusal, err)
	}
	facts.Daw, facts.Track, facts.Item, facts.Length = "REAPER", replaceTheirTrack, replaceTheirItem, 120
	if _, err := log.NarratorFileAdd("n-1", facts); err != nil {
		t.Fatal(err)
	}
	f := &replaceFixture{project: project, file: facts}
	loud := -26.0
	f.measured = &loud
	f.replacer = &fakeReplacer{
		answer:  dawport.RangeReplaced{Result: dawport.OK("Replaced 3 words with Eric Leach's audio in REAPER.", true).WithUndoSteps(1), ReplacementItem: replaceNewItem, CutItem: replaceCutItem, Shift: 1},
		restore: dawport.OK("Put your audio back for 3 words in REAPER.", true).WithUndoSteps(1),
	}
	f.deps = replaceDeps{
		support:   dawport.Support{Available: true, Level: dawport.Experimental},
		replacer:  f.replacer,
		daw:       "REAPER",
		log:       log,
		alignment: func(string) (coverage.AlignmentView, error) { return replaceView(), nil },
		theirs: func(_ context.Context, track string) (dawport.TrackState, error) {
			if track != replaceTheirTrack {
				return dawport.TrackState{}, &bridge.TrackStaleError{GUID: track}
			}
			return dawport.TrackState{TrackGUID: track, Items: []dawport.TrackItem{
				{ItemGUID: replaceTheirItem, Position: 0, Length: 120, PlayRate: 1, SourceFile: path},
			}}, nil
		},
		measure: func(context.Context, string, measure.Range) (measure.Report, error) {
			return measure.Report{IntegratedLUFS: f.measured}, nil
		},
		target: -20,
		newID:  func() string { return "r-0123456789ab" },
	}
	return f
}

func (f *replaceFixture) fileID() string { return "f-1" }

func TestReplacePlanAnswersTheWordsTheirStretchTheShiftAndTheLevelChange(t *testing.T) {
	f := newReplaceFixture(t)
	plan, err := replacePlanIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53)
	if err != nil || !plan.Result.OK {
		t.Fatalf("plan = %+v, %v", plan, err)
	}
	if plan.Narrator != "Eric Leach" || plan.Words != 3 || plan.Start != 12 || plan.End != 14 || plan.Shift != 1 {
		t.Errorf("plan words = %+v", plan)
	}
	if plan.MeasuredLUFS == nil || *plan.MeasuredLUFS != -26 || plan.TargetLUFS != -20 || plan.GainDB != 6 || plan.Clamped || plan.LoudnessNote != "" {
		t.Errorf("plan loudness = %+v", plan)
	}
	if len(f.replacer.replaced) != 0 {
		t.Error("a plan sent the edit")
	}
}

func TestReplacePlanHoldsTheLevelChangeToTheDAWsRangeAndSaysWhyItCannotMeasure(t *testing.T) {
	f := newReplaceFixture(t)
	quiet := -60.0
	f.measured = &quiet
	plan, _ := replacePlanIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53)
	if plan.GainDB != 24 || !plan.Clamped {
		t.Errorf("a stretch 40 dB under the target = %+v", plan)
	}
	f.measured = nil
	plan, _ = replacePlanIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53)
	if plan.MeasuredLUFS != nil || plan.GainDB != 0 || !strings.Contains(plan.LoudnessNote, "too short or too quiet") || !plan.Result.OK {
		t.Errorf("a stretch with no loudness = %+v", plan)
	}
	f.deps.measure = func(context.Context, string, measure.Range) (measure.Report, error) {
		return measure.Report{}, measure.ErrDecoderNotAvailable
	}
	plan, _ = replacePlanIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53)
	if plan.GainDB != 0 || !strings.Contains(plan.LoudnessNote, "WAV needs the audio encoder") {
		t.Errorf("no decoder = %+v", plan)
	}
}

func TestReplacePlanRefusals(t *testing.T) {
	cases := []struct {
		name        string
		change      func(*replaceFixture)
		first, last int
		file        string
		start, end  float64
		want        string
	}{
		{"capability off", func(f *replaceFixture) {
			f.deps.support = dawport.Support{Message: "Experimental: switched off in Settings."}
		}, 4, 6, "f-1", 50, 53, "Experimental: switched off in Settings."},
		{"no such file", nil, 4, 6, "f-9", 50, 53, replaceNoFileSentence},
		{"a stretch past the file", nil, 4, 6, "f-1", 118, 121, replaceStretchSentence},
		{"a stretch backwards", nil, 4, 6, "f-1", 53, 50, replaceStretchSentence},
		{"a stretch too short", nil, 4, 6, "f-1", 50, 50.01, replaceStretchSentence},
		{"a stretch too long", func(f *replaceFixture) { f.file.Length = 1000 }, 4, 6, "f-1", 0, 301, replaceStretchSentence},
		{"a stretch not finite", nil, 4, 6, "f-1", math.NaN(), 53, replaceStretchSentence},
		{"words not heard", nil, 6, 7, "f-1", 50, 53, "These words weren't heard in the recording, so there's no audio to cut. Run the check again if the chapter has changed."},
		{"words out of the alignment", nil, 4, 99, "f-1", 50, 53, "That selection is not in this chapter's alignment any more, so nothing was changed. Reload the chapter and select the words again."},
	}
	for _, c := range cases {
		f := newReplaceFixture(t)
		if c.change != nil {
			c.change(f)
		}
		plan, err := replacePlanIn(t.Context(), f.deps, replaceChapter, c.first, c.last, c.file, c.start, c.end)
		if err != nil || plan.Result.OK || plan.Result.Refused != c.want {
			t.Errorf("%s: plan = %+v, %v; want %q", c.name, plan.Result, err, c.want)
		}
	}
}

func TestReplacePlanRefusesTheirFileGoneOrChanged(t *testing.T) {
	f := newReplaceFixture(t)
	if err := os.WriteFile(f.file.Path, []byte("RIFF....WAVE other audio, longer"), 0o600); err != nil {
		t.Fatal(err)
	}
	plan, _ := replacePlanIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53)
	if plan.Result.Code != dawport.CodeStale || !strings.Contains(plan.Result.Refused, "changed since it was added") {
		t.Errorf("a changed file = %+v", plan.Result)
	}
	if err := os.Remove(f.file.Path); err != nil {
		t.Fatal(err)
	}
	plan, _ = replacePlanIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53)
	if plan.Result.Code != dawport.CodeStale || !strings.Contains(plan.Result.Refused, "no longer where it was") {
		t.Errorf("a file that is gone = %+v", plan.Result)
	}
}

func TestDawReplaceRangeSendsTheResolvedRequestAndRecordsTheReplacement(t *testing.T) {
	f := newReplaceFixture(t)
	answer, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 6)
	if err != nil || !answer.Result.OK || answer.ReplacementID != "r-0123456789ab" {
		t.Fatalf("replace = %+v, %v", answer, err)
	}
	if len(f.replacer.replaced) != 1 {
		t.Fatalf("sent %d requests", len(f.replacer.replaced))
	}
	sent := f.replacer.replaced[0]
	want := dawport.ReplaceRangeRequest{
		RangeRequest:   dawport.RangeRequest{ChapterID: replaceChapter, ItemGUID: replaceMine, Start: 12, End: 14, Words: 3},
		SourceItemGUID: replaceTheirItem, SourceStart: 50, SourceEnd: 53, FadeMs: 10, GainDB: 6, ID: "r-0123456789ab", Narrator: "Eric Leach",
	}
	if sent != want {
		t.Errorf("sent %+v, want %+v", sent, want)
	}
	got := answer.Replacements.Replacements
	if len(got) != 1 || got[0].ID != "r-0123456789ab" || got[0].NarratorName != "Eric Leach" || strings.Join(got[0].Words, " ") != "the Queen shouted." ||
		got[0].MeasuredLUFS == nil || *got[0].MeasuredLUFS != -26 || got[0].TargetLUFS != -20 || got[0].GainDB != 6 || got[0].Shift != 1 || !got[0].Active {
		t.Errorf("recorded %+v", got)
	}
	again, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 5, 6, f.fileID(), 50, 52, 10, 0)
	if err != nil || again.Result.Refused != replaceAlreadySentence || len(f.replacer.replaced) != 1 {
		t.Errorf("words already replaced = %+v, %v (sent %d)", again.Result, err, len(f.replacer.replaced))
	}
}

func TestDawReplaceRangeMapsTheirStretchOntoTheirItemAsTheDAWHasItNow(t *testing.T) {
	f := newReplaceFixture(t)
	path := f.file.Path
	f.deps.theirs = func(context.Context, string) (dawport.TrackState, error) {
		return dawport.TrackState{Items: []dawport.TrackItem{{ItemGUID: replaceTheirItem, Position: 200, Length: 100, SourceOffset: 10, PlayRate: 2, SourceFile: path}}}, nil
	}
	if _, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 0); err != nil {
		t.Fatal(err)
	}
	if sent := f.replacer.replaced[0]; sent.SourceStart != 220 || sent.SourceEnd != 221.5 {
		t.Errorf("their stretch in project seconds = %v to %v, want 220 to 221.5", sent.SourceStart, sent.SourceEnd)
	}
}

func TestDawReplaceRangeRefusesWithNothingSent(t *testing.T) {
	cases := []struct {
		name   string
		change func(*replaceFixture)
		fade   int
		gain   float64
		code   string
		want   string
	}{
		{"a fade of 600", nil, 600, 0, "", replaceBadFadeSentence},
		{"a level of 25", nil, 10, 25, "", replaceBadGainSentence},
		{"a level not a number", nil, 10, math.NaN(), "", replaceBadGainSentence},
		{"no DAW", func(f *replaceFixture) { f.deps.replacer = nil }, 10, 0, "", "REAPER is not connected to this app. Open REAPER; the app connects to it by itself."},
		{"their track gone", func(f *replaceFixture) { f.file.Track = "x"; f.deps.theirs = staleTrack }, 10, 0, dawport.CodeStale, "Their audio is no longer on its track in REAPER as the app added it, so nothing changed. Add their file again."},
		{"their item gone", func(f *replaceFixture) { f.deps.theirs = emptyTrack }, 10, 0, dawport.CodeStale, "Their audio is no longer on its track in REAPER as the app added it, so nothing changed. Add their file again."},
		{"their item trimmed", func(f *replaceFixture) { f.deps.theirs = trimmedTrack(f.file.Path) }, 10, 0, dawport.CodeStale, "Their item in REAPER no longer plays that stretch of their file (it was trimmed or moved), so nothing changed."},
		{"their item plays another file", func(f *replaceFixture) { f.deps.theirs = trimmedTrack("/elsewhere.wav") }, 10, 0, dawport.CodeStale, "Their audio is no longer on its track in REAPER as the app added it, so nothing changed. Add their file again."},
	}
	for _, c := range cases {
		f := newReplaceFixture(t)
		if c.change != nil {
			c.change(f)
		}
		answer, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, c.fade, c.gain)
		if err != nil || answer.Result.Refused != c.want || answer.Result.Code != c.code {
			t.Errorf("%s: answer = %+v, %v; want %q", c.name, answer.Result, err, c.want)
		}
		if len(f.replacer.replaced) != 0 {
			t.Errorf("%s: the edit was sent", c.name)
		}
		if len(answer.Replacements.Replacements) != 0 {
			t.Errorf("%s: something was recorded", c.name)
		}
	}
}

func staleTrack(_ context.Context, track string) (dawport.TrackState, error) {
	return dawport.TrackState{}, &bridge.TrackStaleError{GUID: track}
}

func emptyTrack(context.Context, string) (dawport.TrackState, error) {
	return dawport.TrackState{}, nil
}

func trimmedTrack(path string) func(context.Context, string) (dawport.TrackState, error) {
	return func(context.Context, string) (dawport.TrackState, error) {
		return dawport.TrackState{Items: []dawport.TrackItem{{ItemGUID: replaceTheirItem, Position: 0, Length: 51, PlayRate: 1, SourceFile: path}}}, nil
	}
}

func TestDawReplaceRangePassesTheDAWsRefusalOnAndRecordsNothing(t *testing.T) {
	f := newReplaceFixture(t)
	f.replacer.answer = dawport.RangeReplaced{Result: dawport.Refused("Another item on the track overlaps the words to replace, so nothing changed.")}
	answer, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 0)
	if err != nil || answer.Result.OK || len(answer.Replacements.Replacements) != 0 || answer.ReplacementID != "" {
		t.Fatalf("a refused edit = %+v, %v", answer, err)
	}
	f.replacer.err = bridge.ErrNoAnswer
	answer, err = dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 0)
	if err != nil || !strings.Contains(answer.Result.Refused, "not answering") || len(answer.Replacements.Replacements) != 0 {
		t.Fatalf("no answer = %+v, %v", answer, err)
	}
}

func TestDawRestoreReplacementPutsItBackAndMarksTheRecord(t *testing.T) {
	f := newReplaceFixture(t)
	if _, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 0); err != nil {
		t.Fatal(err)
	}
	answer, err := dawRestoreReplacementIn(t.Context(), f.deps, replaceChapter, "r-0123456789ab")
	if err != nil || !answer.Result.OK || answer.Replacements.Replacements[0].Active {
		t.Fatalf("restore = %+v, %v", answer, err)
	}
	if want := (dawport.RestoreRequest{ReplacementItem: replaceNewItem, ID: "r-0123456789ab", Words: 3}); f.replacer.restored[0] != want {
		t.Errorf("sent %+v, want %+v", f.replacer.restored[0], want)
	}
	again, _ := dawRestoreReplacementIn(t.Context(), f.deps, replaceChapter, "r-0123456789ab")
	if again.Result.Refused != replaceNoRecordSentence || len(f.replacer.restored) != 1 {
		t.Errorf("a second put-back = %+v (sent %d)", again.Result, len(f.replacer.restored))
	}
	if _, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 0); err == nil {
		t.Log("the words put back can be replaced again")
	}
}

func TestDawRestoreReplacementKeepsTheRecordWhenTheDAWRefuses(t *testing.T) {
	f := newReplaceFixture(t)
	if _, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 0); err != nil {
		t.Fatal(err)
	}
	f.replacer.restore = dawport.RefusedStale("Your audio for these words is no longer where the app left it in REAPER, so nothing changed.")
	answer, err := dawRestoreReplacementIn(t.Context(), f.deps, replaceChapter, "r-0123456789ab")
	if err != nil || answer.Result.OK || !answer.Replacements.Replacements[0].Active {
		t.Fatalf("a refused put-back = %+v, %v", answer, err)
	}
	if none, _ := dawRestoreReplacementIn(t.Context(), f.deps, replaceChapter, "r-nope"); none.Result.Refused != replaceNoRecordSentence {
		t.Errorf("an unknown replacement = %+v", none.Result)
	}
}

func TestReplaceAddFileBringsTheFileInAndRecordsIt(t *testing.T) {
	f := newReplaceFixture(t)
	if _, err := f.deps.log.NarratorAdd("إريك 🎙"); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "Take 2 🎙 صوت.FLAC")
	if err := os.WriteFile(path, []byte("fLaC audio"), 0o600); err != nil {
		t.Fatal(err)
	}
	answer, err := replaceAddFileIn(t.Context(), f.deps, "n-2", path)
	if err != nil || !answer.Result.OK || answer.FileID != "f-2" {
		t.Fatalf("add = %+v, %v", answer, err)
	}
	if len(f.replacer.imported) != 1 || f.replacer.imported[0] != "إريك 🎙|"+path {
		t.Errorf("imported %v", f.replacer.imported)
	}
	files := answer.Narrators.Narrators[1].Files
	if len(files) != 1 || files[0].Name != "Take 2 🎙 صوت.FLAC" || files[0].State != editlog.FileOK || files[0].Length != 120 {
		t.Errorf("files = %+v", files)
	}
	again, _ := replaceAddFileIn(t.Context(), f.deps, "n-1", path)
	if again.Result.OK || !strings.Contains(again.Result.Refused, "already in the project as إريك 🎙's audio") || len(f.replacer.imported) != 1 {
		t.Errorf("the same file again = %+v", again.Result)
	}
}

func TestReplaceAddFileRefusesWithNothingSent(t *testing.T) {
	dir := t.TempDir()
	write := func(name, content string) string {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		return path
	}
	notes, empty := write("notes.docx", "doc"), write("empty.wav", "")
	cases := []struct {
		name, narrator, path, want string
		change                     func(*replaceFixture)
	}{
		{"not audio", "n-1", notes, "notes.docx is not a WAV, FLAC, MP3, OGG or AIFF file.", nil},
		{"empty", "n-1", empty, "empty.wav is not a file with audio in it.", nil},
		{"gone", "n-1", filepath.Join(dir, "gone.wav"), "gone.wav could not be opened. Choose it again.", nil},
		{"a network path", "n-1", `\\server\share\leach.wav`, "leach.wav is on a network drive. Copy it to this computer first, then add it.", nil},
		{"no such narrator", "n-9", write("a.wav", "RIFF"), replaceNoNarratorSentence, nil},
		{"capability off", "n-1", write("b.wav", "RIFF"), "Experimental: switched off in Settings.", func(f *replaceFixture) {
			f.deps.support = dawport.Support{Message: "Experimental: switched off in Settings."}
		}},
	}
	for _, c := range cases {
		f := newReplaceFixture(t)
		if c.change != nil {
			c.change(f)
		}
		answer, err := replaceAddFileIn(t.Context(), f.deps, c.narrator, c.path)
		if err != nil || answer.Result.OK || !strings.HasSuffix(answer.Result.Refused, c.want) {
			t.Errorf("%s: %+v, %v; want %q", c.name, answer.Result, err, c.want)
		}
		if len(f.replacer.imported) != 0 {
			t.Errorf("%s: the file was sent", c.name)
		}
	}
	f := newReplaceFixture(t)
	f.replacer.err = errors.New("boom")
	answer, err := replaceAddFileIn(t.Context(), f.deps, "n-1", write("c.wav", "RIFF"))
	if err != nil || answer.Result.OK || answer.FileID != "" {
		t.Errorf("a DAW error = %+v, %v", answer, err)
	}
}

func TestReplaceTargetLUFSReadsTheSettingOrItsDefault(t *testing.T) {
	if got := replaceTargetLUFS(nil); got != defaultReplaceTargetLUFS {
		t.Errorf("no settings = %v", got)
	}
}
