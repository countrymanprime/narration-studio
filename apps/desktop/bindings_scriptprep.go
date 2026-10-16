package main

import (
	"github.com/countrymanprime/narration-utils/shell/internal/manuscript"
	"github.com/countrymanprime/narration-utils/shell/internal/scriptprep"
)

// The Script page's preparation record: each chapter's prep state and the words flagged for pronunciation, each with how it is
// said and the id of the source the value came from (ADR 0792). It is kept in <project>/narration-utils/script-prep.json and
// each flag is checked against the current text on every read, so a flag whose line is gone, whose range no longer fits or
// whose words changed comes back stale rather than moved (ADR 0849). The bindings take ids, offsets, a state, a word, a
// say-value and a source id, never a path.

// ScriptPrepList returns every manuscript chapter with its prep state (none when never set) and every flagged word with its
// status, in reading order of its first flag.
func (h *Host) ScriptPrepList() (string, error) {
	return encodeBinding(h.scriptPrep().List())
}

// ScriptPrepSetChapter stores one chapter's prep state: none, progress or prepped. A chapter the manuscript lacks is refused; the
// opening and closing credits (credits:opening, credits:closing) are kept like a chapter.
func (h *Host) ScriptPrepSetChapter(chapterID, state string) (string, error) {
	return encodeBinding(h.scriptPrep().SetChapter(chapterID, state))
}

// ScriptWordFlag flags a range of one line for pronunciation: start and end are UTF-16 units into the line's text, start before
// end. The word is the line's own text for the range, lower-cased as its key. It returns the word with all its flags.
func (h *Host) ScriptWordFlag(chapterID, paragraphID string, start, end int) (string, error) {
	return encodeBinding(h.scriptPrep().Flag(chapterID, paragraphID, start, end))
}

// ScriptWordSay stores how a flagged word is said and the id of the pronunciation source the value came from; an empty source
// means the narrator typed it, and an empty say clears the value and keeps the word flagged.
func (h *Host) ScriptWordSay(word, say, source string) (string, error) {
	return encodeBinding(h.scriptPrep().Say(word, say, source))
}

// ScriptWordUnflag removes one flag and returns its word. The say-value is dropped with the word's last flag.
func (h *Host) ScriptWordUnflag(flagID string) (string, error) {
	return encodeBinding(h.scriptPrep().Unflag(flagID))
}

// scriptPrep builds the store over one services() snapshot: it keeps no state of its own, so a project switch in the middle of
// a call never mixes two projects.
func (h *Host) scriptPrep() *scriptprep.Service {
	svc := h.services()
	return scriptprep.New(scriptprep.Config{
		Project:    svc.config.projectFolder,
		Manuscript: scriptPrepBook(svc.manuscript),
		Sources:    h.scriptPrepSources,
		Reporter:   h.persist,
	})
}

// scriptPrepSources is the ids of the pronunciation sources the narrator can pick (PronunciationSources), available or not.
func (h *Host) scriptPrepSources() []string {
	list := h.pronunciationSourceList()
	ids := make([]string, 0, len(list.Sources))
	for _, source := range list.Sources {
		ids = append(ids, source.ID)
	}
	return ids
}

// scriptPrepBook reads the current manuscript's chapter ids and its lines in reading order, as the bookmarks do.
func scriptPrepBook(service *manuscript.Service) func() (scriptprep.Book, error) {
	read := bookmarksBook(service)
	return func() (scriptprep.Book, error) {
		source, err := read()
		if err != nil {
			return scriptprep.Book{}, err
		}
		book := scriptprep.Book{Chapters: source.Chapters}
		for _, line := range source.Lines {
			book.Lines = append(book.Lines, scriptprep.Line{ChapterID: line.ChapterID, ID: line.ID, Index: line.Index, Text: line.Text})
		}
		return book, nil
	}
}
