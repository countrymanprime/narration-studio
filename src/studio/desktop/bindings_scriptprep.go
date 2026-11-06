package main

import (
	"desktop/internal/manuscript"
	"desktop/internal/scriptprep"
)

// The Script page's preparation record: each chapter's prep state, kept in <project>/<app>/script-prep.json. A word's
// pronunciation is not kept here: it is its Story Bible name's (the Guide bindings), and the words an older file kept move there
// when the project opens (scriptwords_migrate.go). The bindings take a chapter id and a state, never a path.

// ScriptPrepList returns every manuscript chapter with its prep state (none when never set), then the credits once set.
func (h *Host) ScriptPrepList() (string, error) {
	return encodeBinding(h.scriptPrep().List())
}

// ScriptPrepSetChapter stores one chapter's prep state: none, progress or prepped. A chapter the manuscript lacks is refused; the
// opening and closing credits (credits:opening, credits:closing) are kept like a chapter.
func (h *Host) ScriptPrepSetChapter(chapterID, state string) (string, error) {
	return encodeBinding(h.scriptPrep().SetChapter(chapterID, state))
}

// scriptPrep builds the store over one services() snapshot: it keeps no state of its own, so a project switch in the middle of
// a call never mixes two projects.
func (h *Host) scriptPrep() *scriptprep.Service {
	svc := h.services()
	return scriptprep.New(scriptprep.Config{
		Project:    svc.config.projectFolder,
		Manuscript: scriptPrepBook(svc.manuscript),
		Reporter:   h.persist,
	})
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
