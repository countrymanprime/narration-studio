package stages

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"desktop/internal/evidence"
	"desktop/internal/tracks"
)

// EvidenceView is the read-only evidence one evaluation shares across every
// provider, built once per evaluation (the saved project parsed once, its
// modified time read once) by the service a later phase adds. It carries
// exactly what the analysis evidence ledger's staleness evaluator
// (evidence.EvaluateChapter) needs. ProjectErr is set when the saved project
// could not be read; a provider then answers unknown with
// CauseProjectUnreadable. Ledger and Mapping are the stores as one read at the
// start of the evaluation found them (issue 3801), or the stores themselves:
// a provider reads them, never changes what they return, and they may be nil.
type EvidenceView struct {
	DocumentID    string
	ProjectFolder string
	Project       tracks.Project
	ProjectFile   evidence.LedgerProjectFile
	ProjectErr    error
	Ledger        evidence.LedgerReader
	Mapping       evidence.MappingReader
	// Identities is the open project's source identity cache; nil identifies each file without one.
	Identities *evidence.IdentityCache
}

// Provider supplies the signals for one stage. Stage is the stage its
// signals judge as finished; SignalIDs declares every id it can report, which
// is the default required set and what settings keys derive from; Signals
// answers for one chapter. A provider reads existing evidence only: it must
// not decode audio, transcribe, reach the network or start an analysis.
// An error means it could not answer at all.
type Provider interface {
	Stage() Stage
	SignalIDs() []string
	Signals(ctx context.Context, chapter ChapterContext, view EvidenceView) ([]Signal, error)
}

// Collect asks every provider of the chapter's current stage for its signals
// and returns them sorted by id. A provider that fails contributes one
// unknown provider_error signal per declared id instead of a partial answer.
// A chapter whose stage is not evaluated calls no provider.
func Collect(ctx context.Context, providers []Provider, chapter ChapterContext, view EvidenceView) []Signal {
	signals := []Signal{}
	if _, evaluated := chapter.Status.Next(); !evaluated {
		return signals
	}
	for _, provider := range providers {
		if provider.Stage() != chapter.Status {
			continue
		}
		reported, err := provider.Signals(ctx, chapter, view)
		if err != nil {
			signals = append(signals, failedSignals(provider, err)...)
			continue
		}
		signals = append(signals, reported...)
	}
	slices.SortStableFunc(signals, func(a, b Signal) int { return strings.Compare(a.ID, b.ID) })
	return signals
}

func failedSignals(provider Provider, err error) []Signal {
	ids := distinctSorted(provider.SignalIDs())
	signals := make([]Signal, 0, len(ids))
	for _, id := range ids {
		reason := fmt.Sprintf("could not check: %v", err)
		signals = append(signals, UnknownSignal(id, provider.Stage(), CauseProviderError, reason))
	}
	return signals
}

// DeclaredSignalIDs is the sorted, distinct set of signal ids the providers
// of stage declare: the required set until narrator settings choose one.
func DeclaredSignalIDs(providers []Provider, stage Stage) []string {
	ids := []string{}
	for _, provider := range providers {
		if provider.Stage() == stage {
			ids = append(ids, provider.SignalIDs()...)
		}
	}
	return distinctSorted(ids)
}
