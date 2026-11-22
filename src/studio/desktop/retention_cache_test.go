package main

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"desktop/internal/coverage"
	"desktop/internal/editing"
	"desktop/internal/evidence"
	"desktop/internal/measure"
	"desktop/internal/passagetakes"
)

// cacheKeyOf is a cache key of analyzer whose entry is named by name.
func cacheKeyOf(analyzer, name string) evidence.CacheEntryKey {
	return evidence.CacheEntryKey{
		Source:     evidence.SourceIdentity{Path: "media/a.wav", Size: 1000, PartialHash: "hash-a"},
		AnalyzerID: analyzer, AnalyzerVersion: "1", ParamHash: name,
	}
}

// writeCacheEntry writes an entry of analyzer and sets its last use, and answers its file.
func writeCacheEntry(t *testing.T, project string, key evidence.CacheEntryKey, used time.Time) string {
	t.Helper()
	if err := evidence.NewCacheStore(project).Write(key, []byte("blob")); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(evidence.CacheDir(project))
	if err != nil {
		t.Fatal(err)
	}
	// The entry written last is the one with the newest file time.
	var path string
	var newest time.Time
	for _, entry := range entries {
		info, err := entry.Info()
		if err == nil && (path == "" || info.ModTime().After(newest)) {
			path, newest = filepath.Join(evidence.CacheDir(project), entry.Name()), info.ModTime()
		}
	}
	if err := os.Chtimes(path, used, used); err != nil {
		t.Fatal(err)
	}
	return path
}

// The table of kinds is what the issue's owner answer says; a change to a limit is a change here, on purpose.
func TestTheCacheRetentionTableHoldsTheOwnersKinds(t *testing.T) {
	got := map[string]evidence.CacheKindPolicy{}
	for _, policy := range cacheRetentionPolicies {
		got[policy.AnalyzerID] = policy
	}
	want := map[string]evidence.CacheKindPolicy{
		"recording-coverage-words": {AnalyzerID: "recording-coverage-words", MaxBytes: 256 << 20},
		"peaks":                    {AnalyzerID: "peaks", MaxBytes: 64 << 20},
		"measure.file":             {AnalyzerID: "measure.file", MaxBytes: 8 << 20},
		"editing.silence":          {AnalyzerID: "editing.silence", MaxBytes: 64 << 20, MaxAge: 24 * time.Hour},
		"passagetakes.measure":     {AnalyzerID: "passagetakes.measure", MaxBytes: 8 << 20, MaxAge: 7 * 24 * time.Hour},
		"":                         {AnalyzerID: "", MaxBytes: 256 << 20, MaxAge: 30 * 24 * time.Hour},
	}
	if len(got) != len(cacheRetentionPolicies) || len(got) != len(want) {
		t.Fatalf("the table has %d kinds (%d distinct), want %d", len(cacheRetentionPolicies), len(got), len(want))
	}
	for id, policy := range want {
		if got[id] != policy {
			t.Errorf("kind %q: %+v, want %+v", id, got[id], policy)
		}
	}
}

// Every file that builds a cache key is known here, so a new writer of the analysis cache is added to the table (or its kind is
// stated as kept) on purpose: an analyzer missing from the table keeps every entry for good.
func TestEveryWriterOfTheAnalysisCacheIsInTheRetentionTable(t *testing.T) {
	writers := map[string]bool{
		"internal/coverage/words.go": true, "internal/editing/cache.go": true, "internal/measure/cache.go": true,
		"internal/measure/measurecache.go": true, "internal/passagetakes/evidence.go": true,
		"internal/evidence/cache.go": true, // the store itself and its envelope
	}
	err := filepath.WalkDir("internal", func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		slash := filepath.ToSlash(path)
		if entry.IsDir() || !strings.HasSuffix(slash, ".go") || strings.HasSuffix(slash, "_test.go") || strings.Contains(slash, "/cmd/") {
			return nil
		}
		text, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if strings.Contains(withoutCommentLines(string(text)), "CacheEntryKey{") && !writers[slash] {
			t.Errorf("%s builds an evidence.CacheEntryKey: add its analyzer to cacheRetentionPolicies and this list", slash)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{measure.PeaksAnalyzerID, measure.FileAnalyzerID, editing.AnalyzerSilence, passagetakes.MeasureAnalyzerID, coverage.WordsAnalyzerID} {
		if !slices.ContainsFunc(cacheRetentionPolicies, func(p evidence.CacheKindPolicy) bool { return p.AnalyzerID == id }) {
			t.Errorf("analyzer %q writes the cache and has no row in cacheRetentionPolicies", id)
		}
	}
}

// A pass cut short has trimmed the cheap kinds first: the order the issue ranks the kinds by what an entry costs to make again, the
// recogniser's words last of the named kinds and the entries with no analyzer after them.
func TestTheCacheRetentionTableTakesTheKindsInTheIssuesOrder(t *testing.T) {
	var ids []string
	for _, policy := range cacheRetentionPolicies {
		ids = append(ids, policy.AnalyzerID)
	}
	want := []string{measure.PeaksAnalyzerID, editing.AnalyzerSilence, passagetakes.MeasureAnalyzerID, measure.FileAnalyzerID, coverage.WordsAnalyzerID, ""}
	if !slices.Equal(ids, want) {
		t.Fatalf("kinds in order %q; want %q", ids, want)
	}
}

func TestTheCacheStepRemovesWhatItsKindsLimitsSayAndReportsIt(t *testing.T) {
	project := t.TempDir()
	now := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	stale := writeCacheEntry(t, project, cacheKeyOf(editing.AnalyzerSilence, "stale"), now.Add(-25*time.Hour))
	fresh := writeCacheEntry(t, project, cacheKeyOf(editing.AnalyzerSilence, "fresh"), now.Add(-23*time.Hour))
	takes := writeCacheEntry(t, project, cacheKeyOf(passagetakes.MeasureAnalyzerID, "takes"), now.Add(-6*24*time.Hour))
	unknown := writeCacheEntry(t, project, cacheKeyOf("a-newer-analyzer", "x"), now.Add(-900*24*time.Hour))
	step := cacheRetention{cache: evidence.NewCacheStore(project), policies: cacheRetentionPolicies, now: func() time.Time { return now }}

	report := step.Run(context.Background(), func() bool { return false })
	if report.Err != nil || report.Stopped || report.Kind != "analysis cache" {
		t.Fatalf("report = %+v", report)
	}
	if fileExists(stale) || !fileExists(fresh) || !fileExists(takes) || !fileExists(unknown) {
		t.Fatalf("stale kept %v, fresh kept %v, takes kept %v, unknown kept %v; want only the editing scan unused for 25 hours gone",
			fileExists(stale), fileExists(fresh), fileExists(takes), fileExists(unknown))
	}
	if report.Removed != 1 || report.FilesBefore != 4 || report.FilesAfter != 3 || report.BytesAfter >= report.BytesBefore {
		t.Fatalf("report = %+v; want 1 removed, 4 files before and 3 after", report)
	}
}

func TestTheCacheStepToleratesANilStopAContextAndStoreNobodyGave(t *testing.T) {
	project := t.TempDir()
	step := cacheRetention{cache: evidence.NewCacheStore(project), policies: cacheRetentionPolicies}
	if report := step.Run(nil, nil); report.Err != nil || report.Stopped { //nolint:staticcheck // a nil context is the point
		t.Fatalf("a step with no stop, context or clock: %+v", report)
	}
	if report := (cacheRetention{}).Run(context.Background(), func() bool { return false }); report.Err == nil {
		t.Fatalf("a step with no cache reported no error: %+v", report)
	}
}

func TestTheCacheStepStopsWhenAPassIsToldTo(t *testing.T) {
	project := t.TempDir()
	now := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	stale := writeCacheEntry(t, project, cacheKeyOf(editing.AnalyzerSilence, "stale"), now.Add(-48*time.Hour))
	step := cacheRetention{cache: evidence.NewCacheStore(project), policies: cacheRetentionPolicies, now: func() time.Time { return now }}

	if report := step.Run(context.Background(), func() bool { return true }); !report.Stopped || report.Removed != 0 || !fileExists(stale) {
		t.Fatalf("told to stop (a check running): report = %+v, entry kept %v; want it stopped with the entry left", report, fileExists(stale))
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if report := step.Run(cancelled, func() bool { return false }); !report.Stopped || !fileExists(stale) {
		t.Fatalf("cancelled (a project switch): report = %+v, entry kept %v; want it stopped with the entry left", report, fileExists(stale))
	}
}

// Opening a project removes a cache entry its kind's time has run out for, and leaves a take's entry within its week and an entry of
// an analyzer the table does not name.
func TestOpeningAProjectExpiresAnEditingScanUnusedForADay(t *testing.T) {
	project := twoTakeCoverageProject(t)
	stale := writeCacheEntry(t, project, cacheKeyOf(editing.AnalyzerSilence, "stale"), time.Now().Add(-48*time.Hour))
	takes := writeCacheEntry(t, project, cacheKeyOf(passagetakes.MeasureAnalyzerID, "takes"), time.Now().Add(-48*time.Hour))
	unknown := writeCacheEntry(t, project, cacheKeyOf("a-newer-analyzer", "x"), time.Now().Add(-900*24*time.Hour))

	host := coverageHost(t, project, true, fakeAlignedCoverageSidecarWithSkip())
	waitForRetentionPass(t, host, "open")
	host.closeRetention()
	if fileExists(stale) || !fileExists(takes) || !fileExists(unknown) {
		t.Fatalf("after the open pass: stale kept %v, takes kept %v, unknown kept %v; want only the editing scan gone", fileExists(stale), fileExists(takes), fileExists(unknown))
	}
}
