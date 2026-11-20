package guide

import (
	"context"
	"strings"
)

// cueSourceLocalModel is the speaker_source of a line the local model suggested a speaker for (#3743).
const cueSourceLocalModel = "local-model"

// The paragraphs of its chapter a model reads around a quote: those before it name who is in the scene, the one after it often
// holds the reply.
const (
	fallbackParagraphsBefore = 4
	fallbackParagraphsAfter  = 1
)

// FallbackParagraph is one manuscript paragraph a fallback reads.
type FallbackParagraph struct {
	ID        string
	ChapterID string
	Text      string
}

// FallbackCharacter is a Story Bible entry whose type speaks, as a fallback is told about it.
type FallbackCharacter struct {
	EntityID string
	Name     string
	Aliases  []string
}

// UnknownCue is a quoted line the rules left without a speaker and the narrator has not confirmed or edited. Passage is its
// paragraph and those around it in its chapter, in reading order.
type UnknownCue struct {
	CueID       string
	ChapterID   string
	ParagraphID string
	Quote       string
	Passage     []FallbackParagraph
}

// CueSuggestion is a fallback's speaker for one line: the cue it was asked about, one of the characters it was given, and a
// sentence for the narrator saying why.
type CueSuggestion struct {
	CueID    string
	EntityID string
	Reason   string
}

// SpeakerFallback suggests speakers for lines the rules left unknown. note is a sentence for the narrator when it stopped
// early; an error means it suggested nothing. It writes nothing: AttributeSpeakers decides what is kept.
type SpeakerFallback func(ctx context.Context, cues []UnknownCue, characters []FallbackCharacter) (suggestions []CueSuggestion, note string, err error)

// SetSpeakerFallback gives AttributeSpeakers a fallback for the lines the rules leave unknown; nil, the default, is none.
func (s *Service) SetSpeakerFallback(fallback SpeakerFallback) {
	if fallback == nil {
		s.speakerFallback.Store(nil)
		return
	}
	s.speakerFallback.Store(&fallback)
}

// fillUnknownSpeakers asks the fallback about every unknown, unconfirmed line and writes what it suggests as suggestions:
// the speaker, speaker_source "local-model" and the reason, on lines that are still unknown and unconfirmed when it answers.
// It returns how many lines it filled and a sentence for the narrator when the fallback stopped or failed. It never fails
// the run: the rules' result is already written.
func (s *Service) fillUnknownSpeakers(ctx context.Context) (filled int, note string) {
	fallback := s.speakerFallback.Load()
	if fallback == nil {
		return 0, ""
	}
	const failed = "The local model could not be asked, so the lines the rules left unknown stay unknown."
	cues, characters, err := s.fallbackQuestions()
	if err != nil {
		return 0, failed
	}
	if len(cues) == 0 || len(characters) == 0 {
		return 0, ""
	}
	suggestions, note, err := (*fallback)(ctx, cues, characters)
	if err != nil {
		return 0, failed
	}
	asked := make(map[string]bool, len(cues))
	for _, cue := range cues {
		asked[cue.CueID] = true
	}
	listed := make(map[string]bool, len(characters))
	for _, character := range characters {
		listed[character.EntityID] = true
	}
	byCue := map[string]CueSuggestion{}
	for _, suggestion := range suggestions {
		suggestion.Reason = strings.TrimSpace(suggestion.Reason)
		if _, taken := byCue[suggestion.CueID]; taken || !asked[suggestion.CueID] || !listed[suggestion.EntityID] || suggestion.Reason == "" {
			continue
		}
		byCue[suggestion.CueID] = suggestion
	}
	if len(byCue) == 0 {
		return 0, note
	}
	err = s.mutateInHost(func(document map[string]any) (bool, error) {
		rows, _ := document["dialogue_cues"].([]any)
		for _, raw := range rows {
			cue, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			id, _ := cue["id"].(string)
			suggestion, ok := byCue[id]
			// The narrator may have picked a speaker while the model was reading: their line is theirs.
			if !ok || truthy(cue["corrected"]) || cue["speaker_source"] == "correction" || cue["speaker_entity_id"] != nil {
				continue
			}
			cue["speaker_entity_id"] = suggestion.EntityID
			cue["speaker_source"] = cueSourceLocalModel
			evidence, ok := cue["evidence"].(map[string]any)
			if !ok {
				evidence = map[string]any{}
				cue["evidence"] = evidence
			}
			evidence["reason"] = suggestion.Reason
			filled++
		}
		return filled > 0, nil
	})
	if err != nil {
		return 0, failed
	}
	return filled, note
}

// fallbackQuestions is what a fallback is asked: the unknown, unconfirmed lines, each with its passage, and the entries
// whose type speaks.
func (s *Service) fallbackQuestions() ([]UnknownCue, []FallbackCharacter, error) {
	all, err := s.DialogueCues()
	if err != nil {
		return nil, nil, err
	}
	var unknown []DialogueCue
	for _, cue := range all {
		if cue.SpeakerEntityID == nil && !cue.Corrected && cue.SpeakerSource != "correction" {
			unknown = append(unknown, cue)
		}
	}
	if len(unknown) == 0 {
		return nil, nil, nil
	}
	characters, err := s.fallbackCharacters()
	if err != nil {
		return nil, nil, err
	}
	paragraphs, err := ruleManuscript(s.manuscript())
	if err != nil {
		return nil, nil, err
	}
	at := make(map[[2]string]int, len(paragraphs))
	for i, p := range paragraphs {
		at[[2]string{p.chapterID, p.paragraphID}] = i
	}
	cues := make([]UnknownCue, 0, len(unknown))
	for _, cue := range unknown {
		i, ok := at[[2]string{cue.ChapterID, cue.ParagraphID}]
		if !ok {
			continue // the manuscript changed under the cue; the next refresh drops it
		}
		question := UnknownCue{CueID: cue.ID, ChapterID: cue.ChapterID, ParagraphID: cue.ParagraphID, Quote: cue.QuoteText}
		for j := max(0, i-fallbackParagraphsBefore); j <= i+fallbackParagraphsAfter && j < len(paragraphs); j++ {
			if p := paragraphs[j]; p.chapterID == cue.ChapterID {
				question.Passage = append(question.Passage, FallbackParagraph{ID: p.paragraphID, ChapterID: p.chapterID, Text: string(p.text)})
			}
		}
		cues = append(cues, question)
	}
	return cues, characters, nil
}

// fallbackCharacters is the entries a line's speaker can be: those whose type speaks and that have an id and a name.
func (s *Service) fallbackCharacters() ([]FallbackCharacter, error) {
	types, err := s.Types()
	if err != nil {
		return nil, err
	}
	speaks := map[string]bool{}
	for _, t := range types {
		speaks[t.Name] = t.Speaks
	}
	entities, err := s.Entities()
	if err != nil {
		return nil, err
	}
	var characters []FallbackCharacter
	for _, entity := range entities {
		id, _ := entity["id"].(string)
		name, _ := entity["canonical_name"].(string)
		category, _ := entity["category"].(string)
		if id == "" || strings.TrimSpace(name) == "" || !speaks[category] {
			continue
		}
		character := FallbackCharacter{EntityID: id, Name: name}
		aliases, _ := entity["aliases"].([]any)
		for _, raw := range aliases {
			alias, _ := raw.(map[string]any)
			if text, _ := alias["text"].(string); strings.TrimSpace(text) != "" {
				character.Aliases = append(character.Aliases, text)
			}
		}
		characters = append(characters, character)
	}
	return characters, nil
}
