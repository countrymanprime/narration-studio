package main

import (
	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
	"github.com/countrymanprime/narration-utils/shell/internal/manuscript"
)

// The narrator's Editing records (ADR 0856), kept in <project>/narration-utils/editing/ and checked against the current text
// on every read. A word is named by its key, `paragraphId:ordinal` (its place among the paragraph's whitespace-separated
// words), together with the text it had, so a record whose word changed comes back stale rather than moved. The bindings take
// ids and keys only, never a path.

// EditingAcceptedList returns a chapter's accepted words (flagged words the narrator kept as read) in reading order.
func (h *Host) EditingAcceptedList(chapterID string) (string, error) {
	return encodeBinding(h.editLog().List(chapterID))
}

// EditingAccept records words of a chapter as accepted, so they are no longer flagged. Every key must name a word of the
// chapter's current text, or nothing is saved; a word already accepted is not recorded twice.
func (h *Host) EditingAccept(chapterID string, keys []string) (string, error) {
	return encodeBinding(h.editLog().Accept(chapterID, keys))
}

// EditingUnaccept removes words of a chapter from the accepted list, so their flags show again (Undo of an accept).
func (h *Host) EditingUnaccept(chapterID string, keys []string) (string, error) {
	return encodeBinding(h.editLog().Unaccept(chapterID, keys))
}

// editLog builds the Editing records store over one services() snapshot: it keeps no state of its own, so a project switch
// in the middle of a call never mixes two projects.
func (h *Host) editLog() *editlog.Service {
	svc := h.services()
	return editlog.New(editlog.Config{
		Project:    svc.config.projectFolder,
		Manuscript: editLogBook(svc.manuscript),
		Reporter:   h.persist,
	})
}

// editLogBook reads the current manuscript's chapter ids and its lines in reading order.
func editLogBook(service *manuscript.Service) func() (editlog.Book, error) {
	return func() (editlog.Book, error) {
		if service == nil {
			return editlog.Book{}, nil
		}
		data, err := service.Load()
		if err != nil {
			return editlog.Book{}, err
		}
		var book editlog.Book
		for _, chapter := range manuscriptObjects(data["chapters"]) {
			id, _ := chapter["id"].(string)
			book.Chapters = append(book.Chapters, id)
		}
		for _, paragraph := range manuscriptObjects(data["paragraphs"]) {
			chapterID, _ := paragraph["chapterId"].(string)
			id, _ := paragraph["id"].(string)
			text, _ := paragraph["text"].(string)
			book.Lines = append(book.Lines, editlog.Line{ChapterID: chapterID, ID: id, Index: paragraphIndex(paragraph["index"]), Text: text})
		}
		return book, nil
	}
}
