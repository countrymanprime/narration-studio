package main

import (
	"errors"
	"reflect"
	"slices"
	"strings"
	"sync"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/apply"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/store"
)

// The Story Bible's extraction suggestions (ADR 0803, ADR 0846): what a source offered, kept in
// <project>/ManuscriptGuide/suggestions.json by internal/extraction/store and applied to the Story Bible by
// internal/extraction/apply through the Story Bible's own commands. Only ids and the narrator's edited text cross; no
// binding takes a path. A refusal is the error, a sentence for the narrator, and leaves the Story Bible and the
// suggestions as they were.

// The sentences a binding says before the apply step runs.
const (
	sentenceSuggestionGone   = "That suggestion is gone."
	sentenceEmptyText        = "The text is empty."
	sentenceTextTooLong      = "The text is too long."
	sentenceNotDecided       = "That suggestion is not decided yet."
	sentenceBibleUnavailable = "the Story Bible is unavailable"
)

// maxSuggestionIDBytes bounds an id from the UI; the store's ids are "s" and a number.
const maxSuggestionIDBytes = 64

// extractionOrder is the mock's ORDER: entries first, then names, relationships, properties and claims, speakers.
var extractionOrder = map[extraction.Kind]int{extraction.KindEntry: 0, extraction.KindAlias: 1, extraction.KindRelationship: 2,
	extraction.KindProperty: 3, extraction.KindClaim: 3, extraction.KindSpeaker: 4}

// extractionDecisions serialises the decisions: each is several reads and writes of the suggestions file and the Story Bible.
var extractionDecisions sync.Mutex

// ExtractionDecision is what a decision did: the suggestion as it is now, the other suggestions the decision settled
// (a new entry lets a waiting claim attach), and the ids of the Story Bible entries it changed.
type ExtractionDecision struct {
	Suggestion store.Suggestion   `json:"suggestion"`
	Settled    []store.Suggestion `json:"settled"`
	EntryIDs   []string           `json:"entryIds"`
}

// ExtractionList returns every suggestion, rejected ones included, entries first and then by kind in the mock's
// order, each kind in the order it was stored.
func (h *Host) ExtractionList() (string, error) {
	list, err := h.extractionStore().List()
	if err != nil {
		return "", err
	}
	slices.SortStableFunc(list, func(a, b store.Suggestion) int { return extractionOrder[a.Kind] - extractionOrder[b.Kind] })
	return encodeBinding(list, nil)
}

// ExtractionAccept makes a suggestion the narrator's and applies it. text, when given, replaces what the suggestion
// says (an entry's name, a name, a value, a relation, a claim or a speaker) and is applied as given.
func (h *Host) ExtractionAccept(id string, text *string) (string, error) {
	return h.extractionDecide(id, func(app *apply.Applier, current store.Suggestion) (apply.Result, error) {
		if text == nil {
			return app.Accept(id, nil)
		}
		edited, err := withSuggestionText(current.Payload, *text)
		if err != nil {
			return apply.Result{}, err
		}
		return app.Accept(id, &edited)
	})
}

// ExtractionReject takes back what a suggestion changed and keeps it as a tombstone, so it is not offered again.
func (h *Host) ExtractionReject(id string) (string, error) {
	return h.extractionDecide(id, func(app *apply.Applier, _ store.Suggestion) (apply.Result, error) { return app.Reject(id) })
}

// ExtractionReview makes an automatic acceptance the narrator's and clears the Review flag it set.
func (h *Host) ExtractionReview(id string) (string, error) {
	return h.extractionDecide(id, func(app *apply.Applier, _ store.Suggestion) (apply.Result, error) { return app.Review(id) })
}

// ExtractionReopen is the undo of accept, reject and review: the suggestion goes back to the status the 75% rule gives
// it now. An automatic acceptance stays applied and is flagged Review again; one that needs verification has what the
// decision applied taken back. An edited text stays as edited.
func (h *Host) ExtractionReopen(id string) (string, error) {
	return h.extractionDecide(id, func(app *apply.Applier, current store.Suggestion) (apply.Result, error) {
		if current.Status != extraction.StatusAccepted && current.Status != extraction.StatusRejected {
			return apply.Result{Refused: sentenceNotDecided}, nil
		}
		bible := h.extractionBibleOf()
		if current.Applied != nil {
			entries, err := bible.Entries()
			if err != nil {
				return apply.Result{}, err
			}
			if i := slices.IndexFunc(entries, func(e apply.Entry) bool { return e.ID == current.Applied.EntryID }); i >= 0 && entries[i].Locked {
				return apply.Result{Refused: apply.SentenceLocked}, nil
			}
		}
		undecided := current
		undecided.Status, undecided.Reason = extraction.StatusNeedsVerification, ""
		if err := h.extractionStore().Restore(undecided); err != nil {
			return apply.Result{}, err
		}
		res, err := app.Settle()
		if err != nil {
			return res, err
		}
		now, err := findSuggestion(h.extractionStore(), id)
		if err != nil || now.Status != extraction.StatusAcceptedAuto || now.Applied == nil {
			return res, err
		}
		flags, err := reflag(bible, *now.Applied)
		res.Changes = append(res.Changes, flags...)
		return res, err
	})
}

// extractionDecide runs one decision on a suggestion. A refusal puts every suggestion it changed back as it was, so
// nothing changes but the narrator is told why.
func (h *Host) extractionDecide(id string, decide func(*apply.Applier, store.Suggestion) (apply.Result, error)) (string, error) {
	if len(id) > maxSuggestionIDBytes {
		return "", extractionRefusal(sentenceSuggestionGone)
	}
	bible := h.extractionBibleOf()
	if bible == nil {
		return "", errors.New(sentenceBibleUnavailable)
	}
	extractionDecisions.Lock()
	defer extractionDecisions.Unlock()
	suggestions := h.extractionStore()
	current, err := findSuggestion(suggestions, id)
	if err != nil {
		return "", err
	}
	res, err := decide(apply.New(suggestions, bible), current)
	if err != nil {
		return "", err
	}
	if res.Refused != "" {
		// The apply step holds a refused suggestion with the sentence, and its Before is the held one: the snapshot taken
		// here is what goes back.
		for _, before := range append(res.Before, current) {
			if err := suggestions.Restore(before); err != nil {
				return "", err
			}
		}
		return "", extractionRefusal(res.Refused)
	}
	now, err := findSuggestion(suggestions, id)
	if err != nil {
		return "", err
	}
	decision := ExtractionDecision{Suggestion: now, Settled: []store.Suggestion{}, EntryIDs: []string{}}
	before := map[string]store.Suggestion{}
	for _, s := range res.Before {
		before[s.ID] = s
	}
	for _, s := range res.Suggestions {
		// A settle saves a suggestion it holds again (one about a locked entry) though nothing about it changed.
		if was, ok := before[s.ID]; s.ID != id && (!ok || !reflect.DeepEqual(was, s)) {
			decision.Settled = append(decision.Settled, s)
		}
	}
	for _, change := range res.Changes {
		if change.EntryID != "" && !slices.Contains(decision.EntryIDs, change.EntryID) {
			decision.EntryIDs = append(decision.EntryIDs, change.EntryID)
		}
	}
	return encodeBinding(decision, nil)
}

// reflag sets the Review flags an automatic acceptance has: the entry it made and the names it added.
func reflag(bible apply.Bible, applied store.Applied) ([]apply.Change, error) {
	entries, err := bible.Entries()
	if err != nil {
		return nil, err
	}
	i := slices.IndexFunc(entries, func(e apply.Entry) bool { return e.ID == applied.EntryID })
	if i < 0 {
		return nil, nil
	}
	e := entries[i]
	var changes []apply.Change
	if applied.Created && !e.FlaggedEntry {
		if err := bible.Flag(e.ID, ""); err != nil {
			return changes, err
		}
		changes = append(changes, apply.Change{Op: "flag", EntryID: e.ID})
	}
	for _, alias := range applied.Aliases {
		if slices.Contains(e.Aliases, alias) && !slices.Contains(e.FlaggedAliases, alias) {
			if err := bible.Flag(e.ID, alias); err != nil {
				return changes, err
			}
			changes = append(changes, apply.Change{Op: "flag", EntryID: e.ID, Detail: alias})
		}
	}
	return changes, nil
}

// extractionRefusal is a refusal's error: the narrator's sentence, worded and punctuated as the apply step words its own.
func extractionRefusal(sentence string) error { return errors.New(sentence) }

func findSuggestion(suggestions *store.Service, id string) (store.Suggestion, error) {
	all, err := suggestions.List()
	if err != nil {
		return store.Suggestion{}, err
	}
	for _, s := range all {
		if s.ID == id {
			return s, nil
		}
	}
	return store.Suggestion{}, extractionRefusal(sentenceSuggestionGone)
}

// withSuggestionText is the mock's withText: the one text the narrator edits, trimmed, in place of the payload's.
func withSuggestionText(p store.Payload, text string) (store.Payload, error) {
	if len(text) > store.MaxFieldBytes {
		return p, extractionRefusal(sentenceTextTooLong)
	}
	t := strings.TrimSpace(text)
	if t == "" {
		return p, extractionRefusal(sentenceEmptyText)
	}
	p.Aliases, p.AppearsIn = slices.Clone(p.Aliases), slices.Clone(p.AppearsIn)
	switch p.Kind {
	case extraction.KindEntry:
		p.Name = t
	case extraction.KindAlias:
		p.Alias = t
	case extraction.KindProperty:
		p.Value = t
	case extraction.KindRelationship:
		p.Relation = t
	case extraction.KindClaim:
		p.Text = t
	case extraction.KindSpeaker:
		p.Speaker = t
	}
	return p, nil
}

// extractionStore builds the suggestion store over one services() snapshot; it keeps no state of its own.
func (h *Host) extractionStore() *store.Service {
	return store.New(store.Config{Project: h.services().config.projectFolder, Reporter: h.persist})
}

// extractionBibleOf is the Story Bible the apply step writes through, or nil when there is none.
func (h *Host) extractionBibleOf() apply.Bible {
	if h.extractionBible != nil {
		return h.extractionBible
	}
	if service := h.services().guide; service != nil {
		return service.ExtractionBible()
	}
	return nil
}
