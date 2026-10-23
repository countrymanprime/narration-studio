package voicesample

import (
	"bytes"
	"errors"
	"os"
	"strings"
	"testing"
)

func ids(samples []Sample) []string {
	out := make([]string, 0, len(samples))
	for _, sample := range samples {
		out = append(out, sample.ID)
	}
	return out
}

func TestListSortsPrimaryFirstThenNewest(t *testing.T) {
	r := newRig(t)
	// Created in the order of their numbers; hatter's primary is the oldest.
	r.seed(
		row(1, "hatter", true, 100), row(2, "hatter", false, 100), row(3, "narration", true, 100),
		row(4, "hatter", false, 100), row(5, "narration", false, 100), row(6, "alice", true, 100),
	)
	got := ids(r.list().Samples)
	want := []string{row(6, "", false, 0).ID, row(1, "", false, 0).ID, row(4, "", false, 0).ID, row(2, "", false, 0).ID, row(3, "", false, 0).ID, row(5, "", false, 0).ID}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("order = %v\nwant    %v", got, want)
	}
	list := r.list()
	if list.Totals.Count != 6 || list.Totals.Bytes != 600 {
		t.Fatalf("totals = %+v", list.Totals)
	}
}

func TestSetPrimaryMovesTheMarkWithinOneCharacter(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "hatter", true, 100), row(2, "hatter", false, 100), row(3, "queen", true, 100))
	list, err := r.service.SetPrimary(row(2, "", false, 0).ID)
	if err != nil {
		t.Fatal(err)
	}
	primary := map[string]bool{}
	for _, sample := range list.Samples {
		primary[sample.ID] = sample.Primary
	}
	if primary[row(1, "", false, 0).ID] || !primary[row(2, "", false, 0).ID] || !primary[row(3, "", false, 0).ID] {
		t.Fatalf("primaries = %v: another character's mark must stay", primary)
	}
	// Asking again changes nothing.
	before, _ := os.ReadFile(r.storePath())
	if _, err := r.service.SetPrimary(row(2, "", false, 0).ID); err != nil {
		t.Fatal(err)
	}
	if after, _ := os.ReadFile(r.storePath()); !bytes.Equal(before, after) {
		t.Fatal("setting the primary again rewrote the file")
	}
	if _, err := r.service.SetPrimary(strings.Repeat("a", 32)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an unknown id: %v", err)
	}
	if _, err := r.service.SetPrimary("../x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an id that is not an id: %v", err)
	}
}

func TestRemovingThePrimaryPromotesTheNewestRemaining(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "hatter", false, 100), row(2, "hatter", true, 100), row(3, "hatter", false, 100), row(4, "hatter", false, 100), row(5, "queen", true, 100))
	for _, i := range []int{1, 2, 3, 4, 5} {
		writeFile(t, r.clipPath(row(i, "", false, 0).ID), []byte("clip"))
	}
	removed, err := r.service.Remove(row(2, "", false, 0).ID)
	if err != nil || removed.Removed != 1 || removed.Bytes != 100 {
		t.Fatalf("removed = %+v, %v", removed, err)
	}
	primary := ""
	for _, sample := range r.list().Samples {
		if sample.CharacterID == "hatter" && sample.Primary {
			primary = sample.ID
		}
	}
	if primary != row(4, "", false, 0).ID {
		t.Fatalf("primary = %s, want the newest remaining (sample 4)", primary)
	}
	if _, err := os.Stat(r.clipPath(row(2, "", false, 0).ID)); err == nil {
		t.Fatal("the removed sample's clip is still on disk")
	}
	// Removing a sample that is not the primary leaves the mark where it is.
	if _, err := r.service.Remove(row(1, "", false, 0).ID); err != nil {
		t.Fatal(err)
	}
	for _, sample := range r.list().Samples {
		if sample.ID == row(4, "", false, 0).ID && !sample.Primary {
			t.Fatal("removing a non-primary moved the mark")
		}
	}
	// Removing the last sample of a character leaves no mark for it, and another character's is untouched.
	for _, i := range []int{3, 4} {
		if _, err := r.service.Remove(row(i, "", false, 0).ID); err != nil {
			t.Fatal(err)
		}
	}
	if left := r.list().Samples; len(left) != 1 || left[0].CharacterID != "queen" || !left[0].Primary {
		t.Fatalf("left = %+v", left)
	}
}

func TestRemovingAnUnknownSampleIsNotAnError(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "hatter", true, 100))
	before, _ := os.ReadFile(r.storePath())
	for _, id := range []string{strings.Repeat("a", 32), "", "../../etc", strings.Repeat("A", 32)} {
		removed, err := r.service.Remove(id)
		if err != nil || removed.Removed != 0 || removed.Bytes != 0 {
			t.Errorf("Remove(%q) = %+v, %v", id, removed, err)
		}
	}
	if after, _ := os.ReadFile(r.storePath()); !bytes.Equal(before, after) {
		t.Fatal("removing nothing rewrote the file")
	}
	// A project with no samples at all.
	empty := newRig(t)
	if removed, err := empty.service.Remove(strings.Repeat("a", 32)); err != nil || removed.Removed != 0 {
		t.Fatalf("empty: %+v, %v", removed, err)
	}
	if _, err := os.Stat(Dir(empty.project)); err == nil {
		t.Fatal("removing from an empty project created the folder")
	}
}

func TestRemoveAllDeletesEveryRowAndEveryClip(t *testing.T) {
	r := newRig(t)
	first := r.mustMark(request(10, 12))
	other := request(20, 22)
	other.CharacterID = "queen"
	second := r.mustMark(other)
	orphan := r.clipPath(strings.Repeat("ab", 16))
	writeFile(t, orphan, []byte("a clip left by a save that did not finish"))
	removed, err := r.service.RemoveAll()
	if err != nil || removed.Removed != 2 || removed.Bytes != first.Bytes+second.Bytes {
		t.Fatalf("removed = %+v, %v", removed, err)
	}
	if got := r.clipFiles(); len(got) != 0 {
		t.Fatalf("clips left: %v", got)
	}
	if list := r.list(); len(list.Samples) != 0 || list.Totals.Count != 0 {
		t.Fatalf("list = %+v", list)
	}
	if file := r.stored(); file.SchemaVersion != Version || len(file.Samples) != 0 {
		t.Fatalf("file = %+v", file)
	}
	// Again, with nothing left.
	if removed, err := r.service.RemoveAll(); err != nil || removed.Removed != 0 || removed.Bytes != 0 {
		t.Fatalf("second RemoveAll = %+v, %v", removed, err)
	}
}

func TestUpdateChangesLabelNoteAndCharacter(t *testing.T) {
	r := newRig(t)
	first := r.mustMark(request(10, 12))
	second := r.mustMark(request(20, 22))
	updated, err := r.service.Update(second.ID, Change{CharacterID: "hatter", Label: "  Whispered ", Note: "to the dormouse\r\nnear the end"})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Label != "Whispered" || updated.Note != "to the dormouse\nnear the end" || updated.Primary {
		t.Fatalf("updated = %+v", updated)
	}
	if got := r.list().Samples; got[0].ID != first.ID || got[1].Label != "Whispered" {
		t.Fatalf("list = %+v", got)
	}

	// A move to a character with no samples makes the sample that character's primary; the old character promotes its newest.
	moved, err := r.service.Update(first.ID, Change{CharacterID: "queen", Label: first.Label, Note: first.Note})
	if err != nil {
		t.Fatal(err)
	}
	if moved.CharacterID != "queen" || !moved.Primary {
		t.Fatalf("moved = %+v", moved)
	}
	for _, sample := range r.list().Samples {
		if sample.ID == second.ID && !sample.Primary {
			t.Fatal("Hatter was left with no primary after her primary moved away")
		}
	}
	// A move to a character who has samples does not take their primary mark.
	back, err := r.service.Update(first.ID, Change{CharacterID: "hatter"})
	if err != nil || back.Primary || back.CharacterID != "hatter" {
		t.Fatalf("back = %+v, %v", back, err)
	}
	if got := r.stored().Samples; len(got) != 2 {
		t.Fatalf("rows = %d", len(got))
	}
	// The clip and the provenance do not move with the character.
	if !bytes.Contains(mustRead(t, r.clipPath(first.ID)), []byte("RIFF")) || r.list().Samples[0].Source.StartKey != "p-000001:0" {
		t.Fatal("the clip or its provenance changed")
	}
}

func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestUpdateRefusals(t *testing.T) {
	r := newRig(t)
	rows := make([]Stored, 0, 21)
	for i := 1; i <= 20; i++ {
		rows = append(rows, row(i, "hatter", i == 1, 100))
	}
	rows = append(rows, row(21, "queen", true, 100))
	r.seed(rows...)

	_, err := r.service.Update(row(21, "", false, 0).ID, Change{CharacterID: "hatter"})
	if refusal := refusalOf(t, err); refusal.Reason != ReasonCharacterLimit {
		t.Fatalf("a move to a character with twenty samples: %v", refusal)
	}
	if moved := r.list(); len(moved.Samples) != 21 || moved.Samples[len(moved.Samples)-1].CharacterID != "queen" {
		t.Fatal("the refused move changed the store")
	}
	_, err = r.service.Update(strings.Repeat("a", 32), Change{CharacterID: "hatter"})
	if refusal := refusalOf(t, err); refusal.Reason != ReasonNotFound {
		t.Fatalf("an unknown sample: %v", refusal)
	}
	// Staying with the character who has twenty is not a move.
	if _, err := r.service.Update(row(2, "", false, 0).ID, Change{CharacterID: "hatter", Label: "renamed"}); err != nil {
		t.Fatalf("renaming one of twenty: %v", err)
	}
	for name, change := range map[string]Change{
		"no character":    {CharacterID: ""},
		"label too long":  {CharacterID: "hatter", Label: strings.Repeat("a", 61)},
		"note too long":   {CharacterID: "hatter", Note: strings.Repeat("a", 501)},
		"label has a tab": {CharacterID: "hatter", Label: "a\tb"},
	} {
		if _, err := r.service.Update(row(2, "", false, 0).ID, change); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}

func TestLabelAndNoteLimitsCountUTF16Units(t *testing.T) {
	r := newRig(t)
	sample := r.mustMark(request(10, 12))
	cases := []struct {
		name        string
		label, note string
		ok          bool
	}{
		{"60 ASCII", strings.Repeat("a", 60), "", true},
		{"61 ASCII", strings.Repeat("a", 61), "", false},
		{"30 emoji are 60 units", strings.Repeat("🎩", 30), "", true},
		{"31 emoji are 62 units", strings.Repeat("🎩", 31), "", false},
		{"60 Arabic letters", strings.Repeat("م", 60), "", true},
		{"61 Hebrew letters", strings.Repeat("ש", 61), "", false},
		{"a note of 500", "", strings.Repeat("n", 500), true},
		{"a note of 501", "", strings.Repeat("n", 501), false},
		{"250 emoji are 500 units", "", strings.Repeat("🎩", 250), true},
		{"251 emoji are 502 units", "", strings.Repeat("🎩", 251), false},
		{"note keeps tabs and breaks", "", "a\tb\nc", true},
		{"a bell in the note", "", "a\ab", false},
		{"a break in the label", "a\nb", "", false},
		{"a lone surrogate half is not text", "\xed\xa0\x80", "", false},
	}
	for _, c := range cases {
		_, err := r.service.Update(sample.ID, Change{CharacterID: "hatter", Label: c.label, Note: c.note})
		if (err == nil) != c.ok {
			t.Errorf("%s: err = %v, want ok = %v", c.name, err, c.ok)
		}
	}
}

func TestProvenanceIsComputedOnReadAndNeverStored(t *testing.T) {
	r := newRig(t)
	sample := r.mustMark(request(10, 12))
	before, _ := os.ReadFile(r.storePath())
	state := func() (SourceState, string) {
		s := r.list().Samples[0]
		return s.Source.State, s.Source.ChapterTitle
	}
	if got, title := state(); got != SourceOK || title != "Chapter One" {
		t.Fatalf("state = %s, %q", got, title)
	}
	r.book.Lines[0].Text = "“Off with her hat!” the Queen shouted."
	if got, _ := state(); got != SourceTextChanged {
		t.Fatalf("a word changed: %s", got)
	}
	r.book = aliceBook()
	r.book.Lines = r.book.Lines[1:]
	if got, _ := state(); got != SourceTextChanged {
		t.Fatalf("the paragraph is gone: %s", got)
	}
	r.book = aliceBook()
	r.book.Chapters = r.book.Chapters[1:]
	if got, title := state(); got != SourceChapterMissing || title != "" {
		t.Fatalf("the chapter is gone: %s, %q", got, title)
	}
	r.config.Manuscript = func() (Book, error) { return Book{}, errors.New("the manuscript cannot be read") }
	r.service = r.build()
	if got, _ := state(); got != SourceChapterMissing {
		t.Fatalf("no manuscript: %s", got)
	}
	r.config.Manuscript = nil
	r.service = r.build()
	if got, _ := state(); got != SourceChapterMissing {
		t.Fatalf("no manuscript service: %s", got)
	}
	r.book = aliceBook()
	r.config.Manuscript = func() (Book, error) { return r.book, nil }
	r.service = r.build()
	if got, _ := state(); got != SourceOK {
		t.Fatalf("restored: %s", got)
	}
	// Nothing in the file says any of this, and the clip plays whatever the text did.
	if after, _ := os.ReadFile(r.storePath()); !bytes.Equal(before, after) {
		t.Fatal("reading provenance rewrote samples.json")
	}
	if strings.Contains(string(before), "text_changed") || strings.Contains(string(before), "chapter_missing") {
		t.Fatal("a provenance state is stored")
	}
	if clip, err := r.service.Clip(sample.ID); err != nil || clip.State != ClipOK {
		t.Fatalf("clip = %+v, %v", clip, err)
	}
}

func TestClipStateOnList(t *testing.T) {
	r := newRig(t)
	sample := r.mustMark(request(10, 12))
	path := r.clipPath(sample.ID)
	original := mustRead(t, path)
	state := func() ClipState { return r.list().Samples[0].ClipState }

	if state() != ClipOK {
		t.Fatalf("state = %s", state())
	}
	writeFile(t, path, append(bytes.Clone(original), 0))
	if state() != ClipSizeChanged {
		t.Fatalf("a longer file: %s", state())
	}
	writeFile(t, path, original[:len(original)-2])
	if state() != ClipSizeChanged {
		t.Fatalf("a shorter file: %s", state())
	}
	// The list checks size only: a same-size change is found when the clip is served.
	changed := bytes.Clone(original)
	changed[len(changed)-1] ^= 0xff
	writeFile(t, path, changed)
	if state() != ClipOK {
		t.Fatalf("a same-size change on the list: %s", state())
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if state() != ClipMissing {
		t.Fatalf("a deleted file: %s", state())
	}
	if err := os.Mkdir(path, 0o755); err != nil {
		t.Fatal(err)
	}
	if state() != ClipMissing {
		t.Fatalf("a folder where the file goes: %s", state())
	}
}

func TestClipHashIsCheckedBeforeItIsServed(t *testing.T) {
	r := newRig(t)
	sample := r.mustMark(request(10, 12))
	path := r.clipPath(sample.ID)
	original := mustRead(t, path)

	clip, err := r.service.Clip(sample.ID)
	if err != nil || clip.State != ClipOK || clip.Path != path || clip.Bytes != int64(len(original)) {
		t.Fatalf("clip = %+v, %v", clip, err)
	}
	changed := bytes.Clone(original)
	changed[len(changed)-1] ^= 0xff
	writeFile(t, path, changed)
	if clip, err = r.service.Clip(sample.ID); err != nil || clip.State != ClipHashChanged || clip.Path != "" {
		t.Fatalf("a same-size change: %+v, %v", clip, err)
	}
	writeFile(t, path, original[:10])
	if clip, err = r.service.Clip(sample.ID); err != nil || clip.State != ClipSizeChanged || clip.Path != "" {
		t.Fatalf("a short file: %+v, %v", clip, err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if clip, err = r.service.Clip(sample.ID); err != nil || clip.State != ClipMissing || clip.Path != "" {
		t.Fatalf("a deleted file: %+v, %v", clip, err)
	}
	for _, id := range []string{strings.Repeat("a", 32), "../x", ""} {
		if _, err := r.service.Clip(id); !errors.Is(err, ErrNotFound) {
			t.Errorf("Clip(%q) err = %v", id, err)
		}
	}
}
