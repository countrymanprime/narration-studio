package runlog

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// benchBegin times Begin, which prunes logs/runs first, over a folder of files stderr files (run-00000 the newest, every file past the hour
// a written file is left alone): after the first call the folder is held at its 20-file cap, so the loop times the steady state; with
// -benchtime=1x each run is the first Begin over a folder of files stale files. docs/research/2026-11-20-host-read-benchmark.md has the figures:
//
//	go -C src/studio/desktop test ./internal/runlog -run xxx -bench BenchmarkBegin -benchtime=200x -count=3
func benchBegin(b *testing.B, files int) {
	path := filepath.Join(b.TempDir(), "logs", "run.jsonl")
	logger := New(path, 0)
	runs := filepath.Join(filepath.Dir(path), "runs")
	if err := os.MkdirAll(runs, 0o755); err != nil {
		b.Fatal(err)
	}
	now := time.Now()
	for i := range files {
		name := filepath.Join(runs, fmt.Sprintf("run-%05d.stderr.jsonl", i))
		if err := os.WriteFile(name, []byte("x"), 0o600); err != nil {
			b.Fatal(err)
		}
		when := now.Add(-2*time.Hour - time.Duration(i)*time.Minute) // all past the hour a written file is left alone
		if err := os.Chtimes(name, when, when); err != nil {
			b.Fatal(err)
		}
	}
	b.ResetTimer()
	for range b.N {
		logger.Begin("bench")
	}
}

func BenchmarkBegin20(b *testing.B)   { benchBegin(b, 20) }
func BenchmarkBegin200(b *testing.B)  { benchBegin(b, 200) }
func BenchmarkBegin2000(b *testing.B) { benchBegin(b, 2000) }
