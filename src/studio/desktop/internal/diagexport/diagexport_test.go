package diagexport

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/trace"
)

// Every sentinel below is a value a narrator's content or a profile could hold. None may reach a bundle.
const (
	canaryUser    = "zelda-canary-user"
	canaryProject = "The Obsidian Orchard"
	canaryWord    = "CANARYWORD-hotword"
	canaryPath    = `C:\Users\zelda-canary-user\Documents\The Obsidian Orchard\ch1.wav`
)

var testEvent = trace.Define("test", "diag_event", trace.LevelInfo, trace.PathField("file"), trace.LenField("text"), trace.ErrField("err"), trace.IDField("chapter"))

func fixture(t *testing.T) (Options, *trace.Tracer, string) {
	t.Helper()
	dir := t.TempDir()
	tracer := trace.New(trace.Options{Path: filepath.Join(dir, "trace.jsonl"), Home: `C:\Users\` + canaryUser, ProjectRoot: `C:\Users\` + canaryUser + `\Documents\` + canaryProject})
	// An enabled tracer holds its file open; on Windows the temp directory cannot be removed until it is closed.
	t.Cleanup(tracer.Close)
	tracer.SetEnabled(true)
	tracer.Emit(testEvent, trace.PathValue("file", canaryPath), trace.LenValue("text", canaryWord), trace.ErrValue("err", os.ErrNotExist), trace.IDValue("chapter", "ch-1"))
	tracer.Flush()
	runLog := filepath.Join(dir, "run.jsonl")
	lines := []string{
		`{"ts":"2026-11-03T10:00:00Z","level":"INFO","event":"run.start","tool":"measure","run":"r1","path":"` + strings.ReplaceAll(canaryPath, `\`, `\\`) + `","msg":"` + canaryWord + `"}`,
		`{"ts":"2026-11-03T10:00:01Z","level":"INFO","event":"run.end","run":"r1","outcome":"ok","duration_ms":12,"quote":"` + canaryWord + `"}`,
		`not json ` + canaryWord,
	}
	if err := os.WriteFile(runLog, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return Options{
		Tracer: tracer, RunLogPath: runLog, TracePath: filepath.Join(dir, "trace.jsonl"), AppVersion: "0.0.0-dev",
		LeakTerms: []string{canaryUser, canaryProject}, Now: func() time.Time { return time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC) },
	}, tracer, dir
}

func zipContents(t *testing.T, path string) map[string]string {
	t.Helper()
	reader, err := zip.OpenReader(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reader.Close() }()
	out := map[string]string{}
	for _, file := range reader.File {
		handle, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(handle)
		_ = handle.Close()
		out[file.Name] = string(data)
	}
	return out
}

func TestNoCanaryReachesTheBundleItsManifestOrItsPreview(t *testing.T) {
	opts, _, dir := fixture(t)
	bundle, err := Build(opts)
	if err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(dir, "out.zip")
	if err := bundle.WriteZip(dest); err != nil {
		t.Fatal(err)
	}
	preview, _ := json.Marshal(bundle.Preview())
	everything := string(preview)
	for name, body := range zipContents(t, dest) {
		everything += "\n" + name + "\n" + body
	}
	for _, canary := range []string{canaryUser, canaryProject, canaryWord, "Obsidian", "Documents", "ch1.wav", "zelda"} {
		if strings.Contains(strings.ToLower(everything), strings.ToLower(canary)) {
			t.Errorf("sentinel %q reached the bundle:\n%s", canary, everything)
		}
	}
}

func TestTheManifestSaysWhatIsAndIsNotIncluded(t *testing.T) {
	opts, _, dir := fixture(t)
	bundle, err := Build(opts)
	if err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(dir, "out.zip")
	if err := bundle.WriteZip(dest); err != nil {
		t.Fatal(err)
	}
	var manifest Manifest
	if err := json.Unmarshal([]byte(zipContents(t, dest)["manifest.json"]), &manifest); err != nil {
		t.Fatal(err)
	}
	included := map[string]bool{}
	for _, file := range manifest.Files {
		included[file.Name] = true
	}
	if !included["trace.jsonl"] || !included["run.jsonl"] || included["manifest.json"] {
		t.Errorf("included = %v, want trace.jsonl and run.jsonl", included)
	}
	excluded := map[string]string{}
	for _, item := range manifest.Excluded {
		excluded[item.Name] = item.Reason
	}
	for _, name := range []string{"sidecar stderr", "host.log", "bridge.jsonl"} {
		if excluded[name] == "" {
			t.Errorf("manifest does not say %q is left out: %v", name, excluded)
		}
	}
	if manifest.Format != 1 || manifest.RedactionVersion != trace.RedactionVersion || manifest.AppVersion != "0.0.0-dev" {
		t.Errorf("manifest header = %+v", manifest)
	}
}

func TestTheRunLogKeepsOnlyAllowListedScalarsAndDropsUnreadableLines(t *testing.T) {
	opts, _, _ := fixture(t)
	bundle, err := Build(opts)
	if err != nil {
		t.Fatal(err)
	}
	body := string(bundle.File("run.jsonl"))
	if !strings.Contains(body, `"outcome":"ok"`) || !strings.Contains(body, `"duration_ms":12`) {
		t.Errorf("run.jsonl lost its allow-listed fields: %s", body)
	}
	if strings.Contains(body, "not json") || strings.Contains(body, "quote") || strings.Contains(body, `"path"`) {
		t.Errorf("run.jsonl kept a field outside the allow-list: %s", body)
	}
}

func TestTheLeakCheckDropsALineThatNamesTheUserOrTheProject(t *testing.T) {
	opts, tracer, _ := fixture(t)
	// An id field that happens to spell the user name: the registry allows it, the leak check must not.
	tracer.Emit(testEvent, trace.IDValue("chapter", canaryUser))
	tracer.Flush()
	bundle, err := Build(opts)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.ToLower(string(bundle.File("trace.jsonl"))), canaryUser) {
		t.Error("a line naming the user survived the leak check")
	}
	if bundle.Manifest().LeakCheck.LinesDropped < 1 {
		t.Errorf("leak check = %+v, want at least one dropped line", bundle.Manifest().LeakCheck)
	}
}

func TestTheRingIsIncludedOnlyWhenTheDiskTraceIsOff(t *testing.T) {
	opts, tracer, _ := fixture(t)
	bundle, _ := Build(opts)
	if bundle.File("trace-memory.jsonl") != nil {
		t.Error("the ring was exported although the disk trace is on")
	}
	tracer.SetEnabled(false)
	bundle, _ = Build(opts)
	if len(bundle.File("trace-memory.jsonl")) == 0 {
		t.Error("the ring was left out although the disk trace is off")
	}
}

func TestAMissingLogIsLeftOutNotAnError(t *testing.T) {
	opts, _, _ := fixture(t)
	opts.RunLogPath = filepath.Join(t.TempDir(), "absent.jsonl")
	opts.TracePath = filepath.Join(t.TempDir(), "absent-trace.jsonl")
	bundle, err := Build(opts)
	if err != nil {
		t.Fatal(err)
	}
	if bundle.File("run.jsonl") != nil || bundle.File("trace.jsonl") != nil {
		t.Error("an absent log produced a file")
	}
}

func TestShortOrEmptyLeakTermsAreIgnoredSoTheyCannotDropEverything(t *testing.T) {
	opts, _, _ := fixture(t)
	opts.LeakTerms = []string{"", "a", "ab"}
	bundle, _ := Build(opts)
	if bundle.Manifest().LeakCheck.Terms != 0 || bundle.Manifest().LeakCheck.LinesDropped != 0 {
		t.Errorf("leak check = %+v, want no terms and no drops", bundle.Manifest().LeakCheck)
	}
}

func TestSummaryCountsEventsAndListsProblemsWithoutValues(t *testing.T) {
	opts, _, _ := fixture(t)
	bundle, _ := Build(opts)
	var out bytes.Buffer
	if err := Summarize(&out, bundle.File("trace.jsonl")); err != nil {
		t.Fatal(err)
	}
	text := out.String()
	if !strings.Contains(text, "test.diag_event") || !strings.Contains(text, "1 records") {
		t.Errorf("summary = %q, want the event name and its count", text)
	}
	if strings.Contains(text, "ch-1") {
		t.Errorf("summary printed a field value: %q", text)
	}
}
