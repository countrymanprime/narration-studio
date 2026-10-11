package main

import (
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/manuscript"
	"github.com/countrymanprime/narration-utils/shell/internal/marks"
)

// The Script page's marks: a range of one paragraph marked with one of the narrator's mark types, with an optional note, or
// a question when the type asks. The types and the marks are kept in <project>/narration-utils/marks.json and each mark is
// checked against the current text on every read, so a mark whose line is gone, whose range no longer fits or whose words
// changed comes back stale rather than moved (docs/architecture/script-marks.md).

// MarksList returns the mark types in the narrator's order and every mark in reading order, each checked against the
// current manuscript. The first read of a project with no marks file brings the reader's old notes across once.
func (h *Host) MarksList() (string, error) {
	return encodeBinding(h.marks().List())
}

// MarksAdd marks a range of one line: start and end are UTF-16 units into the line's text, start before end. A type that
// asks needs text (its question), and its mark starts open.
func (h *Host) MarksAdd(chapterID, paragraphID string, start, end int, typeKey, text string) (string, error) {
	return encodeBinding(h.marks().Add(chapterID, paragraphID, start, end, typeKey, text))
}

// MarksRemove deletes a mark by id and returns the types and the marks left.
func (h *Host) MarksRemove(id string) (string, error) {
	return encodeBinding(h.marks().Remove(id))
}

// MarksSaveTypes replaces the mark types, in the narrator's order; a type with no key is new. At least one is kept, and
// removing a type that marks use is refused with the count unless removeUses is set, which removes those marks too.
func (h *Host) MarksSaveTypes(types []marks.MarkType, removeUses bool) (string, error) {
	return encodeBinding(h.marks().SaveTypes(types, removeUses))
}

// marks builds the marks store over one services() snapshot: it keeps no state of its own, so a project switch in the
// middle of a call never mixes two projects.
func (h *Host) marks() *marks.Service {
	svc := h.services()
	return marks.New(marks.Config{
		Project:    svc.config.projectFolder,
		Manuscript: marksBook(svc.manuscript),
		OldNotes:   marksOldNotes(svc.manuscript),
		Reporter:   h.persist,
	})
}

// marksBook reads the current manuscript's chapter ids and its lines in reading order, as the bookmarks do.
func marksBook(service *manuscript.Service) func() (marks.Book, error) {
	read := bookmarksBook(service)
	return func() (marks.Book, error) {
		source, err := read()
		if err != nil {
			return marks.Book{}, err
		}
		book := marks.Book{Chapters: source.Chapters}
		for _, line := range source.Lines {
			book.Lines = append(book.Lines, marks.Line{ChapterID: line.ChapterID, ID: line.ID, Index: line.Index, Text: line.Text})
		}
		return book, nil
	}
}

// marksOldNotes reads the reader's notes for the one-time migration; the reader's file is only read, never changed.
func marksOldNotes(service *manuscript.Service) func() ([]marks.OldNote, error) {
	return func() ([]marks.OldNote, error) {
		if service == nil {
			return nil, nil
		}
		var notes []marks.OldNote
		for _, note := range service.Notes("") {
			chapterID, _ := note["chapterId"].(string)
			paragraphID, _ := note["paragraphId"].(string)
			text, _ := note["text"].(string)
			created, _ := note["createdAt"].(string)
			createdAt, _ := time.Parse(time.RFC3339Nano, created)
			old := marks.OldNote{ChapterID: chapterID, ParagraphID: paragraphID, Text: text, CreatedAt: createdAt}
			if start, end := paragraphIndex(note["anchorStart"]), paragraphIndex(note["anchorEnd"]); start >= 0 && end >= 0 {
				old.Start, old.End = &start, &end
			}
			notes = append(notes, old)
		}
		return notes, nil
	}
}
