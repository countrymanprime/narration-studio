package guide

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	return func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
		out := make([]CueSuggestion, len(cues))
		for i, cue := range cues {
			out[i] = CueSuggestion{CueID: cue.CueID, EntityID: entity, Reason: reason}
		}
		return FallbackResult{Suggestions: out, Asked: len(cues)}, nil
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
	s := fallbackProject(t, func(_ context.Context, cues []UnknownCue, characters []FallbackCharacter) (FallbackResult, error) {
		asked, listed = cues, characters
		return FallbackResult{Asked: len(cues)}, nil
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
		"invisible reason": func(cue UnknownCue) []CueSuggestion {
			return []CueSuggestion{{CueID: cue.CueID, EntityID: "entity-bo", Reason: "\u200b\u2060 \u200d"}}
		},
		"nothing suggested": func(UnknownCue) []CueSuggestion { return nil },
	} {
		t.Run(name, func(t *testing.T) {
			s := fallbackProject(t, func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
				return FallbackResult{Suggestions: build(cues[0]), Asked: len(cues)}, nil
			})
			if result := attributed(t, s); result.ModelFilled != 0 || result.Attributed != 1 {
				t.Fatalf("result %+v", result)
			}
			if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerEntityID != nil || cue.SpeakerSource != "unknown" || cue.Evidence.Reason != "" {
				t.Fatalf("cue %+v", cue)
			}
		})
	}
}

func TestTheFirstSuggestionForALineWins(t *testing.T) {
	s := fallbackProject(t, func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
		return FallbackResult{Asked: 1, Suggestions: []CueSuggestion{{CueID: cues[0].CueID, EntityID: "entity-bo", Reason: "Bo speaks first."}, {CueID: cues[0].CueID, EntityID: "entity-ada", Reason: "Ada speaks."}}}, nil
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
		s = fallbackProject(t, func(ctx context.Context, cues []UnknownCue, characters []FallbackCharacter) (FallbackResult, error) {
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
	s := fallbackProject(t, func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
		calls++
		return FallbackResult{}, nil // it asks about none, so no line is remembered as declined
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
	s := fallbackProject(t, func(context.Context, []UnknownCue, []FallbackCharacter) (FallbackResult, error) {
		return FallbackResult{Suggestions: []CueSuggestion{{CueID: "ignored", EntityID: "entity-bo", Reason: "Bo."}}}, errors.New("the model crashed")
	})
	result, err := s.AttributeSpeakers(context.Background())
	if err != nil || result.Filled != 1 || result.Attributed != 1 || result.ModelFilled != 0 || !strings.Contains(result.ModelNote, "local model") || strings.Contains(result.ModelNote, "crashed") {
		t.Fatalf("result %+v, %v", result, err)
	}
	if cue := cuesByQuote(t, s)["Hello,"]; cue.SpeakerEntityID == nil {
		t.Fatal("the rules' result was lost")
	}

	stopped := fallbackProject(t, func(ctx context.Context, cues []UnknownCue, characters []FallbackCharacter) (FallbackResult, error) {
		result, _ := suggest("entity-bo", "Bo is in the hall.")(ctx, cues, characters)
		result.Note = "The local model stopped early."
		return result, nil
	})
	if result := attributed(t, stopped); result.ModelFilled != 1 || result.ModelNote != "The local model stopped early." {
		t.Fatalf("what it answered before it stopped is kept, with its note: %+v", result)
	}
}

func TestARefreshKeepsAModelsSuggestionUntilARuleFindsASpeakerOrTheEntryGoes(t *testing.T) {
	calls := 0
	s := fallbackProject(t, func(ctx context.Context, cues []UnknownCue, characters []FallbackCharacter) (FallbackResult, error) {
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
	speakers := map[string]bool{ada: true, "entity-bo": true}
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

func editGuide(t *testing.T, s *Service, change func(document map[string]any)) {
	t.Helper()
	written, err := os.ReadFile(s.guidePath())
	if err != nil {
		t.Fatal(err)
	}
	var onDisk map[string]any
	if err := json.Unmarshal(written, &onDisk); err != nil {
		t.Fatal(err)
	}
	change(onDisk)
	raw, _ := json.Marshal(onDisk)
	if err := os.WriteFile(s.guidePath(), raw, 0o600); err != nil {
		t.Fatal(err)
	}
}

func fileCue(t *testing.T, document map[string]any, quote string) map[string]any {
	t.Helper()
	for _, raw := range document["dialogue_cues"].([]any) {
		if cue := raw.(map[string]any); cue["quote_text"] == quote {
			return cue
		}
	}
	t.Fatalf("no cue %q", quote)
	return nil
}

var speakingCharacter = []any{map[string]any{"name": "Character", "colour": "green", "speaks": true}}

func character(id, name string, aliases ...string) map[string]any {
	list := []any{}
	for _, alias := range aliases {
		list = append(list, map[string]any{"text": alias})
	}
	return map[string]any{"id": id, "canonical_name": name, "category": "Character", "aliases": list}
}

// The rules match names on a to z and 0 to 9 only, and give a name to the first entry that has it. An entry they cannot match
// is exactly the one the model is for, so its suggestion must survive a refresh like any other.
func TestARefreshKeepsASuggestionForAnEntryTheRulesCannotName(t *testing.T) {
	for name, entities := range map[string][]any{
		"a name in another script":             {cueAda, character("entity-boris", "Борис")},
		"every name taken by an earlier entry": {cueAda, character("entity-tom", "Tom", "Thomas"), character("entity-boris", "Thomas")},
	} {
		t.Run(name, func(t *testing.T) {
			calls := 0
			s := cueProject(t, map[string]any{"entities": entities, "types": speakingCharacter},
				[3]string{"c1", "p1", `"Hello," Ada said.`}, [3]string{"c1", "p2", `Nobody else was in the kitchen.`}, [3]string{"c1", "p3", `"Well?"`})
			s.SetSpeakerFallback(func(ctx context.Context, cues []UnknownCue, characters []FallbackCharacter) (FallbackResult, error) {
				calls++
				return suggest("entity-boris", "Boris is the only other person there.")(ctx, cues, characters)
			})
			if first := attributed(t, s); first.ModelFilled != 1 {
				t.Fatalf("first run %+v", first)
			}
			if _, err := s.RefreshCues(context.Background()); err != nil {
				t.Fatal(err)
			}
			if cue := cuesByQuote(t, s)["Well?"]; cue.SpeakerEntityID == nil || *cue.SpeakerEntityID != "entity-boris" || cue.SpeakerSource != "local-model" || cue.Evidence.Reason == "" {
				t.Fatalf("the refresh wiped the suggestion: %+v", cue)
			}
			if again := attributed(t, s); calls != 1 || again.ModelFilled != 0 || again.Filled != 0 || again.Changed != 0 {
				t.Fatalf("asked %d times; second run %+v", calls, again)
			}
		})
	}
}

// What can change while the model reads, besides the narrator's own choice: the entry can go or stop speaking, and a rule can
// find the speaker. None of these lines takes the model's answer.
func TestASuggestionIsDroppedWhenItsEntryWentOrARuleFoundTheSpeakerWhileTheModelRan(t *testing.T) {
	for name, meanwhile := range map[string]func(document map[string]any){
		"the entry was deleted": func(document map[string]any) { document["entities"] = []any{cueAda, fallbackPlace} },
		"its type stopped speaking": func(document map[string]any) {
			document["types"] = []any{map[string]any{"name": "Character", "colour": "green", "speaks": false}, map[string]any{"name": "Place", "colour": "blue", "speaks": false}}
		},
		"a rule found the speaker": func(document map[string]any) {
			cue := fileCue(t, document, "Who goes there?")
			cue["speaker_entity_id"], cue["speaker_source"] = "entity-ada", "tag"
		},
	} {
		t.Run(name, func(t *testing.T) {
			var s *Service
			s = fallbackProject(t, func(ctx context.Context, cues []UnknownCue, characters []FallbackCharacter) (FallbackResult, error) {
				editGuide(t, s, meanwhile)
				return suggest("entity-bo", "Bo is in the hall.")(ctx, cues, characters)
			})
			result := attributed(t, s)
			cue := cuesByQuote(t, s)["Who goes there?"]
			if result.ModelFilled != 0 || cue.SpeakerSource == "local-model" || cue.Evidence.Reason != "" || (cue.SpeakerEntityID != nil && *cue.SpeakerEntityID == "entity-bo") {
				t.Fatalf("result %+v cue %+v", result, cue)
			}
		})
	}
}

// The rules named Ada for a line through an alias; the alias goes, the rules find nobody, and the model names Ada again. The
// speaker is the same but the line moved from a rule to the model: the run reports it and undo takes it back.
func TestALineTheModelFillsWithTheSpeakerARuleHadIsReportedAndUndone(t *testing.T) {
	s := cueProject(t, map[string]any{"entities": []any{character("entity-ada", "Ada", "Addie")}, "types": speakingCharacter},
		[3]string{"c1", "p1", `"Hello," Addie said.`})
	if first := attributed(t, s); first.Filled != 1 {
		t.Fatalf("first run %+v", first)
	}
	setEntities(t, s, cueAda)
	s.SetSpeakerFallback(suggest("entity-ada", "Ada is the only person in the room."))
	result := attributed(t, s)
	if result.ModelFilled != 1 || result.Filled+result.Changed != 1 || len(result.Previous) != 1 || result.Previous[0].SpeakerSource != "tag" {
		t.Fatalf("result %+v", result)
	}
	if restored, err := s.RestoreSpeakers(result.Previous); err != nil || restored != 1 {
		t.Fatalf("restored %d, %v", restored, err)
	}
	if cue := cuesByQuote(t, s)["Hello,"]; cue.SpeakerSource != "tag" || cue.Evidence.Reason != "" {
		t.Fatalf("undo left the model's line: %+v", cue)
	}
}

// A fallback that asks about fewer lines than it was handed (a cap) says so, and the next run starts with the lines it has not
// asked about instead of the same first ones. A changed cast makes a declined line worth asking again.
func TestACappedFallbackTellsTheNarratorAndTheNextRunAsksTheRest(t *testing.T) {
	var asked [][]string
	s := cueProject(t, map[string]any{"entities": []any{cueAda, attributeBo}, "types": speakingCharacter},
		[3]string{"c1", "p1", `"One?"`}, [3]string{"c1", "p2", `"Two?"`}, [3]string{"c1", "p3", `"Three?"`})
	s.SetSpeakerFallback(func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
		var quotes []string
		for _, cue := range cues[:min(2, len(cues))] {
			quotes = append(quotes, cue.Quote)
		}
		asked = append(asked, quotes)
		return FallbackResult{Asked: len(quotes)}, nil // it cannot tell who speaks any of them
	})
	first := attributed(t, s)
	if first.ModelNote != "The local model was asked about 2 of the 3 lines the rules left unknown; run it again for the rest." {
		t.Fatalf("note %q", first.ModelNote)
	}
	second := attributed(t, s)
	third := attributed(t, s)
	if got := fmt.Sprint(asked); got != "[[One? Two?] [Three?]]" || second.ModelNote != "" || third.ModelNote != "" {
		t.Fatalf("asked %s; notes %q %q", got, second.ModelNote, third.ModelNote)
	}
	setEntities(t, s, cueAda, attributeBo, character("entity-cy", "Cy"))
	attributed(t, s)
	if got := fmt.Sprint(asked[len(asked)-1]); len(asked) != 3 || got != "[One? Two?]" {
		t.Fatalf("a new entry did not reopen the declined lines: %v", asked)
	}
}

// The model declined a line in an earlier run, so the next run does not hand it over; an answer for it is not one it was asked for.
func TestASuggestionForALineThatWasNotAskedAboutIsDropped(t *testing.T) {
	first, runs := "", 0
	s := cueProject(t, map[string]any{"entities": []any{cueAda, attributeBo}, "types": speakingCharacter},
		[3]string{"c1", "p1", `"One?"`}, [3]string{"c1", "p2", `"Two?"`})
	s.SetSpeakerFallback(func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
		runs++
		if runs == 1 {
			first = cues[0].CueID
			return FallbackResult{Asked: 1}, nil
		}
		if len(cues) != 1 || cues[0].Quote != "Two?" {
			t.Fatalf("second run was handed %+v", cues)
		}
		return FallbackResult{Asked: 1, Suggestions: []CueSuggestion{{CueID: first, EntityID: "entity-bo", Reason: "Bo asks one."}}}, nil
	})
	attributed(t, s)
	result := attributed(t, s)
	if cue := cuesByQuote(t, s)["One?"]; runs != 2 || result.ModelFilled != 0 || cue.SpeakerEntityID != nil || cue.SpeakerSource != "unknown" {
		t.Fatalf("runs %d result %+v cue %+v", runs, result, cue)
	}
}

func TestAReasonIsCleanedAndCappedWhoeverGivesIt(t *testing.T) {
	s := fallbackProject(t, suggest("entity-bo", "Bo\x00 is\nhere\u202e, "+strings.Repeat("x", 400)))
	attributed(t, s)
	reason := string(cuesByQuote(t, s)["Who goes there?"].Evidence.Reason)
	if !strings.HasPrefix(reason, "Bo is here, xxx") || !strings.HasSuffix(reason, "…") || len([]rune(reason)) != 300 {
		t.Fatalf("reason %q", reason)
	}
}

func TestAFileSuggestionWithNoReadableReasonIsNotKeptByARefresh(t *testing.T) {
	for name, reason := range map[string]any{"white space": "   ", "invisible": "\u200b", "a number": 5, "missing": nil} {
		t.Run(name, func(t *testing.T) {
			s := fallbackProject(t, suggest("entity-bo", "Bo is in the hall."))
			attributed(t, s)
			editGuide(t, s, func(document map[string]any) {
				evidence := fileCue(t, document, "Who goes there?")["evidence"].(map[string]any)
				if reason == nil {
					delete(evidence, "reason")
				} else {
					evidence["reason"] = reason
				}
			})
			// The file is read as it is: one odd reason does not make the quoted lines unreadable.
			if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerSource != "local-model" || strings.TrimSpace(string(cue.Evidence.Reason)) != "" && name != "invisible" {
				t.Fatalf("read %+v", cue)
			}
			s.SetSpeakerFallback(nil)
			if _, err := s.RefreshCues(context.Background()); err != nil {
				t.Fatal(err)
			}
			if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerEntityID != nil || cue.SpeakerSource != "unknown" {
				t.Fatalf("a suggestion with no reason was kept: %+v", cue)
			}
		})
	}
}

func TestConfirmingOrClearingALineDropsTheModelsReason(t *testing.T) {
	for name, choice := range map[string]string{"confirmed for another": "entity-ada", "confirmed as suggested": "entity-bo", "cleared": ""} {
		t.Run(name, func(t *testing.T) {
			s := fallbackProject(t, suggest("entity-bo", "Bo is in the hall."))
			attributed(t, s)
			if err := s.CorrectCue(cuesByQuote(t, s)["Who goes there?"].ID, choice); err != nil {
				t.Fatal(err)
			}
			if cue := cuesByQuote(t, s)["Who goes there?"]; cue.Evidence.Reason != "" || cue.SpeakerSource != "correction" || cue.Evidence.ParagraphID != "p3" {
				t.Fatalf("cue %+v", cue)
			}
		})
	}
}

// A refresh of one chapter keeps the other chapters' cues from the file without recomputing them; a suggestion there whose
// entry is gone must not stay, or the line names nobody and is never asked about again.
func TestAChapterRefreshClearsASuggestionWhoseEntryIsGone(t *testing.T) {
	s := fallbackProject(t, suggest("entity-bo", "Bo is in the hall."))
	attributed(t, s)
	if _, err := s.RefreshCues(context.Background(), "c1"); err != nil {
		t.Fatal(err)
	}
	if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerSource != "local-model" || cue.Evidence.Reason == "" {
		t.Fatalf("a chapter refresh dropped a suggestion whose entry still speaks: %+v", cue)
	}
	setEntities(t, s, cueAda, fallbackPlace)
	if _, err := s.RefreshCues(context.Background(), "c1"); err != nil {
		t.Fatal(err)
	}
	cue := cuesByQuote(t, s)["Who goes there?"]
	if cue.SpeakerEntityID != nil || cue.SpeakerSource != "unknown" || cue.Evidence.Reason != "" || cue.Evidence.ParagraphID != "p3" {
		t.Fatalf("cue %+v", cue)
	}
	if kept := cuesByQuote(t, s)["Hello,"]; kept.SpeakerSource != "tag" {
		t.Fatalf("a rule's line in the kept chapter changed: %+v", kept)
	}
}

func TestThePassageReachesFourParagraphsBackAndOneOn(t *testing.T) {
	var passage []string
	rows := [][3]string{}
	for i, text := range []string{"Zero.", "One.", "Two.", "Three.", "Four.", `"Who?"`, "Six.", "Seven."} {
		rows = append(rows, [3]string{"c1", fmt.Sprintf("p%d", i), text})
	}
	s := cueProject(t, map[string]any{"entities": []any{cueAda}, "types": speakingCharacter}, rows...)
	s.SetSpeakerFallback(func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
		for _, p := range cues[0].Passage {
			passage = append(passage, p.ID)
		}
		return FallbackResult{Asked: len(cues)}, nil
	})
	attributed(t, s)
	if got := strings.Join(passage, " "); got != "p1 p2 p3 p4 p5 p6" {
		t.Fatalf("passage %q", got)
	}
}

// Two presses of the button can overlap: the fallback, its memory of declined lines and the write are safe to run at once.
func TestOverlappingRunsDoNotCorruptTheLines(t *testing.T) {
	s := fallbackProject(t, suggest("entity-bo", "Bo is in the hall."))
	done := make(chan error, 4)
	for range 4 {
		go func() {
			_, err := s.AttributeSpeakers(context.Background())
			done <- err
		}()
	}
	for range 4 {
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
	if cue := cuesByQuote(t, s)["Who goes there?"]; cue.SpeakerEntityID == nil || *cue.SpeakerEntityID != "entity-bo" || cue.SpeakerSource != "local-model" {
		t.Fatalf("cue %+v", cue)
	}
}

// The model declined a line with nobody named near it. The narrator then edits the paragraph before it: the line is worth
// asking again, though its own words, and so its id, are the same.
func TestADeclinedLineIsAskedAgainWhenThePassageAroundItChanges(t *testing.T) {
	asked := 0
	rows := [][3]string{{"c1", "p1", "The cellar was quiet."}, {"c1", "p2", `"Is anyone here?"`}}
	s := cueProject(t, map[string]any{"entities": []any{cueAda, attributeBo}, "types": speakingCharacter}, rows...)
	s.SetSpeakerFallback(func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
		asked++
		return FallbackResult{Asked: len(cues)}, nil
	})
	attributed(t, s)
	attributed(t, s)
	if asked != 1 {
		t.Fatalf("asked %d times about a line it had declined with nothing changed", asked)
	}
	raw, _ := os.ReadFile(s.manuscript())
	if err := os.WriteFile(s.manuscript(), []byte(strings.Replace(string(raw), "The cellar was quiet.", "Bo opened the cellar door and listened.", 1)), 0o600); err != nil {
		t.Fatal(err)
	}
	attributed(t, s)
	if asked != 2 {
		t.Fatalf("asked %d times; the paragraph before the line changed, so it is asked again", asked)
	}
}

// A Story Bible file can come from someone else: a reason a refresh carries is cleaned and capped again.
func TestARefreshCleansAndCapsTheReasonItCarries(t *testing.T) {
	s := fallbackProject(t, suggest("entity-bo", "Bo is in the hall."))
	attributed(t, s)
	editGuide(t, s, func(document map[string]any) {
		fileCue(t, document, "Who goes there?")["evidence"].(map[string]any)["reason"] = "Bo \u202egnp.exe\nsecond line " + strings.Repeat("x", 5000)
	})
	s.SetSpeakerFallback(nil)
	if _, err := s.RefreshCues(context.Background()); err != nil {
		t.Fatal(err)
	}
	reason := string(cuesByQuote(t, s)["Who goes there?"].Evidence.Reason)
	if len([]rune(reason)) != 300 || strings.ContainsAny(reason, "\u202e\n") || !strings.HasPrefix(reason, "Bo gnp.exe second line xxx") {
		t.Fatalf("reason (%d runes) %q", len([]rune(reason)), reason[:min(len(reason), 80)])
	}
}

// An answer naming nobody the fallback was given is no answer: the line counts as declined, so a capped run moves on.
func TestAnAnswerForAnEntryOutsideTheCastDoesNotHoldUpLaterLines(t *testing.T) {
	var asked [][]string
	s := cueProject(t, map[string]any{"entities": []any{cueAda, attributeBo, fallbackPlace}, "types": []any{speakingCharacter[0], map[string]any{"name": "Place", "colour": "blue", "speaks": false}}},
		[3]string{"c1", "p1", `"One?"`}, [3]string{"c1", "p2", `"Two?"`}, [3]string{"c1", "p3", `"Three?"`})
	s.SetSpeakerFallback(func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
		var quotes []string
		result := FallbackResult{}
		for i, cue := range cues[:min(2, len(cues))] {
			quotes = append(quotes, cue.Quote)
			result.Suggestions = append(result.Suggestions, CueSuggestion{CueID: cue.CueID, EntityID: []string{"entity-ghost", "entity-hall"}[i], Reason: "Somebody says it."})
		}
		asked = append(asked, quotes)
		result.Asked = len(quotes)
		return result, nil
	})
	first := attributed(t, s)
	attributed(t, s)
	if got := fmt.Sprint(asked); got != "[[One? Two?] [Three?]]" || first.ModelFilled != 0 {
		t.Fatalf("asked %s; first %+v", got, first)
	}
}

func TestAFallbackThatPanicsLeavesTheRulesResultAndSaysSo(t *testing.T) {
	s := fallbackProject(t, func(context.Context, []UnknownCue, []FallbackCharacter) (FallbackResult, error) {
		panic("the adapter broke")
	})
	result, err := s.AttributeSpeakers(context.Background())
	if err != nil || result.Filled != 1 || result.ModelFilled != 0 || result.ModelNote != fallbackFailed || len(result.Previous) != 1 {
		t.Fatalf("result %+v, %v", result, err)
	}
}

// What makes a declined line worth asking again: a character renamed, or given another name. Nothing else about the cast changed.
func TestADeclinedLineIsAskedAgainWhenACharacterIsRenamedOrGainsAName(t *testing.T) {
	asked := 0
	s := cueProject(t, map[string]any{"entities": []any{cueAda, attributeBo}, "types": speakingCharacter}, [3]string{"c1", "p1", `"Is anyone here?"`})
	s.SetSpeakerFallback(func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
		asked++
		return FallbackResult{Asked: len(cues)}, nil
	})
	attributed(t, s)
	attributed(t, s)
	setEntities(t, s, cueAda, character("entity-bo", "Bartholomew"))
	attributed(t, s)
	setEntities(t, s, cueAda, character("entity-bo", "Bartholomew", "Barty"))
	attributed(t, s)
	attributed(t, s)
	if asked != 3 {
		t.Fatalf("asked %d times, want 3: once at first, once after the rename, once after the new name", asked)
	}
}

func TestWithNoEntryThatSpeaksTheFallbackIsNotAsked(t *testing.T) {
	asked := 0
	s := cueProject(t, map[string]any{"entities": []any{fallbackPlace}, "types": []any{map[string]any{"name": "Place", "colour": "blue", "speaks": false}}}, [3]string{"c1", "p1", `"Is anyone here?"`})
	s.SetSpeakerFallback(func(_ context.Context, cues []UnknownCue, _ []FallbackCharacter) (FallbackResult, error) {
		asked++
		return FallbackResult{Asked: len(cues)}, nil
	})
	if result := attributed(t, s); asked != 0 || result.ModelNote != "" {
		t.Fatalf("asked %d times with nobody who could speak; result %+v", asked, result)
	}
}
