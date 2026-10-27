package guide

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

var attributeRows = [][3]string{
	{"c1", "p1", `"Hello," Ada said.`},
	{"c1", "p2", `"Wait," Bo said.`},
}

var attributeBo = map[string]any{"id": "entity-bo", "canonical_name": "Bo", "category": "Character", "aliases": []any{}}

func attributeProject(t *testing.T, cues ...any) *Service {
	t.Helper()
	document := map[string]any{"entities": []any{cueAda, attributeBo}, "types": []any{map[string]any{"name": "Character", "colour": "green", "speaks": true}}}
	if len(cues) > 0 {
		document["dialogue_cues"] = cues
	}
	return cueProject(t, document, attributeRows...)
}

func cuesByQuote(t *testing.T, s *Service) map[string]DialogueCue {
	t.Helper()
	cues, err := s.DialogueCues()
	if err != nil {
		t.Fatal(err)
	}
	byQuote := map[string]DialogueCue{}
	for _, cue := range cues {
		byQuote[cue.QuoteText] = cue
	}
	return byQuote
}

func attributed(t *testing.T, s *Service) SpeakerAttribution {
	t.Helper()
	result, err := s.AttributeSpeakers(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestAttributeSpeakersFillsEveryUnattributedLineTheFirstTime(t *testing.T) {
	s := attributeProject(t)
	result := attributed(t, s)
	if result.Cues != 2 || result.Attributed != 2 || result.Filled != 2 || result.Changed != 0 || result.KeptConfirmed != 0 || len(result.Previous) != 2 {
		t.Fatalf("result %+v", result)
	}
	if cue := cuesByQuote(t, s)["Hello,"]; cue.SpeakerEntityID == nil || *cue.SpeakerEntityID != "entity-ada" || cue.Corrected {
		t.Fatalf("a suggestion is not a confirmation: %+v", cue)
	}
}

func TestAttributeSpeakersRerunChangesNothingWhenNothingIsNew(t *testing.T) {
	s := attributeProject(t)
	attributed(t, s)
	before, _ := os.ReadFile(s.guidePath())
	result := attributed(t, s)
	if result.Filled != 0 || result.Changed != 0 || len(result.Previous) != 0 || result.Attributed != 2 {
		t.Fatalf("a re-run with nothing new reported %+v", result)
	}
	if after, _ := os.ReadFile(s.guidePath()); string(after) != string(before) {
		t.Fatal("a no-op re-run rewrote the Story Bible differently")
	}
}

func TestAttributeSpeakersNeverOverwritesAConfirmedOrEditedLine(t *testing.T) {
	s := attributeProject(t)
	attributed(t, s)
	cues := cuesByQuote(t, s)
	// The narrator confirms Ada's line as Bo, and clears Bo's line to unknown: both are their own choices.
	if err := s.CorrectCue(cues["Hello,"].ID, "entity-bo"); err != nil {
		t.Fatal(err)
	}
	if err := s.CorrectCue(cues["Wait,"].ID, "unknown"); err != nil {
		t.Fatal(err)
	}
	result := attributed(t, s)
	if result.KeptConfirmed != 2 || result.Filled != 0 || result.Changed != 0 {
		t.Fatalf("result %+v", result)
	}
	now := cuesByQuote(t, s)
	if now["Hello,"].SpeakerEntityID == nil || *now["Hello,"].SpeakerEntityID != "entity-bo" || !now["Hello,"].Corrected {
		t.Fatalf("a confirmed line moved: %+v", now["Hello,"])
	}
	if now["Wait,"].SpeakerEntityID != nil || !now["Wait,"].Corrected {
		t.Fatalf("a line the narrator cleared was refilled: %+v", now["Wait,"])
	}
}

func TestAttributeSpeakersOnlyFillsWhatIsNewWhenAnEntryIsAdded(t *testing.T) {
	document := map[string]any{"entities": []any{cueAda}, "types": []any{map[string]any{"name": "Character", "colour": "green", "speaks": true}}}
	s := cueProject(t, document, attributeRows...)
	first := attributed(t, s)
	if first.Filled != 1 {
		t.Fatalf("first run %+v", first)
	}
	if err := s.CorrectCue(cuesByQuote(t, s)["Hello,"].ID, "entity-ada"); err != nil {
		t.Fatal(err)
	}
	document["entities"] = []any{cueAda, attributeBo}
	// Keep the cues the first run wrote, as the app does: only the entries change.
	written, _ := os.ReadFile(s.guidePath())
	var onDisk map[string]any
	_ = json.Unmarshal(written, &onDisk)
	onDisk["entities"] = document["entities"]
	raw, _ := json.Marshal(onDisk)
	if err := os.WriteFile(s.guidePath(), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	second := attributed(t, s)
	if second.Filled != 1 || second.KeptConfirmed != 1 || len(second.Previous) != 1 {
		t.Fatalf("second run %+v", second)
	}
}

func TestAttributeSpeakersFailureLosesNoConfirmedWork(t *testing.T) {
	s := attributeProject(t)
	attributed(t, s)
	hello := cuesByQuote(t, s)["Hello,"]
	if err := s.CorrectCue(hello.ID, "entity-bo"); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(s.guidePath())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.AttributeSpeakers(ctx); err == nil {
		t.Fatal("a cancelled run reported success")
	}
	if after, _ := os.ReadFile(s.guidePath()); string(after) != string(before) {
		t.Fatal("a failed run changed the Story Bible")
	}
	if err := os.WriteFile(s.manuscript(), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AttributeSpeakers(context.Background()); err == nil {
		t.Fatal("an unreadable manuscript reported success")
	}
	if after, _ := os.ReadFile(s.guidePath()); string(after) != string(before) {
		t.Fatal("a failed run changed the Story Bible")
	}
}

func TestRestoreSpeakersUndoesARunButNeverAConfirmedLine(t *testing.T) {
	s := attributeProject(t)
	result := attributed(t, s)
	hello := cuesByQuote(t, s)["Hello,"]
	if err := s.CorrectCue(hello.ID, "entity-bo"); err != nil {
		t.Fatal(err)
	}
	restored, err := s.RestoreSpeakers(result.Previous)
	if err != nil || restored != 1 {
		t.Fatalf("restored %d, %v", restored, err)
	}
	now := cuesByQuote(t, s)
	if now["Wait,"].SpeakerEntityID != nil || now["Wait,"].Corrected {
		t.Fatalf("undo left %+v", now["Wait,"])
	}
	if now["Hello,"].SpeakerEntityID == nil || *now["Hello,"].SpeakerEntityID != "entity-bo" || !now["Hello,"].Corrected {
		t.Fatalf("undo overwrote a confirmed line: %+v", now["Hello,"])
	}
}
