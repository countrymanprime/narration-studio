package store

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// Version is the only suggestions.json version this package reads or writes.
const Version = 1

// what names the file for the narrator in a persist notice or an error.
const what = "suggestions"

// File is where a project's suggestions are kept: inside ManuscriptGuide, which replacing the manuscript removes.
func File(project string) string {
	return filepath.Join(project, "ManuscriptGuide", "suggestions.json")
}

type fileData struct {
	Version     int          `json:"version"`
	Suggestions []Suggestion `json:"suggestions"`
}

// Entry is a Story Bible entry as the store needs it to attach a suggestion: its id, its name and its other names.
type Entry struct {
	ID      string
	Name    string
	Aliases []string
}

// Bible is the Story Bible as it is now.
type Bible []Entry

// Resolve finds the entry a reference points at: its id, its name or any of its names, ignoring case.
func (b Bible) Resolve(ref string) (string, bool) {
	key := strings.ToLower(strings.TrimSpace(ref))
	if key == "" {
		return "", false
	}
	for _, e := range b {
		if strings.ToLower(e.ID) == key {
			return e.ID, true
		}
	}
	for _, e := range b {
		if strings.ToLower(e.Name) == key {
			return e.ID, true
		}
	}
	for _, e := range b {
		for _, a := range e.Aliases {
			if strings.ToLower(a) == key {
				return e.ID, true
			}
		}
	}
	return "", false
}

// Quote is a stretch of text a source says backs a suggestion. The paragraph is a hint; the text is what is searched for.
type Quote struct {
	ParagraphID string
	Text        string
}

// Raw is what a source offers: no id, no offsets, no status. Confidence is nil when the source gave none.
type Raw struct {
	Payload    Payload
	Confidence *float64
	Quotes     []Quote
	ChapterID  string
	Flag       string
	Note       string
}

// Context is what an ingest checks a source's suggestions against.
type Context struct {
	Paragraphs []extraction.Paragraph
	Bible      Bible
	// At is when the suggestions were offered.
	At time.Time
}

// Result says what an ingest did.
type Result struct {
	Added []Suggestion
	// Skipped are the offers that were already stored or rejected before.
	Skipped []Raw
}

// Config is what a Service needs.
type Config struct {
	// Project is the project folder; empty means no project is open, and nothing is read or saved.
	Project string
	// Reporter tells the narrator about a file that cannot be read (ADR 0069); nil only logs nothing.
	Reporter *persist.Reporter
}

// Service reads and writes a project's suggestions. It holds no state, so the host builds one per call; the
// read-modify-write of the file is serialised by lockFile.
type Service struct {
	config Config
}

// New returns the service for config.
func New(config Config) *Service { return &Service{config: config} }

var fileLocks sync.Map

// lockFile serialises every change to one project's file across services built for the same project.
// +checklocksignore
func lockFile(path string) func() {
	lock, _ := fileLocks.LoadOrStore(filepath.Clean(path), &sync.Mutex{})
	mutex, _ := lock.(*sync.Mutex)
	mutex.Lock()
	return mutex.Unlock
}

var errNoProject = errors.New("save the project first")

// List returns every suggestion in the order they were stored, tombstones included.
func (s *Service) List() ([]Suggestion, error) {
	if s.config.Project == "" {
		return []Suggestion{}, nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return []Suggestion{}, err
	}
	return file.Suggestions, nil
}

// Ingest stores what a source offered. Each quote is looked up in the manuscript, never trusting the source's offsets;
// the status follows the rule at ingest. An offer whose fingerprint is stored already, rejected or not, is skipped, even
// if the stored one's text was edited since. An offer that breaks a rule refuses the whole call and nothing is stored.
func (s *Service) Ingest(source Source, raws []Raw, ctx Context) (Result, error) {
	if s.config.Project == "" {
		return Result{}, errNoProject
	}
	if !validSource(source) {
		return Result{}, fmt.Errorf("%q is not a place suggestions come from", source)
	}
	for _, raw := range raws {
		if err := checkRaw(raw); err != nil {
			return Result{}, err
		}
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return Result{}, err
	}
	seen := make(map[string]bool, len(file.Suggestions))
	for _, existing := range file.Suggestions {
		seen[existing.Fp] = true
		seen[extraction.Fingerprint(existing.Payload.Core())] = true
	}
	var result Result
	for _, raw := range raws {
		fp := extraction.Fingerprint(raw.Payload.Core())
		if seen[fp] {
			result.Skipped = append(result.Skipped, raw)
			continue
		}
		seen[fp] = true
		suggestion := build(raw, source, fp, nextID(file.Suggestions), ctx)
		if err := check(suggestion); err != nil {
			return Result{}, err
		}
		file.Suggestions = append(file.Suggestions, suggestion)
		result.Added = append(result.Added, suggestion)
	}
	if len(result.Added) == 0 {
		return result, nil
	}
	if err := s.write(file); err != nil {
		return Result{}, err
	}
	return result, nil
}

func checkRaw(raw Raw) error {
	if err := checkPayload(raw.Payload); err != nil {
		return err
	}
	if !validConfidence(raw.Confidence) {
		return errors.New("a suggestion has a confidence outside 0 to 1")
	}
	if raw.Flag != "" && raw.Flag != FlagDuplicate {
		return fmt.Errorf("a suggestion has a flag that is not %q", FlagDuplicate)
	}
	return nil
}

// nextID is the first sN not in use, counting from one more than the suggestions there are.
func nextID(stored []Suggestion) string {
	used := make(map[string]bool, len(stored))
	for _, s := range stored {
		used[s.ID] = true
	}
	for n := len(stored) + 1; ; n++ {
		if id := "s" + strconv.Itoa(n); !used[id] {
			return id
		}
	}
}

// build makes the stored suggestion for an offer: quotes looked up in the text, the entry attached if it exists, the
// status from the rule.
func build(raw Raw, source Source, fp, id string, ctx Context) Suggestion {
	suggestion := Suggestion{ID: id, Kind: raw.Payload.Kind, Payload: raw.Payload, Evidence: []Evidence{}, Confidence: raw.Confidence, Source: source,
		Fp: fp, Flag: raw.Flag, Note: raw.Note, ChapterID: raw.ChapterID, CreatedAt: ctx.At.UTC()}
	missing := ""
	for _, quote := range raw.Quotes {
		found, ok := extraction.VerifyEvidence(ctx.Paragraphs, quote.Text, extraction.QuoteHint{ParagraphID: quote.ParagraphID, ChapterID: raw.ChapterID})
		if ok {
			suggestion.Evidence = append(suggestion.Evidence, Evidence{ParagraphID: found.ParagraphID, Start: found.Start, End: found.End, Text: found.Text})
		} else if missing == "" {
			missing = quote.Text
		}
	}
	suggestion.UnverifiedQuote = missing
	suggestion.attach(ctx.Bible)
	suggestion.rule()
	return suggestion
}

// attach points a suggestion at the entry it is about, if the Story Bible has one now. One pointing at an entry that is gone (an
// import's undo removed it) is pointed again, or waits.
func (s *Suggestion) attach(bible Bible) {
	if s.EntryID != nil {
		if slices.ContainsFunc(bible, func(e Entry) bool { return e.ID == *s.EntryID }) {
			return
		}
		s.EntryID = nil
	}
	if id, ok := bible.Resolve(s.Payload.EntryRef()); ok {
		s.EntryID = &id
	}
}

func sameEntry(a, b *string) bool { return (a == nil) == (b == nil) && (a == nil || *a == *b) }

// Settle points suggestions that were waiting for an entry at the entries the Story Bible has now and gives each
// undecided one the status its data says. Accepted and rejected suggestions are never touched. It returns the ones it changed.
func (s *Service) Settle(bible Bible) ([]Suggestion, error) {
	if s.config.Project == "" {
		return []Suggestion{}, nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return []Suggestion{}, err
	}
	changed := []Suggestion{}
	for i := range file.Suggestions {
		current := &file.Suggestions[i]
		if current.Status != extraction.StatusAcceptedAuto && current.Status != extraction.StatusNeedsVerification {
			continue
		}
		before := *current
		current.attach(bible)
		current.rule()
		if current.Status != before.Status || current.Reason != before.Reason || !sameEntry(current.EntryID, before.EntryID) {
			changed = append(changed, *current)
		}
	}
	if len(changed) == 0 {
		return changed, nil
	}
	return changed, s.write(file)
}

// Accept makes a suggestion the narrator's, with its payload replaced by edited when that is given. It returns the
// suggestion as it was, so the caller can put it back with Restore. A rejected suggestion cannot be accepted.
func (s *Service) Accept(id string, edited *Payload) (Suggestion, error) {
	return s.decide(id, func(current *Suggestion) error {
		if current.Status == extraction.StatusRejected {
			return errors.New("that suggestion was rejected, so it cannot be accepted")
		}
		if edited != nil {
			if edited.Kind != current.Kind {
				return errors.New("the kind of a suggestion cannot change")
			}
			if err := checkPayload(*edited); err != nil {
				return err
			}
			current.Payload = *edited
		}
		current.Status, current.Reason = extraction.StatusAccepted, ""
		return nil
	})
}

// Reject keeps a suggestion as a tombstone, so it is not offered again. It returns the suggestion as it was.
func (s *Service) Reject(id string) (Suggestion, error) {
	return s.decide(id, func(current *Suggestion) error {
		current.Status, current.Reason = extraction.StatusRejected, ""
		return nil
	})
}

// Review makes an automatic acceptance the narrator's. A suggestion that needs verification is decided with Accept.
// It returns the suggestion as it was.
func (s *Service) Review(id string) (Suggestion, error) {
	return s.decide(id, func(current *Suggestion) error {
		if current.Status != extraction.StatusAcceptedAuto {
			return errors.New("there is nothing to review")
		}
		current.Status, current.Reason = extraction.StatusAccepted, ""
		return nil
	})
}

// Restore puts a suggestion back as it was, by id: the undo of a decision. A suggestion that is gone is added again.
func (s *Service) Restore(previous Suggestion) error {
	if s.config.Project == "" {
		return errNoProject
	}
	if err := check(previous); err != nil {
		return err
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return err
	}
	for i := range file.Suggestions {
		if file.Suggestions[i].ID == previous.ID {
			file.Suggestions[i] = previous
			return s.write(file)
		}
	}
	file.Suggestions = append(file.Suggestions, previous)
	return s.write(file)
}

// Remove deletes the suggestions with these ids in one write, leaving no tombstone, so the same offer is stored again later: the undo
// of an import. An id that is not stored is passed over.
func (s *Service) Remove(ids []string) error {
	if s.config.Project == "" {
		return errNoProject
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return err
	}
	kept := slices.DeleteFunc(slices.Clone(file.Suggestions), func(x Suggestion) bool { return slices.Contains(ids, x.ID) })
	if len(kept) == len(file.Suggestions) {
		return nil
	}
	file.Suggestions = kept
	return s.write(file)
}

func (s *Service) decide(id string, change func(*Suggestion) error) (Suggestion, error) {
	if s.config.Project == "" {
		return Suggestion{}, errNoProject
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return Suggestion{}, err
	}
	for i := range file.Suggestions {
		if file.Suggestions[i].ID != id {
			continue
		}
		previous := file.Suggestions[i]
		if err := change(&file.Suggestions[i]); err != nil {
			return Suggestion{}, err
		}
		if err := s.write(file); err != nil {
			return Suggestion{}, err
		}
		return previous, nil
	}
	return Suggestion{}, errors.New("that suggestion is no longer there")
}

// decode checks a file's bytes against every rule. The error is a sentence for the narrator; nothing is loaded when it is not nil.
func decode(raw []byte) (fileData, error) {
	if len(raw) > MaxFileBytes {
		return fileData{}, fmt.Errorf("the suggestions file is over the %d MB limit", MaxFileBytes>>20)
	}
	var file fileData
	if err := json.Unmarshal(raw, &file); err != nil {
		return fileData{}, errors.New("the suggestions file is not valid")
	}
	if file.Version > Version {
		return file, nil
	}
	if len(file.Suggestions) > MaxSuggestions {
		return fileData{}, fmt.Errorf("the suggestions file holds more than %d suggestions", MaxSuggestions)
	}
	seen := make(map[string]bool, len(file.Suggestions))
	for _, suggestion := range file.Suggestions {
		if err := check(suggestion); err != nil {
			return fileData{}, err
		}
		if seen[suggestion.ID] {
			return fileData{}, fmt.Errorf("suggestion %s is in the file twice", suggestion.ID)
		}
		seen[suggestion.ID] = true
	}
	return file, nil
}

// read reads suggestions.json; the caller holds the file's lock. A corrupt file, or one that breaks a rule, is kept
// aside and an empty list starts; one written by a newer app is refused and never overwritten.
func (s *Service) read() (fileData, error) {
	file := fileData{Version: Version, Suggestions: []Suggestion{}}
	newer := 0
	var decoded fileData
	outcome := s.config.Reporter.ReadJSON(File(s.config.Project), what, persist.NarratorData, func(raw []byte) error {
		candidate, err := decode(raw)
		if err != nil {
			return err
		}
		if candidate.Version > Version {
			newer = candidate.Version
			return nil
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing, persist.Quarantined, persist.Healed:
		return file, nil
	case persist.Unreadable:
		return fileData{}, fmt.Errorf("your %s file could not be read, so nothing was changed", what)
	}
	if err := persist.CheckVersion(newer, Version, what); err != nil {
		return fileData{}, err
	}
	if decoded.Suggestions != nil {
		file.Suggestions = decoded.Suggestions
	}
	return file, nil
}

// write replaces suggestions.json through a temporary file and a rename; the caller holds the file's lock.
func (s *Service) write(file fileData) error {
	file.Version = Version
	if len(file.Suggestions) > MaxSuggestions {
		return fmt.Errorf("a project keeps at most %d suggestions, rejected ones included", MaxSuggestions)
	}
	path := File(s.config.Project)
	encoded, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	if len(encoded) > MaxFileBytes {
		return fmt.Errorf("the suggestions file would be over the %d MB limit", MaxFileBytes>>20)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the project's ManuscriptGuide folder: %w", err)
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, bytes.TrimSpace(encoded), 0o600); err != nil {
		return fmt.Errorf("could not write the %s file: %w", what, err)
	}
	if err := os.Rename(temporary, path); err != nil {
		return fmt.Errorf("could not activate the %s file: %w", what, err)
	}
	return nil
}
