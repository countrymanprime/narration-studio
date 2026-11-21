package main

import (
	"context"
	"errors"
	"fmt"

	"desktop/internal/coverage"
	"desktop/internal/editing"
	"desktop/internal/evidence"
	"desktop/internal/proofing"
	"desktop/internal/retention"
)

// ledgerRetentionKeys is the retention key of each analyzer whose records the ledger holds: how that analyzer's reader picks the
// record it reads (#3816). An analyzer missing from it keeps every record.
var ledgerRetentionKeys = map[string]evidence.RetentionKey{
	coverage.AnalyzerID:                coverage.RetentionKey,
	editing.AnalyzerSilence:            editing.ItemRetentionKey,
	editing.AnalyzerClick:              editing.ItemRetentionKey,
	editing.AnalyzerBreath:             editing.ItemRetentionKey,
	editing.AnalyzerEditingRender:      editing.RenderRetentionKey,
	proofing.AnalyzerTranscriptCompare: proofing.ComparisonRetentionKey,
	proofing.AnalyzerRenderMeasurement: proofing.RenderMeasurementRetentionKey,
}

// ledgerRetention is the retention step of the analysis ledger and of the stored results and summaries that hang from its records
// (#3816). It deletes the records no reader selects any more, each with its result and summary first, then the results and summaries
// whose record has no file. The ledger and the stores are injected, so a test drives it with files in a temp folder.
type ledgerRetention struct {
	ledger *evidence.LedgerStore
	// referenced is the record ids a narrator's decision stands on (stages.DecisionStore.ReferencedRecordIDs); an error stops the step.
	referenced func() (map[string]bool, error)
	// removeResult removes what is stored beside a record of the coverage analyzer, before the record itself goes.
	removeResult func(recordID string) error
	// sweep removes the stored results and summaries whose record has no file, and answers the record ids it did that for.
	sweep func() ([]string, error)
	// measure reports the files and bytes of the stores this step prunes.
	measure func(stop func() bool) retention.Report
}

func (l ledgerRetention) Name() string { return "ledger" }

func (l ledgerRetention) Run(ctx context.Context, stop func() bool) retention.Report {
	report := l.measure(stop)
	report.Kind = l.Name()
	if stop() || ctx.Err() != nil {
		report.Stopped = true
		return report
	}
	referenced, err := l.referenced()
	if err != nil {
		// Without the ids a decision stands on, nothing may be deleted.
		report.Err = fmt.Errorf("no ledger record was removed: %w", err)
		return report
	}
	beforeDelete := func(record evidence.LedgerRecord) error {
		if record.AnalyzerID != coverage.AnalyzerID {
			return nil
		}
		return l.removeResult(record.ID)
	}
	var errs []error
	dropped, err := l.ledger.Retain(ledgerRetentionKeys, referenced, beforeDelete)
	errs = append(errs, err)
	report.Removed = len(dropped)
	// The sweep goes right after the pass: a record the pass stopped on halfway leaves a result or a summary the sweep finds.
	if !stop() && ctx.Err() == nil {
		swept, err := l.sweep()
		errs = append(errs, err)
		report.Removed += len(swept)
	} else {
		report.Stopped = true
	}
	report.Err = errors.Join(errs...)
	after := l.measure(func() bool { return false })
	report.BytesAfter, report.FilesAfter = after.BytesBefore, after.FilesBefore
	return report
}

// ledgerRetentionDirs are the folders of a project that the ledger step prunes.
func ledgerRetentionDirs(project string) []string {
	return []string{evidence.LedgerDir(project), coverage.ResultsDir(project), coverage.SummariesDir(project)}
}

// measureDirs is a Report of the files and bytes below dirs.
func measureDirs(dirs []string) func(stop func() bool) retention.Report {
	return func(stop func() bool) retention.Report {
		var total retention.Report
		for _, dir := range dirs {
			part := retention.DirStep("", dir).Run(context.Background(), stop)
			total.FilesBefore += part.FilesBefore
			total.BytesBefore += part.BytesBefore
			total.Stopped = total.Stopped || part.Stopped
			if total.Err == nil {
				total.Err = part.Err
			}
		}
		total.FilesAfter, total.BytesAfter = total.FilesBefore, total.BytesBefore
		return total
	}
}
