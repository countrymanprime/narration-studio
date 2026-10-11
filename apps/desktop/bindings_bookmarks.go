package main

import (
	"github.com/countrymanprime/narration-utils/shell/internal/bookmarks"
	"github.com/countrymanprime/narration-utils/shell/internal/manuscript"
)

// The narrator's bookmarks (ADR 0820): a spot in the manuscript, a paragraph and a UTF-16 offset in its text, with an
// optional label and note, kept in <project>/narration-utils/bookmarks.json and checked against the current text on every
// read, so a bookmark whose line is gone or whose offset no longer fits comes back stale rather than moved.

// BookmarksList returns every bookmark in reading order, each checked against the current manuscript.
func (h *Host) BookmarksList() (string, error) {
	return encodeBinding(h.bookmarks().List())
}

// BookmarksAdd bookmarks a spot: offset is UTF-16 units into the line's text, from 0 to its length. A spot that already has
// a bookmark returns that one.
func (h *Host) BookmarksAdd(chapterID, paragraphID string, offset int) (string, error) {
	return encodeBinding(h.bookmarks().Add(chapterID, paragraphID, offset))
}

// BookmarksUpdate replaces a bookmark's label and note, both plain text within the limits ADR 0820 states.
func (h *Host) BookmarksUpdate(id, label, note string) (string, error) {
	return encodeBinding(h.bookmarks().Update(id, label, note))
}

// BookmarksRemove deletes a bookmark by id and returns the bookmarks left, in reading order.
func (h *Host) BookmarksRemove(id string) (string, error) {
	return encodeBinding(h.bookmarks().Remove(id))
}

// bookmarks builds the bookmarks store over one services() snapshot: it keeps no state of its own, so a project switch in
// the middle of a call never mixes two projects.
func (h *Host) bookmarks() *bookmarks.Service {
	svc := h.services()
	return bookmarks.New(bookmarks.Config{
		Project:    svc.config.projectFolder,
		Manuscript: bookmarksBook(svc.manuscript),
		Reporter:   h.persist,
	})
}

// bookmarksBook reads the current manuscript's chapter ids and its lines in reading order.
func bookmarksBook(service *manuscript.Service) func() (bookmarks.Book, error) {
	return func() (bookmarks.Book, error) {
		if service == nil {
			return bookmarks.Book{}, nil
		}
		data, err := service.Load()
		if err != nil {
			return bookmarks.Book{}, err
		}
		var book bookmarks.Book
		for _, chapter := range manuscriptObjects(data["chapters"]) {
			id, _ := chapter["id"].(string)
			book.Chapters = append(book.Chapters, id)
		}
		for _, paragraph := range manuscriptObjects(data["paragraphs"]) {
			chapterID, _ := paragraph["chapterId"].(string)
			id, _ := paragraph["id"].(string)
			text, _ := paragraph["text"].(string)
			book.Lines = append(book.Lines, bookmarks.Line{ChapterID: chapterID, ID: id, Index: paragraphIndex(paragraph["index"]), Text: text})
		}
		return book, nil
	}
}

// manuscriptObjects reads a list of the manuscript's records, decoded from its file or built in memory.
func manuscriptObjects(value any) []map[string]any {
	if objects, ok := value.([]map[string]any); ok {
		return objects
	}
	items, _ := value.([]any)
	objects := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if object, ok := item.(map[string]any); ok {
			objects = append(objects, object)
		}
	}
	return objects
}
