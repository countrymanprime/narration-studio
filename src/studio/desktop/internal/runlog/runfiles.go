package runlog

import (
	"desktop/internal/persist"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	// maxRunFiles and maxRunFileAge are the per-run retention: the last 20 runs or 7 days, whichever keeps fewer. A
	// file must be within both to survive a prune — the more aggressive of the two limits wins, never the looser one.
	maxRunFiles   = 20
	maxRunFileAge = 7 * 24 * time.Hour
)

// Level is "debug" or "info", read live from the shared level a sidecar's NARRATION_LOG_LEVEL is built from — not
// fixed at Begin, so a sidecar started after the narrator turns debug on mid-run still gets it. "info" on a nil Run.
func (r *Run) Level() string {
	if r == nil || r.level == nil || r.level.Level() > slog.LevelDebug {
		return "info"
	}
	return "debug"
}

// StderrWriter appends everything written to it to this run's own file, logs/runs/<run-id>.stderr.jsonl — the sidecar
// stderr that internal/process writes here. A nil Run, or one with no runs folder, discards silently:
// a run only exists to log, never to block whatever launched it.
func (r *Run) StderrWriter() io.WriteCloser {
	if r == nil || r.runsDir == "" {
		return discardWriteCloser{}
	}
	return &stderrFileWriter{path: filepath.Join(r.runsDir, r.id+".stderr.jsonl")}
}

type discardWriteCloser struct{}

func (discardWriteCloser) Write(p []byte) (int, error) { return len(p), nil }
func (discardWriteCloser) Close() error                { return nil }

// stderrFileWriter opens, appends and closes on every Write, the same shape as hostlog.Log.Report and runlog's own
// rotatingWriter: simple, and safe without a mutex here since exec.Cmd relays one stream through one goroutine, so a
// given run's file only ever has one writer.
type stderrFileWriter struct{ path string }

func (w *stderrFileWriter) Write(p []byte) (int, error) {
	if err := os.MkdirAll(filepath.Dir(w.path), 0o755); err != nil {
		return 0, fmt.Errorf("could not prepare the run's stderr folder: %w", err)
	}
	file, err := os.OpenFile(w.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, fmt.Errorf("could not open the run's stderr file: %w", err)
	}
	n, err := file.Write(p)
	if err != nil {
		_ = file.Close()
		return n, err
	}
	return n, file.Close()
}

func (w *stderrFileWriter) Close() error { return nil }

// pruneBudget is the most a Begin spends pruning logs/runs; a variable so a test can make it run out.
var pruneBudget = time.Second

// runFilesRule is what Begin prunes logs/runs by (persist.PruneFolder): the newest maxRunFiles run files stay and any older than
// maxRunFileAge go, so a long burst of runs does not fill the disk and a quiet week does not keep stale debug detail around. A run file
// written in the last hour is never removed, whatever the count, so a sidecar that wrote only at its start and is still running keeps its
// earlier lines (a burst of more than maxRunFiles runs within an hour therefore keeps them all until the hour has passed). Only
// <run-id>.stderr.jsonl files are runs' (anything else in the folder is left alone) and nothing is removed through a link.
var runFilesRule = persist.PruneRule{
	Group:      func(name string) (string, bool) { return name, strings.HasSuffix(name, ".stderr.jsonl") },
	KeepGroups: maxRunFiles,
	MaxAge:     maxRunFileAge,
	Guard:      time.Hour,
}
