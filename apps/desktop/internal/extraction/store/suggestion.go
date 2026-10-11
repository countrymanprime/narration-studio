package store

import (
	"errors"
	"fmt"
	"reflect"
	"time"
	"unicode/utf16"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
)

// Source says where a suggestion came from. Rules suggestions carry SourceRules.
type Source string

// The sources.
const (
	SourceRules      Source = "rules"
	SourceImported   Source = "imported"
	SourceLocalModel Source = "local-model"
	SourceGLiNER     Source = "gliner"
	SourceBookNLP    Source = "booknlp"
)

// FlagDuplicate is the one flag: the source thinks the suggestion repeats something else.
const FlagDuplicate = "duplicate"

// Payload is what a suggestion offers, as it is stored and sent: the fields of extraction.Payload under the names the
// Studio Next mock uses. Kind says which fields are used and every other field is empty.
type Payload struct {
	Kind        extraction.Kind      `json:"kind"`
	Name        string               `json:"name,omitempty"`
	Type        string               `json:"type,omitempty"`
	Aliases     []string             `json:"aliases,omitempty"`
	Description string               `json:"description,omitempty"`
	AppearsIn   []string             `json:"appearsIn,omitempty"`
	Entry       string               `json:"entry,omitempty"`
	Alias       string               `json:"alias,omitempty"`
	Key         string               `json:"key,omitempty"`
	Value       string               `json:"value,omitempty"`
	To          string               `json:"to,omitempty"`
	Relation    string               `json:"relation,omitempty"`
	Claim       extraction.ClaimKind `json:"claim,omitempty"`
	Text        string               `json:"text,omitempty"`
	Quote       string               `json:"quote,omitempty"`
	Speaker     string               `json:"speaker,omitempty"`
}

// Core returns the payload the rule and the fingerprint read.
func (p Payload) Core() extraction.Payload {
	return extraction.Payload{Kind: p.Kind, Name: p.Name, Type: p.Type, Aliases: p.Aliases, Description: p.Description, AppearsIn: p.AppearsIn,
		Entry: p.Entry, Alias: p.Alias, Key: p.Key, Value: p.Value, To: p.To, Relation: p.Relation, Claim: p.Claim, Text: p.Text, Quote: p.Quote, Speaker: p.Speaker}
}

// EntryRef is the name the payload uses for the entry it belongs to: an entry's own name, the entry a property, alias,
// relationship or claim is about; empty for a speaker.
func (p Payload) EntryRef() string {
	switch p.Kind {
	case extraction.KindEntry:
		return p.Name
	case extraction.KindAlias, extraction.KindProperty, extraction.KindRelationship, extraction.KindClaim:
		return p.Entry
	}
	return ""
}

// Applied is what applying a suggestion changed in the Story Bible. The apply step writes it; this package stores it.
type Applied struct {
	EntryID   string   `json:"entryId,omitempty"`
	Created   bool     `json:"created,omitempty"`
	Aliases   []string `json:"aliases,omitempty"`
	RelID     *int     `json:"relId,omitempty"`
	PhraseKey string   `json:"phraseKey,omitempty"`
}

// Evidence is a quoted stretch of one paragraph; Start and End are UTF-16 code units into the paragraph's text.
type Evidence struct {
	ParagraphID string `json:"paragraphId"`
	Start       int    `json:"start"`
	End         int    `json:"end"`
	Text        string `json:"text"`
}

// Suggestion is one suggestion as stored. EntryID is nil until the suggestion belongs to an entry in the Story Bible.
// Confidence is nil when the source gave none and is never made up. Fp is the fingerprint of what was first offered.
type Suggestion struct {
	ID              string            `json:"id"`
	Kind            extraction.Kind   `json:"kind"`
	Payload         Payload           `json:"payload"`
	EntryID         *string           `json:"entryId"`
	Evidence        []Evidence        `json:"evidence"`
	Confidence      *float64          `json:"confidence"`
	Source          Source            `json:"source"`
	Status          extraction.Status `json:"status"`
	UnverifiedQuote string            `json:"unverifiedQuote,omitempty"`
	Reason          string            `json:"reason,omitempty"`
	Fp              string            `json:"fp"`
	Flag            string            `json:"flag,omitempty"`
	Note            string            `json:"note,omitempty"`
	ChapterID       string            `json:"chapterId,omitempty"`
	Applied         *Applied          `json:"applied,omitempty"`
	CreatedAt       time.Time         `json:"createdAt"`
}

// The limits on the file. Each is at least the importer's, so an import that passed can always be stored.
const (
	// MaxSuggestions is how many suggestions, tombstones included, one project keeps. The importer reads at most 5000 rows.
	MaxSuggestions = 20000
	// MaxFileBytes is the size of the file, read or written.
	MaxFileBytes = 32 << 20
	// MaxFieldBytes is the length of one text. The importer's field limit is the same.
	MaxFieldBytes = 8 << 10
	// MaxListItems is how many aliases or chapters one entry payload names.
	MaxListItems = 200
	// MaxEvidence is how many quotes back one suggestion.
	MaxEvidence = 20
)

func validKind(k extraction.Kind) bool {
	switch k {
	case extraction.KindEntry, extraction.KindAlias, extraction.KindProperty, extraction.KindRelationship, extraction.KindClaim, extraction.KindSpeaker:
		return true
	}
	return false
}

func validStatus(s extraction.Status) bool {
	switch s {
	case extraction.StatusAcceptedAuto, extraction.StatusNeedsVerification, extraction.StatusAccepted, extraction.StatusRejected:
		return true
	}
	return false
}

func validSource(s Source) bool {
	switch s {
	case SourceRules, SourceImported, SourceLocalModel, SourceGLiNER, SourceBookNLP:
		return true
	}
	return false
}

func validConfidence(c *float64) bool { return c == nil || (*c >= 0 && *c <= 1) }

func unitsOf(s string) int {
	n := 0
	for _, r := range s {
		n += utf16.RuneLen(r)
	}
	return n
}

// canonical keeps only the fields the kind uses, so a payload with a stray field is told apart from one that fits.
func canonical(p Payload) Payload {
	c := Payload{Kind: p.Kind}
	switch p.Kind {
	case extraction.KindEntry:
		c.Name, c.Type, c.Aliases, c.Description, c.AppearsIn = p.Name, p.Type, p.Aliases, p.Description, p.AppearsIn
	case extraction.KindAlias:
		c.Entry, c.Alias = p.Entry, p.Alias
	case extraction.KindProperty:
		c.Entry, c.Key, c.Value = p.Entry, p.Key, p.Value
	case extraction.KindRelationship:
		c.Entry, c.To, c.Relation = p.Entry, p.To, p.Relation
	case extraction.KindClaim:
		c.Entry, c.Claim, c.Text = p.Entry, p.Claim, p.Text
	case extraction.KindSpeaker:
		c.Quote, c.Speaker = p.Quote, p.Speaker
	}
	return c
}

func nonEmpty(p Payload) bool {
	switch p.Kind {
	case extraction.KindEntry:
		return p.Name != ""
	case extraction.KindAlias:
		return p.Entry != "" && p.Alias != ""
	case extraction.KindProperty:
		return p.Entry != "" && p.Key != "" && p.Value != ""
	case extraction.KindRelationship:
		return p.Entry != "" && p.To != "" && p.Relation != ""
	case extraction.KindClaim:
		return p.Entry != "" && p.Text != "" && (p.Claim == extraction.ClaimTalk || p.Claim == extraction.ClaimAct || p.Claim == extraction.ClaimKnow)
	case extraction.KindSpeaker:
		return p.Quote != "" && p.Speaker != ""
	}
	return false
}

// sameFields is reflect.DeepEqual with an empty list read as no list.
func sameFields(a, b Payload) bool {
	for _, p := range []*Payload{&a, &b} {
		if len(p.Aliases) == 0 {
			p.Aliases = nil
		}
		if len(p.AppearsIn) == 0 {
			p.AppearsIn = nil
		}
	}
	return reflect.DeepEqual(a, b)
}

func texts(p Payload) []string {
	out := []string{p.Name, p.Type, p.Description, p.Entry, p.Alias, p.Key, p.Value, p.To, p.Relation, p.Text, p.Quote, p.Speaker}
	out = append(out, p.Aliases...)
	return append(out, p.AppearsIn...)
}

// checkPayload says whether a payload fits its kind and the field limits.
func checkPayload(p Payload) error {
	if !validKind(p.Kind) {
		return fmt.Errorf("a suggestion has the kind %q, which is not one of entry, alias, property, relationship, claim or speaker", p.Kind)
	}
	if !nonEmpty(p) || !sameFields(p, canonical(p)) {
		return fmt.Errorf("a %s suggestion's payload does not fit its kind", p.Kind)
	}
	if len(p.Aliases) > MaxListItems || len(p.AppearsIn) > MaxListItems {
		return fmt.Errorf("a suggestion names more than %d aliases or chapters", MaxListItems)
	}
	for _, text := range texts(p) {
		if len(text) > MaxFieldBytes {
			return fmt.Errorf("a suggestion has a text over the %d KB limit for one field", MaxFieldBytes/1024)
		}
	}
	return nil
}

// check says whether a stored suggestion keeps every rule of the file.
func check(s Suggestion) error {
	switch {
	case s.ID == "":
		return errors.New("a suggestion has no id")
	case !validKind(s.Kind):
		return fmt.Errorf("suggestion %s has the kind %q, which is not one of entry, alias, property, relationship, claim or speaker", s.ID, s.Kind)
	case !validStatus(s.Status):
		return fmt.Errorf("suggestion %s has the status %q, which is not one of accepted-auto, needs-verification, accepted or rejected", s.ID, s.Status)
	case !validSource(s.Source):
		return fmt.Errorf("suggestion %s has the source %q, which is not one of rules, imported, local-model, gliner or booknlp", s.ID, s.Source)
	case !validConfidence(s.Confidence):
		return fmt.Errorf("suggestion %s has a confidence outside 0 to 1", s.ID)
	case s.Payload.Kind != s.Kind:
		return fmt.Errorf("suggestion %s has a payload of another kind than its own", s.ID)
	case s.Fp == "":
		return fmt.Errorf("suggestion %s has no fingerprint", s.ID)
	case s.Flag != "" && s.Flag != FlagDuplicate:
		return fmt.Errorf("suggestion %s has a flag that is not %q", s.ID, FlagDuplicate)
	case len(s.Evidence) > MaxEvidence:
		return fmt.Errorf("suggestion %s has more than %d quotes", s.ID, MaxEvidence)
	}
	if err := checkPayload(s.Payload); err != nil {
		return fmt.Errorf("suggestion %s: %w", s.ID, err)
	}
	for _, e := range s.Evidence {
		if e.ParagraphID == "" || e.Start < 0 || e.End <= e.Start || e.End-e.Start != unitsOf(e.Text) {
			return fmt.Errorf("suggestion %s has a quote whose place does not fit its text", s.ID)
		}
	}
	for _, text := range []string{s.UnverifiedQuote, s.Reason, s.Note, s.ChapterID, s.Fp} {
		if len(text) > MaxFieldBytes {
			return fmt.Errorf("suggestion %s has a text over the %d KB limit for one field", s.ID, MaxFieldBytes/1024)
		}
	}
	for _, e := range s.Evidence {
		if len(e.Text) > MaxFieldBytes {
			return fmt.Errorf("suggestion %s has a quote over the %d KB limit for one field", s.ID, MaxFieldBytes/1024)
		}
	}
	return nil
}

// candidate is what the rule reads of a suggestion.
func (s Suggestion) candidate() extraction.Candidate {
	c := extraction.Candidate{Kind: s.Kind, Confidence: s.Confidence, UnverifiedQuote: s.UnverifiedQuote}
	for _, e := range s.Evidence {
		c.Evidence = append(c.Evidence, extraction.Evidence{ParagraphID: e.ParagraphID, Start: e.Start, End: e.End, Text: e.Text})
	}
	if s.EntryID != nil {
		c.EntryID = *s.EntryID
	}
	return c
}

// rule sets the status and reason an undecided suggestion has by the 75% rule (ADR 0803).
func (s *Suggestion) rule() {
	c := s.candidate()
	s.Status = extraction.AutoStatus(c)
	s.Reason = ""
	for i, r := range extraction.ReasonsOf(c) {
		if i > 0 {
			s.Reason += " "
		}
		s.Reason += string(r)
	}
}
