package main

import (
	"context"
	"errors"

	"desktop/internal/extraction"
	"desktop/internal/extractionport"
	"desktop/internal/extractionport/localmodel"
	"desktop/internal/guide"
)

// localModelOutOfTime is what the narrator is told when the run's time ended while the model was reading.
const localModelOutOfTime = "The local model ran out of time, so the lines after it keep the rules' answer."

// localModelSpeakerFallback is the Story Bible's speaker fallback (guide.SpeakerFallback) over the local-model source (#3743):
// each unknown line becomes one question, and an answer the source keeps comes back tied to its line by the question's place,
// so two lines that read the same are told apart. How many lines one run may ask about is the source's MaxQuotes; a model that
// stops early, or a run whose time ends, keeps what was answered and gives a note. Nothing here reads a file or the network:
// the source is handed everything it is asked about. Runs may overlap: each works on its own copy of the source.
func localModelSpeakerFallback(source localmodel.Source) guide.SpeakerFallback {
	return func(ctx context.Context, cues []guide.UnknownCue, characters []guide.FallbackCharacter) (guide.FallbackResult, error) {
		listed := make([]localmodel.Character, len(characters))
		entity := make(map[string]string, len(characters))
		for i, c := range characters {
			listed[i] = localmodel.Character{Name: c.Name, Aliases: c.Aliases}
			entity[c.Name] = c.EntityID
		}
		questions := make([]localmodel.Question, len(cues))
		for i, cue := range cues {
			passage := make([]extraction.Paragraph, len(cue.Passage))
			for j, p := range cue.Passage {
				passage[j] = extraction.Paragraph{ID: p.ID, ChapterID: p.ChapterID, Text: p.Text}
			}
			questions[i] = localmodel.Question{ChapterID: cue.ChapterID, ParagraphID: cue.ParagraphID, Quote: cue.Quote, Passage: passage, Characters: listed}
		}
		run := source // a copy: the closure's own source is shared by every run
		run.Questions = func() ([]localmodel.Question, error) { return questions, nil }
		note := ""
		answers, err := run.Answer(ctx, extractionport.Input{Note: func(sentence string) { note = sentence }})
		switch {
		case err != nil && (errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled)):
			note = localModelOutOfTime
		case err != nil:
			return guide.FallbackResult{}, err
		}
		result := guide.FallbackResult{Asked: answers.Asked, Note: note}
		for _, a := range answers.Kept {
			// The source answers only with a name exactly one character has, so the name finds its entry.
			if id, ok := entity[a.Raw.Payload.Speaker]; ok && a.Question < len(cues) {
				result.Suggestions = append(result.Suggestions, guide.CueSuggestion{CueID: cues[a.Question].CueID, EntityID: id, Reason: a.Raw.Note})
			}
		}
		return result, nil
	}
}
