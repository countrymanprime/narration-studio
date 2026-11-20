package main

import (
	"context"

	"desktop/internal/extraction"
	"desktop/internal/extractionport"
	"desktop/internal/extractionport/localmodel"
	"desktop/internal/guide"
)

// localModelSpeakerFallback is the Story Bible's speaker fallback (guide.SpeakerFallback) over the local-model source (#3743):
// each unknown line becomes one question, and an answer the source keeps comes back tied to its line by the question's place,
// so two lines that read the same are told apart. How many lines one run may ask about is the source's MaxQuotes; a model that
// stops early gives its note. Nothing here reads a file or the network: the source is handed everything it is asked about.
func localModelSpeakerFallback(source localmodel.Source) guide.SpeakerFallback {
	return func(ctx context.Context, cues []guide.UnknownCue, characters []guide.FallbackCharacter) ([]guide.CueSuggestion, string, error) {
		listed := make([]localmodel.Character, len(characters))
		entity := map[string]string{}
		twice := map[string]bool{}
		for i, c := range characters {
			listed[i] = localmodel.Character{Name: c.Name, Aliases: c.Aliases}
			if _, seen := entity[c.Name]; seen {
				twice[c.Name] = true
			}
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
		source.Questions = func() ([]localmodel.Question, error) { return questions, nil }
		note := ""
		answered, err := source.Answer(ctx, extractionport.Input{Note: func(sentence string) { note = sentence }})
		if err != nil {
			return nil, "", err
		}
		suggestions := make([]guide.CueSuggestion, 0, len(answered))
		for _, a := range answered {
			name := a.Raw.Payload.Speaker
			// The source never answers with a name two characters share; the check keeps that true here too.
			if id, ok := entity[name]; ok && !twice[name] {
				suggestions = append(suggestions, guide.CueSuggestion{CueID: cues[a.Question].CueID, EntityID: id, Reason: a.Raw.Note})
			}
		}
		return suggestions, note, nil
	}
}
