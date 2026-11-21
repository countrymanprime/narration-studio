package editing

import (
	"bytes"
	"context"
	"os"
	"testing"
	"time"

	"desktop/internal/evidence"
	"desktop/internal/stages"
	"desktop/internal/tracks"
)

func chapterContext() stages.ChapterContext {
	return stages.ChapterContext{DocumentID: "doc-1", ChapterID: "chapter-1", Title: "Chapter One", Status: stages.StageEditing}
}

func evidenceView(svc *testService) stages.EvidenceView {
	project, err := tracks.Parse(svc.rppPath)
	if err != nil {
		panic(err)
	}
	return stages.EvidenceView{DocumentID: "doc-1", ProjectFolder: svc.dir, Project: project, Ledger: svc.ledger, Mapping: svc.mapping}
}

// TestSignalProviderDeclaresStageAndIDs is the contract shape SR's engine
// reads (Collect/DeclaredSignalIDs).
func TestSignalProviderDeclaresStageAndIDs(t *testing.T) {
	provider := NewSignalProvider(nil)
	if provider.Stage() != stages.StageEditing {
		t.Fatalf("Stage() = %q, want %q", provider.Stage(), stages.StageEditing)
	}
	ids := provider.SignalIDs()
	want := []string{EmptySpaceSignalID, ClickSignalID, BreathSignalID}
	if len(ids) != len(want) {
		t.Fatalf("SignalIDs() = %v, want %v", ids, want)
	}
	for _, id := range want {
		if !containsString(ids, id) {
			t.Fatalf("SignalIDs() = %v, missing %q", ids, id)
		}
	}
}

// TestSignalProviderUnknownBeforeAnyScan proves a never-analyzed chapter's
// three signals are all unknown - never met, never a crash - before Phase
// 5's job has ever run.
func TestSignalProviderUnknownBeforeAnyScan(t *testing.T) {
	svc := newTestService(t)
	provider := NewSignalProvider(svc.Service)
	signals, err := provider.Signals(context.Background(), chapterContext(), evidenceView(svc))
	if err != nil {
		t.Fatalf("Signals() error = %v", err)
	}
	if len(signals) != 3 {
		t.Fatalf("Signals() = %d signals, want 3", len(signals))
	}
	for _, signal := range signals {
		if signal.State != stages.SignalUnknown {
			t.Fatalf("signal %s state = %q, want %q", signal.ID, signal.State, stages.SignalUnknown)
		}
		if err := signal.Validate(); err != nil {
			t.Fatalf("signal %s failed Validate(): %v", signal.ID, err)
		}
	}
}

// TestSignalProviderMetAfterACleanScan is the end-to-end proof:
// after a scan finds no candidates (a maximum gap wide enough that the 3 s
// gap between the fixture's two items does not cross it), the empty-space
// signal reads met, and the click/breath signals still never do.
func TestSignalProviderMetAfterACleanScan(t *testing.T) {
	svc := newTestService(t)
	wideGap := 10.0
	svc.config.Policy = func() Policy { return Policy{MaxGapSeconds: &wideGap} }
	if _, err := svc.Start(context.Background(), Request{DocumentID: "doc-1", ChapterID: "chapter-1", ChapterTitle: "Chapter One"}); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	svc.Wait()
	if got := svc.State().Phase; got != PhaseComplete {
		t.Fatalf("scan phase = %q, want %q", got, PhaseComplete)
	}

	provider := NewSignalProvider(svc.Service)
	signals, err := provider.Signals(context.Background(), chapterContext(), evidenceView(svc))
	if err != nil {
		t.Fatalf("Signals() error = %v", err)
	}
	byID := map[string]stages.Signal{}
	for _, signal := range signals {
		byID[signal.ID] = signal
	}
	if got := byID[EmptySpaceSignalID].State; got != stages.SignalMet {
		t.Fatalf("empty-space signal state = %q, want %q (reason: %s)", got, stages.SignalMet, byID[EmptySpaceSignalID].Reason)
	}
	for _, id := range []string{ClickSignalID, BreathSignalID} {
		if got := byID[id].State; got != stages.SignalUnknown {
			t.Fatalf("%s state = %q, want %q (never met, detector not validated)", id, got, stages.SignalUnknown)
		}
	}
}

// TestSignalProviderNotMetAfterAScanWithCandidates mirrors
// TestServiceFindsEmptySpace but through the signal itself: a tight maximum
// gap crosses the fixture's 3 s inter-item gap, so the empty-space signal
// must read not_met once the scan has run.
func TestSignalProviderNotMetAfterAScanWithCandidates(t *testing.T) {
	svc := newTestService(t)
	tightGap := 1.0
	svc.config.Policy = func() Policy { return Policy{MaxGapSeconds: &tightGap} }
	if _, err := svc.Start(context.Background(), Request{DocumentID: "doc-1", ChapterID: "chapter-1", ChapterTitle: "Chapter One"}); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	svc.Wait()

	provider := NewSignalProvider(svc.Service)
	signals, err := provider.Signals(context.Background(), chapterContext(), evidenceView(svc))
	if err != nil {
		t.Fatalf("Signals() error = %v", err)
	}
	var emptySpace stages.Signal
	for _, signal := range signals {
		if signal.ID == EmptySpaceSignalID {
			emptySpace = signal
		}
	}
	if emptySpace.State != stages.SignalNotMet {
		t.Fatalf("empty-space signal state = %q, want %q (reason: %s)", emptySpace.State, stages.SignalNotMet, emptySpace.Reason)
	}
}

// TestSignalProviderUnmapped proves the D5 gate at the provider level: a
// chapter with no confirmed track answers unknown, not a crash and not met.
// This fixture's one track happens to be named exactly the chapter's own
// title ("Chapter One"), so once unlinked it reads as an unconfirmed
// suggestion (CauseUnconfirmedMapping) rather than a plain CauseUnmappedTrack
// - itself a real case this test is glad to exercise, since D5 says an
// unconfirmed fuzzy match is still unknown, just with a different action.
func TestSignalProviderUnmapped(t *testing.T) {
	svc := newTestService(t)
	if err := svc.mapping.Clear("doc-1", "track-1"); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	provider := NewSignalProvider(svc.Service)
	signals, err := provider.Signals(context.Background(), chapterContext(), evidenceView(svc))
	if err != nil {
		t.Fatalf("Signals() error = %v", err)
	}
	var emptySpace stages.Signal
	for _, signal := range signals {
		if signal.ID == EmptySpaceSignalID {
			emptySpace = signal
		}
	}
	if emptySpace.State != stages.SignalUnknown {
		t.Fatalf("state = %q, want %q", emptySpace.State, stages.SignalUnknown)
	}
	if emptySpace.Cause != stages.CauseUnconfirmedMapping && emptySpace.Cause != stages.CauseUnmappedTrack {
		t.Fatalf("cause = %q, want %s or %s", emptySpace.Cause, stages.CauseUnconfirmedMapping, stages.CauseUnmappedTrack)
	}
}

// TestSignalProviderProjectUnreadable proves the view.ProjectErr branch
// answers all three signals unknown rather than erroring the whole
// evaluation - a provider failing outright would cost every OTHER stage's
// signals too (Collect's own per-provider isolation), so this path is worth
// its own direct test. The empty-space signal names the real cause
// (CauseProjectUnreadable); the click/breath signals always give the same
// unvalidated-detector reason regardless of context - itself never
// met, whatever else is also true about the project.
func TestSignalProviderProjectUnreadable(t *testing.T) {
	provider := NewSignalProvider(&Service{})
	view := stages.EvidenceView{ProjectErr: errUnreadableFixture}
	signals, err := provider.Signals(context.Background(), chapterContext(), view)
	if err != nil {
		t.Fatalf("Signals() error = %v", err)
	}
	for _, signal := range signals {
		if signal.State != stages.SignalUnknown {
			t.Fatalf("signal %s state = %q, want %q", signal.ID, signal.State, stages.SignalUnknown)
		}
		if signal.ID == EmptySpaceSignalID && signal.Cause != stages.CauseProjectUnreadable {
			t.Fatalf("empty-space signal cause = %q, want %q", signal.Cause, stages.CauseProjectUnreadable)
		}
	}
}

var errUnreadableFixture = errNamed("could not read the saved project")

type errNamed string

func (e errNamed) Error() string { return string(e) }

// A scan writes each item's key down, so it reads the file whatever the cache holds, and so does the write of its result.
func TestAScanRefreshesIdentitiesTheCacheAlreadyHeld(t *testing.T) {
	svc := newTestService(t)
	old := time.Now().Add(-time.Hour)
	for _, item := range svc.track.Items {
		if err := os.Chtimes(item.SourceFile, old, old); err != nil {
			t.Fatal(err)
		}
	}
	scanCache := &evidence.IdentityCache{}
	svc.config.Identities = scanCache
	for _, item := range svc.track.Items {
		if _, err := scanCache.Identify(item.SourceFile, svc.dir); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := svc.Start(context.Background(), Request{DocumentID: "doc-1", ChapterID: "chapter-1", ChapterTitle: "Chapter One"}); err != nil {
		t.Fatal(err)
	}
	svc.Wait()
	if got := scanCache.Reads(); got != 6 {
		t.Fatalf("a scan of two files the cache already held made %d reads in all, want 6 (each read again for its key and for its result)", got)
	}
}

// A take rewritten in place with its size and modification time kept is a different file: the next read of the signals samples it and
// answers that its scan is stale.
func TestSignalsOfATakeRewrittenKeepingSizeAndTimeAreStale(t *testing.T) {
	svc := newTestService(t)
	take := svc.track.Items[0].SourceFile
	old := time.Now().Add(-time.Hour)
	if err := os.Chtimes(take, old, old); err != nil {
		t.Fatal(err)
	}
	svc.config.Identities = &evidence.IdentityCache{}
	if _, err := svc.Start(context.Background(), Request{DocumentID: "doc-1", ChapterID: "chapter-1", ChapterTitle: "Chapter One"}); err != nil {
		t.Fatal(err)
	}
	svc.Wait()
	state := func() evidence.EvaluatorState {
		t.Helper()
		coverage, _, _, err := svc.gatherCoverage(chapterContext(), evidenceView(svc), AnalyzerSilence, AnalyzerVersion)
		if err != nil || len(coverage.Items) != 2 {
			t.Fatalf("gatherCoverage() = %+v, %v", coverage, err)
		}
		return coverage.Items[0].State
	}
	if got := state(); got != evidence.StateCurrent {
		t.Fatalf("after the scan the take is %q, want current", got)
	}

	info, err := os.Stat(take)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(take, bytes.Repeat([]byte("Z"), int(info.Size())), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(take, old, old); err != nil {
		t.Fatal(err)
	}
	if got := state(); got != evidence.StateStale {
		t.Fatalf("a take rewritten keeping its size and time is %q, want stale", got)
	}
}
