package guide

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
)

// A book whose second chapter has a line no rule can attribute: nobody is named in its paragraph.
var fallbackRows = [][3]string{
	{"c1", "p0", `Chapter one belongs to nobody in chapter two.`},
	{"c2", "p1", `"Hello," Ada said.`},
	{"c2", "p2", `She waited by the door for a long while.`},
	{"c2", "p3", `"Who goes there?"`},
	{"c2", "p4", `Nothing answered.`},
	{"c2", "p5", `The hall was dark.`},
}

var fallbackPlace = map[string]any{"id": "entity-hall", "canonical_name": "Hall", "category": "Place", "aliases": []any{}}

func fallbackProject(t *testing.T, fallback SpeakerFallback) *Service {
	t.Helper()
	ada := map[string]any{"id": "entity-ada", "canonical_name": "Ada", "category": "Character", "aliases": []any{map[string]any{"text": "Addie"}, map[string]any{"text": " "}}}
	document := map[string]any{
		"entities": []any{ada, attributeBo, fallbackPlace},
		"types":    []any{map[string]any{"name": "Character", "colour": "green", "speaks": true}, map[string]any{"name": "Place", "colour": "blue", "speaks": false}},
	}
	s := cueProject(t, document, fallbackRows...)
	s.SetSpeakerFallback(fallback)
	return s
}

// suggest answers every asked line with entity and reason.
func suggest(entity, reason string) SpeakerFallback {
	return func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) ([]CueSuggestion, string, error) {
		out := make([]CueSuggestion, len(cues))
		for i, cue := range cues {
			out[i] = CueSuggestion{CueID: cue.CueID, EntityID: entity, Reason: reason}
		}
		return out, "", nil
	}
}

func setEntities(t *testing.T, s *Service, entities ...any) {
	t.Helper()
	written, err := os.ReadFile(s.guidePath())
	if err != nil {
		t.Fatal(err)
	}
	var onDisk map[string]any
	if err := json.Unmarshal(written, &onDisk); err != nil {
		t.Fatal(err)
	}
	onDisk["entities"] = entities
	raw, _ := json.Marshal(onDisk)
	if err := os.WriteFile(s.guidePath(), raw, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestTheFallbackIsAskedOnlyAboutUnknownLinesWithTheirPassageAndTheSpeakingEntries(t *testing.T) {
	var asked []UnknownCue
	var listed []FallbackCharacter
	s := fallbackProject(t, func(_ context.Context, cues []UnknownCue, characters []FallbackCharacter) ([]CueSuggestion, string, error) {
		asked, listed = cues, characters
		return nil, "", nil
	})
	result := attributed(t, s)
	if len(asked) != 1 || asked[0].Quote != "Who goes there?" || asked[0].ChapterID != "c2" || asked[0].ParagraphID != "p3" || asked[0].CueID == "" {
		t.Fatalf("asked %+v", asked)
	}
	var ids []string
	for _, p := range asked[0].Passage {
		ids = append(ids, p.ID+":"+p.ChapterID)
	}
	// Four paragraphs back would reach chapter one; the passage stays in the line's chapter, and takes one paragraph after it.
	if got := strings.Join(ids, " "); got != "p1:c2 p2:c2 p3:c2 p4:c2" {
		t.Fatalf("passage %q", got)
	}
	if asked[0].Passage[2].Text != `"Who goes there?"` {
		t.Fatalf("passage text %q", asked[0].Passage[2].Text)
	}
	if len(listed) != 2 || listed[0].EntityID != "entity-ada" || listed[0].Name != "Ada" || len(listed[0].Aliases) != 1 || listed[0].Aliases[0] != "Addie" || listed[1].EntityID != "entity-bo" {
		t.Fatalf("a place does not speak and a blank alias is no name: %+v", listed)
	}
	if result.ModelFilled != 0 || result.ModelNote != "" || result.Filled != 1 {
		t.Fatalf("result %+v", result)
	}
}

func TestTheFallbackFillsAnUnknownLineAsASuggestionWithItsReasonAndUndoTakesItBack(t *testing.T) {
	s := fallbackProject(t, suggest("entity-bo", "  Bo is the only other person in the hall.  "))
	result := attributed(t, s)
	if result.Cues != 2 || result.Attributed != 2 || result.Filled != 2 || result.ModelFilled != 1 || result.ModelNote != "" || len(result.Previous) != 2 {
		t.Fatalf("result %+v", result)
	}
	cue := cuesByQuote(t, s)["Who goes there?"]
	if cue.SpeakerEntityID == nil || *cue.SpeakerEntityID != "entity-bo" || cue.SpeakerSource != "local-model" || cue.Corrected ||
		cue.Evidence.Reason != "Bo is the only other person in the hall." || cue.Evidence.ParagraphID != "p3" {
		t.Fatalf("a model's answer is a suggestion with a reason: %+v", cue)
	}
	if ruled := cuesByQuote(t, s)["Hello,"]; ruled.SpeakerSource != "tag" || ruled.Evidence.Reason != "" {
		t.Fatalf("a line the rules attributed is not the model's: %+v", ruled)
	}
	restored, err := s.RestoreSpeakers(result.Previous)
	if err != nil || restored != 2 {
		t.Fatalf("restored %d, %v", restored, err)
	}
	if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerEntityID != nil || cue.SpeakerSource != "unknown" || cue.Evidence.Reason != "" {
		t.Fatalf("undo left the model's suggestion or its reason: %+v", cue)
	}
}

func TestWithoutAFallbackNothingIsAskedAndTheResultSaysSo(t *testing.T) {
	s := fallbackProject(t, nil)
	result := attributed(t, s)
	if result.ModelFilled != 0 || result.ModelNote != "" || result.Filled != 1 {
		t.Fatalf("result %+v", result)
	}
	if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerEntityID != nil || cue.SpeakerSource != "unknown" {
		t.Fatalf("cue %+v", cue)
	}
}

func TestASuggestionThatIsNotForAnAskedLineAListedCharacterOrHasNoReasonIsDropped(t *testing.T) {
	for name, build := range map[string]func(cue UnknownCue) []CueSuggestion{
		"a place": func(cue UnknownCue) []CueSuggestion {
			return []CueSuggestion{{CueID: cue.CueID, EntityID: "entity-hall", Reason: "The hall speaks."}}
		},
		"nobody listed": func(cue UnknownCue) []CueSuggestion {
			return []CueSuggestion{{CueID: cue.CueID, EntityID: "entity-zed", Reason: "Zed speaks."}}
		},
		"no reason": func(cue UnknownCue) []CueSuggestion {
			return []CueSuggestion{{CueID: cue.CueID, EntityID: "entity-bo", Reason: " \n"}}
		},
		"a line not asked": func(UnknownCue) []CueSuggestion {
			return []CueSuggestion{{CueID: "cue-other", EntityID: "entity-bo", Reason: "Bo speaks."}}
		},
		"nothing suggested": func(UnknownCue) []CueSuggestion { return nil },
	} {
		s := fallbackProject(t, func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) ([]CueSuggestion, string, error) {
			return build(cues[0]), "", nil
		})
		if result := attributed(t, s); result.ModelFilled != 0 || result.Attributed != 1 {
			t.Fatalf("%s: result %+v", name, result)
		}
		if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerEntityID != nil || cue.SpeakerSource != "unknown" || cue.Evidence.Reason != "" {
			t.Fatalf("%s: cue %+v", name, cue)
		}
	}
}

func TestTheFirstSuggestionForALineWins(t *testing.T) {
	s := fallbackProject(t, func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) ([]CueSuggestion, string, error) {
		return []CueSuggestion{{CueID: cues[0].CueID, EntityID: "entity-bo", Reason: "Bo speaks first."}, {CueID: cues[0].CueID, EntityID: "entity-ada", Reason: "Ada speaks."}}, "", nil
	})
	if result := attributed(t, s); result.ModelFilled != 1 {
		t.Fatalf("result %+v", result)
	}
	if cue := cuesByQuote(t, s)["Who goes there?"]; *cue.SpeakerEntityID != "entity-bo" || cue.Evidence.Reason != "Bo speaks first." {
		t.Fatalf("cue %+v", cue)
	}
}

// The model is slow; the narrator can pick a speaker, or clear the line to unknown, while it reads. Their choice is never written over.
func TestTheFallbackNeverOverwritesALineTheNarratorChoseWhileItRan(t *testing.T) {
	for name, choice := range map[string]string{"picked Ada": "entity-ada", "cleared to unknown": ""} {
		var s *Service
		s = fallbackProject(t, func(ctx context.Context, cues []UnknownCue, characters []FallbackCharacter) ([]CueSuggestion, string, error) {
			if err := s.CorrectCue(cues[0].CueID, choice); err != nil {
				t.Fatal(err)
			}
			return suggest("entity-bo", "Bo is in the hall.")(ctx, cues, characters)
		})
		result := attributed(t, s)
		cue := cuesByQuote(t, s)["Who goes there?"]
		speaker := ""
		if cue.SpeakerEntityID != nil {
			speaker = *cue.SpeakerEntityID
		}
		if result.ModelFilled != 0 || result.KeptConfirmed != 1 || speaker != choice || !cue.Corrected || cue.SpeakerSource != "correction" || cue.Evidence.Reason != "" {
			t.Fatalf("%s: result %+v cue %+v", name, result, cue)
		}
	}
}

func TestAConfirmedUnknownLineIsNotPutToTheFallback(t *testing.T) {
	calls := 0
	s := fallbackProject(t, func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) ([]CueSuggestion, string, error) {
		calls++
		return nil, "", nil
	})
	attributed(t, s)
	if err := s.CorrectCue(cuesByQuote(t, s)["Who goes there?"].ID, ""); err != nil {
		t.Fatal(err)
	}
	attributed(t, s)
	if calls != 1 {
		t.Fatalf("the fallback was asked %d times; the second run had no unknown line the narrator had not confirmed", calls)
	}
}

func TestAFallbackThatFailsOrStopsLeavesTheRulesResultAndSaysSo(t *testing.T) {
	s := fallbackProject(t, func(context.Context, []UnknownCue, []FallbackCharacter) ([]CueSuggestion, string, error) {
		return []CueSuggestion{{CueID: "ignored", EntityID: "entity-bo", Reason: "Bo."}}, "", errors.New("the model crashed")
	})
	result, err := s.AttributeSpeakers(context.Background())
	if err != nil || result.Filled != 1 || result.Attributed != 1 || result.ModelFilled != 0 || !strings.Contains(result.ModelNote, "local model") || strings.Contains(result.ModelNote, "crashed") {
		t.Fatalf("result %+v, %v", result, err)
	}
	if cue := cuesByQuote(t, s)["Hello,"]; cue.SpeakerEntityID == nil {
		t.Fatal("the rules' result was lost")
	}

	stopped := fallbackProject(t, func(ctx context.Context, cues []UnknownCue, characters []FallbackCharacter) ([]CueSuggestion, string, error) {
		suggestions, _, _ := suggest("entity-bo", "Bo is in the hall.")(ctx, cues, characters)
		return suggestions, "The local model stopped early.", nil
	})
	if result := attributed(t, stopped); result.ModelFilled != 1 || result.ModelNote != "The local model stopped early." {
		t.Fatalf("what it answered before it stopped is kept, with its note: %+v", result)
	}
}

func TestARefreshKeepsAModelsSuggestionUntilARuleFindsASpeakerOrTheEntryGoes(t *testing.T) {
	calls := 0
	s := fallbackProject(t, func(ctx context.Context, cues []UnknownCue, characters []FallbackCharacter) ([]CueSuggestion, string, error) {
		calls++
		return suggest("entity-bo", "Bo is in the hall.")(ctx, cues, characters)
	})
	attributed(t, s)
	if counts, err := s.RefreshCues(context.Background()); err != nil || counts.Attributed != 2 {
		t.Fatalf("refresh %+v, %v", counts, err)
	}
	if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerEntityID == nil || *cue.SpeakerEntityID != "entity-bo" || cue.SpeakerSource != "local-model" || cue.Evidence.Reason != "Bo is in the hall." || cue.Corrected {
		t.Fatalf("a refresh wiped the model's suggestion: %+v", cue)
	}
	again := attributed(t, s)
	if calls != 1 || again.Filled != 0 || again.Changed != 0 || again.ModelFilled != 0 || len(again.Previous) != 0 {
		t.Fatalf("a kept suggestion is not asked about again (%d calls): %+v", calls, again)
	}

	// Bo is no longer an entry that speaks: the suggestion names nobody, so the line is unknown again.
	s.SetSpeakerFallback(nil)
	setEntities(t, s, cueAda, fallbackPlace)
	gone := attributed(t, s)
	if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerEntityID != nil || cue.SpeakerSource != "unknown" || cue.Evidence.Reason != "" {
		t.Fatalf("a suggestion outlived its entry: %+v", cue)
	}
	if gone.Changed != 1 || len(gone.Previous) != 1 || gone.Previous[0].SpeakerSource != "local-model" {
		t.Fatalf("result %+v", gone)
	}
	// Undo cannot bring the reason back, so the line stays unknown rather than a suggestion with no reason.
	if _, err := s.RestoreSpeakers(gone.Previous); err != nil {
		t.Fatal(err)
	}
	if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerEntityID != nil || cue.SpeakerSource != "unknown" {
		t.Fatalf("undo restored a model's suggestion without its reason: %+v", cue)
	}
}

func TestARulesSpeakerWinsOverAModelsSuggestion(t *testing.T) {
	ada := entityID("Ada")
	fresh := extracted(t, cueRows([3]string{"c1", "p1", `"Wait," Ada said.`}, [3]string{"c1", "p2", `"Who?"`}), speakerIndex("Ada"), false)
	suggested := func(id any, source, reason string) *pyObject {
		return newPyObject("id", id, "speaker_entity_id", "entity-bo", "speaker_source", source, "corrected", false, "evidence", newPyObject("reason", reason))
	}
	speakers := map[string]any{"ada": ada, "bo": "entity-bo"}
	merged, err := mergeDialogueCues(fresh, []any{suggested(fresh[0].values["id"], "local-model", "Bo says it."), suggested(fresh[1].values["id"], "local-model", "Bo asks.")}, speakers)
	if err != nil {
		t.Fatal(err)
	}
	if merged[0].values["speaker_entity_id"] != ada || merged[0].values["speaker_source"] != "tag" {
		t.Fatalf("the rule's speaker lost to the model: %v", merged[0].values)
	}
	if _, has := merged[0].values["evidence"].(*pyObject).values["reason"]; has {
		t.Fatal("a rule's line kept the model's reason")
	}
	kept := merged[1].values
	if kept["speaker_entity_id"] != "entity-bo" || kept["speaker_source"] != "local-model" || kept["corrected"] != false || kept["evidence"].(*pyObject).values["reason"] != "Bo asks." || kept["evidence"].(*pyObject).values["paragraphId"] != "p2" {
		t.Fatalf("kept %v", kept)
	}
	if _, has := fresh[1].values["evidence"].(*pyObject).values["reason"]; has || fresh[1].values["speaker_entity_id"] != nil {
		t.Fatal("the merge changed the fresh cue it was given")
	}
	// Only a model's suggestion with a reason is carried: a rule's old guess or a reasonless row is as the rules now find it.
	for _, prior := range []*pyObject{suggested(fresh[1].values["id"], "proximity", "Bo asks."), suggested(fresh[1].values["id"], "local-model", "")} {
		if merged, _ := mergeDialogueCues(fresh, []any{prior}, speakers); merged[1].values["speaker_entity_id"] != nil {
			t.Fatalf("carried %v", prior.values)
		}
	}
}
