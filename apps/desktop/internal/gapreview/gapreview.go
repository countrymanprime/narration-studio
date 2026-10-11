// Package gapreview is the narrator's call on a recording-check gap (ADR 0842). A check's gaps (coverage.GapLine,
// ADR 0830) are not findings, so there is nothing to accept or ignore until the narrator says so: accepting a gap
// writes one finding through the findings store's public API (analyzer "recording-check", category pickup) and
// records it accepted, so the note is an ordinary Proof note; ignoring writes only a review entry, so the gap reads
// as ignored and stays out of the card's to-review count. Running a check never does either.
//
// Reviews are kept in narration-utils/coverage/gap-reviews.json, keyed by the chapter, the result's evidence key (the
// ledger record id) and the gap id. A new check run has a new evidence key, so earlier entries stop matching any gap
// and drop out of what is read, but they stay in the file.
package gapreview

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/findings"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// SchemaVersion is the only gap-reviews.json version this package reads or writes.
const SchemaVersion = 1

// AnalyzerName is Finding.Analyzer of an accepted gap and the folder its findings are saved under.
const AnalyzerName = "recording-check"

// what names the file for the narrator in a persist notice or an error.
const what = "recording check review"

// Decision is the narrator's call on one gap.
type Decision string

const (
	// Accepted means the gap became a note.
	Accepted Decision = "accepted"
	// Ignored means the gap is remembered as not worth a note.
	Ignored Decision = "ignored"
)

// ErrNotCurrent is wrapped by the Current function of a chapter whose result is stale or was never made.
var ErrNotCurrent = errors.New("this chapter's recording check is out of date or was never run, so there is nothing to accept or ignore; check the recording again")

// errUnknownGap is the refusal for a gap id the current result does not hold.
var errUnknownGap = errors.New("that gap is not in this chapter's latest recording check")

// idPattern bounds a chapter id before it becomes a findings scope.
var idPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

// File is where a project's gap reviews are kept.
func File(project string) string {
	return filepath.Join(project, "narration-utils", "coverage", "gap-reviews.json")
}

// Current is a chapter's current check result as this package needs it.
type Current struct {
	// EvidenceKey names the run: it changes with every new check.
	EvidenceKey  string
	ChapterTitle string
	Gaps         []coverage.GapLine
}

// Config is what a Service needs.
type Config struct {
	// Project is the project folder; empty means no project is open.
	Project string
	// Current answers the chapter's current result, or an error wrapping ErrNotCurrent when it is stale or absent.
	Current func(chapterID string) (Current, error)
	// Findings is the project's findings store.
	Findings *findings.Store
	// Reporter tells the narrator about a file that cannot be read (ADR 0069).
	Reporter *persist.Reporter
}

// Service reads and writes a project's gap reviews. It keeps no state: the host builds one per call.
type Service struct {
	config Config
	now    func() time.Time
}

// New returns the service for config.
func New(config Config) *Service { return &Service{config: config, now: time.Now} }

type entry struct {
	ChapterID   string   `json:"chapterId"`
	EvidenceKey string   `json:"evidenceKey"`
	GapID       string   `json:"gapId"`
	Decision    Decision `json:"decision"`
	At          string   `json:"at"`
}

type reviewFile struct {
	SchemaVersion int     `json:"schemaVersion"`
	Reviews       []entry `json:"reviews"`
}

var fileLocks sync.Map

// lockFile serialises every change to one project's file across services built for the same project.
// +checklocksignore
func lockFile(path string) func() {
	lock, _ := fileLocks.LoadOrStore(filepath.Clean(path), &sync.Mutex{})
	mutex, _ := lock.(*sync.Mutex)
	mutex.Lock()
	return mutex.Unlock
}

// Reviews answers the chapter's current gaps that have a review. A stale or absent result has none.
func (s *Service) Reviews(chapterID string) (map[string]Decision, error) {
	reviews := map[string]Decision{}
	if s.config.Project == "" || !idPattern.MatchString(chapterID) {
		return reviews, nil
	}
	current, err := s.config.Current(chapterID)
	if errors.Is(err, ErrNotCurrent) {
		return reviews, nil
	}
	if err != nil {
		return nil, err
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return nil, err
	}
	for _, review := range file.Reviews {
		if review.ChapterID == chapterID && review.EvidenceKey == current.EvidenceKey && hasGap(current, review.GapID) {
			reviews[review.GapID] = review.Decision
		}
	}
	return reviews, nil
}

// Accept turns a gap of the chapter's current result into one note, with the accepted decision, and answers it.
// Accepting the same gap again answers the same finding and writes nothing.
func (s *Service) Accept(chapterID, gapID string) (findings.Finding, error) {
	gap, current, err := s.target(chapterID, gapID)
	if err != nil {
		return findings.Finding{}, err
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return findings.Finding{}, err
	}
	existing := file.find(chapterID, current.EvidenceKey, gapID)
	if existing != nil && existing.Decision == Ignored {
		return findings.Finding{}, errors.New("that gap was ignored; it stays ignored until the recording is checked again")
	}
	finding := gapFinding(chapterID, current, gap)
	if stored, found, err := s.config.Findings.Get(finding.ID); err != nil {
		return findings.Finding{}, err
	} else if found && existing != nil {
		return stored, nil
	}
	if _, err := s.config.Findings.MergeAnalyzerFindings(AnalyzerName, chapterID, []findings.Finding{finding}); err != nil {
		return findings.Finding{}, err
	}
	stamp := s.now().UTC().Format(time.RFC3339)
	decided, found, err := s.config.Findings.RecordDecision(finding.ID, finding.EvidenceVersion, findings.StatusAccepted, "", stamp)
	if err != nil {
		return findings.Finding{}, err
	}
	if !found {
		return findings.Finding{}, errors.New("the note could not be saved; try again")
	}
	if existing == nil {
		file.Reviews = append(file.Reviews, entry{ChapterID: chapterID, EvidenceKey: current.EvidenceKey, GapID: gapID, Decision: Accepted, At: stamp})
		if err := s.write(file); err != nil {
			return findings.Finding{}, err
		}
	}
	return decided, nil
}

// Ignore remembers that the narrator passed on a gap of the chapter's current result. It makes no note. Ignoring an
// ignored gap again changes nothing.
func (s *Service) Ignore(chapterID, gapID string) error {
	_, current, err := s.target(chapterID, gapID)
	if err != nil {
		return err
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return err
	}
	if existing := file.find(chapterID, current.EvidenceKey, gapID); existing != nil {
		if existing.Decision == Accepted {
			return errors.New("that gap is already a note; decide it there")
		}
		return nil
	}
	file.Reviews = append(file.Reviews, entry{ChapterID: chapterID, EvidenceKey: current.EvidenceKey, GapID: gapID, Decision: Ignored, At: s.now().UTC().Format(time.RFC3339)})
	return s.write(file)
}

// target finds the gap in the chapter's current result, or refuses with a sentence.
func (s *Service) target(chapterID, gapID string) (coverage.GapLine, Current, error) {
	if s.config.Project == "" {
		return coverage.GapLine{}, Current{}, errors.New("open a project first")
	}
	if !idPattern.MatchString(chapterID) {
		return coverage.GapLine{}, Current{}, errUnknownGap
	}
	current, err := s.config.Current(chapterID)
	if err != nil {
		return coverage.GapLine{}, Current{}, err
	}
	for _, gap := range current.Gaps {
		if gap.ID == gapID {
			return gap, current, nil
		}
	}
	return coverage.GapLine{}, Current{}, errUnknownGap
}

func hasGap(current Current, id string) bool {
	for _, gap := range current.Gaps {
		if gap.ID == id {
			return true
		}
	}
	return false
}

func (f reviewFile) find(chapterID, evidenceKey, gapID string) *entry {
	for i := range f.Reviews {
		if r := &f.Reviews[i]; r.ChapterID == chapterID && r.EvidenceKey == evidenceKey && r.GapID == gapID {
			return r
		}
	}
	return nil
}

// gapFinding builds the finding an accepted gap becomes. Its id is stable over the chapter, the gap and the result's
// evidence key, so accepting twice is one finding and a new check run makes a new one.
func gapFinding(chapterID string, current Current, gap coverage.GapLine) findings.Finding {
	expected := gap.FirstWord
	if gap.LastWord != "" && gap.LastWord != gap.FirstWord {
		expected += " … " + gap.LastWord
	}
	manuscript := findings.Manuscript{ChapterID: chapterID, ChapterTitle: current.ChapterTitle}
	if gap.Kind == coverage.GapExtra {
		expected = ""
		if gap.Text != nil {
			manuscript.Recorded = *gap.Text
		}
	}
	manuscript.Expected = expected
	if len(gap.ParagraphIDs) > 0 {
		manuscript.Span = &findings.Span{ParagraphID: gap.ParagraphIDs[0]}
	}
	evidence := map[string]any{
		"kind": string(gap.Kind), "gap_id": gap.ID, "evidence_key": current.EvidenceKey,
		"token_count": gap.TokenCount, "first_word": gap.FirstWord, "last_word": gap.LastWord,
	}
	source := findings.Source{}
	if gap.Position != nil {
		evidence["item_index"] = gap.Position.ItemIndex
		evidence["source_time"] = gap.Position.SourceTime
		source.ItemGUID = gap.Position.ItemGUID
	}
	return findings.Finding{
		SchemaVersion:    findings.SchemaVersion,
		ID:               findings.StableID(AnalyzerName, chapterID, gap.ID, current.EvidenceKey),
		Analyzer:         AnalyzerName,
		Source:           source,
		Manuscript:       &manuscript,
		Category:         findings.CategoryPickup,
		Severity:         findings.SeverityInfo,
		Confidence:       gap.Confidence,
		ConfidenceReason: gap.ConfReason,
		EvidenceVersion:  evidenceVersion(gap),
		Evidence:         evidence,
		Review:           findings.ReviewState{Status: findings.StatusUnreviewed},
	}
}

// evidenceVersion hashes what a decision on the gap rests on: its kind, size and words.
func evidenceVersion(gap coverage.GapLine) string {
	text := ""
	if gap.Text != nil {
		text = *gap.Text
	}
	sum := sha256.Sum256([]byte(strings.Join([]string{string(gap.Kind), fmt.Sprint(gap.TokenCount), gap.FirstWord, gap.LastWord, text}, "\x00")))
	return hex.EncodeToString(sum[:8])
}

// read reads gap-reviews.json; the caller holds the file's lock. A corrupt file is kept aside and an empty set
// started; one written by a newer app is refused and never overwritten.
func (s *Service) read() (reviewFile, error) {
	file := reviewFile{SchemaVersion: SchemaVersion, Reviews: []entry{}}
	newer := 0
	var decoded reviewFile
	outcome := s.config.Reporter.ReadJSON(File(s.config.Project), what, persist.NarratorData, func(raw []byte) error {
		var candidate reviewFile
		if err := json.Unmarshal(raw, &candidate); err != nil {
			return err
		}
		if candidate.SchemaVersion > SchemaVersion {
			newer = candidate.SchemaVersion
			return nil
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing, persist.Quarantined, persist.Healed:
		return file, nil
	case persist.Unreadable:
		return reviewFile{}, fmt.Errorf("your %s file could not be read, so nothing was changed", what)
	}
	if err := persist.CheckVersion(newer, SchemaVersion, what); err != nil {
		return reviewFile{}, err
	}
	if decoded.Reviews != nil {
		file.Reviews = decoded.Reviews
	}
	return file, nil
}

// write replaces gap-reviews.json through a temporary file and a rename; the caller holds the file's lock.
func (s *Service) write(file reviewFile) error {
	file.SchemaVersion = SchemaVersion
	path := File(s.config.Project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the project's coverage folder: %w", err)
	}
	encoded, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, encoded, 0o600); err != nil {
		return fmt.Errorf("could not write the %s file: %w", what, err)
	}
	if err := os.Rename(temporary, path); err != nil {
		return fmt.Errorf("could not activate the %s file: %w", what, err)
	}
	return nil
}
