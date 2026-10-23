package main

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/apply"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/store"
)

// extractionParagraphs are the two lines every fixture suggestion quotes.
var extractionParagraphs = []extraction.Paragraph{
	{ID: "p-000001", ChapterID: "c-0001", Text: "“Oh dear! Oh dear! I shall be late!” said the White Rabbit, taking a watch out of its waistcoat-pocket."},
	{ID: "p-000002", ChapterID: "c-0002", Text: "The Duchess spoke sternly to the baby, and Alice thought it rather rude."},
}

func extractionConfidence(c float64) *float64 { return &c }

type extractionOffer struct {
	source store.Source
	raw    store.Raw
}

func extractionQuote(paragraphID, text string) []store.Quote {
	return []store.Quote{{ParagraphID: paragraphID, Text: text}}
}

// extractionOffers is one suggestion of each kind, stored out of kind order, and between them every reason the rule gives.
var extractionOffers = []extractionOffer{
	{store.SourceRules, store.Raw{Payload: store.Payload{Kind: extraction.KindClaim, Entry: "White Rabbit", Claim: extraction.ClaimTalk, Text: "Worries about being late"},
		Confidence: extractionConfidence(0.9), Quotes: extractionQuote("p-000001", "I shall be late!"), ChapterID: "c-0001"}},
	{store.SourceRules, store.Raw{Payload: store.Payload{Kind: extraction.KindEntry, Name: "The Dodo", Type: "Character", Description: "A bird who runs the race."},
		Confidence: extractionConfidence(0.9)}},
	{store.SourceRules, store.Raw{Payload: store.Payload{Kind: extraction.KindAlias, Entry: "White Rabbit", Alias: "Rabbit"}, Confidence: extractionConfidence(0.5)}},
	{store.SourceRules, store.Raw{Payload: store.Payload{Kind: extraction.KindProperty, Entry: "Alice", Key: "Habit", Value: "Finds things rude"},
		Confidence: extractionConfidence(0.93), Quotes: extractionQuote("p-000002", "Alice thought it rather rude")}},
	{store.SourceImported, store.Raw{Payload: store.Payload{Kind: extraction.KindRelationship, Entry: "Alice", To: "White Rabbit", Relation: "follows"}}},
	{store.SourceGLiNER, store.Raw{Payload: store.Payload{Kind: extraction.KindSpeaker, Quote: "Oh dear! Oh dear! I shall be late!", Speaker: "White Rabbit"},
		Confidence: extractionConfidence(0.6), Quotes: extractionQuote("p-000001", "Oh dear! Oh dear! I shall be late!"), Flag: store.FlagDuplicate,
		Note: "Also offered as the Rabbit."}},
	{store.SourceRules, store.Raw{Payload: store.Payload{Kind: extraction.KindProperty, Entry: "The Duchess", Key: "Manner", Value: "Stern"},
		Confidence: extractionConfidence(0.95), Quotes: extractionQuote("p-000002", "spoke sternly")}},
	{store.SourceLocalModel, store.Raw{Payload: store.Payload{Kind: extraction.KindClaim, Entry: "Zed", Claim: extraction.ClaimKnow, Text: "Knows a secret"},
		Confidence: extractionConfidence(0.8), Quotes: extractionQuote("", "a line that is not in the book")}},
	{store.SourceRules, store.Raw{Payload: store.Payload{Kind: extraction.KindAlias, Entry: "White Rabbit", Alias: "Alice"}, Confidence: extractionConfidence(0.4)}},
}

// extractionHost is a host over a fresh project whose Story Bible has Alice, the White Rabbit and the locked Duchess,
// with extractionOffers stored and settled the way a scan leaves them.
func extractionHost(t *testing.T) (*Host, *apply.FakeBible) {
	t.Helper()
	bible := &apply.FakeBible{
		Entities: []apply.Entry{
			{ID: "alice", Name: "Alice", Category: "Character"},
			{ID: "white-rabbit", Name: "White Rabbit", Category: "Character"},
			{ID: "duchess", Name: "The Duchess", Category: "Character", Locked: true},
		},
		CueList: []apply.Cue{{ID: "cue-1", ParagraphID: "p-000001", Start: 0, End: 36}},
	}
	host := &Host{extractionBible: bible}
	host.config.projectFolder = t.TempDir()
	suggestions := host.extractionStore()
	for _, offer := range extractionOffers {
		entries, err := bible.Entries()
		if err != nil {
			t.Fatal(err)
		}
		known := store.Bible{}
		for _, e := range entries {
			known = append(known, store.Entry{ID: e.ID, Name: e.Name, Aliases: e.Aliases})
		}
		added, err := suggestions.Ingest(offer.source, []store.Raw{offer.raw}, store.Context{Paragraphs: extractionParagraphs, Bible: known,
			At: time.Date(2026, 10, 11, 9, 0, 0, 0, time.UTC)})
		if err != nil || len(added.Added) != 1 {
			t.Fatalf("ingest %+v: %+v, %v", offer.raw.Payload, added, err)
		}
		if _, err := apply.New(suggestions, bible).Settle(); err != nil {
			t.Fatal(err)
		}
	}
	return host, bible
}

func decodeSuggestions(t *testing.T) func(string, error) []store.Suggestion {
	return func(payload string, err error) []store.Suggestion {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var list []store.Suggestion
		if err := json.Unmarshal([]byte(payload), &list); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return list
	}
}

func decodeDecision(t *testing.T) func(string, error) ExtractionDecision {
	return func(payload string, err error) ExtractionDecision {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var decision ExtractionDecision
		if err := json.Unmarshal([]byte(payload), &decision); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return decision
	}
}

// suggestionAbout finds the stored suggestion whose payload says text.
func suggestionAbout(t *testing.T, host *Host, text string) store.Suggestion {
	t.Helper()
	for _, s := range decodeSuggestions(t)(host.ExtractionList()) {
		p := s.Payload
		if slices.Contains([]string{p.Name, p.Alias, p.Value, p.Relation, p.Text, p.Quote}, text) {
			return s
		}
	}
	t.Fatalf("no suggestion says %q", text)
	return store.Suggestion{}
}

func entryOf(t *testing.T, bible *apply.FakeBible, name string) (apply.Entry, bool) {
	t.Helper()
	entries, _ := bible.Entries()
	i := slices.IndexFunc(entries, func(e apply.Entry) bool { return e.Name == name })
	if i < 0 {
		return apply.Entry{}, false
	}
	return entries[i], true
}

func TestExtractionListReturnsEverySuggestionWithItsReason(t *testing.T) {
	host, _ := extractionHost(t)
	list := decodeSuggestions(t)(host.ExtractionList())
	if len(list) != len(extractionOffers) {
		t.Fatalf("listed %d, want %d", len(list), len(extractionOffers))
	}
	var kinds []extraction.Kind
	for _, s := range list {
		kinds = append(kinds, s.Kind)
	}
	want := []extraction.Kind{extraction.KindEntry, extraction.KindAlias, extraction.KindAlias, extraction.KindRelationship,
		extraction.KindClaim, extraction.KindProperty, extraction.KindProperty, extraction.KindClaim, extraction.KindSpeaker}
	if !slices.Equal(kinds, want) {
		t.Fatalf("order = %v, want %v (entries first, as the mock's ORDER, each kind in stored order)", kinds, want)
	}
	dodo := suggestionAbout(t, host, "The Dodo")
	if dodo.Status != extraction.StatusAcceptedAuto || dodo.EntryID == nil || dodo.Applied == nil || !dodo.Applied.Created || dodo.Fp == "" {
		t.Fatalf("an automatic entry is applied: %+v", dodo)
	}
	habit := suggestionAbout(t, host, "Finds things rude")
	if len(habit.Evidence) != 1 || habit.Evidence[0].ParagraphID != "p-000002" || habit.Evidence[0].Start != 43 || habit.Evidence[0].End != 71 {
		t.Fatalf("the quote's place is computed from the text: %+v", habit.Evidence)
	}
	follows := suggestionAbout(t, host, "follows")
	if follows.Confidence != nil || follows.Source != store.SourceImported || follows.Status != extraction.StatusNeedsVerification || follows.Reason == "" {
		t.Fatalf("no confidence is null and needs verification with a reason: %+v", follows)
	}
	speaker := suggestionAbout(t, host, "Oh dear! Oh dear! I shall be late!")
	if speaker.Flag != store.FlagDuplicate || speaker.Note == "" || speaker.Source != store.SourceGLiNER {
		t.Fatalf("the flag and its note cross: %+v", speaker)
	}
	secret := suggestionAbout(t, host, "Knows a secret")
	if secret.EntryID != nil || secret.UnverifiedQuote == "" || !strings.Contains(secret.Reason, string(extraction.ReasonUnknownEntry)) {
		t.Fatalf("a claim about no entry waits with its unfound quote: %+v", secret)
	}
	if stern := suggestionAbout(t, host, "Stern"); stern.Status != extraction.StatusNeedsVerification || stern.Reason != apply.SentenceLocked {
		t.Fatalf("a suggestion about a locked entry waits: %+v", stern)
	}
}

func TestExtractionListOfNoProjectIsEmpty(t *testing.T) {
	if got, err := (&Host{}).ExtractionList(); err != nil || got != "[]" {
		t.Fatalf("ExtractionList = %q, %v", got, err)
	}
}

func TestExtractionAcceptAppliesAndAnswersTheSuggestion(t *testing.T) {
	host, bible := extractionHost(t)
	rabbit := suggestionAbout(t, host, "Rabbit")
	decision := decodeDecision(t)(host.ExtractionAccept(rabbit.ID, nil))
	if decision.Suggestion.ID != rabbit.ID || decision.Suggestion.Status != extraction.StatusAccepted || !slices.Equal(decision.EntryIDs, []string{"white-rabbit"}) {
		t.Fatalf("accept = %+v", decision)
	}
	if e, _ := entryOf(t, bible, "White Rabbit"); !slices.Contains(e.Aliases, "Rabbit") || slices.Contains(e.FlaggedAliases, "Rabbit") {
		t.Fatalf("the name is applied and not flagged: %+v", e)
	}

	// An edited text is applied as given, trimmed.
	habit := suggestionAbout(t, host, "Finds things rude")
	decision = decodeDecision(t)(host.ExtractionAccept(habit.ID, ptr("  Thinks the Duchess rude  ")))
	if decision.Suggestion.Payload.Value != "Thinks the Duchess rude" || decision.Suggestion.Status != extraction.StatusAccepted {
		t.Fatalf("edited accept = %+v", decision.Suggestion)
	}
	if e, _ := entryOf(t, bible, "Alice"); len(e.Properties) != 1 || e.Properties[0].Value != "Thinks the Duchess rude" {
		t.Fatalf("the edit is what is applied: %+v", e.Properties)
	}
}

func TestExtractionAcceptRefusesWithASentenceAndChangesNothing(t *testing.T) {
	host, bible := extractionHost(t)
	for _, tc := range []struct{ text, sentence string }{
		{"Alice", "“Alice” is already a name of Alice."},
		{"Stern", apply.SentenceLocked},
	} {
		before := decodeSuggestions(t)(host.ExtractionList())
		entries, _ := bible.Entries()
		_, err := host.ExtractionAccept(suggestionAbout(t, host, tc.text).ID, nil)
		if err == nil || err.Error() != tc.sentence {
			t.Fatalf("accept %q = %v, want %q", tc.text, err, tc.sentence)
		}
		if after := decodeSuggestions(t)(host.ExtractionList()); !jsonEqual(t, before, after) {
			t.Fatalf("a refusal changed the suggestions:\n%+v\n%+v", before, after)
		}
		if now, _ := bible.Entries(); !jsonEqual(t, entries, now) {
			t.Fatalf("a refusal changed the Story Bible")
		}
	}
}

func TestExtractionRejectTakesBackAndLeavesATombstone(t *testing.T) {
	host, bible := extractionHost(t)
	dodo := suggestionAbout(t, host, "The Dodo")
	decision := decodeDecision(t)(host.ExtractionReject(dodo.ID))
	if decision.Suggestion.Status != extraction.StatusRejected || decision.Suggestion.Applied != nil || !slices.Equal(decision.EntryIDs, []string{*dodo.EntryID}) {
		t.Fatalf("reject = %+v", decision)
	}
	if _, present := entryOf(t, bible, "The Dodo"); present {
		t.Fatal("the automatic entry is still in the Story Bible")
	}
	if list := decodeSuggestions(t)(host.ExtractionList()); len(list) != len(extractionOffers) {
		t.Fatal("the rejected suggestion is not kept as a tombstone")
	}
}

func TestExtractionReviewMakesItTheNarrators(t *testing.T) {
	host, bible := extractionHost(t)
	dodo := suggestionAbout(t, host, "The Dodo")
	if e, _ := entryOf(t, bible, "The Dodo"); !e.FlaggedEntry {
		t.Fatal("the automatic entry is not flagged Review")
	}
	decision := decodeDecision(t)(host.ExtractionReview(dodo.ID))
	if decision.Suggestion.Status != extraction.StatusAccepted {
		t.Fatalf("review = %+v", decision)
	}
	if e, _ := entryOf(t, bible, "The Dodo"); e.FlaggedEntry {
		t.Fatal("the Review flag is still set")
	}
	rabbit := suggestionAbout(t, host, "Rabbit")
	if _, err := host.ExtractionReview(rabbit.ID); err == nil || err.Error() != "Nothing to review." {
		t.Fatalf("review of a suggestion that needs verification = %v", err)
	}
	if after := suggestionAbout(t, host, "Rabbit"); !jsonEqual(t, after, rabbit) {
		t.Fatal("a refused review changed the suggestion")
	}
}

func TestExtractionReopenIsTheUndoOfAllThree(t *testing.T) {
	t.Run("accept", func(t *testing.T) {
		host, bible := extractionHost(t)
		rabbit := suggestionAbout(t, host, "Rabbit")
		decodeDecision(t)(host.ExtractionAccept(rabbit.ID, nil))
		decision := decodeDecision(t)(host.ExtractionReopen(rabbit.ID))
		if decision.Suggestion.Status != rabbit.Status || decision.Suggestion.Reason != rabbit.Reason || decision.Suggestion.Applied != nil {
			t.Fatalf("reopen = %+v, was %+v", decision.Suggestion, rabbit)
		}
		if e, _ := entryOf(t, bible, "White Rabbit"); slices.Contains(e.Aliases, "Rabbit") {
			t.Fatal("the accepted name was not taken back")
		}
	})
	t.Run("reject", func(t *testing.T) {
		host, bible := extractionHost(t)
		dodo := suggestionAbout(t, host, "The Dodo")
		decodeDecision(t)(host.ExtractionReject(dodo.ID))
		decision := decodeDecision(t)(host.ExtractionReopen(dodo.ID))
		if decision.Suggestion.Status != extraction.StatusAcceptedAuto || decision.Suggestion.Applied == nil || !decision.Suggestion.Applied.Created {
			t.Fatalf("reopen = %+v", decision.Suggestion)
		}
		if e, present := entryOf(t, bible, "The Dodo"); !present || !e.FlaggedEntry {
			t.Fatalf("the entry is not back and flagged: %+v", e)
		}
	})
	t.Run("review", func(t *testing.T) {
		host, bible := extractionHost(t)
		dodo := suggestionAbout(t, host, "The Dodo")
		decodeDecision(t)(host.ExtractionReview(dodo.ID))
		decision := decodeDecision(t)(host.ExtractionReopen(dodo.ID))
		if decision.Suggestion.Status != extraction.StatusAcceptedAuto || !slices.Contains(decision.EntryIDs, *dodo.EntryID) {
			t.Fatalf("reopen = %+v", decision)
		}
		if e, _ := entryOf(t, bible, "The Dodo"); !e.FlaggedEntry {
			t.Fatal("the Review flag is not back")
		}
	})
	t.Run("undecided", func(t *testing.T) {
		host, _ := extractionHost(t)
		if _, err := host.ExtractionReopen(suggestionAbout(t, host, "Rabbit").ID); err == nil || err.Error() != sentenceNotDecided {
			t.Fatalf("reopen of an undecided suggestion = %v", err)
		}
	})
}

func TestExtractionBindingsTakeTextAndIDsOnly(t *testing.T) {
	host, _ := extractionHost(t)
	habit := suggestionAbout(t, host, "Finds things rude")
	for name, call := range map[string]func() (string, error){
		"unknown id":    func() (string, error) { return host.ExtractionAccept("s999", nil) },
		"a path as id":  func() (string, error) { return host.ExtractionReject("../../etc/passwd") },
		"a long id":     func() (string, error) { return host.ExtractionReview(strings.Repeat("s", 10000)) },
		"control bytes": func() (string, error) { return host.ExtractionReopen("\x00\xff\n") },
		"empty text":    func() (string, error) { return host.ExtractionAccept(habit.ID, ptr("   ")) },
		"text over cap": func() (string, error) {
			return host.ExtractionAccept(habit.ID, ptr(strings.Repeat("a", store.MaxFieldBytes+1)))
		},
		"no Story Bible": func() (string, error) { return (&Host{}).ExtractionAccept(habit.ID, nil) },
	} {
		if got, err := call(); err == nil || got != "" {
			t.Errorf("%s: %q, %v", name, got, err)
		}
	}
	if _, err := host.ExtractionAccept("s999", nil); err.Error() != sentenceSuggestionGone {
		t.Fatalf("an unknown id = %v", err)
	}
	if got := suggestionAbout(t, host, "Finds things rude"); !jsonEqual(t, got, habit) {
		t.Fatal("a refused text changed the suggestion")
	}
}

func jsonEqual(t *testing.T, a, b any) bool {
	t.Helper()
	x, err := json.Marshal(a)
	if err != nil {
		t.Fatal(err)
	}
	y, err := json.Marshal(b)
	if err != nil {
		t.Fatal(err)
	}
	return string(x) == string(y)
}

func TestExtractionAcceptAnswersTheSuggestionsANewEntrySettled(t *testing.T) {
	host, bible := extractionHost(t)
	decision := decodeDecision(t)(host.ExtractionAccept(suggestionAbout(t, host, "Rabbit").ID, nil))
	if len(decision.Settled) != 0 {
		t.Fatalf("an accept that settles nothing else answers %+v", decision.Settled)
	}
	// The narrator adds Zed by accepting a new entry: the waiting claim about Zed attaches, and comes back settled.
	added, err := host.extractionStore().Ingest(store.SourceRules, []store.Raw{{Payload: store.Payload{Kind: extraction.KindEntry, Name: "Zed", Type: "Character"},
		Confidence: extractionConfidence(0.3)}}, store.Context{Paragraphs: extractionParagraphs})
	if err != nil {
		t.Fatal(err)
	}
	decision = decodeDecision(t)(host.ExtractionAccept(added.Added[0].ID, nil))
	if len(decision.Settled) != 1 || decision.Settled[0].Payload.Text != "Knows a secret" || decision.Settled[0].EntryID == nil {
		t.Fatalf("settled = %+v", decision.Settled)
	}
	if _, present := entryOf(t, bible, "Zed"); !present {
		t.Fatal("the accepted entry is not in the Story Bible")
	}
}
