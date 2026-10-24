package takecompare

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/process"
)

// The test binary doubles as the sidecar: started with fakeSidecarEnv set, TestMain writes that variable's words report
// to --out (or exits with the code it names) instead of running the tests.
const fakeSidecarEnv = "TAKECOMPARE_FAKE_SIDECAR"

func TestMain(m *testing.M) {
	if report, ok := os.LookupEnv(fakeSidecarEnv); ok {
		fakeSidecar(report)
	}
	os.Exit(m.Run())
}

func fakeSidecar(report string) {
	var code int
	if _, err := fmt.Sscanf(report, "exit %d", &code); err == nil {
		fmt.Fprintln(os.Stderr, "The take's source file could not be decoded")
		os.Exit(code)
	}
	for k, arg := range os.Args {
		if arg == "--out" && k+1 < len(os.Args) {
			if err := os.WriteFile(os.Args[k+1], []byte(report), 0o600); err != nil {
				os.Exit(3)
			}
		}
	}
	os.Exit(0)
}

func writeFile(t *testing.T, path string, value any) {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
}

// runnerFixture is a manuscript of one chapter and a manifest of one take of its second sentence.
func runnerFixture(t *testing.T, firstUnit, lastUnit int) (SidecarRequest, *ProcessRunner) {
	t.Helper()
	dir := t.TempDir()
	manuscript := filepath.Join(dir, "project", "app", "manuscript", "manuscript.json")
	writeFile(t, manuscript, map[string]any{"schemaVersion": 1, "documentId": "d",
		"chapters":   []any{map[string]any{"id": "ch-1", "title": "Chapter One"}},
		"paragraphs": []any{map[string]any{"id": "p-1", "chapterId": "ch-1", "index": 0, "text": "Alice was tired. She had nothing to do."}}})
	manifest := filepath.Join(dir, "session", "manifest.json")
	writeFile(t, manifest, map[string]any{"schemaVersion": 1, "chapterId": "ch-1", "span": map[string]int{"firstUnit": firstUnit, "lastUnit": lastUnit},
		"takes": []any{map[string]any{"itemGuid": "{I}", "takeGuid": "{T}", "sourceFile": "a.wav", "startOffset": 10.0, "length": 4.0}}})
	supervisor := process.NewSupervisor()
	t.Cleanup(func() { _ = supervisor.Close() })
	return SidecarRequest{ManifestPath: manifest, ManuscriptPath: manuscript, Model: "small"},
		&ProcessRunner{Sidecars: supervisor, Python: os.Args[0], SessionDir: filepath.Join(dir, "session")}
}

const fakeReport = `TAKE_TRANSCRIPTION|{"language":"en","model":"small"}` + "\n" +
	`TAKE_WORDS|{"index":0,"takeGuid":"{T}","words":[["She",0.0,0.3],["had",0.4,0.7],["nothing",0.8,1.1],["two",1.2,1.5],["do",1.6,1.9]]}` + "\n"

func TestTheRunnerAlignsTheSidecarsWordsToTheSpan(t *testing.T) {
	t.Setenv(fakeSidecarEnv, fakeReport)
	req, runner := runnerFixture(t, 1, 1)

	text, err := runner.TakeDivergence(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	results, err := ParseResults(text)
	if err != nil {
		t.Fatalf("%v\n%s", err, text)
	}
	if len(results.Takes) != 1 || len(results.Takes[0].Divergences) != 1 || results.Takes[0].Divergences[0].AudioText != "two" {
		t.Fatalf("results = %+v", results)
	}
	if entries, _ := os.ReadDir(runner.SessionDir); len(entries) != 1 { // the manifest; the words report is removed
		t.Fatalf("session folder = %v", entries)
	}
}

func TestABadSpanIsRefusedBeforeTheSidecarStarts(t *testing.T) {
	t.Setenv(fakeSidecarEnv, "exit 9") // would be reported if it ran
	req, runner := runnerFixture(t, 0, 7)

	if _, err := runner.TakeDivergence(context.Background(), req); err == nil || !strings.Contains(err.Error(), "not within the chapter") {
		t.Fatalf("err = %v", err)
	}
}

func TestASidecarFailureOrAReportThatDoesNotFitIsAnError(t *testing.T) {
	for report, want := range map[string]string{
		"exit 1": "the take aligner exited 1: The take's source file could not be decoded",
		`TAKE_TRANSCRIPTION|{"model":"small"}` + "\n":    "no words for take 0",
		"COVERAGE_WORDS|{}\n":                            "unknown line",
		strings.ReplaceAll(fakeReport, "{T}", "{OTHER}"): "of take {OTHER}, not {T}",
	} {
		t.Setenv(fakeSidecarEnv, report)
		req, runner := runnerFixture(t, 1, 1)
		if _, err := runner.TakeDivergence(context.Background(), req); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%q: err = %v, want %q", report, err, want)
		}
	}
}

func TestACancelledComparisonIsTheContextsError(t *testing.T) {
	t.Setenv(fakeSidecarEnv, "exit 2")
	req, runner := runnerFixture(t, 1, 1)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := runner.TakeDivergence(ctx, req); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v", err)
	}
}
