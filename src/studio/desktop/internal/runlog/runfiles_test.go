package runlog

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestStderrWriterAppendsToTheRunsOwnFile(t *testing.T) {
	logger, path := newLogger(t, 0)
	run := logger.Begin("transcript_compare")
	writer := run.StderrWriter()
	if _, err := writer.Write([]byte("line one\n")); err != nil {
		t.Fatal(err)
	}
	if _, err := writer.Write([]byte("line two\n")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	stderrPath := filepath.Join(filepath.Dir(path), "runs", run.ID()+".stderr.jsonl")
	got, err := os.ReadFile(stderrPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "line one\nline two\n" {
		t.Fatalf("stderr file = %q", got)
	}
}

func TestNilRunStderrWriterDiscardsSilently(t *testing.T) {
	var run *Run
	writer := run.StderrWriter()
	if _, err := writer.Write([]byte("dropped")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestLevelReadsLiveFromTheSharedLevelVar(t *testing.T) {
	logger, _ := newLogger(t, 0)
	run := logger.Begin("guide")
	if got := run.Level(); got != "info" {
		t.Fatalf("Level() = %q before SetDebug, want info", got)
	}
	logger.SetDebug(true)
	if got := run.Level(); got != "debug" {
		t.Fatalf("Level() = %q after SetDebug(true), want debug", got)
	}
	if got := (*Run)(nil).Level(); got != "info" {
		t.Fatalf("nil Run Level() = %q, want info", got)
	}
}

func TestBeginKeepsTheNewestRunFilesUpToTheCountLimit(t *testing.T) {
	logger, path := newLogger(t, 0)
	runsDir := filepath.Join(filepath.Dir(path), "runs")
	if err := os.MkdirAll(runsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	base := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < maxRunFiles+5; i++ {
		name := filepath.Join(runsDir, "run-"+strconv.Itoa(i)+".stderr.jsonl")
		if err := os.WriteFile(name, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
		modTime := base.Add(time.Duration(i) * time.Minute)
		if err := os.Chtimes(name, modTime, modTime); err != nil {
			t.Fatal(err)
		}
	}
	// All files land within minutes of each other, so fixing "now" three hours after the last one keeps every file outside
	// the one-hour guard and well inside the 7-day age limit — this test is only exercising the count limit, not the age one.
	logger.now = fixedClock(base.Add(time.Duration(maxRunFiles+5)*time.Minute + 3*time.Hour)) // past the hour a written file is left alone

	logger.Begin("prune") // a run begins: the folder is pruned first

	entries, err := os.ReadDir(runsDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != maxRunFiles {
		t.Fatalf("got %d files after pruning, want %d", len(entries), maxRunFiles)
	}
	// The oldest 5 (run-0 .. run-4) must be gone; the newest maxRunFiles must remain.
	if _, err := os.Stat(filepath.Join(runsDir, "run-0.stderr.jsonl")); err == nil {
		t.Fatal("the oldest run file should have been pruned by count")
	}
	if _, err := os.Stat(filepath.Join(runsDir, "run-"+strconv.Itoa(maxRunFiles+4)+".stderr.jsonl")); err != nil {
		t.Fatal("the newest run file should have survived pruning")
	}
}

func TestBeginDropsRunFilesOlderThanTheAgeLimitEvenUnderTheCountLimit(t *testing.T) {
	logger, path := newLogger(t, 0)
	runsDir := filepath.Join(filepath.Dir(path), "runs")
	if err := os.MkdirAll(runsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	fresh := filepath.Join(runsDir, "fresh.stderr.jsonl")
	stale := filepath.Join(runsDir, "stale.stderr.jsonl")
	for _, name := range []string{fresh, stale} {
		if err := os.WriteFile(name, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	if err := os.Chtimes(fresh, now.Add(-time.Hour), now.Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(stale, now.Add(-8*24*time.Hour), now.Add(-8*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	logger.now = fixedClock(now)

	logger.Begin("prune") // a run begins: the folder is pruned first

	if _, err := os.Stat(fresh); err != nil {
		t.Fatal("a file within 7 days should survive even though only two files exist")
	}
	if _, err := os.Stat(stale); err == nil {
		t.Fatal("a file older than 7 days should be pruned even though the count limit was not reached")
	}
}

func TestWithRunAndFromContextRoundTrip(t *testing.T) {
	logger, _ := newLogger(t, 0)
	run := logger.Begin("guide")
	ctx := WithRun(context.Background(), run)
	if got := FromContext(ctx); got != run {
		t.Fatalf("FromContext returned %v, want the same run", got)
	}
	if got := FromContext(context.Background()); got != nil {
		t.Fatalf("FromContext on a plain context = %v, want nil", got)
	}
}

// Only a run's own file is pruned: a stray file in the folder is neither counted nor removed, and a link is not followed.
func TestBeginPrunesOnlyRunFilesAndFollowsNoLink(t *testing.T) {
	logger, path := newLogger(t, 0)
	runsDir := filepath.Join(filepath.Dir(path), "runs")
	if err := os.MkdirAll(runsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	old := now.Add(-30 * 24 * time.Hour)
	stray := filepath.Join(runsDir, "notes.txt")
	elsewhere := filepath.Join(t.TempDir(), "outside.stderr.jsonl")
	link := filepath.Join(runsDir, "link.stderr.jsonl")
	for _, name := range []string{stray, elsewhere} {
		if err := os.WriteFile(name, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(name, old, old); err != nil {
			t.Fatal(err)
		}
	}
	linked := os.Symlink(elsewhere, link) == nil
	logger.now = fixedClock(now)

	logger.Begin("prune")

	if _, err := os.Stat(stray); err != nil {
		t.Fatal("a file that is not a run's was removed")
	}
	if _, err := os.Stat(elsewhere); err != nil {
		t.Fatal("a file behind a link was removed")
	}
	if linked {
		if _, err := os.Lstat(link); err != nil {
			t.Fatal("a link was removed")
		}
	}
}

// A run's file written within the last hour stays however many newer runs began: a sidecar that wrote only at its start is still running.
func TestBeginLeavesARunFileWrittenWithinTheLastHour(t *testing.T) {
	logger, path := newLogger(t, 0)
	runsDir := filepath.Join(filepath.Dir(path), "runs")
	if err := os.MkdirAll(runsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	for i := 0; i < maxRunFiles+3; i++ {
		name := filepath.Join(runsDir, "run-"+strconv.Itoa(i)+".stderr.jsonl")
		if err := os.WriteFile(name, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
		modTime := now.Add(-time.Duration(i) * time.Minute) // all within the last hour
		if err := os.Chtimes(name, modTime, modTime); err != nil {
			t.Fatal(err)
		}
	}
	logger.now = fixedClock(now)
	logger.Begin("prune")
	if entries, err := os.ReadDir(runsDir); err != nil || len(entries) != maxRunFiles+3 {
		t.Fatalf("%d files left (%v); want all %d: each was written within the hour", len(entries), err, maxRunFiles+3)
	}
}

// A Begin whose prune budget has run out still starts the run and removes nothing it did not get to.
func TestBeginDoesNotWaitOnAPruneThatRanOutOfBudget(t *testing.T) {
	was := pruneBudget
	t.Cleanup(func() { pruneBudget = was })
	pruneBudget = -time.Second
	logger, path := newLogger(t, 0)
	runs := filepath.Join(filepath.Dir(path), "runs")
	if err := os.MkdirAll(runs, 0o755); err != nil {
		t.Fatal(err)
	}
	stale := filepath.Join(runs, "old.stderr.jsonl")
	if err := os.WriteFile(stale, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-30 * 24 * time.Hour)
	if err := os.Chtimes(stale, old, old); err != nil {
		t.Fatal(err)
	}
	if run := logger.Begin("tool"); run == nil {
		t.Fatal("Begin returned no run")
	}
	if _, err := os.Stat(stale); err != nil {
		t.Fatalf("a prune past its budget removed a file: %v", err)
	}
}

// B2: a logs/runs that is a link is not pruned (nothing is removed through a link), and the run log says so instead of letting it grow in silence.
func TestBeginRecordsARunsFolderItWillNotPrune(t *testing.T) {
	logger, path := newLogger(t, 0)
	elsewhere := t.TempDir()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(elsewhere, filepath.Join(filepath.Dir(path), "runs")); err != nil {
		t.Skipf("no links here: %v", err)
	}
	logger.Begin("tool")
	var warned bool
	for _, record := range readLines(t, path) {
		warned = warned || record["event"] == "runs.prune"
	}
	if !warned {
		t.Fatal("a logs/runs that is a link was skipped without a record")
	}
}
