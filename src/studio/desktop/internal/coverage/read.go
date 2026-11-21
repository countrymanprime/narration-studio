package coverage

import (
	"desktop/internal/creditsid"
	"desktop/internal/evidence"
	"desktop/internal/stages"
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
	basis, err := s.readableChapter(s.asked(), chapterID, alignment)
	if err != nil {
		return ChapterResult{}, err
	}
	project, projectFile, err := s.savedProject()
	if err != nil {
		return ChapterResult{}, err
	}
	return s.evaluate(s.asked(), project, projectFile, basis, alignment)
}

// ResultIn is Result against a saved project the caller already parsed (the
// stage recommendations' shared EvidenceView), so evaluating every chapter
// reads the .rpp once.
func (s *Service) ResultIn(project tracks.Project, projectFile evidence.LedgerProjectFile, chapterID string, alignment AlignmentParams) (ChapterResult, error) {
	return s.resultIn(s.asked(), project, projectFile, chapterID, alignment)
}

// LedgerReads is how often the service's ledger store has listed its folder and how many record files it has decoded, for
// the tests that guard what a page's read costs (issue 3749).
func (s *Service) LedgerReads() (listings, decodes int) { return s.ledger.Reads() }

// ResultsDecoded is how many stored result files the service has decoded, for the tests that guard what a page's read
// costs (issue 3804): a read of every chapter takes the summaries and decodes none.
func (s *Service) ResultsDecoded() int64 {
	if s.results.cache == nil {
		return 0
	}
	return s.results.cache.decoded.Load()
}

// Pass is one read of every chapter of a book: its ResultIn answers each chapter from a single listing of the ledger, a
// single read of the chapter links and a single sweep of the manuscript, where Service.ResultIn does all three for every
// chapter (issues 3749, 3801). Take one per read and drop it after: a record, a link or a text edit made later is not in it.
type Pass struct {
	service *Service
	read    reading
}

// reading is where one read of chapters finds the ledger, the chapter links and the manuscript: the stores, asked for every
// chapter, or what a Pass read once.
type reading struct {
	ledger  evidence.LedgerReader
	mapping evidence.MappingReader
	// manuscript is nil when each chapter loads the manuscript itself.
	manuscript *manuscriptIndex
	// load is the manuscript a stage evaluation's view loaded once; nil loads it from the store for each chapter.
	load func() (map[string]any, error)
}

// asked is the reading of one chapter on its own: every question goes to the stores.
func (s *Service) asked() reading { return reading{ledger: s.ledger, mapping: s.mapping} }

// viewed is the reading of a stage evaluation: what its view read once, and the stores for what the view leaves out.
func (s *Service) viewed(view stages.EvidenceView) reading {
	read := s.asked()
	if view.Ledger != nil {
		read.ledger = view.Ledger
	}
	if view.Mapping != nil {
		read.mapping = view.Mapping
	}
	read.load = view.Manuscript
	return read
}

// Pass starts a read of many chapters. What cannot be read once (a ledger that cannot be listed, no manuscript) is asked
// for each chapter, which reports it itself.
func (s *Service) Pass() Pass { return Pass{service: s, read: s.shared()} }

// shared reads once what every chapter of a pass needs.
func (s *Service) shared() reading {
	read := s.asked()
	if snapshot, err := s.ledger.Snapshot(); err == nil {
		read.ledger = snapshot
	}
	if s.config.LoadManuscript == nil {
		return read
	}
	if data, err := s.config.LoadManuscript(); err == nil {
		index := indexManuscript(data)
		read.manuscript = &index
		read.mapping = s.mapping.Snapshot(index.documentID)
	}
	return read
}

// basis is chapterID's basis from the pass's manuscript. A credits row is rendered, not read from the manuscript, and
// goes the way a single read does.
func (s *Service) basis(read reading, chapterID string) (ChapterBasis, error) {
	if _, isCredits := creditsid.Kind(chapterID); isCredits || read.manuscript == nil {
		load := read.load
		if load == nil {
			load = s.config.LoadManuscript
		}
		basis, _, err := s.basisAndText(load, chapterID)
		return basis, err
	}
	return read.manuscript.basis(chapterID)
}

// ResultIn is Service.ResultIn from what the pass read once.
func (p Pass) ResultIn(project tracks.Project, projectFile evidence.LedgerProjectFile, chapterID string, alignment AlignmentParams) (ChapterResult, error) {
	return p.service.resultIn(p.read, project, projectFile, chapterID, alignment)
}

// Summary is ResultIn for a caller that reads the check's state and the summary of its result (the counts, the paragraph
// lines, the gaps) and not the result itself: no stored result is decoded for it (issue 3804). The summary is nil unless
// a stored result stands behind the answer; Result is nil in the answer.
func (p Pass) Summary(project tracks.Project, projectFile evidence.LedgerProjectFile, chapterID string, alignment AlignmentParams) (ChapterResult, *ResultSummary, error) {
	basis, err := p.service.readableChapter(p.read, chapterID, alignment)
	if err == nil {
		var result ChapterResult
		var summary *ResultSummary
		if result, summary, err = p.service.evaluateSummary(p.read, project, projectFile, basis, alignment); err == nil {
			return result, summary, nil
		}
	}
	if reason, ok := ReasonOf(err); ok {
		return ChapterResult{State: evidence.StateNever, Reasons: []string{string(reason)}}, nil, nil
	}
	return ChapterResult{}, nil, err
}

func (s *Service) resultIn(read reading, project tracks.Project, projectFile evidence.LedgerProjectFile, chapterID string, alignment AlignmentParams) (ChapterResult, error) {
	basis, err := s.readableChapter(read, chapterID, alignment)
	if err == nil {
		var result ChapterResult
		if result, err = s.evaluate(read, project, projectFile, basis, alignment); err == nil {
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
func (s *Service) readableChapter(read reading, chapterID string, alignment AlignmentParams) (ChapterBasis, error) {
	if s.config.Project == "" {
		return ChapterBasis{}, unknown(ReasonNoProject, "open a project first")
	}
	if err := alignment.validate(); err != nil {
		return ChapterBasis{}, err
	}
	return s.basis(read, chapterID)
}

// latestRecord is the chapter's newest coverage ledger record of any outcome.
func (s *Service) latestRecord(chapterID string) (*evidence.LedgerRecord, error) {
	return newestRecord(s.ledger, chapterID)
}

// newestRecord is latestRecord from the ledger a read already holds.
func newestRecord(ledger evidence.LedgerReader, chapterID string) (*evidence.LedgerRecord, error) {
	records, err := ledger.List(AnalyzerID, chapterID)
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
	for chapterID, summary := range s.currentSummaries(alignment) {
		fractions[chapterID] = summary.PresentFraction()
		paragraphs[chapterID] = summary.Paragraphs
	}
	return fractions, paragraphs
}

// currentSummaries is the summary of the stored result of every chapter whose newest complete check is current for the
// saved project. No stored result is decoded for it, but one that has no summary yet (issue 3802).
func (s *Service) currentSummaries(alignment AlignmentParams) map[string]ResultSummary {
	reports := map[string]ResultSummary{}
	if s.config.Project == "" || alignment.validate() != nil {
		return reports
	}
	// One listing of the ledger answers every chapter of the pass.
	read := s.shared()
	if _, listed := read.ledger.(evidence.LedgerSnapshot); !listed {
		return reports
	}
	chapters := checkedChapters(read.ledger)
	if len(chapters) == 0 {
		return reports
	}
	project, projectFile, err := s.savedProject()
	if err != nil {
		return reports
	}
	for _, chapterID := range chapters {
		basis, err := s.basis(read, chapterID)
		if err != nil {
			continue
		}
		result, summary, err := s.evaluateSummary(read, project, projectFile, basis, alignment)
		if err == nil && result.State == evidence.StateCurrent && summary != nil {
			reports[chapterID] = *summary
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
func (s *Service) evaluate(read reading, project tracks.Project, projectFile evidence.LedgerProjectFile, basis ChapterBasis, alignment AlignmentParams) (ChapterResult, error) {
	answer, err := s.evaluateRecord(read, project, projectFile, basis, alignment)
	if err != nil || answer.Record == nil {
		return answer, err
	}
	stored, ok := s.results.read(answer.Record.ID)
	if !ok {
		return resultMissing(answer), nil
	}
	answer.Result = &stored
	return manuscriptChecked(answer, basis, stored.DocumentID, stored.ManuscriptHash), nil
}

// evaluateSummary is evaluate for a read of every chapter: the same state and reasons, with the stored result's summary
// where evaluate gives the result itself, so the result's per-word alignment is not decoded. Result is nil in its answer.
func (s *Service) evaluateSummary(read reading, project tracks.Project, projectFile evidence.LedgerProjectFile, basis ChapterBasis, alignment AlignmentParams) (ChapterResult, *ResultSummary, error) {
	answer, err := s.evaluateRecord(read, project, projectFile, basis, alignment)
	if err != nil || answer.Record == nil {
		return answer, nil, err
	}
	summary, ok := s.summary(answer.Record.ID)
	if !ok {
		return resultMissing(answer), nil, nil
	}
	return manuscriptChecked(answer, basis, summary.DocumentID, summary.ManuscriptHash), &summary, nil
}

// resultMissing is the answer for a complete record whose stored result cannot be read: never checked.
func resultMissing(answer ChapterResult) ChapterResult {
	answer.State = evidence.StateNever
	answer.Reasons = append(answer.Reasons, string(ReasonResultMissing))
	return answer
}

// manuscriptChecked makes the answer stale when the stored result measured another document or another text of the chapter.
func manuscriptChecked(answer ChapterResult, basis ChapterBasis, documentID, manuscriptHash string) ChapterResult {
	if documentID != basis.DocumentID || manuscriptHash != basis.Hash || answer.Record.Scope.DocumentID != basis.DocumentID {
		answer.State = evidence.StateStale
		reason := ReasonManuscriptChanged
		if _, isCredits := creditsid.Kind(basis.ChapterID); isCredits {
			reason = ReasonCreditsChanged
		}
		answer.Reasons = append(answer.Reasons, string(reason))
	}
	return answer
}

// evaluateRecord is the part of evaluate that reads no stored result: the chapter's newest complete record against the
// saved project, the confirmed track and the parameters. Record is nil in its answer when there is none.
func (s *Service) evaluateRecord(read reading, project tracks.Project, projectFile evidence.LedgerProjectFile, basis ChapterBasis, alignment AlignmentParams) (ChapterResult, error) {
	if _, err := confirmedTrack(read.mapping, basis.DocumentID, basis.ChapterID); err != nil {
		return ChapterResult{}, err
	}
	// The run read the chapter's audio (the voices of its folder, less a track marked as not a voice), so the check reads the same set (#3593).
	if s.config.ChapterAudio != nil {
		project = s.config.ChapterAudio(project)
	}
	evaluation, evaluationBasis, err := evidence.EvaluateChapter(read.ledger, read.mapping, evidence.ChapterEvaluationRequest{
		Project: project, ProjectFolder: s.config.Project, ProjectFile: projectFile,
		DocumentID: basis.DocumentID, ChapterID: basis.ChapterID,
		AnalyzerID: AnalyzerID, AnalyzerVersion: AnalyzerVersion,
		ParamHash: paramHash(alignment, readProjectInputs(s.config.Project)),
		Identify:  s.identities.Identify,
	})
	if err != nil {
		return ChapterResult{}, err
	}
	return ChapterResult{State: evaluation.State, Reasons: reasonStrings(evaluation.Reasons), Basis: &evaluationBasis, Record: evaluation.Record}, nil
}

func reasonStrings(reasons []evidence.EvaluatorReason) []string {
	result := make([]string, 0, len(reasons))
	for _, reason := range reasons {
		result = append(result, string(reason))
	}
	return result
}
