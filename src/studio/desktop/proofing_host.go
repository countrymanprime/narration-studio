package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"desktop/internal/deliveryprofile"
	"desktop/internal/evidence"
	"desktop/internal/manuscript"
	"desktop/internal/measure"
	"desktop/internal/persist"
	"desktop/internal/proofing"
	"desktop/internal/settings"
	"desktop/internal/transcript"
)

// comparisonRecorder is the transcript service's run recorder: every
// finished comparison becomes one analysis evidence ledger record, with its chapter resolved from the run's chapter
// title through the manuscript, the manuscript's documentId, the compared set read from the run's manifest and the
// saved project file's time at completion. A record that cannot be written is logged and never fails the comparison
// the narrator is looking at.
func comparisonRecorder(folder string, ledger *evidence.LedgerStore, text *manuscript.Service, store *settings.Store, reporter *persist.Reporter) func(transcript.CompletedRun) {
	recorder := &proofing.ComparisonRecorder{
		Ledger: ledger, Lookup: text, ProjectFolder: folder,
		DocumentID:  func() string { return manuscriptDocumentID(text) },
		ProjectFile: func() (evidence.LedgerProjectFile, error) { return savedProjectFile(folder, store) },
	}
	return func(run transcript.CompletedRun) {
		err := recorder.Record(proofing.ComparisonRun{
			RunID: run.RunID, Outcome: run.Outcome, ManifestPath: run.ManifestPath, ChapterTitle: run.ChapterTitle,
			Model: run.Model, TrackGUID: run.TrackGUID, FindingCount: run.FindingCount,
			StartedAt: run.StartedAt, CompletedAt: run.CompletedAt,
		})
		if err != nil {
			reporter.Warn("comparison_record_failed", fmt.Sprintf("The Transcript Compare run was not recorded for the proofing check: %v", err))
		}
	}
}

// transcriptManuscript is the manuscript a completed comparison's findings are resolved against: one book for the run, so
// the file is read once and not for each finding. With no readable manuscript it is nil, the interface itself and not a
// nil book, which is what the findings adapter checks for.
func transcriptManuscript(text *manuscript.Service) func() transcript.ManuscriptLookup {
	return func() transcript.ManuscriptLookup {
		book, err := text.Book()
		if err != nil {
			return nil
		}
		return book
	}
}

// renderMeasurementRecorder is the measurement job's per-file hook: a
// measured file that is some chapter's chosen render becomes one ledger record per such chapter, keyed by the render's
// fingerprint, with its Report (or failed, with the error). Nil without a project or a manuscript. A record that cannot
// be written is logged; the measurement the narrator is looking at is unaffected.
func renderMeasurementRecorder(folder string, ledger *evidence.LedgerStore, text *manuscript.Service, reporter *persist.Reporter) measuredFileFunc {
	if folder == "" || text == nil || ledger == nil {
		return nil
	}
	renders := proofing.NewRenderStore(folder)
	return func(path string, measured measure.FileMeasurement, measureErr error, began time.Time) {
		_, err := proofing.RecordRenderMeasurements(ledger, renders, manuscriptDocumentID(text), folder, path,
			measured.Report, measured.Fingerprint.SHA256, measureErr, began, time.Now().UTC())
		if err != nil {
			reporter.Warn("render_measurement_record_failed", fmt.Sprintf("The measurement of %s was not recorded for the proofing check: %v", filepath.Base(path), err))
		}
	}
}

// proofingProfile is the delivery profile the open project is judged against now, for the proofing delivery checks. It takes a services() snapshot, so it must not be called with h.mu held:
// configureLocked passes it as a value and the stages service calls it at evaluation time.
func (h *Host) proofingProfile() deliveryprofile.Profile {
	profile, _, _ := h.selectedDeliveryProfile(h.services())
	return profile
}

// manuscriptDocumentID is the imported manuscript's documentId, "" before an import.
func manuscriptDocumentID(text *manuscript.Service) string {
	data, err := text.Load()
	if err != nil {
		return ""
	}
	id, _ := data["documentId"].(string)
	return id
}

// savedProjectFile is the narrator's chosen saved .rpp with its modified time now.
func savedProjectFile(folder string, store *settings.Store) (evidence.LedgerProjectFile, error) {
	path, err := selectedProjectFile(folder, store)
	if err != nil {
		return evidence.LedgerProjectFile{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return evidence.LedgerProjectFile{}, err
	}
	return evidence.LedgerProjectFile{Path: path, ModTime: info.ModTime().UTC()}, nil
}
