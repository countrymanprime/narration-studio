package main

import "github.com/countrymanprime/narration-utils/shell/internal/manuscript"

// manuscriptLine is one current line of a chapter as the bindings that check stored anchors against the text read it.
type manuscriptLine struct {
	ID    string
	Index int
	Text  string
}

// manuscriptLines reads a chapter's current lines from the manuscript, the same read the reader's own paragraphs come from.
func manuscriptLines(service *manuscript.Service) func(string) ([]manuscriptLine, error) {
	return func(chapterID string) ([]manuscriptLine, error) {
		if service == nil {
			return nil, nil
		}
		rows, err := service.Paragraphs(chapterID)
		if err != nil {
			return nil, err
		}
		lines := make([]manuscriptLine, 0, len(rows))
		for _, row := range rows {
			id, _ := row["id"].(string)
			text, _ := row["text"].(string)
			lines = append(lines, manuscriptLine{ID: id, Index: paragraphIndex(row["index"]), Text: text})
		}
		return lines, nil
	}
}

// paragraphIndex is a paragraph's book-wide index as the manuscript's JSON carries it, or -1 when it has none.
func paragraphIndex(value any) int {
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case int:
		return typed
	default:
		return -1
	}
}
