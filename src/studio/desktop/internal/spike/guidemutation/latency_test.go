//go:build spike && spikelatency

package guidemutation

// How to run (from src/studio/desktop; not part of the gate, it takes a few minutes):
//
//	SPIKE_PYTHON=<repo>/.venv/bin/python go test -tags spike,spikelatency -run TestLatency -count=1 -v ./internal/spike/guidemutation
//
// SPIKE_RUNS (default 20) and SPIKE_OUT (a file the markdown table is written to) are optional.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

type sample struct {
	name  string
	first time.Duration
	rest  []time.Duration
}

func (s sample) percentile(p float64) time.Duration {
	sorted := append([]time.Duration(nil), s.rest...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	return sorted[int(float64(len(sorted)-1)*p+0.5)]
}

func (s sample) max() time.Duration {
	longest := s.first
	for _, d := range s.rest {
		longest = max(longest, d)
	}
	return longest
}

func ms(d time.Duration) string {
	return strconv.FormatFloat(float64(d.Microseconds())/1000, 'f', 1, 64)
}

// measure is latency_test.go's method: runs timed calls, the first reported alone, p50/p95/max over the rest.
func measure(t *testing.T, name string, runs int, setup func(), op func(i int) error) sample {
	t.Helper()
	result := sample{name: name}
	for i := 0; i < runs; i++ {
		if setup != nil {
			setup()
		}
		start := time.Now()
		if err := op(i); err != nil {
			t.Fatalf("%s run %d: %v", name, i, err)
		}
		if took := time.Since(start); i == 0 {
			result.first = took
		} else {
			result.rest = append(result.rest, took)
		}
	}
	return result
}

func workerOK(result Result, err error) error {
	if err != nil {
		return err
	}
	if result.Code != 0 {
		return fmt.Errorf("code %d: %s", result.Code, result.Stderr)
	}
	return nil
}

func operations(t *testing.T, py string, p project, runs int) []sample {
	t.Helper()
	var out []sample
	out = append(out, measure(t, "spawn: edit, 1 field", runs, nil, func(i int) error { return p.svc.Edit(p.subject, "description", fmt.Sprint("spawn ", i)) }))
	out = append(out, measure(t, "spawn: setLocked", runs, nil, func(i int) error { return p.svc.Edit(p.subject, "locked", fmt.Sprint(i%2 == 1)) }))
	_ = p.svc.Edit(p.subject, "locked", "false")

	worker := NewWorker(py, workerScript(t))
	defer func() { _ = worker.Close() }()
	out = append(out, measure(t, "worker: edit, 1 field (first = start + call)", runs, nil, func(i int) error {
		return workerOK(worker.Run(editArgv(p.guidePath, p.subject, "description", fmt.Sprint("warm ", i))...))
	}))
	out = append(out, measure(t, "worker: setLocked", runs, nil, func(i int) error {
		return workerOK(worker.Run(editArgv(p.guidePath, p.subject, "locked", fmt.Sprint(i%2 == 1))...))
	}))
	_ = worker.Close()
	_ = p.svc.Edit(p.subject, "locked", "false")
	// What a call pays when the worker has gone (the idle exit): a start and the call, every time.
	out = append(out, measure(t, "worker: edit after an idle exit (start + call)", runs, func() { _ = worker.Close() }, func(i int) error {
		return workerOK(worker.Run(editArgv(p.guidePath, p.subject, "description", fmt.Sprint("cold ", i))...))
	}))

	out = append(out, measure(t, "Go: edit, 1 field", runs, nil, func(i int) error {
		return Edit(p.guidePath, p.subject, map[string]string{"description": fmt.Sprint("go ", i)})
	}))
	out = append(out, measure(t, "Go: setLocked", runs, nil, func(i int) error {
		return Edit(p.guidePath, p.subject, map[string]string{"locked": fmt.Sprint(i%2 == 1)})
	}))
	_ = Edit(p.guidePath, p.subject, map[string]string{"locked": "false"})
	document := Open(p.guidePath)
	out = append(out, measure(t, "Go: edit, document held in memory, unindented write (first = parse)", runs, nil, func(i int) error {
		return document.Edit(p.subject, map[string]string{"description": fmt.Sprint("held ", i)})
	}))
	out = append(out, measure(t, "Go: setLocked, document held in memory, unindented write", runs, nil, func(i int) error {
		return document.Edit(p.subject, map[string]string{"locked": fmt.Sprint(i%2 == 1)})
	}))
	_ = Edit(p.guidePath, p.subject, map[string]string{"locked": "false"})
	// The Go edit is read, change, write; the read and the write alone show where its time goes.
	out = append(out, measure(t, "Go: read and parse only", runs, nil, func(int) error { _, err := load(p.guidePath); return err }))
	held, err := load(p.guidePath)
	if err != nil {
		t.Fatal(err)
	}
	// A host that keeps the document in memory between edits (re-reading it only when another writer changed the file) pays this.
	out = append(out, measure(t, "Go: write only (document held in memory)", runs, nil, func(int) error { return write(p.guidePath, held) }))
	out = append(out, measure(t, "Go: write only, unindented (document held in memory)", runs, nil, func(int) error {
		raw, err := json.Marshal(held)
		if err != nil {
			return err
		}
		return os.WriteFile(p.guidePath, raw, 0o644)
	}))
	return out
}

func table(header string, rows []sample) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s\n\n| Operation | Runs | First (ms) | p50 (ms) | p95 (ms) | Max (ms) |\n| --- | --- | --- | --- | --- | --- |\n", header)
	for _, row := range rows {
		fmt.Fprintf(&b, "| %s | %d | %s | %s | %s | %s |\n", row.name, len(row.rest)+1, ms(row.first), ms(row.percentile(0.5)), ms(row.percentile(0.95)), ms(row.max()))
	}
	return b.String()
}

func TestLatency(t *testing.T) {
	py := python(t)
	runs := 20
	if value, err := strconv.Atoi(os.Getenv("SPIKE_RUNS")); err == nil && value > 1 {
		runs = value
	}
	var report strings.Builder
	for _, size := range []struct {
		label              string
		chapters, perChapt int
	}{{"small", 3, 10}, {"full-length", 30, 40}} {
		p := newProject(t, py, size.chapters, size.perChapt)
		header := fmt.Sprintf("### %s manuscript (%d words; Story Bible file %d KB)", size.label, p.words, p.size/1024)
		report.WriteString(table(header, operations(t, py, p, runs)) + "\n")
	}
	t.Log("\n" + report.String())
	if out := os.Getenv("SPIKE_OUT"); out != "" {
		if err := os.WriteFile(out, []byte(report.String()), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestHeldDocumentRefusesWithoutChangingAndRereadsAfterAnotherWriter(t *testing.T) {
	path := filepath.Join(t.TempDir(), "manuscript_guide.json")
	if err := os.WriteFile(path, []byte(fixture), 0o644); err != nil {
		t.Fatal(err)
	}
	document := Open(path)
	if err := document.Edit("entity-a", map[string]string{"description": "first"}); err != nil {
		t.Fatal(err)
	}
	if err := document.Edit("entity-a", map[string]string{"description": "lost", "category": "Draft"}); err == nil {
		t.Fatal("a reserved category was accepted")
	}
	if err := document.Edit("entity-a", map[string]string{"context": "c"}); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if strings.Contains(string(raw), "lost") || !strings.Contains(string(raw), `"text":"first"`) {
		t.Fatalf("a refused field reached the held document:\n%s", raw)
	}
	// Another writer (a build) replaces the file: the next edit works on its content, not the held copy.
	if err := os.WriteFile(path, []byte(strings.Replace(fixture, `"Mirelle", "category": "Place", "locked": true`, `"Mirelle", "category": "Place", "locked": false`, 1)), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := document.Edit("entity-b", map[string]string{"description": "rebuilt"}); err != nil {
		t.Fatalf("the edit after another writer used the stale copy: %v", err)
	}
	if raw, _ := os.ReadFile(path); strings.Contains(string(raw), `"first"`) {
		t.Fatalf("the stale held copy was written over the other writer's file:\n%s", raw)
	}
}
