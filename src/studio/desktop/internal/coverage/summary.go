package coverage

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sync"

	"desktop/internal/evidence"
	"desktop/internal/persist"
)

// resultSummaryVersion is the version of a stored result summary. Raise it when ResultSummary's fields or what summarize
// puts in them change, ClassifyGaps included: a summary of another version is rebuilt from its result.
const resultSummaryVersion = 1

// ResultSummary is the part of a stored result that a read of every chapter needs: the counts, the paragraph lines and the
// gaps. A stored result is mostly its per-word alignment (about 800 KB for a 3,500 word chapter), and the chapter list
// decoded every chapter's only to read these (issue 3802). Every field is a function of the stored result alone. Whether
// the check is current and how far the chapter is recorded are not here: they are judged on every read against the saved
// project, the settings and the manuscript.
type ResultSummary struct {
	SchemaVersion  int    `json:"schemaVersion"`
	RecordID       string `json:"recordId"`
	DocumentID     string `json:"documentId"`
	ChapterID      string `json:"chapterId"`
	ManuscriptHash string `json:"manuscriptHash"`
	// Summary and Paragraphs are the report's own.
	Summary    Summary         `json:"summary"`
	Paragraphs []ParagraphLine `json:"paragraphs"`
	// Gaps and Unfinished are ClassifyGaps of the report.
	Gaps       []GapLine  `json:"gaps"`
	Unfinished Unfinished `json:"unfinished"`
}

// PresentFraction is the report's (Report.PresentFraction).
func (s ResultSummary) PresentFraction() float64 { return Report{Summary: s.Summary}.PresentFraction() }

func summarize(result StoredResult) ResultSummary {
	gaps, unfinished := ClassifyGaps(result.Report)
	return ResultSummary{
		SchemaVersion: resultSummaryVersion, RecordID: result.RecordID, DocumentID: result.DocumentID, ChapterID: result.ChapterID,
		ManuscriptHash: result.ManuscriptHash, Summary: result.Report.Summary, Paragraphs: nonNil(result.Report.Paragraphs),
		Gaps: gaps, Unfinished: unfinished,
	}
}

// summaryStore keeps one ResultSummary per stored result, in a file named by the record's id and in memory. A result is
// written once per record and never rewritten, so a summary is good for as long as its result is there: its key is the
// record id and the version, both checked on read, and no file time or size. The summaries it holds are shared between
// reads: read them, never change them.
type summaryStore struct {
	dir      string
	reporter *persist.Reporter
	mu       sync.Mutex
	// +checklocks:mu
	held map[string]ResultSummary
}

func (s *summaryStore) path(recordID string) (string, bool) {
	name, ok := evidence.RecordFileName(recordID)
	return filepath.Join(s.dir, name), ok
}

// write stores the summary and holds it. The held copy answers even when the file could not be written.
func (s *summaryStore) write(summary ResultSummary) error {
	path, ok := s.path(summary.RecordID)
	if !ok {
		return fmt.Errorf("%q is not a ledger record id", summary.RecordID)
	}
	summary.SchemaVersion = resultSummaryVersion
	s.hold(summary)
	encoded, err := json.Marshal(summary)
	if err != nil {
		return err
	}
	if err := writeAtomically(path, encoded); err != nil {
		return fmt.Errorf("could not store the coverage result summary: %w", err)
	}
	return nil
}

func (s *summaryStore) hold(summary ResultSummary) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.held == nil {
		s.held = map[string]ResultSummary{}
	}
	s.held[summary.RecordID] = summary
}

// read returns the record's summary, or false when there is none this version can use: missing, unreadable, of another
// version or naming another record.
func (s *summaryStore) read(recordID string) (ResultSummary, bool) {
	path, ok := s.path(recordID)
	if !ok {
		return ResultSummary{}, false
	}
	s.mu.Lock()
	held, found := s.held[recordID]
	s.mu.Unlock()
	if found {
		return held, true
	}
	var summary ResultSummary
	outcome := s.reporter.ReadJSON(path, "coverage result summary", persist.Disposable, func(raw []byte) error {
		var decoded ResultSummary
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return err
		}
		if decoded.SchemaVersion != resultSummaryVersion || decoded.RecordID != recordID {
			return fmt.Errorf("coverage result summary %s is version %d of record %q", recordID, decoded.SchemaVersion, decoded.RecordID)
		}
		summary = decoded
		return nil
	})
	if outcome != persist.Loaded {
		return ResultSummary{}, false
	}
	s.hold(summary)
	return summary, true
}

// summary is the summary of the record's stored result, or false when the result is not there. One that is missing or
// cannot be used is built from the result (one decode) and stored, so a result written before summaries were, or by a
// version that summarized differently, is decoded once more and never again.
func (s *Service) summary(recordID string) (ResultSummary, bool) {
	if !s.results.exists(recordID) {
		return ResultSummary{}, false
	}
	if summary, ok := s.summaries.read(recordID); ok {
		return summary, true
	}
	stored, ok := s.results.read(recordID)
	if !ok {
		return ResultSummary{}, false
	}
	summary := summarize(stored)
	if err := s.summaries.write(summary); err != nil {
		s.config.Reporter.Warn("coverage_summary_not_stored", err.Error())
	}
	return summary, true
}
