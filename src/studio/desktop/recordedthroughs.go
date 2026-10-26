package main

import (
	"desktop/internal/coverage"
	"desktop/internal/credits"
	"desktop/internal/manuscript"
	"desktop/internal/recordedthrough"
	"desktop/internal/settings"
	"desktop/internal/teleprompter"
)

// recordedThroughs is the manuscript service's recorded-through provider: for every chapter, how far it is recorded
// (recordedthrough.Resolve) from its current Proof result, the stretches the Booth followed during takes (its reading
// file) and the recorded length the same payload carries. It only reads; a chapter nothing says is recorded is left out.
func recordedThroughs(folder string, service *coverage.Service, store *settings.Store) manuscript.RecordedThroughs {
	return func(chapters []string, lengths map[string]manuscript.RecordedLength) map[string]recordedthrough.Through {
		if folder == "" {
			return nil
		}
		var proof map[string][]coverage.ParagraphLine
		if service != nil && store != nil {
			proof = service.CurrentParagraphs(coverageSettings(store).Alignment)
		}
		return recordedThroughsFor(folder, chapters, proof, lengths)
	}
}

// recordedThroughsFor is the provider's rule over already-read results.
func recordedThroughsFor(folder string, chapters []string, proof map[string][]coverage.ParagraphLine, lengths map[string]manuscript.RecordedLength) map[string]recordedthrough.Through {
	result := map[string]recordedthrough.Through{}
	book, ok := teleprompter.LoadBook(folder)
	if !ok {
		return result
	}
	for _, id := range chapters {
		script, ok := book.Script(id)
		if !ok {
			continue
		}
		in := recordedthrough.Inputs{Script: scriptOf(script), WordsPerHour: credits.WordsPerFinishedHour}
		for _, line := range proof[id] {
			in.Proof = append(in.Proof, recordedthrough.Coverage{ID: line.ID, Tokens: line.Tokens, Present: line.Present})
		}
		if reading, err := book.Reading(id); err == nil && reading != nil && reading.Tokens == len(script.Tokens) {
			in.Booth = reading.Followed()
		}
		if length, known := lengths[id]; known && length.Unavailable == "" {
			seconds := length.Seconds
			in.RecordedSeconds = &seconds
		}
		if place := recordedthrough.Resolve(in); place != nil {
			result[id] = *place
		}
	}
	return result
}

// scriptOf is a teleprompter script as the resolver counts it.
func scriptOf(script teleprompter.ChapterScript) recordedthrough.Script {
	out := recordedthrough.Script{Tokens: len(script.Tokens)}
	for i, id := range script.ParagraphIDs {
		if i+1 >= len(script.Breaks) {
			break
		}
		end := len(script.Tokens)
		if i+2 < len(script.Breaks) {
			end = script.Breaks[i+2]
		}
		start := script.Breaks[i+1]
		out.Paragraphs = append(out.Paragraphs, recordedthrough.Paragraph{ID: id, Start: start, Count: end - start})
	}
	return out
}
