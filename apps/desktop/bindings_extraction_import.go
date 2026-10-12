package main

import (
	"errors"
	"slices"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/apply"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/importer"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/store"
)

// A Story Bible written outside the app, imported (the `storybible-import` format, docs/reference/storybible-import-format.md).
// The page reads the file the narrator chose and sends its text; no binding takes a path, so the host opens nothing and fetches
// nothing. The text is untrusted: internal/extraction/importer refuses it over its caps before it builds a row, and the preview and the
// commit both parse and plan it here, from the text, so the commit never takes the page's word for what the preview said. This file
// imports no os, net or exec package (a test checks).

const sentenceUnknownFormat = "That is not a format the import reads."

// ExtractionImportLine is one row of the preview: where it is in the file, what it is about, what importing it does, the status the 75%
// rule gives it (empty for a skipped row), its confidence (nil when the file gave none) and why it is skipped, what a merge adds or why
// it needs verification.
type ExtractionImportLine struct {
	Row        int               `json:"row"`
	Where      string            `json:"where"`
	Kind       importer.Record   `json:"kind"`
	Label      string            `json:"label"`
	Action     importer.Action   `json:"action"`
	Status     extraction.Status `json:"status,omitempty"`
	Confidence *float64          `json:"confidence"`
	Note       string            `json:"note"`
}

// ExtractionImportError is a row that cannot be read, or the refusal of the whole file (Row 0).
type ExtractionImportError struct {
	Row    int    `json:"row"`
	Where  string `json:"where"`
	Reason string `json:"reason"`
}

// ExtractionImportPlan is what importing a text would do. Format is the one it was read as, empty for a file refused before it was
// read; Offered counts the lines that add or merge, which is what a commit ingests.
type ExtractionImportPlan struct {
	Format  importer.Format         `json:"format,omitempty"`
	Lines   []ExtractionImportLine  `json:"lines"`
	Errors  []ExtractionImportError `json:"errors"`
	Offered int                     `json:"offered"`
}

// ExtractionImportResult is what a commit did: the suggestions it stored, as they are after the accepted ones were applied, the ids of
// the Story Bible entries it changed, and how many lines it skipped. The UI records it as one undo step.
type ExtractionImportResult struct {
	Suggestions []store.Suggestion `json:"suggestions"`
	EntryIDs    []string           `json:"entryIds"`
	Skipped     int                `json:"skipped"`
}

// ExtractionImportPromptText is the prompt the narrator copies into an LLM of their choice for one format, the example it contains,
// and the size the page checks a chosen file against before reading it.
type ExtractionImportPromptText struct {
	Format   importer.Format `json:"format"`
	Prompt   string          `json:"prompt"`
	Example  string          `json:"example"`
	MaxBytes int             `json:"maxBytes"`
}

// ExtractionImportPreview works out what importing text would do, against the Story Bible, the manuscript and the suggestions as they
// are now. hint is "csv", "json" or "" (worked out from the text). It writes nothing.
func (h *Host) ExtractionImportPreview(text string, hint string) (string, error) {
	format, err := importFormat(hint, true)
	if err != nil {
		return "", err
	}
	bible := h.extractionBibleOf()
	if bible == nil {
		return "", errors.New(sentenceBibleUnavailable)
	}
	extractionDecisions.Lock()
	defer extractionDecisions.Unlock()
	parsed := importer.Parse([]byte(text), format)
	if importRefused(parsed) {
		return encodeBinding(wirePlan(parsed.Format, importer.Plan{Errors: parsed.Errors}), nil)
	}
	plan, _, err := h.planImport(bible, parsed)
	if err != nil {
		return "", err
	}
	return encodeBinding(wirePlan(parsed.Format, plan), nil)
}

// ExtractionImportCommit parses and plans text again and stores the rows that add or merge as suggestions from an imported file, in one
// write: all of them or, when the write fails, none. The ones the 75% rule accepts are applied through the Story Bible's own commands
// and flagged for Review; if that fails, the error is returned and the stored suggestions wait for the next settle (a scan or a
// decision), as a scan's do. A file refused before parsing is refused with the importer's sentence.
func (h *Host) ExtractionImportCommit(text string, hint string) (string, error) {
	format, err := importFormat(hint, true)
	if err != nil {
		return "", err
	}
	bible := h.extractionBibleOf()
	if bible == nil {
		return "", errors.New(sentenceBibleUnavailable)
	}
	extractionDecisions.Lock()
	defer extractionDecisions.Unlock()
	parsed := importer.Parse([]byte(text), format)
	if importRefused(parsed) {
		return "", extractionRefusal(parsed.Errors[0].Reason)
	}
	plan, paragraphs, err := h.planImport(bible, parsed)
	if err != nil {
		return "", err
	}
	offered := plan.Offered()
	result := ExtractionImportResult{Suggestions: []store.Suggestion{}, EntryIDs: []string{}, Skipped: len(plan.Lines) - len(offered)}
	if len(offered) == 0 {
		return encodeBinding(result, nil)
	}
	raws := make([]store.Raw, len(offered))
	for i, line := range offered {
		raws[i] = importRaw(line)
	}
	entries, err := bible.Entries()
	if err != nil {
		return "", err
	}
	suggestions := h.extractionStore()
	ingested, err := suggestions.Ingest(store.SourceImported, raws, store.Context{Paragraphs: paragraphs, Bible: storeBibleOf(entries), At: time.Now()})
	if err != nil {
		return "", err
	}
	result.Skipped += len(ingested.Skipped)
	applied, err := apply.New(suggestions, bible).Settle()
	if err != nil {
		return "", err
	}
	for _, change := range applied.Changes {
		if change.EntryID != "" && !slices.Contains(result.EntryIDs, change.EntryID) {
			result.EntryIDs = append(result.EntryIDs, change.EntryID)
		}
	}
	now, err := suggestions.List()
	if err != nil {
		return "", err
	}
	for _, added := range ingested.Added {
		if i := slices.IndexFunc(now, func(s store.Suggestion) bool { return s.ID == added.ID }); i >= 0 {
			result.Suggestions = append(result.Suggestions, now[i])
		}
	}
	return encodeBinding(result, nil)
}

// ExtractionImportPrompt returns the prompt for format ("csv" or "json"): importer.Prompt's text, which is what Copy puts on the
// clipboard, with the example it contains and the byte cap.
func (h *Host) ExtractionImportPrompt(format string) (string, error) {
	f, err := importFormat(format, false)
	if err != nil {
		return "", err
	}
	example := importer.ExampleJSON
	if f == importer.FormatCSV {
		example = importer.ExampleCSV
	}
	return encodeBinding(ExtractionImportPromptText{Format: f, Prompt: importer.Copy(f), Example: example, MaxBytes: importer.MaxBytes}, nil)
}

func importFormat(hint string, detect bool) (importer.Format, error) {
	switch f := importer.Format(hint); {
	case f == importer.FormatCSV || f == importer.FormatJSON:
		return f, nil
	case f == "" && detect:
		return "", nil
	}
	return "", extractionRefusal(sentenceUnknownFormat)
}

// importRefused says whether Parse refused the whole file before reading a row: over a cap, not UTF-8 text, a NUL, or nothing in it.
func importRefused(parsed importer.Result) bool {
	return len(parsed.Rows) == 0 && len(parsed.Errors) == 1 && parsed.Errors[0].Row == 0
}

// planImport plans parsed rows against the Story Bible, the manuscript and every suggestion stored, tombstones included. The caller
// holds extractionDecisions, so the plan and a commit see the same suggestions.
func (h *Host) planImport(bible apply.Bible, parsed importer.Result) (importer.Plan, []extraction.Paragraph, error) {
	svc := h.services()
	paragraphs, err := h.extractionParagraphsOf(svc)
	if err != nil {
		return importer.Plan{}, nil, err
	}
	chapters, err := h.extractionChaptersOf(svc)
	if err != nil {
		return importer.Plan{}, nil, err
	}
	entries, err := bible.Entries()
	if err != nil {
		return importer.Plan{}, nil, err
	}
	stored, err := h.extractionStore().List()
	if err != nil {
		return importer.Plan{}, nil, err
	}
	book := importer.Book{Chapters: chapters, Paragraphs: paragraphs, Seen: map[string]extraction.Status{}}
	for _, e := range entries {
		book.Entries = append(book.Entries, importer.Entry{ID: e.ID, Name: e.Name, Aliases: slices.Clone(e.Aliases), Locked: e.Locked})
	}
	for _, s := range stored {
		book.Seen[s.Fp] = s.Status
		book.Seen[extraction.Fingerprint(s.Payload.Core())] = s.Status
	}
	return importer.PlanImport(book, parsed.Rows, parsed.Errors), paragraphs, nil
}

// importRaw is a planned line as the store takes an offer: the quote the file gave goes in as a quote to look up in the manuscript, so
// what is stored as evidence is the manuscript's own text.
func importRaw(line importer.Line) store.Raw {
	it := line.Item
	raw := store.Raw{Confidence: it.Confidence, ChapterID: line.ChapterID}
	quote := func(text string) {
		if text != "" {
			raw.Quotes = []store.Quote{{ParagraphID: it.Paragraph, Text: text}}
		}
	}
	switch it.Record {
	case importer.RecordEntry:
		raw.Payload = store.Payload{Kind: extraction.KindEntry, Name: it.Name, Type: it.Type, Aliases: it.Aliases, Description: it.Description, AppearsIn: it.AppearsIn}
	case importer.RecordProperty:
		raw.Payload = store.Payload{Kind: extraction.KindProperty, Entry: it.Entry, Key: it.Key, Value: it.Value}
		quote(it.Evidence)
	case importer.RecordRelationship:
		raw.Payload = store.Payload{Kind: extraction.KindRelationship, Entry: it.Entry, To: it.To, Relation: it.Relation}
	case importer.RecordClaim:
		raw.Payload = store.Payload{Kind: extraction.KindClaim, Entry: it.Entry, Claim: it.Claim, Text: it.Text}
		quote(it.Evidence)
	case importer.RecordSpeaker:
		raw.Payload = store.Payload{Kind: extraction.KindSpeaker, Quote: it.Quote, Speaker: it.Speaker}
		quote(it.Quote)
	}
	return raw
}

func storeBibleOf(entries []apply.Entry) store.Bible {
	known := make(store.Bible, 0, len(entries))
	for _, e := range entries {
		known = append(known, store.Entry{ID: e.ID, Name: e.Name, Aliases: slices.Clone(e.Aliases)})
	}
	return known
}

func wirePlan(format importer.Format, plan importer.Plan) ExtractionImportPlan {
	out := ExtractionImportPlan{Format: format, Lines: []ExtractionImportLine{}, Errors: []ExtractionImportError{}}
	for _, l := range plan.Lines {
		out.Lines = append(out.Lines, ExtractionImportLine{Row: l.Row, Where: l.Where, Kind: l.Item.Record, Label: l.Label, Action: l.Action,
			Status: l.Status, Confidence: l.Confidence, Note: l.Note})
		if l.Action != importer.ActionSkip {
			out.Offered++
		}
	}
	for _, e := range plan.Errors {
		out.Errors = append(out.Errors, ExtractionImportError{Row: e.Row, Where: e.Where, Reason: e.Reason})
	}
	return out
}

// extractionChaptersOf is the manuscript's chapters as an import cell names them: by id, by number (its place, from 1) or by heading.
func (h *Host) extractionChaptersOf(svc hostServices) ([]importer.Chapter, error) {
	if h.extractionChapters != nil {
		return h.extractionChapters()
	}
	if svc.manuscript == nil {
		return nil, nil
	}
	data, err := svc.manuscript.Load()
	if err != nil {
		return nil, err
	}
	var chapters []importer.Chapter
	for i, chapter := range manuscriptObjects(data["chapters"]) {
		id, _ := chapter["id"].(string)
		title, _ := chapter["title"].(string)
		if id != "" {
			chapters = append(chapters, importer.Chapter{ID: id, Number: i + 1, Title: title})
		}
	}
	return chapters, nil
}
