package importer

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
)

// Entry is a Story Bible entry as the plan reads it.
type Entry struct {
	ID      string
	Name    string
	Aliases []string
	Locked  bool
}

// Chapter is a manuscript chapter a cell can name by id, number or heading.
type Chapter struct {
	ID     string
	Number int
	Title  string
}

// Book is what the plan reads: the Story Bible, the manuscript, and what was already offered. Seen maps a suggestion's
// fingerprint to its status, so a row offered or rejected before is skipped.
type Book struct {
	Entries    []Entry
	Chapters   []Chapter
	Paragraphs []extraction.Paragraph
	Seen       map[string]extraction.Status
}

// Action is what importing a row does.
type Action string

// The actions. Nothing is ever deleted.
const (
	ActionAdd   Action = "add"
	ActionMerge Action = "merge"
	ActionSkip  Action = "skip"
)

// Line is the preview of one row. Status is empty for a skipped row. Evidence holds what the evidence check found in
// the manuscript for the row's quote; a quote it did not find is in Reasons as ReasonQuoteNotFound.
type Line struct {
	Row        int
	Where      string
	Item       Item
	Label      string
	Action     Action
	Status     extraction.Status
	Confidence *float64
	Reasons    []extraction.Reason
	Evidence   []extraction.Evidence
	ChapterID  string
	Note       string
}

// Plan is what an import would do: a line per row that can be read, and an error per row that cannot.
type Plan struct {
	Lines  []Line
	Errors []RowError
}

// Offered returns the lines that add or merge, in file order. Accepting the import ingests exactly these.
func (p Plan) Offered() []Line {
	var out []Line
	for _, l := range p.Lines {
		if l.Action != ActionSkip {
			out = append(out, l)
		}
	}
	return out
}

func key(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

// resolve finds the entry a reference names: by id, name or alias, ignoring case.
func (b Book) resolve(ref string) (Entry, bool) {
	k := key(ref)
	if k == "" {
		return Entry{}, false
	}
	for _, match := range []func(Entry) bool{
		func(e Entry) bool { return key(e.ID) == k },
		func(e Entry) bool { return key(e.Name) == k },
		func(e Entry) bool {
			for _, a := range e.Aliases {
				if key(a) == k {
					return true
				}
			}
			return false
		},
	} {
		for _, e := range b.Entries {
			if match(e) {
				return e, true
			}
		}
	}
	return Entry{}, false
}

func (b Book) chapter(ref string) string {
	k := key(ref)
	if k == "" {
		return ""
	}
	for _, c := range b.Chapters {
		if key(c.ID) == k {
			return c.ID
		}
	}
	for _, c := range b.Chapters {
		if c.Number != 0 && strconv.Itoa(c.Number) == k {
			return c.ID
		}
	}
	for _, c := range b.Chapters {
		if key(c.Title) == k {
			return c.ID
		}
	}
	return ""
}

func payload(it Item) extraction.Payload {
	switch it.Record {
	case RecordEntry:
		return extraction.Payload{Kind: extraction.KindEntry, Name: it.Name, Type: it.Type, Aliases: it.Aliases, Description: it.Description, AppearsIn: it.AppearsIn}
	case RecordProperty:
		return extraction.Payload{Kind: extraction.KindProperty, Entry: it.Entry, Key: it.Key, Value: it.Value}
	case RecordRelationship:
		return extraction.Payload{Kind: extraction.KindRelationship, Entry: it.Entry, To: it.To, Relation: it.Relation}
	case RecordClaim:
		return extraction.Payload{Kind: extraction.KindClaim, Entry: it.Entry, Claim: it.Claim, Text: it.Text}
	}
	return extraction.Payload{Kind: extraction.KindSpeaker, Quote: it.Quote, Speaker: it.Speaker}
}

func label(it Item) string {
	switch it.Record {
	case RecordEntry:
		if it.Type != "" {
			return it.Name + " · " + it.Type
		}
		return it.Name
	case RecordProperty:
		return it.Entry + ": " + it.Key + " = " + it.Value
	case RecordRelationship:
		return it.Entry + " " + it.Relation + " " + it.To
	case RecordClaim:
		verb := map[extraction.ClaimKind]string{extraction.ClaimTalk: "says", extraction.ClaimAct: "does", extraction.ClaimKnow: "knows"}[it.Claim]
		return it.Entry + " " + verb + ": " + it.Text
	}
	return it.Speaker + ": " + it.Quote
}

// refsOf lists the entries a row is about, which must exist in the Story Bible or in the file.
func refsOf(it Item) []string {
	switch it.Record {
	case RecordProperty, RecordClaim:
		return []string{it.Entry}
	case RecordRelationship:
		return []string{it.Entry, it.To}
	case RecordSpeaker:
		return []string{it.Speaker}
	}
	return nil
}

// PlanImport works out what importing rows into book would do. Review status comes from extraction.AutoStatus over a
// Candidate built the same way the accept path builds it, and a quote is checked against the manuscript with
// extraction.VerifyEvidence, so the preview and the accept cannot disagree. A row about an entry that is in neither the
// Story Bible nor the file is an error. A locked entry is never edited (ADR 0007): a row that would change it is skipped.
// Nothing is deleted.
func PlanImport(book Book, rows []Row, parseErrors []RowError) Plan {
	plan := Plan{Errors: append([]RowError(nil), parseErrors...)}
	inFile := map[string]bool{}
	for _, r := range rows {
		if r.Item.Record == RecordEntry {
			inFile[key(r.Item.Name)] = true
			for _, a := range r.Item.Aliases {
				inFile[key(a)] = true
			}
		}
	}
	seen := map[string]extraction.Status{}
	for fp, s := range book.Seen {
		seen[fp] = s
	}
	// Entries first, as when they are added: the other rows may be about them.
	order := make([]Row, 0, len(rows))
	for _, r := range rows {
		if r.Item.Record == RecordEntry {
			order = append(order, r)
		}
	}
	for _, r := range rows {
		if r.Item.Record != RecordEntry {
			order = append(order, r)
		}
	}
	for _, r := range order {
		it := r.Item
		if bad := missingRef(book, inFile, it); bad != "" {
			plan.Errors = append(plan.Errors, RowError{Row: r.Row, Where: r.Where, Reason: "No entry “" + bad + "” in the Story Bible or in this file."})
			continue
		}
		l := Line{Row: r.Row, Where: r.Where, Item: it, Label: label(it), Confidence: it.Confidence}
		fp := extraction.Fingerprint(payload(it))
		var notes []string
		switch prior, dup := seen[fp]; {
		case dup:
			l.Action, l.Note = ActionSkip, "Already suggested"
			if prior == extraction.StatusRejected {
				l.Note = "Rejected before"
			}
		default:
			notes = plan.decide(book, &l)
		}
		if l.Action != ActionSkip {
			seen[fp] = l.Status
			l.Note = strings.TrimSpace(strings.Join(append(notes, l.Note), " "))
		}
		plan.Lines = append(plan.Lines, l)
	}
	sort.SliceStable(plan.Lines, func(a, b int) bool { return plan.Lines[a].Row < plan.Lines[b].Row })
	sort.SliceStable(plan.Errors, func(a, b int) bool { return plan.Errors[a].Row < plan.Errors[b].Row })
	return plan
}

func missingRef(book Book, inFile map[string]bool, it Item) string {
	for _, ref := range refsOf(it) {
		if _, ok := book.resolve(ref); !ok && !inFile[key(ref)] {
			return ref
		}
	}
	return ""
}

// decide sets the action, status, reasons and evidence of one line, and returns notes to put before its own.
func (p *Plan) decide(book Book, l *Line) []string {
	it := l.Item
	var notes []string
	if it.Record == RecordEntry {
		return p.decideEntry(book, l)
	}
	if ref := refsOf(it)[0]; it.Record != RecordSpeaker {
		if e, ok := book.resolve(ref); ok && e.Locked {
			l.Action, l.Note = ActionSkip, "Locked entry; it is not edited"
			return nil
		}
	}
	// The first entry a row names is the one it belongs to; one that is only in the file stands in until it is added.
	entryID := ""
	if ref := refsOf(it)[0]; it.Record != RecordSpeaker {
		if e, ok := book.resolve(ref); ok {
			entryID = e.ID
		} else {
			entryID = "file:" + key(ref)
		}
	}
	cand := extraction.Candidate{Kind: payload(it).Kind, Confidence: it.Confidence, EntryID: entryID}
	if it.Chapter != "" {
		if l.ChapterID = book.chapter(it.Chapter); l.ChapterID == "" {
			notes = append(notes, fmt.Sprintf("chapter “%s” not found.", it.Chapter))
		}
	}
	quote := it.Evidence
	if it.Record == RecordSpeaker {
		quote = it.Quote
	}
	if quote != "" {
		if ev, ok := extraction.VerifyEvidence(book.Paragraphs, quote, extraction.QuoteHint{ParagraphID: it.Paragraph, ChapterID: l.ChapterID}); ok {
			cand.Evidence = []extraction.Evidence{ev}
		} else {
			cand.UnverifiedQuote = quote
		}
	}
	l.Evidence = cand.Evidence
	l.Action = ActionAdd
	l.Reasons = extraction.ReasonsOf(cand)
	l.Status = extraction.AutoStatus(cand)
	l.Note = joinReasons(l.Reasons)
	return notes
}

func (p *Plan) decideEntry(book Book, l *Line) []string {
	it := l.Item
	names := append([]string{it.Name}, it.Aliases...)
	var found Entry
	var matched bool
	for _, n := range names {
		if found, matched = book.resolve(n); matched {
			break
		}
	}
	cand := extraction.Candidate{Kind: extraction.KindEntry, Confidence: it.Confidence}
	l.Reasons = extraction.ReasonsOf(cand)
	l.Status = extraction.AutoStatus(cand)
	if !matched {
		l.Action = ActionAdd
		l.Note = joinReasons(l.Reasons)
		return nil
	}
	if found.Locked {
		l.Action, l.Status, l.Reasons, l.Note = ActionSkip, "", nil, "Locked entry; it is not edited"
		return nil
	}
	have := map[string]bool{key(found.Name): true}
	for _, a := range found.Aliases {
		have[key(a)] = true
	}
	var added []string
	for _, n := range names {
		if !have[key(n)] {
			have[key(n)] = true
			added = append(added, n)
		}
	}
	if len(added) == 0 {
		l.Action, l.Status, l.Reasons, l.Note = ActionSkip, "", nil, "Already in the Story Bible"
		return nil
	}
	l.Action = ActionMerge
	l.Note = joinReasons(l.Reasons)
	return []string{"adds " + strings.Join(added, ", ") + "."}
}

func joinReasons(rs []extraction.Reason) string {
	parts := make([]string, len(rs))
	for i, r := range rs {
		parts[i] = string(r)
	}
	return strings.Join(parts, " ")
}
