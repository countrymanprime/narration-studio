package guide

import (
	"context"
	"fmt"
	"log/slog"
	"slices"
	"strings"

	"desktop/internal/extraction"
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

// FallbackResult is what a fallback gave. Asked is how many of the lines it was handed, counted from the first, it put to the
// model (a cap or an early stop makes that fewer than all); Note is a sentence for the narrator when it stopped early.
type FallbackResult struct {
	Suggestions []CueSuggestion
	Asked       int
	Note        string
}

// SpeakerFallback suggests speakers for lines the rules left unknown. An error means it suggested nothing. It writes nothing:
// AttributeSpeakers decides what is kept. Two runs may call it at once.
type SpeakerFallback func(ctx context.Context, cues []UnknownCue, characters []FallbackCharacter) (FallbackResult, error)

// maxFallbackReasonRunes is the longest reason kept on a cue, whoever gave it.
const maxFallbackReasonRunes = 300

// fallbackFailed is what the narrator is told when the fallback could not run at all.
const fallbackFailed = "The local model could not be asked, so the lines the rules left unknown stay unknown."

// SetSpeakerFallback gives AttributeSpeakers a fallback for the lines the rules leave unknown; nil, the default, is none.
func (s *Service) SetSpeakerFallback(fallback SpeakerFallback) {
	if fallback == nil {
		s.speakerFallback.Store(nil)
		return
	}
	s.SetSpeakerFallbackProvider(func() SpeakerFallback { return fallback })
}

// SetSpeakerFallbackProvider gives AttributeSpeakers a function it asks at the start of each run for that run's fallback, so a
// setting the narrator changed since the project opened counts. A nil answer means the run asks no fallback.
func (s *Service) SetSpeakerFallbackProvider(provider func() SpeakerFallback) {
	if provider == nil {
		s.speakerFallback.Store(nil)
		return
	}
	s.speakerFallback.Store(&provider)
}

// fillUnknownSpeakers asks the fallback about every unknown, unconfirmed line and writes what it suggests as suggestions:
// the speaker, speaker_source "local-model" and the reason, on lines that are still unknown and unconfirmed when it answers,
// for an entry that still speaks then. It returns the ids of the lines it filled and a sentence for the narrator when the
// fallback stopped, failed or was not asked about every line. It never fails the run: the rules' result is already written.
func (s *Service) fillUnknownSpeakers(ctx context.Context) (filled map[string]bool, note string) {
	provider := s.speakerFallback.Load()
	if provider == nil {
		return nil, ""
	}
	fallback := (*provider)()
	if fallback == nil {
		return nil, ""
	}
	cues, characters, err := s.fallbackQuestions()
	if err != nil {
		slog.Warn("the speaker fallback could not read its questions", "error", err)
		return nil, fallbackFailed
	}
	if len(cues) == 0 || len(characters) == 0 {
		return nil, ""
	}
	result, err := fallback(ctx, cues, characters)
	if err != nil {
		slog.Warn("the speaker fallback failed", "error", err)
		return nil, fallbackFailed
	}
	asked := make(map[string]bool, len(cues))
	for _, cue := range cues {
		asked[cue.CueID] = true
	}
	byCue := map[string]CueSuggestion{}
	for _, suggestion := range result.Suggestions {
		suggestion.Reason = extraction.CleanSentence(suggestion.Reason, maxFallbackReasonRunes)
		if _, taken := byCue[suggestion.CueID]; taken || !asked[suggestion.CueID] || suggestion.Reason == "" {
			continue
		}
		byCue[suggestion.CueID] = suggestion
	}
	s.rememberDeclined(cues, characters, min(max(result.Asked, 0), len(cues)), byCue)
	note = result.Note
	if note == "" && result.Asked < len(cues) {
		note = fmt.Sprintf("The local model was asked about %d of the %d lines the rules left unknown; run it again for the rest.", max(result.Asked, 0), len(cues))
	}
	if len(byCue) == 0 {
		return nil, note
	}
	filled = map[string]bool{}
	err = s.mutateInHost(func(document map[string]any) (bool, error) {
		speakers := speakingEntityIDs(document)
		rows, _ := document["dialogue_cues"].([]any)
		for _, raw := range rows {
			cue, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			id, _ := cue["id"].(string)
			suggestion, ok := byCue[id]
			// The narrator may have picked a speaker, a rule found one or the entry gone while the model was reading.
			if !ok || truthy(cue["corrected"]) || cue["speaker_source"] == "correction" || cue["speaker_entity_id"] != nil || !speakers[suggestion.EntityID] {
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
			filled[id] = true
		}
		return len(filled) > 0, nil
	})
	if err != nil {
		slog.Warn("the speaker fallback's suggestions could not be written", "error", err)
		return nil, fallbackFailed
	}
	return filled, note
}

// speakingEntityIDs is the ids of the document's entries whose type speaks; none when its types cannot be read.
func speakingEntityIDs(document map[string]any) map[string]bool {
	ids := map[string]bool{}
	speaking, err := speakingTypes(document)
	if err != nil {
		return ids
	}
	entities, _ := document["entities"].([]any)
	for _, raw := range entities {
		entity, _ := raw.(map[string]any)
		id, _ := entity["id"].(string)
		if category, _ := entity["category"].(string); id != "" && slices.Contains(speaking, category) {
			ids[id] = true
		}
	}
	return ids
}

// declinedKey names a line the model was asked about and gave no kept answer for, with the cast it was asked with: a changed
// cast (a new entry, a new alias) makes the line worth asking again.
func declinedKey(cueID string, characters []FallbackCharacter) string {
	var b strings.Builder
	b.WriteString(cueID)
	for _, c := range characters {
		b.WriteString("\x00" + c.EntityID + "\x01" + c.Name + "\x01" + strings.Join(c.Aliases, "\x02"))
	}
	return b.String()
}

// rememberDeclined records the asked lines that got no kept answer, so the next run's cap is spent on lines the model has not
// seen instead of the same first ones. It lasts while the project is open; nothing is written.
func (s *Service) rememberDeclined(cues []UnknownCue, characters []FallbackCharacter, asked int, kept map[string]CueSuggestion) {
	s.fallbackMu.Lock()
	defer s.fallbackMu.Unlock()
	if s.fallbackDeclined == nil {
		s.fallbackDeclined = map[string]bool{}
	}
	for _, cue := range cues[:asked] {
		if _, ok := kept[cue.CueID]; !ok {
			s.fallbackDeclined[declinedKey(cue.CueID, characters)] = true
		}
	}
}

// declined reports whether the model already declined this line with this cast.
func (s *Service) declined(cueID string, characters []FallbackCharacter) bool {
	s.fallbackMu.Lock()
	defer s.fallbackMu.Unlock()
	return s.fallbackDeclined[declinedKey(cueID, characters)]
}

// fallbackQuestions is what a fallback is asked: the unknown, unconfirmed lines the model has not already declined, each with
// its passage, and the entries whose type speaks.
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
		if s.declined(cue.ID, characters) {
			continue
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
