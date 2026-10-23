package apply

import (
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/store"
)

type harness struct {
	t     *testing.T
	store *store.Service
	bible *FakeBible
	app   *Applier
}

func newHarness(t *testing.T, entries ...Entry) *harness {
	t.Helper()
	b := &FakeBible{Entities: entries}
	s := store.New(store.Config{Project: t.TempDir()})
	return &harness{t: t, store: s, bible: b, app: New(s, b)}
}

func conf(c float64) *float64 { return &c }

// ingest stores one suggestion and settles it, the way an import does, and returns its id.
func (h *harness) ingest(p store.Payload, confidence *float64, quote string) string {
	h.t.Helper()
	entries, _ := h.bible.Entries()
	raw := store.Raw{Payload: p, Confidence: confidence}
	if quote != "" {
		raw.Quotes = []store.Quote{{ParagraphID: "p1", Text: quote}}
	}
	res, err := h.store.Ingest(store.SourceImported, []store.Raw{raw}, store.Context{
		Paragraphs: []extraction.Paragraph{{ID: "p1", Text: `Wren said “Hold the door.” Then Wren left.`}},
		Bible:      storeBible(entries),
		At:         time.Unix(0, 0).UTC(),
	})
	if err != nil || len(res.Added) != 1 {
		h.t.Fatalf("ingest: %v %v", res, err)
	}
	if _, err := h.app.Settle(); err != nil {
		h.t.Fatal(err)
	}
	return res.Added[0].ID
}

func (h *harness) get(id string) store.Suggestion {
	h.t.Helper()
	all, _ := h.store.List()
	s, ok := find(all, id)
	if !ok {
		h.t.Fatalf("suggestion %s missing", id)
	}
	return s
}

func (h *harness) entry(ref string) Entry {
	e, _ := resolve(h.bible.Entities, ref)
	return e
}

var wren = Entry{ID: "wren", Name: "Wren", Category: "Character"}

func TestAcceptAppliesEachKindInOneStep(t *testing.T) {
	h := newHarness(t, wren, Entry{ID: "mill", Name: "The Mill", Category: "Place"})
	cases := []struct {
		name string
		p    store.Payload
		quo  string
	}{
		{"entry", store.Payload{Kind: extraction.KindEntry, Name: "Brook", Type: "Place", Description: "A stream."}, ""},
		{"alias", store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "the Wren"}, ""},
		{"relationship", store.Payload{Kind: extraction.KindRelationship, Entry: "Wren", To: "The Mill", Relation: "works at"}, ""},
		{"property", store.Payload{Kind: extraction.KindProperty, Entry: "Wren", Key: "Codename", Value: "Sparrow"}, "Wren said"},
		{"claim", store.Payload{Kind: extraction.KindClaim, Entry: "Wren", Claim: extraction.ClaimTalk, Text: "Tells people to hold the door."}, "Hold the door."},
	}
	for _, c := range cases {
		id := h.ingest(c.p, conf(0.4), c.quo)
		res, err := h.app.Accept(id, nil)
		if err != nil || res.Refused != "" {
			t.Fatalf("%s: %v %q", c.name, err, res.Refused)
		}
		got := h.get(id)
		if got.Status != extraction.StatusAccepted || got.Applied == nil || got.Applied.EntryID == "" {
			t.Fatalf("%s: %+v", c.name, got)
		}
		if len(res.Changes) == 0 || len(res.Before) != 1 || res.Before[0].ID != id {
			t.Fatalf("%s: the result does not say what changed: %+v", c.name, res)
		}
	}
	if e := h.entry("Wren"); len(e.Aliases) != 1 || e.Relations[0].Label != "works at" || len(e.Properties) != 2 {
		t.Fatalf("wren: %+v", e)
	}
	if e := h.entry("Wren"); e.Properties[1].Key != "Says" {
		t.Fatalf("a claim becomes the property Says: %+v", e.Properties)
	}
	if e := h.entry("Brook"); e.Category != "Place" || e.FlaggedEntry {
		t.Fatalf("an accepted entry is not flagged: %+v", e)
	}
}

func TestSpeakerConfirmsTheQuotedLineThroughTheCue(t *testing.T) {
	h := newHarness(t, wren)
	h.bible.CueList = []Cue{{ID: "c1", ParagraphID: "p1", Start: 10, End: 28}}
	id := h.ingest(store.Payload{Kind: extraction.KindSpeaker, Quote: "Hold the door.", Speaker: "Wren"}, conf(0.5), "Hold the door.")
	if res, err := h.app.Accept(id, nil); err != nil || res.Refused != "" {
		t.Fatalf("%v %q", err, res.Refused)
	}
	if c := h.bible.CueList[0]; c.SpeakerID != "wren" || !c.Corrected {
		t.Fatalf("cue: %+v", c)
	}
	if got := h.get(id); got.Applied == nil || got.Applied.PhraseKey != "c1" {
		t.Fatalf("%+v", got.Applied)
	}
	// a quote outside every cue is refused with a sentence
	h.bible.CueList = []Cue{{ID: "c2", ParagraphID: "p9", Start: 0, End: 5}}
	id2 := h.ingest(store.Payload{Kind: extraction.KindSpeaker, Quote: "Then Wren left.", Speaker: "Wren"}, conf(0.5), "Then Wren left.")
	res, err := h.app.Accept(id2, nil)
	if err != nil || res.Refused != sentenceNoCue {
		t.Fatalf("%v %q", err, res.Refused)
	}
	if got := h.get(id2); got.Status != extraction.StatusNeedsVerification || got.Reason != sentenceNoCue {
		t.Fatalf("%+v", got)
	}
}

func TestAcceptedAutoIsAppliedAndFlaggedReview(t *testing.T) {
	h := newHarness(t, wren)
	entryID := h.ingest(store.Payload{Kind: extraction.KindEntry, Name: "Brook", Type: "Place"}, conf(0.75), "")
	aliasID := h.ingest(store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "Little Wren"}, conf(0.9), "")
	if h.get(entryID).Status != extraction.StatusAcceptedAuto || h.get(aliasID).Status != extraction.StatusAcceptedAuto {
		t.Fatal("both stay listed as accepted-auto")
	}
	if e := h.entry("Brook"); e.ID == "" || !e.FlaggedEntry {
		t.Fatalf("new entry is applied and flagged: %+v", e)
	}
	if e := h.entry("Wren"); len(e.Aliases) != 1 || len(e.FlaggedAliases) != 1 || e.FlaggedAliases[0] != "Little Wren" {
		t.Fatalf("new name is applied and flagged: %+v", e)
	}
}

func TestUnderTheThresholdWaitsAndAnEditIsStoredAndApplied(t *testing.T) {
	h := newHarness(t, wren)
	id := h.ingest(store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "Wrenn"}, conf(0.5), "")
	if len(h.entry("Wren").Aliases) != 0 || h.get(id).Status != extraction.StatusNeedsVerification {
		t.Fatal("nothing changes before the narrator accepts")
	}
	edited := store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "Wren the Younger"}
	if res, err := h.app.Accept(id, &edited); err != nil || res.Refused != "" {
		t.Fatalf("%v %q", err, res.Refused)
	}
	got := h.get(id)
	if got.Payload.Alias != "Wren the Younger" || got.Status != extraction.StatusAccepted || h.entry("Wren").Aliases[0] != "Wren the Younger" {
		t.Fatalf("%+v %+v", got, h.entry("Wren"))
	}
}

func TestRejectTakesBackAnAutomaticAcceptance(t *testing.T) {
	h := newHarness(t, wren, Entry{ID: "mill", Name: "The Mill"})
	alias := h.ingest(store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "Little Wren"}, conf(0.9), "")
	rel := h.ingest(store.Payload{Kind: extraction.KindRelationship, Entry: "Wren", To: "The Mill", Relation: "works at"}, conf(0.9), "")
	prop := h.ingest(store.Payload{Kind: extraction.KindProperty, Entry: "Wren", Key: "Codename", Value: "Sparrow"}, conf(0.9), "Wren said")
	made := h.ingest(store.Payload{Kind: extraction.KindEntry, Name: "Brook", Type: "Place"}, conf(0.9), "")
	for _, id := range []string{alias, rel, prop, made} {
		if res, err := h.app.Reject(id); err != nil || res.Refused != "" {
			t.Fatalf("%v %q", err, res.Refused)
		}
		if h.get(id).Status != extraction.StatusRejected || h.get(id).Applied != nil {
			t.Fatalf("not a tombstone: %+v", h.get(id))
		}
	}
	if e := h.entry("Wren"); len(e.Aliases) != 0 || len(e.Relations) != 0 || len(e.Properties) != 0 {
		t.Fatalf("%+v", e)
	}
	if h.entry("Brook").ID != "" {
		t.Fatal("the entry the apply step made goes")
	}
}

func TestRejectKeepsAnEntryTheNarratorHasReviewed(t *testing.T) {
	h := newHarness(t)
	id := h.ingest(store.Payload{Kind: extraction.KindEntry, Name: "Brook", Type: "Place"}, conf(0.9), "")
	if res, err := h.app.Review(id); err != nil || res.Refused != "" {
		t.Fatalf("%v %q", err, res.Refused)
	}
	if _, err := h.app.Reject(id); err != nil {
		t.Fatal(err)
	}
	if h.entry("Brook").ID == "" {
		t.Fatal("a reviewed entry stays")
	}
}

func TestLockedEntryIsNeverEdited(t *testing.T) {
	h := newHarness(t, Entry{ID: "wren", Name: "Wren", Locked: true})
	id := h.ingest(store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "Little Wren"}, conf(0.9), "")
	got := h.get(id)
	if got.Status != extraction.StatusNeedsVerification || got.Reason != SentenceLocked || got.Applied != nil {
		t.Fatalf("%+v", got)
	}
	res, err := h.app.Accept(id, nil)
	if err != nil || res.Refused != SentenceLocked {
		t.Fatalf("%v %q", err, res.Refused)
	}
	if e := h.entry("Wren"); len(e.Aliases) != 0 || len(e.FlaggedAliases) != 0 {
		t.Fatalf("nothing is written: %+v", e)
	}
}

func TestNameOwnedByAnotherEntryIsRefused(t *testing.T) {
	h := newHarness(t, wren, Entry{ID: "mill", Name: "The Mill", Aliases: []string{"Old Mill"}})
	id := h.ingest(store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "old mill"}, conf(0.9), "")
	got := h.get(id)
	if got.Status != extraction.StatusNeedsVerification || got.Reason != "“old mill” is already a name of The Mill." {
		t.Fatalf("%+v", got)
	}
	if len(h.entry("Wren").Aliases) != 0 {
		t.Fatal("not applied")
	}
}

func TestClaimAboutAMissingEntryWaitsThenAttaches(t *testing.T) {
	h := newHarness(t)
	claim := h.ingest(store.Payload{Kind: extraction.KindClaim, Entry: "Wren", Claim: extraction.ClaimKnow, Text: "Knows the door is open."}, conf(0.9), "Wren said")
	rejected := h.ingest(store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "W"}, conf(0.9), "")
	if h.get(claim).Status != extraction.StatusNeedsVerification {
		t.Fatal("waits")
	}
	if _, err := h.app.Reject(rejected); err != nil {
		t.Fatal(err)
	}
	h.ingest(store.Payload{Kind: extraction.KindEntry, Name: "Wren", Type: "Character"}, conf(0.9), "")
	got := h.get(claim)
	if got.Status != extraction.StatusAcceptedAuto || got.EntryID == nil || got.Applied == nil {
		t.Fatalf("attached and applied in the same pass: %+v", got)
	}
	if p := h.entry("Wren").Properties; len(p) != 1 || p[0].Key != "Knows" {
		t.Fatalf("%+v", p)
	}
	if h.get(rejected).Status != extraction.StatusRejected {
		t.Fatal("rejected is never touched")
	}
}

func TestReviewMakesAnAutomaticAcceptanceTheNarrators(t *testing.T) {
	h := newHarness(t, wren)
	id := h.ingest(store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "Little Wren"}, conf(0.9), "")
	if res, err := h.app.Review(id); err != nil || res.Refused != "" {
		t.Fatalf("%v %q", err, res.Refused)
	}
	if h.get(id).Status != extraction.StatusAccepted || len(h.entry("Wren").FlaggedAliases) != 0 || len(h.entry("Wren").Aliases) != 1 {
		t.Fatalf("%+v", h.entry("Wren"))
	}
	waiting := h.ingest(store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "W"}, conf(0.2), "")
	if res, _ := h.app.Review(waiting); res.Refused != sentenceNothing {
		t.Fatalf("a suggestion that needs verification is decided with Accept: %q", res.Refused)
	}
}

func TestApplyingTwiceChangesNothingTheSecondTime(t *testing.T) {
	h := newHarness(t, wren)
	p := store.Payload{Kind: extraction.KindProperty, Entry: "wren", Key: "codename", Value: "Sparrow"}
	h.bible.Entities[0].Properties = []Property{{Key: "Codename", Value: "Sparrow"}}
	id := h.ingest(p, conf(0.4), "Wren said")
	if res, err := h.app.Accept(id, nil); err != nil || res.Refused != "" {
		t.Fatalf("%v %q", err, res.Refused)
	}
	if got := h.entry("Wren").Properties; len(got) != 1 {
		t.Fatalf("a duplicate property is not added: %+v", got)
	}
	if _, err := h.app.Settle(); err != nil {
		t.Fatal(err)
	}
	if got := h.entry("Wren").Properties; len(got) != 1 {
		t.Fatalf("%+v", got)
	}
}

func TestAPropertyNeverOverwritesADifferentValue(t *testing.T) {
	h := newHarness(t, Entry{ID: "wren", Name: "Wren", Properties: []Property{{Key: "Codename", Value: "Finch"}}})
	id := h.ingest(store.Payload{Kind: extraction.KindProperty, Entry: "Wren", Key: "Codename", Value: "Sparrow"}, conf(0.4), "Wren said")
	res, _ := h.app.Accept(id, nil)
	if res.Refused == "" || h.entry("Wren").Properties[0].Value != "Finch" {
		t.Fatalf("%q %+v", res.Refused, h.entry("Wren").Properties)
	}
}

func TestWithdrawTakesBackAndRemoves(t *testing.T) {
	h := newHarness(t, wren, Entry{ID: "mill", Name: "The Mill"})
	made := h.ingest(store.Payload{Kind: extraction.KindEntry, Name: "Brook", Type: "Place"}, conf(0.9), "")
	claim := h.ingest(store.Payload{Kind: extraction.KindClaim, Entry: "Brook", Claim: extraction.ClaimAct, Text: "Floods"}, conf(0.9), "")
	alias := h.ingest(store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "Little Wren"}, conf(0.9), "")
	rel := h.ingest(store.Payload{Kind: extraction.KindRelationship, Entry: "Wren", To: "The Mill", Relation: "works at"}, conf(0.9), "")
	waiting := h.ingest(store.Payload{Kind: extraction.KindProperty, Entry: "Wren", Key: "Codename", Value: "Sparrow"}, conf(0.3), "Wren said")
	other := h.ingest(store.Payload{Kind: extraction.KindProperty, Entry: "Brook", Key: "Depth", Value: "Shallow"}, conf(0.9), "Then Wren left")
	if h.get(other).Applied == nil {
		t.Fatalf("the harness did not apply the other suggestion: %+v", h.get(other))
	}

	res, err := h.app.Withdraw([]string{alias, made, rel, claim, waiting, "s999"})
	if err != nil || res.Refused != "" {
		t.Fatalf("%v %q", err, res.Refused)
	}
	all, _ := h.store.List()
	if len(all) != 1 || all[0].ID != other {
		t.Fatalf("left %+v, want only %s", all, other)
	}
	if got := all[0]; got.Applied != nil || got.Status != extraction.StatusNeedsVerification || got.EntryID != nil {
		t.Fatalf("a suggestion about the removed entry was not settled: %+v", got)
	}
	if e := h.entry("Wren"); len(e.Aliases) != 0 || len(e.Relations) != 0 || len(e.Properties) != 0 {
		t.Fatalf("%+v", e)
	}
	if h.entry("Brook").ID != "" {
		t.Fatal("the entry the apply step made goes")
	}
	if len(res.Suggestions) != 1 || res.Suggestions[0].ID != other {
		t.Fatalf("the result's suggestions = %+v, want the one it settled", res.Suggestions)
	}
}

func TestWithdrawAboutALockedEntryChangesNothing(t *testing.T) {
	h := newHarness(t, wren)
	alias := h.ingest(store.Payload{Kind: extraction.KindAlias, Entry: "Wren", Alias: "Little Wren"}, conf(0.9), "")
	made := h.ingest(store.Payload{Kind: extraction.KindEntry, Name: "Brook", Type: "Place"}, conf(0.9), "")
	h.bible.Entities[0].Locked = true
	before, _ := h.store.List()
	res, err := h.app.Withdraw([]string{made, alias})
	if err != nil || res.Refused != SentenceLocked {
		t.Fatalf("%v %q", err, res.Refused)
	}
	after, _ := h.store.List()
	if len(after) != len(before) || h.entry("Brook").ID == "" || len(h.entry("Wren").Aliases) != 1 {
		t.Fatalf("a refused withdraw changed something: %+v %+v", after, h.bible.Entities)
	}
}
