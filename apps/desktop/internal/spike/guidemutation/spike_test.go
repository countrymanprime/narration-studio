//go:build spike

package guidemutation

// How to run (from apps/desktop; not part of the gate):
//
//	SPIKE_PYTHON=<repo>/.venv/bin/python go test -tags spike -count=1 -v ./internal/spike/guidemutation
//
// Without SPIKE_PYTHON only the Go-only tests run. TestLatency also needs SPIKE_LATENCY=1; it takes a few minutes. SPIKE_RUNS
// (default 20) and SPIKE_OUT (a file the markdown table is written to) are optional.

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/guide"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "..")
}

func backend(t *testing.T) string {
	return filepath.Join(repoRoot(t), "sidecars", "manuscript-guide", "core", "manuscript_guide.py")
}

func workerScript(t *testing.T) string {
	return filepath.Join(repoRoot(t), "sidecars", "manuscript-guide", "spikes", "serve_worker.py")
}

func python(t *testing.T) string {
	t.Helper()
	value := os.Getenv("SPIKE_PYTHON")
	if value == "" {
		t.Skip("set SPIKE_PYTHON to the repository's Python to run the sidecar side")
	}
	return value
}

// The generator is latency_test.go's (internal/latency), copied with the same seed so the manuscripts are the same text.
var words = strings.Fields("the door was open and rain fell on stone while a quiet wind moved through hall toward river bridge morning light old road " +
	"lantern shadow market horse letter window garden after before under above small long dark bright cold warm heard saw knew said walked turned")
var names = []string{"Aldric", "Mirelle", "Dawnspire", "Corvane", "Thessaly", "Harrowgate", "Ombrel", "Vasquin", "Eldermoor", "Quillon"}

func sentence(r *rand.Rand) string {
	var b strings.Builder
	n := 7 + r.Intn(8)
	for i := 0; i < n; i++ {
		if i > 0 {
			b.WriteByte(' ')
		}
		if i > 0 && r.Intn(6) == 0 {
			b.WriteString(names[r.Intn(len(names))])
			continue
		}
		w := words[r.Intn(len(words))]
		if i == 0 {
			w = strings.ToUpper(w[:1]) + w[1:]
		}
		b.WriteString(w)
	}
	b.WriteByte('.')
	return b.String()
}

func synthManuscript(path string, chapters, perChapter int) (int, error) {
	r := rand.New(rand.NewSource(7))
	var chapterList, paragraphList []map[string]any
	total, index := 0, 0
	for c := 0; c < chapters; c++ {
		id := fmt.Sprintf("ch%03d", c+1)
		title := fmt.Sprintf("Chapter %d", c+1)
		chapterList = append(chapterList, map[string]any{"id": id, "title": title, "contentKind": "narration", "index": c})
		for p := 0; p < perChapter; p++ {
			var text []string
			for s := 0; s < 7; s++ {
				text = append(text, sentence(r))
			}
			body := strings.Join(text, " ")
			total += len(strings.Fields(body))
			paragraphList = append(paragraphList, map[string]any{"id": fmt.Sprintf("p%05d", index), "chapterId": id, "chapterTitle": title, "text": body, "index": index})
			index++
		}
	}
	document := map[string]any{"schemaVersion": 1, "documentId": "latency", "importedAt": "2026-01-01T00:00:00Z", "chapters": chapterList, "paragraphs": paragraphList}
	raw, err := json.Marshal(document)
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return 0, err
	}
	return total, os.WriteFile(path, raw, 0o644)
}

// project is a project folder with a synthetic manuscript and a Story Bible the real sidecar built from it (rules-only: the
// baseline's venv had no spaCy model either).
type project struct {
	dir, guidePath string
	svc            *guide.Service
	words, size    int
	subject        string
}

func newProject(t *testing.T, py string, chapters, perChapter int) project {
	t.Helper()
	dir := t.TempDir()
	count, err := synthManuscript(filepath.Join(dir, "narration-utils", "manuscript", "manuscript.json"), chapters, perChapter)
	if err != nil {
		t.Fatal(err)
	}
	svc := guide.New(dir, py, backend(t), settings.New(t.TempDir(), dir), process.NewSupervisor())
	if _, err := svc.Build(filepath.Join(dir, "progress.txt"), filepath.Join(dir, "log.txt"), guide.RulesOnly); err != nil {
		t.Fatalf("build: %v", err)
	}
	p := project{dir: dir, guidePath: filepath.Join(dir, "ManuscriptGuide", "manuscript_guide.json"), svc: svc, words: count}
	entities, err := svc.Entities()
	if err != nil {
		t.Fatal(err)
	}
	for _, entity := range entities {
		if entity["canonical_name"] == "Aldric" {
			p.subject = fmt.Sprint(entity["id"])
		}
	}
	if p.subject == "" {
		t.Fatal("the build found no Aldric")
	}
	info, err := os.Stat(p.guidePath)
	if err != nil {
		t.Fatal(err)
	}
	p.size = int(info.Size())
	if keep := os.Getenv("SPIKE_KEEP"); keep != "" {
		copyFile(t, p.guidePath, filepath.Join(keep, fmt.Sprintf("guide-%d-words.json", count)))
	}
	return p
}

func editArgv(path, id, field, value string) []string {
	return []string{"edit", "--guide", path, "--entity-id", id, "--field", field, "--value=" + value}
}

func decodeFile(t *testing.T, path string) any {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func copyFile(t *testing.T, from, to string) {
	t.Helper()
	raw, err := os.ReadFile(from)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(to, raw, 0o644); err != nil {
		t.Fatal(err)
	}
}

const fixture = `{
  "schema_version": 2,
  "entities": [
    {"id": "entity-a", "canonical_name": "Aldric", "category": "Character", "locked": false, "score": 1.0,
     "aliases": ["Ald", {"text": "Old Ald", "pronunciation": {"ipa": "x", "source": "user"}, "occurrences": []}],
     "pronunciation": {"ipa": "a", "source": "user", "alternate": {"ipa": "b", "source": "user"}}, "description": {"text": ""}},
    {"id": "entity-b", "canonical_name": "Mirelle", "category": "Place", "locked": true}
  ],
  "types": [{"name": "Hero", "colour": "green", "speaks": true}, {"name": "Place", "colour": "blue", "speaks": false}]
}`

func TestEditAppliesTheFieldsAndTheLegacyNormalization(t *testing.T) {
	path := filepath.Join(t.TempDir(), "manuscript_guide.json")
	if err := os.WriteFile(path, []byte(fixture), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Edit(path, "entity-a", map[string]string{"description": "Tall", "category": "Hero", "properties": `[{"key": " Codename ", "value": "Wren"}]`}); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	text := string(raw)
	for _, want := range []string{`"text": "Tall"`, `"category": "Hero"`, `"key": "Codename"`, `"review_state": "reviewed"`, `"score": 1.0`, `"text": "Ald"`} {
		if !strings.Contains(text, want) {
			t.Errorf("the file has no %s:\n%s", want, text)
		}
	}
	if strings.Contains(text, `"source": "user"`) {
		t.Errorf("a legacy user source was written back:\n%s", text)
	}
}

func TestEditRefusesWithoutWriting(t *testing.T) {
	path := filepath.Join(t.TempDir(), "manuscript_guide.json")
	if err := os.WriteFile(path, []byte(fixture), 0o644); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		id     string
		fields map[string]string
		want   string
	}{
		{"entity-b", map[string]string{"description": "x"}, "locked"},
		{"entity-a", map[string]string{"category": "Character"}, "Unknown or reserved category"},
		{"entity-a", map[string]string{"category": "Draft"}, "Unknown or reserved category"},
		{"entity-a", map[string]string{"description": "x", "properties": `[{"key": "a", "value": ""}, {"key": "A", "value": ""}]`}, "two properties"},
		{"entity-a", map[string]string{"nickname": "x"}, "Unsupported"},
		{"entity-z", map[string]string{"description": "x"}, "not found"},
	}
	for _, c := range cases {
		if err := Edit(path, c.id, c.fields); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("Edit(%s, %v) = %v, want an error with %q", c.id, c.fields, err, c.want)
		}
	}
	if err := Edit(path, "entity-a", map[string]string{"aliases": "x"}); !errors.Is(err, ErrNeedsPython) {
		t.Errorf("an alias edit = %v, want ErrNeedsPython", err)
	}
	if raw, _ := os.ReadFile(path); string(raw) != fixture {
		t.Errorf("a refused edit wrote the file")
	}
	// The one locked field a locked entity takes is "locked" itself.
	if err := Edit(path, "entity-b", map[string]string{"locked": "false"}); err != nil {
		t.Fatal(err)
	}
}

// TestGoEditMatchesTheSidecar runs the same edits through manuscript_guide.py and through Edit on copies of one built Story Bible and
// requires the two files to hold the same JSON (key order aside).
func TestGoEditMatchesTheSidecar(t *testing.T) {
	py := python(t)
	p := newProject(t, py, 3, 10)
	edits := []map[string]string{
		{"description": "A tall man"},
		{"personality": "gruff"},
		{"personality": ""},
		{"context": "Narrator note"},
		{"properties": `[{"key": "Codename", "value": " Wren "}]`},
		{"category": "Place"},
		{"canonical_name": "Aldric the Elder"},
		{"locked": "true"},
		{"locked": "no"},
		{"description": "d", "context": "c", "personality": "p", "canonical_name": "Aldric"},
	}
	sidecarPath, goPath, heldPath := p.guidePath, filepath.Join(t.TempDir(), "go.json"), filepath.Join(t.TempDir(), "held.json")
	copyFile(t, sidecarPath, goPath)
	copyFile(t, sidecarPath, heldPath)
	held := Open(heldPath)
	for _, fields := range edits {
		if err := p.svc.EditFields(p.subject, fields); err != nil {
			t.Fatalf("sidecar %v: %v", fields, err)
		}
		if err := Edit(goPath, p.subject, fields); err != nil {
			t.Fatalf("Go %v: %v", fields, err)
		}
		if err := held.Edit(p.subject, fields); err != nil {
			t.Fatalf("held Go %v: %v", fields, err)
		}
		if a, b := decodeFile(t, sidecarPath), decodeFile(t, goPath); !reflect.DeepEqual(a, b) {
			t.Fatalf("after %v the sidecar's file and Go's differ", fields)
		}
		if a, b := decodeFile(t, sidecarPath), decodeFile(t, heldPath); !reflect.DeepEqual(a, b) {
			t.Fatalf("after %v the sidecar's file and the held document's differ", fields)
		}
	}
}

func TestWorkerAnswersLikeASpawnAndRestarts(t *testing.T) {
	py := python(t)
	p := newProject(t, py, 3, 10)
	worker := NewWorker(py, workerScript(t), "--idle-seconds", "0.5")
	defer func() { _ = worker.Close() }()

	result, err := worker.Run(editArgv(p.guidePath, p.subject, "description", "warm")...)
	if err != nil || result.Code != 0 || strings.TrimSpace(result.Stdout) != "EDITED|"+p.subject {
		t.Fatalf("edit = %+v, %v", result, err)
	}
	result, err = worker.Run(editArgv(p.guidePath, "entity-nobody", "description", "x")...)
	if err != nil || result.Code != 1 || !strings.Contains(result.Stderr, "Entity not found") {
		t.Fatalf("a refused edit = %+v, %v; want code 1 and the reason on stderr", result, err)
	}
	if result, _ := worker.Run("build", "--manuscript", "x", "--out", "y"); result.Code != 2 {
		t.Fatalf("the worker ran a build: %+v", result)
	}
	// After the idle exit the next call starts a new worker and still succeeds.
	time.Sleep(1500 * time.Millisecond)
	if result, err := worker.Run(editArgv(p.guidePath, p.subject, "locked", "true")...); err != nil || result.Code != 0 {
		t.Fatalf("the call after an idle exit = %+v, %v", result, err)
	}
	if worker.Starts() != 2 {
		t.Fatalf("starts = %d, want 2 (the first and one after the idle exit)", worker.Starts())
	}
	entities, err := p.svc.Entities()
	if err != nil {
		t.Fatal(err)
	}
	for _, entity := range entities {
		if entity["id"] == p.subject && (entity["locked"] != true || entity["description"].(map[string]any)["text"] != "warm") {
			t.Fatalf("the worker's edits are not in the file: %v", entity)
		}
	}
}

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
	if os.Getenv("SPIKE_LATENCY") == "" {
		t.Skip("set SPIKE_LATENCY=1 to measure")
	}
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
