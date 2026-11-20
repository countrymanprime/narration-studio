package coverage

import (
	"desktop/internal/creditsid"
	"desktop/internal/evidence"
	"desktop/internal/tracks"
)

// Result reads the chapter's newest complete coverage run back and says
// whether it is current: the saved project's items unchanged (EL's evaluator,
// src/studio/desktop/internal/evidence/fingerprint.go), the same confirmed track, the same alignment parameters and
// project inputs (the parameter hash, which leaves model and language out,
// Q13), and the same manuscript text. It never runs anything. A chapter that
// cannot be evaluated at all (no manuscript, unmapped, no saved project) is a
// ChapterResult in state never with that Reason, not an error.
func (s *Service) Result(chapterID string, alignment AlignmentParams) (ChapterResult, error) {
	result, err := s.result(chapterID, alignment)
	if reason, ok := ReasonOf(err); ok {
		return ChapterResult{State: evidence.StateNever, Reasons: []string{string(reason)}}, nil
	}
	return result, err
}

func (s *Service) result(chapterID string, alignment AlignmentParams) (ChapterResult, error) {
	basis, err := s.readableChapter(chapterID, alignment)
	if err != nil {
		return ChapterResult{}, err
	}
	project, projectFile, err := s.savedProject()
	if err != nil {
		return ChapterResult{}, err
	}
	return s.evaluate(s.ledger, project, projectFile, basis, alignment)
}

// ResultIn is Result against a saved project the caller already parsed (the
// stage recommendations' shared EvidenceView), so evaluating every chapter
// reads the .rpp once.
func (s *Service) ResultIn(project tracks.Project, projectFile evidence.LedgerProjectFile, chapterID string, alignment AlignmentParams) (ChapterResult, error) {
	return s.resultIn(s.ledger, project, projectFile, chapterID, alignment)
}

// LedgerReads is how often the service's ledger store has listed its folder and how many record files it has decoded, for
// the tests that guard what a page's read costs (issue 3749).
func (s *Service) LedgerReads() (listings, decodes int) { return s.ledger.Reads() }

// Pass is one read of every chapter of a book: its ResultIn answers each chapter from a single listing of the ledger,
// where Service.ResultIn lists it for every chapter (issue 3749). Take one per read and drop it after: a record written
// later is not in it.
type Pass struct {
	service *Service
	ledger  evidence.LedgerReader
}

// Pass starts a read of many chapters. If the ledger cannot be listed, each chapter asks the store and reports that itself.
func (s *Service) Pass() Pass {
	snapshot, err := s.ledger.Snapshot()
	if err != nil {
		return Pass{service: s, ledger: s.ledger}
	}
	return Pass{service: s, ledger: snapshot}
}

// ResultIn is Service.ResultIn from the pass's listing of the ledger.
func (p Pass) ResultIn(project tracks.Project, projectFile evidence.LedgerProjectFile, chapterID string, alignment AlignmentParams) (ChapterResult, error) {
	return p.service.resultIn(p.ledger, project, projectFile, chapterID, alignment)
}

func (s *Service) resultIn(ledger evidence.LedgerReader, project tracks.Project, projectFile evidence.LedgerProjectFile, chapterID string, alignment AlignmentParams) (ChapterResult, error) {
	basis, err := s.readableChapter(chapterID, alignment)
	if err == nil {
		var result ChapterResult
		if result, err = s.evaluate(ledger, project, projectFile, basis, alignment); err == nil {
			return result, nil
		}
	}
	if reason, ok := ReasonOf(err); ok {
		return ChapterResult{State: evidence.StateNever, Reasons: []string{string(reason)}}, nil
	}
	return ChapterResult{}, err
}

// readableChapter checks what every read needs before the saved project: an
// open project, valid alignment parameters and the chapter in the manuscript.
func (s *Service) readableChapter(chapterID string, alignment AlignmentParams) (ChapterBasis, error) {
	if s.config.Project == "" {
		return ChapterBasis{}, unknown(ReasonNoProject, "open a project first")
	}
	if err := alignment.validate(); err != nil {
		return ChapterBasis{}, err
	}
	return s.chapter(chapterID)
}

// latestRecord is the chapter's newest coverage ledger record of any outcome.
func (s *Service) latestRecord(chapterID string) (*evidence.LedgerRecord, error) {
	records, err := s.ledger.List(AnalyzerID, chapterID)
	if err != nil || len(records) == 0 {
		return nil, err
	}
	return &records[0], nil
}

// Checking reports whether a check of chapterID is running now.
func (s *Service) Checking(chapterID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, running := range s.jobs {
		if running.basis.ChapterID == chapterID && running.state.Phase == PhaseRunning {
			return true
		}
	}
	return false
}

// RecordedFractions is the measured ManuscriptChapter.recordedFraction (D11):
// for every chapter whose newest complete coverage run is current, the share
// of its body words present. A chapter with no current complete result -
// never checked, stale, partial, failed, unmapped, or anything that cannot be
// read - is absent, so the UI keeps its labeled status estimate (Q12 A). It
// never runs anything (Q14), and it reads the saved project once, and only
// when the ledger holds a complete coverage record at all.
func (s *Service) RecordedFractions(alignment AlignmentParams) map[string]float64 {
	fractions, _ := s.Current(alignment)
	return fractions
}

// Current is, from one pass over the checked chapters, what RecordedFractions answers and each chapter's paragraph lines
// from the same current, complete checks, for the recorded-through place (recordedthrough.Resolve). A chapter with no
// current check is left out of both; reading never starts a check.
func (s *Service) Current(alignment AlignmentParams) (fractions map[string]float64, paragraphs map[string][]ParagraphLine) {
	fractions, paragraphs = map[string]float64{}, map[string][]ParagraphLine{}
	for chapterID, report := range s.currentReports(alignment) {
		fractions[chapterID] = report.PresentFraction()
		paragraphs[chapterID] = report.Paragraphs
	}
	return fractions, paragraphs
}

// currentReports is the stored report of every chapter whose newest complete check is current for the saved project.
func (s *Service) currentReports(alignment AlignmentParams) map[string]Report {
	reports := map[string]Report{}
	if s.config.Project == "" || alignment.validate() != nil {
		return reports
	}
	// One listing of the ledger answers every chapter of the pass.
	ledger, err := s.ledger.Snapshot()
	if err != nil {
		return reports
	}
	chapters := checkedChapters(ledger)
	if len(chapters) == 0 {
		return reports
	}
	project, projectFile, err := s.savedProject()
	if err != nil {
		return reports
	}
	for _, chapterID := range chapters {
		basis, err := s.chapter(chapterID)
		if err != nil {
			continue
		}
		result, err := s.evaluate(ledger, project, projectFile, basis, alignment)
		if err == nil && result.Current() {
			reports[chapterID] = result.Result.Report
		}
	}
	return reports
}

// checkedChapters lists the chapters with at least one complete coverage
// record, each once.
func checkedChapters(ledger evidence.LedgerReader) []string {
	records, err := ledger.List(AnalyzerID, "")
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	chapters := []string{}
	for _, record := range records {
		if record.Outcome != evidence.LedgerComplete || seen[record.Scope.ChapterID] {
			continue
		}
		seen[record.Scope.ChapterID] = true
		chapters = append(chapters, record.Scope.ChapterID)
	}
	return chapters
}

// evaluate compares the chapter's newest complete run against the parsed
// saved project, the confirmed track, the parameters and the manuscript.
func (s *Service) evaluate(ledger evidence.LedgerReader, project tracks.Project, projectFile evidence.LedgerProjectFile, basis ChapterBasis, alignment AlignmentParams) (ChapterResult, error) {
	if _, err := confirmedTrack(s.mapping, basis.DocumentID, basis.ChapterID); err != nil {
		return ChapterResult{}, err
	}
	// The run read the chapter's audio (the voices of its folder, less a track marked as not a voice), so the check reads the same set (#3593).
	if s.config.ChapterAudio != nil {
		project = s.config.ChapterAudio(project)
	}
	evaluation, evaluationBasis, err := evidence.EvaluateChapter(ledger, s.mapping, evidence.ChapterEvaluationRequest{
		Project: project, ProjectFolder: s.config.Project, ProjectFile: projectFile,
		DocumentID: basis.DocumentID, ChapterID: basis.ChapterID,
		AnalyzerID: AnalyzerID, AnalyzerVersion: AnalyzerVersion,
		ParamHash: paramHash(alignment, readProjectInputs(s.config.Project)),
		Identify:  s.identities.Identify,
	})
	if err != nil {
		return ChapterResult{}, err
	}
	answer := ChapterResult{State: evaluation.State, Reasons: reasonStrings(evaluation.Reasons), Basis: &evaluationBasis, Record: evaluation.Record}
	if evaluation.Record == nil {
		return answer, nil
	}
	stored, ok := s.results.read(evaluation.Record.ID)
	if !ok {
		answer.State = evidence.StateNever
		answer.Reasons = append(answer.Reasons, string(ReasonResultMissing))
		return answer, nil
	}
	answer.Result = &stored
	if stored.DocumentID != basis.DocumentID || stored.ManuscriptHash != basis.Hash || evaluation.Record.Scope.DocumentID != basis.DocumentID {
		answer.State = evidence.StateStale
		reason := ReasonManuscriptChanged
		if _, isCredits := creditsid.Kind(basis.ChapterID); isCredits {
			reason = ReasonCreditsChanged
		}
		answer.Reasons = append(answer.Reasons, string(reason))
	}
	return answer, nil
}

func reasonStrings(reasons []evidence.EvaluatorReason) []string {
	result := make([]string, 0, len(reasons))
	for _, reason := range reasons {
		result = append(result, string(reason))
	}
	return result
}
