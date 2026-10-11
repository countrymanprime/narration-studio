package apply

import (
	"fmt"
	"slices"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/store"
)

// The sentences a refusal says.
const (
	SentenceLocked      = "The entry is locked."
	sentenceNoCue       = "The quoted line is not in the text."
	sentenceNothing     = "Nothing to review."
	sentenceGone        = "That suggestion is gone."
	sentenceRejected    = "That suggestion was rejected, so it cannot be accepted."
	sentenceKindChange  = "The kind of a suggestion cannot change."
	sentenceSelfRelated = "An entry cannot be related to itself."
)

// The property keys a claim becomes.
var claimKeys = map[extraction.ClaimKind]string{extraction.ClaimTalk: "Says", extraction.ClaimAct: "Does", extraction.ClaimKnow: "Knows"}

// order is the step order of the mock: entries, names, relationships, properties and claims, speakers.
var order = map[extraction.Kind]int{extraction.KindEntry: 0, extraction.KindAlias: 1, extraction.KindRelationship: 2, extraction.KindProperty: 3, extraction.KindClaim: 3, extraction.KindSpeaker: 4}

// Store is the suggestion store as the apply step uses it.
type Store interface {
	List() ([]store.Suggestion, error)
	Settle(bible store.Bible) ([]store.Suggestion, error)
	Restore(previous store.Suggestion) error
}

// Change is one thing a step did to the Story Bible, for the caller's undo step.
type Change struct {
	Op      string
	EntryID string
	Detail  string
}

// Result says what a step did. Before holds each suggestion it changed as it was, so the caller can put them back with Restore.
// A refusal is not an error: Refused is the sentence for the narrator, and nothing was written to the Story Bible.
type Result struct {
	Suggestions []store.Suggestion
	Before      []store.Suggestion
	Changes     []Change
	Refused     string
}

// Applier applies suggestions to a Bible and records what it did in a Store.
type Applier struct {
	store Store
	bible Bible
}

// New returns an Applier over a store and a Story Bible.
func New(s Store, b Bible) *Applier { return &Applier{store: s, bible: b} }

type run struct {
	a       *Applier
	res     Result
	before  map[string]store.Suggestion
	touched []string
}

func (a *Applier) newRun() *run { return &run{a: a, before: map[string]store.Suggestion{}} }

// remember notes a suggestion's first state in this run.
func (r *run) remember(s store.Suggestion) {
	if _, seen := r.before[s.ID]; !seen {
		r.before[s.ID] = clone(s)
		r.touched = append(r.touched, s.ID)
	}
}

func (r *run) save(s store.Suggestion) error {
	r.remember(s)
	return r.a.store.Restore(s)
}

func (r *run) finish() (Result, error) {
	all, err := r.a.store.List()
	if err != nil {
		return r.res, err
	}
	for _, id := range r.touched {
		r.res.Before = append(r.res.Before, r.before[id])
		for _, s := range all {
			if s.ID == id {
				r.res.Suggestions = append(r.res.Suggestions, s)
			}
		}
	}
	return r.res, nil
}

func (r *run) log(op, entry, detail string) {
	r.res.Changes = append(r.res.Changes, Change{Op: op, EntryID: entry, Detail: detail})
}

func clone(s store.Suggestion) store.Suggestion {
	if s.Applied != nil {
		a := *s.Applied
		a.Aliases = slices.Clone(a.Aliases)
		s.Applied = &a
	}
	if s.EntryID != nil {
		id := *s.EntryID
		s.EntryID = &id
	}
	return s
}

func find(all []store.Suggestion, id string) (store.Suggestion, bool) {
	for _, s := range all {
		if s.ID == id {
			return clone(s), true
		}
	}
	return store.Suggestion{}, false
}

func fold(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

// resolve finds an entry by id, name or other name, ignoring case, in the order store.Bible does.
func resolve(entries []Entry, ref string) (Entry, bool) {
	key := fold(ref)
	if key == "" {
		return Entry{}, false
	}
	for _, match := range []func(Entry) bool{
		func(e Entry) bool { return fold(e.ID) == key },
		func(e Entry) bool { return fold(e.Name) == key },
		func(e Entry) bool {
			return slices.ContainsFunc(e.Aliases, func(a string) bool { return fold(a) == key })
		},
	} {
		for _, e := range entries {
			if match(e) {
				return e, true
			}
		}
	}
	return Entry{}, false
}

// owner finds the entry that has a name, as its own or as another.
func owner(entries []Entry, name string) (Entry, bool) { return resolve(entries, name) }

func entryByID(entries []Entry, id string) (Entry, bool) {
	for _, e := range entries {
		if e.ID == id {
			return e, true
		}
	}
	return Entry{}, false
}

var categories = []string{"Character", "Place", "Organization", "Lore", "Item", "Event"}

// categoryFor maps a suggestion's type to a Story Bible category; a type the Story Bible has no category for becomes Lore.
func categoryFor(t string) string {
	for _, c := range categories {
		if fold(c) == fold(t) {
			return c
		}
	}
	return "Lore"
}

func setEntryID(s *store.Suggestion, id string) { s.EntryID = &id }

func storeBible(entries []Entry) store.Bible {
	out := make(store.Bible, 0, len(entries))
	for _, e := range entries {
		out = append(out, store.Entry{ID: e.ID, Name: e.Name, Aliases: e.Aliases})
	}
	return out
}

// fits says whether a payload has what its kind needs, so a bad edit is refused before anything is written.
func fits(p store.Payload) bool {
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
		_, ok := claimKeys[p.Claim]
		return p.Entry != "" && p.Text != "" && ok
	case extraction.KindSpeaker:
		return p.Quote != "" && p.Speaker != ""
	}
	return false
}

// propertyOf is the key and the text a property or claim suggestion writes.
func propertyOf(p store.Payload) (key, text string) {
	if p.Kind == extraction.KindClaim {
		return claimKeys[p.Claim], p.Text
	}
	return p.Key, p.Value
}

func lines(v string) []string {
	if v == "" {
		return nil
	}
	return strings.Split(v, "\n")
}

func indexKey(props []Property, key string) int {
	return slices.IndexFunc(props, func(p Property) bool { return fold(p.Key) == fold(key) })
}

// applyOne puts one suggestion into the Story Bible. flag is true for an automatic acceptance, which flags what it adds for Review. It
// returns the sentence that says why it could not, with nothing written, or an error from the Story Bible.
func (r *run) applyOne(s *store.Suggestion, flag bool) (problem string, err error) {
	b := r.a.bible
	entries, err := b.Entries()
	if err != nil {
		return "", err
	}
	p := s.Payload
	switch p.Kind {
	case extraction.KindEntry:
		return r.applyEntry(s, p, entries, flag)
	case extraction.KindSpeaker:
		return r.applySpeaker(s, p, entries)
	}
	e, ok := resolve(entries, p.Entry)
	if !ok {
		return string(extraction.ReasonUnknownEntry), nil
	}
	if e.Locked {
		return SentenceLocked, nil
	}
	setEntryID(s, e.ID)
	switch p.Kind {
	case extraction.KindAlias:
		if o, owned := owner(entries, p.Alias); owned && o.ID != e.ID {
			return fmt.Sprintf("“%s” is already a name of %s.", p.Alias, o.Name), nil
		}
		if _, has := owner(entries, p.Alias); has {
			return "", nil
		}
		if err := b.SetAliases(e.ID, append(slices.Clone(e.Aliases), p.Alias)); err != nil {
			return "", err
		}
		if flag {
			if err := b.Flag(e.ID, p.Alias); err != nil {
				return "", err
			}
		}
		s.Applied = &store.Applied{EntryID: e.ID, Aliases: []string{p.Alias}}
		r.log("alias", e.ID, p.Alias)
	case extraction.KindRelationship:
		to, ok := resolve(entries, p.To)
		switch {
		case !ok:
			return fmt.Sprintf("There is no entry “%s”.", p.To), nil
		case to.ID == e.ID:
			return sentenceSelfRelated, nil
		case to.Locked:
			return fmt.Sprintf("“%s” is locked.", to.Name), nil
		}
		if slices.ContainsFunc(e.Relations, func(x Relation) bool { return x.To == to.ID && fold(x.Label) == fold(p.Relation) }) {
			return "", nil
		}
		if err := b.Relate(e.ID, to.ID, p.Relation); err != nil {
			return "", err
		}
		s.Applied = &store.Applied{EntryID: e.ID}
		r.log("relationship", e.ID, p.Relation+" "+to.Name)
	case extraction.KindProperty, extraction.KindClaim:
		return r.applyProperty(s, p, e)
	}
	return "", nil
}

func (r *run) applyEntry(s *store.Suggestion, p store.Payload, entries []Entry, flag bool) (string, error) {
	b := r.a.bible
	hit, ok := resolve(entries, p.Name)
	if !ok {
		for _, a := range p.Aliases {
			if hit, ok = owner(entries, a); ok {
				break
			}
		}
	}
	var free []string
	taken := map[string]bool{fold(p.Name): true}
	for _, a := range p.Aliases {
		if _, owned := owner(entries, a); !owned && !taken[fold(a)] {
			taken[fold(a)] = true
			free = append(free, a)
		}
	}
	if ok {
		if hit.Locked {
			return SentenceLocked, nil
		}
		setEntryID(s, hit.ID)
		var added []string
		for _, a := range append([]string{p.Name}, free...) {
			if _, has := owner(entries, a); !has && !slices.ContainsFunc(added, func(x string) bool { return fold(x) == fold(a) }) {
				added = append(added, a)
			}
		}
		if len(added) > 0 {
			if err := b.SetAliases(hit.ID, append(slices.Clone(hit.Aliases), added...)); err != nil {
				return "", err
			}
			r.log("alias", hit.ID, strings.Join(added, ", "))
		}
		if hit.Description == "" && p.Description != "" {
			if err := b.SetDescription(hit.ID, p.Description); err != nil {
				return "", err
			}
			r.log("description", hit.ID, p.Description)
		}
		if flag {
			for _, a := range added {
				if err := b.Flag(hit.ID, a); err != nil {
					return "", err
				}
			}
		}
		s.Applied = &store.Applied{EntryID: hit.ID, Aliases: added}
		return "", nil
	}
	id, err := b.Create(p.Name, categoryFor(p.Type), free, p.Description)
	if err != nil {
		return "", err
	}
	if flag {
		if err := b.Flag(id, ""); err != nil {
			return "", err
		}
	}
	setEntryID(s, id)
	s.Applied = &store.Applied{EntryID: id, Created: true}
	r.log("create", id, p.Name)
	return "", nil
}

// applyProperty writes a property, or a claim as the property Says, Does or Knows. A claim adds a line to a key that has other lines; a
// property whose key already says something else is refused, so the narrator's own fact is never overwritten.
func (r *run) applyProperty(s *store.Suggestion, p store.Payload, e Entry) (string, error) {
	key, text := propertyOf(p)
	props := slices.Clone(e.Properties)
	i := indexKey(props, key)
	switch {
	case i < 0:
		props = append(props, Property{Key: key, Value: text})
	case p.Kind == extraction.KindClaim:
		if slices.Contains(lines(props[i].Value), text) {
			return "", nil
		}
		props[i].Value = strings.Join(append(lines(props[i].Value), text), "\n")
	case fold(props[i].Value) == fold(text):
		return "", nil
	default:
		return fmt.Sprintf("The entry already has a property “%s”.", props[i].Key), nil
	}
	if err := r.a.bible.SetProperties(e.ID, props); err != nil {
		return "", err
	}
	s.Applied = &store.Applied{EntryID: e.ID}
	r.log("property", e.ID, key)
	return "", nil
}

func (r *run) applySpeaker(s *store.Suggestion, p store.Payload, entries []Entry) (string, error) {
	who, ok := resolve(entries, p.Speaker)
	if !ok {
		return fmt.Sprintf("There is no speaking entry “%s”.", p.Speaker), nil
	}
	if len(s.Evidence) == 0 {
		return sentenceNoCue, nil
	}
	cues, err := r.a.bible.Cues()
	if err != nil {
		return "", err
	}
	ev := s.Evidence[0]
	i := slices.IndexFunc(cues, func(c Cue) bool { return c.ParagraphID == ev.ParagraphID && c.Start <= ev.Start && ev.End <= c.End })
	if i < 0 {
		return sentenceNoCue, nil
	}
	cue := cues[i]
	if cue.Corrected && cue.SpeakerID != who.ID {
		return "You already chose the speaker of that line.", nil
	}
	setEntryID(s, who.ID)
	if cue.SpeakerID == who.ID {
		return "", nil
	}
	if err := r.a.bible.CorrectCue(cue.ID, who.ID); err != nil {
		return "", err
	}
	s.Applied = &store.Applied{EntryID: who.ID, PhraseKey: cue.ID}
	r.log("speaker", who.ID, cue.ID)
	return "", nil
}

// reverseOne takes back what applying a suggestion changed. Names, relationships, properties and speakers go; an entry only when the
// apply step made it and nobody has reviewed it. It returns the sentence that says why it could not, with nothing changed.
func (r *run) reverseOne(s *store.Suggestion) (string, error) {
	a := s.Applied
	if a == nil {
		return "", nil
	}
	b := r.a.bible
	entries, err := b.Entries()
	if err != nil {
		return "", err
	}
	e, present := entryByID(entries, a.EntryID)
	if present && e.Locked {
		return SentenceLocked, nil
	}
	p := s.Payload
	switch {
	case present && a.Created && e.FlaggedEntry:
		if err := b.Delete(e.ID); err != nil {
			return "", err
		}
		s.EntryID = nil
		r.log("delete", e.ID, e.Name)
	case present && len(a.Aliases) > 0:
		keep := slices.DeleteFunc(slices.Clone(e.Aliases), func(x string) bool { return slices.Contains(a.Aliases, x) })
		if len(keep) != len(e.Aliases) {
			if err := b.SetAliases(e.ID, keep); err != nil {
				return "", err
			}
			r.log("remove-alias", e.ID, strings.Join(a.Aliases, ", "))
		}
	case present && (p.Kind == extraction.KindProperty || p.Kind == extraction.KindClaim):
		if err := r.takeBackProperty(e, p); err != nil {
			return "", err
		}
	case present && p.Kind == extraction.KindRelationship:
		if to, ok := resolve(entries, p.To); ok {
			if to.Locked {
				return fmt.Sprintf("“%s” is locked.", to.Name), nil
			}
			if err := b.Unrelate(e.ID, to.ID, p.Relation); err != nil {
				return "", err
			}
			r.log("unrelate", e.ID, p.Relation)
		}
	case p.Kind == extraction.KindSpeaker && a.PhraseKey != "":
		cues, err := b.Cues()
		if err != nil {
			return "", err
		}
		if slices.ContainsFunc(cues, func(c Cue) bool { return c.ID == a.PhraseKey && c.SpeakerID == a.EntryID }) {
			if err := b.CorrectCue(a.PhraseKey, ""); err != nil {
				return "", err
			}
			r.log("unspeak", a.EntryID, a.PhraseKey)
		}
	}
	s.Applied = nil
	return "", nil
}

func (r *run) takeBackProperty(e Entry, p store.Payload) error {
	key, text := propertyOf(p)
	props := slices.Clone(e.Properties)
	i := indexKey(props, key)
	if i < 0 {
		return nil
	}
	if p.Kind == extraction.KindClaim {
		keep := slices.DeleteFunc(lines(props[i].Value), func(l string) bool { return l == text })
		props[i].Value = strings.Join(keep, "\n")
	} else if fold(props[i].Value) != fold(text) {
		return nil
	} else {
		props[i].Value = ""
	}
	if props[i].Value == "" {
		props = slices.Delete(props, i, i+1)
	}
	if err := r.a.bible.SetProperties(e.ID, props); err != nil {
		return err
	}
	r.log("remove-property", e.ID, key)
	return nil
}

// unflag clears the Review flags an automatic acceptance set, once the narrator has made the suggestion theirs.
func (r *run) unflag(s store.Suggestion) error {
	a := s.Applied
	if a == nil {
		return nil
	}
	entries, err := r.a.bible.Entries()
	if err != nil {
		return err
	}
	e, ok := entryByID(entries, a.EntryID)
	if !ok {
		return nil
	}
	if a.Created && e.FlaggedEntry {
		if err := r.a.bible.Unflag(e.ID, ""); err != nil {
			return err
		}
	}
	for _, alias := range a.Aliases {
		if slices.Contains(e.FlaggedAliases, alias) {
			if err := r.a.bible.Unflag(e.ID, alias); err != nil {
				return err
			}
		}
	}
	return nil
}

func refused(sentence string) Result { return Result{Refused: sentence} }

// hold keeps an undecided suggestion waiting with the sentence that says why.
func hold(s *store.Suggestion, sentence string) {
	s.Status, s.Reason = extraction.StatusNeedsVerification, sentence
}

// Accept makes a suggestion the narrator's, with its payload replaced by edited when that is given, and applies it if it was not already.
// Accepting an entry or a name is the review of it, so its Review flag goes. When it cannot be applied the suggestion waits with the
// sentence, and nothing is written to the Story Bible.
func (a *Applier) Accept(id string, edited *store.Payload) (Result, error) {
	all, err := a.store.List()
	if err != nil {
		return Result{}, err
	}
	s, ok := find(all, id)
	switch {
	case !ok:
		return refused(sentenceGone), nil
	case s.Status == extraction.StatusRejected:
		return refused(sentenceRejected), nil
	case edited != nil && edited.Kind != s.Kind:
		return refused(sentenceKindChange), nil
	case edited != nil && !fits(*edited):
		return refused(fmt.Sprintf("A %s suggestion's text does not fit its kind.", s.Kind)), nil
	}
	r := a.newRun()
	if edited != nil {
		if problem, err := r.reverseOne(&s); err != nil || problem != "" {
			return r.refuse(s, problem, err)
		}
		s.Payload = *edited
	}
	if s.Applied == nil {
		if problem, err := r.applyOne(&s, false); err != nil || problem != "" {
			return r.refuse(s, problem, err)
		}
	}
	if err := r.unflag(s); err != nil {
		return r.res, err
	}
	s.Status, s.Reason = extraction.StatusAccepted, ""
	if err := r.save(s); err != nil {
		return r.res, err
	}
	return r.settle()
}

// refuse records why a suggestion could not be applied: it waits, with the sentence, and the caller is told.
func (r *run) refuse(s store.Suggestion, problem string, err error) (Result, error) {
	if err != nil {
		return r.res, err
	}
	hold(&s, problem)
	if err := r.save(s); err != nil {
		return r.res, err
	}
	res, err := r.finish()
	res.Refused = problem
	return res, err
}

// Reject takes back what a suggestion changed and keeps it as a tombstone, so it is not offered again. A suggestion about a locked
// entry cannot be taken back; that is refused with nothing changed.
func (a *Applier) Reject(id string) (Result, error) {
	all, err := a.store.List()
	if err != nil {
		return Result{}, err
	}
	s, ok := find(all, id)
	if !ok {
		return refused(sentenceGone), nil
	}
	r := a.newRun()
	if problem, err := r.reverseOne(&s); err != nil || problem != "" {
		if err != nil {
			return r.res, err
		}
		return refused(problem), nil
	}
	s.Status, s.Reason = extraction.StatusRejected, ""
	if err := r.save(s); err != nil {
		return r.res, err
	}
	return r.settle()
}

// Review makes an automatic acceptance the narrator's and clears the Review flag it set. A suggestion that still needs verification is
// decided with Accept.
func (a *Applier) Review(id string) (Result, error) {
	all, err := a.store.List()
	if err != nil {
		return Result{}, err
	}
	s, ok := find(all, id)
	if !ok {
		return refused(sentenceGone), nil
	}
	if s.Status != extraction.StatusAcceptedAuto || s.Reason != "" || s.Applied == nil {
		return refused(sentenceNothing), nil
	}
	if entries, err := a.bible.Entries(); err != nil {
		return Result{}, err
	} else if e, present := entryByID(entries, s.Applied.EntryID); present && e.Locked {
		return refused(SentenceLocked), nil
	}
	r := a.newRun()
	if err := r.unflag(s); err != nil {
		return r.res, err
	}
	s.Status = extraction.StatusAccepted
	if err := r.save(s); err != nil {
		return r.res, err
	}
	return r.settle()
}

// Settle points suggestions at the entries that exist now, gives each undecided one the status its data says, applies the ones that are
// accepted automatically (flagged Review) and takes back the ones that no longer are. Accepted and rejected suggestions are never touched.
func (a *Applier) Settle() (Result, error) { return a.newRun().settle() }

func (r *run) settle() (Result, error) {
	a := r.a
	for pass := 0; pass < 2; pass++ {
		entries, err := a.bible.Entries()
		if err != nil {
			return r.res, err
		}
		before, err := a.store.List()
		if err != nil {
			return r.res, err
		}
		changed, err := a.store.Settle(storeBible(entries))
		if err != nil {
			return r.res, err
		}
		for _, c := range changed {
			if old, ok := find(before, c.ID); ok {
				r.remember(old)
			}
		}
		all, err := a.store.List()
		if err != nil {
			return r.res, err
		}
		var undecided []store.Suggestion
		for _, s := range all {
			if s.Status == extraction.StatusAcceptedAuto || s.Status == extraction.StatusNeedsVerification {
				undecided = append(undecided, s)
			}
		}
		slices.SortStableFunc(undecided, func(x, y store.Suggestion) int { return order[x.Kind] - order[y.Kind] })
		work := false
		for _, s := range undecided {
			s = clone(s)
			switch {
			case s.Status == extraction.StatusAcceptedAuto && s.Applied == nil:
				problem, err := r.applyOne(&s, true)
				if err != nil {
					return r.res, err
				}
				if problem != "" {
					hold(&s, problem)
				}
				if problem != "" || s.Applied != nil {
					if err := r.save(s); err != nil {
						return r.res, err
					}
					work = true
				}
			case s.Status == extraction.StatusNeedsVerification && s.Applied != nil:
				if problem, err := r.reverseOne(&s); err != nil || problem != "" {
					if err != nil {
						return r.res, err
					}
					continue
				}
				if err := r.save(s); err != nil {
					return r.res, err
				}
				work = true
			}
		}
		if !work {
			break
		}
	}
	return r.finish()
}
