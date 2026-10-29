package gliner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"desktop/internal/extraction"
	"desktop/internal/extractionport"
	"desktop/internal/extractionport/extractionporttest"
	"desktop/internal/port"
	"desktop/internal/process"
)

// The test binary doubles as the sidecar: started with fakeEnv set, TestMain runs fakeSidecar instead of the tests.
const fakeEnv = "GLINER_FAKE_SIDECAR"

// installDir is the install folder the fake host reports; the fake sidecar refuses any other.
const installDir = "C:/cache/analysis/gliner/gliner/4e09"

func TestMain(m *testing.M) {
	if mode := os.Getenv(fakeEnv); mode != "" {
		fakeSidecar(mode)
	}
	os.Exit(m.Run())
}

func argument(args []string, flag string) string {
	if i := slices.Index(args, flag); i >= 0 && i+1 < len(args) {
		return args[i+1]
	}
	return ""
}

// fakeSidecar prints what mode says, as `suggest --source gliner` would, and exits.
func fakeSidecar(mode string) {
	args := os.Args[1:]
	if len(args) == 0 || args[0] != "suggest" || argument(args, "--source") != "gliner" || argument(args, "--install") != installDir ||
		argument(args, "--manuscript") == "" || argument(args, "--guide") == "" {
		fmt.Fprintf(os.Stderr, "unexpected arguments %q\n", args)
		os.Exit(3)
	}
	line := func(s string) { fmt.Println(s) }
	switch mode {
	case "golden":
		var lines []json.RawMessage
		data, _ := os.ReadFile(filepath.Join("testdata", "suggest-lines.json"))
		_ = json.Unmarshal(data, &lines)
		for _, l := range lines {
			compact, _ := json.Marshal(l)
			line(string(compact))
		}
	case "sample":
		line(`{"source":"gliner","payload":{"kind":"entry","name":"Alice","type":"Character","aliases":[],"description":"","appearsIn":[]},"confidence":0.91,"quotes":[{"paragraphId":"1-1","text":"Alice was beginning to get very tired of sitting by her sister on the bank."}],"chapterId":"1"}`)
	case "pool":
		// What `--workers 3` prints: a progress record after each chunk, then the suggestions. The progress lines come from the
		// committed contract file the sidecar's own test writes.
		if argument(args, "--workers") != "3" {
			fmt.Fprintf(os.Stderr, "expected --workers 3, got %q\n", args)
			os.Exit(3)
		}
		var records []json.RawMessage
		data, _ := os.ReadFile(filepath.Join("testdata", "suggest-progress.json"))
		_ = json.Unmarshal(data, &records)
		for _, r := range records {
			compact, _ := json.Marshal(r)
			line(string(compact))
		}
		line(`{"source":"gliner","payload":{"kind":"entry","name":"Alice","type":"Character","aliases":[],"description":"","appearsIn":[]},"confidence":0.91,"quotes":[{"paragraphId":"1-1","text":"Alice was beginning to get very tired of sitting by her sister on the bank."}],"chapterId":"1"}`)
	case "threads":
		if argument(args, "--threads") != "2" || argument(args, "--workers") != "" {
			fmt.Fprintf(os.Stderr, "expected --threads 2 and no --workers, got %q\n", args)
			os.Exit(3)
		}
	case "bad-progress":
		line(`{"progress":{"done":5,"total":2,"failed":[]}}`)
	case "bad-quote":
		line(`{"source":"gliner","payload":{"kind":"entry","name":"Dawnspyre","type":"Place"},"confidence":0.8,"quotes":[{"paragraphId":"p-000001","text":"meet in Dawnspyre."}],"chapterId":"c-0001"}`)
	case "alias":
		line(`{"source":"gliner","payload":{"kind":"entry","name":"Arelian","type":"Character","aliases":["Captain Arelian"]},"confidence":0.9,"quotes":[{"paragraphId":"p-000001","text":"Captain Arelian said"}]}`)
	case "speaker":
		line(`{"source":"gliner","payload":{"kind":"speaker","name":"Ada","type":"Character"},"confidence":0.9,"quotes":[]}`)
	case "type":
		line(`{"source":"gliner","payload":{"kind":"entry","name":"Ash","type":"Lore"},"confidence":0.9,"quotes":[]}`)
	case "rules":
		line(`{"source":"rules","payload":{"kind":"entry","name":"Ash","type":"Item"},"confidence":0.9,"quotes":[]}`)
	case "unknown-field":
		line(`{"source":"gliner","payload":{"kind":"entry","name":"Ash","type":"Item"},"confidence":0.9,"quotes":[],"status":"accepted"}`)
	case "confidence":
		line(`{"source":"gliner","payload":{"kind":"entry","name":"Ash","type":"Item"},"confidence":1.5,"quotes":[]}`)
	case "big-field":
		line(`{"source":"gliner","payload":{"kind":"entry","name":"` + strings.Repeat("A", MaxFieldBytes+1) + `","type":"Item"},"confidence":null,"quotes":[]}`)
	case "long-line":
		line(`{"source":"gliner","payload":{"kind":"entry","name":"Ash","type":"Item","description":"` + strings.Repeat("a", MaxLineBytes) + `"},"confidence":null,"quotes":[]}`)
	case "flood":
		entry := `{"source":"gliner","payload":{"kind":"entry","name":"` + strings.Repeat("A", 1000) + `","type":"Item"},"confidence":null,"quotes":[]}`
		for range MaxOutputBytes/len(entry) + 10 {
			line(entry)
		}
		time.Sleep(time.Hour)
	case "hang":
		time.Sleep(time.Hour)
	case "fail":
		// What manuscript_guide.py's main prints for any failure: one JSON log record.
		fmt.Fprintln(os.Stderr, `{"level": "info", "msg": "ERROR: GLiNER could not be loaded: No module named 'torch'. Repair it in Analysis tools.", "ts": "2026-10-12T00:00:00Z"}`)
		os.Exit(1)
	}
	os.Exit(0)
}

// fake is an installed GLiNER source whose sidecar is this test binary in mode.
func fake(t *testing.T, mode string) (Source, *[]string) {
	t.Helper()
	t.Setenv(fakeEnv, mode)
	supervisor := process.NewSupervisor()
	t.Cleanup(func() { _ = supervisor.Close() })
	var mu sync.Mutex
	var logged []string
	return Source{
		Supervisor: supervisor,
		Command: func() (Command, error) {
			return Command{Program: os.Args[0], Manuscript: "m.json", Guide: "g.json"}, nil
		},
		Install: func() (string, bool) { return installDir, true },
		Log:     func(s string) { mu.Lock(); logged = append(logged, s); mu.Unlock() },
	}, &logged
}

var book = extractionport.Input{Paragraphs: []extraction.Paragraph{
	{ID: "p-000001", ChapterID: "c-0001", Text: "Captain Arelian said the Council of Ash would meet in Dawnspire."},
	{ID: "p-000002", ChapterID: "c-0001", Text: "Later they saw Dawnspire burning. Arelian rode the grey mare alone."},
}}

func extract(t *testing.T, source Source, ctx context.Context) ([]extractionport.Raw, error) {
	t.Helper()
	extractor, err := source.Extractor()
	if err != nil {
		t.Fatal(err)
	}
	return extractor.Extract(ctx, book)
}

func TestTheSidecarsLinesBecomeEntrySuggestionsOnly(t *testing.T) {
	source, logged := fake(t, "golden")
	raws, err := extract(t, source, context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(raws) != 5 {
		t.Fatalf("raws = %d, want the golden's 5 (logged %q)", len(raws), *logged)
	}
	var types []string
	for _, raw := range raws {
		for _, p := range extractionporttest.RawProblems(raw, true) {
			t.Error(p)
		}
		if raw.Payload.Kind != extraction.KindEntry || len(raw.Payload.Aliases) != 0 || len(raw.Quotes) != 1 {
			t.Errorf("raw = %+v, want an entry with no aliases and one quote", raw)
		}
		types = append(types, raw.Payload.Type)
	}
	if want := []string{"Character", "Organization", "Place", "Item", "Character"}; !slices.Equal(types, want) {
		t.Errorf("types = %v, want %v", types, want)
	}
	if c := raws[0].Confidence; c == nil || *c != 0.93 {
		t.Errorf("the model's score was not passed through: %v", c)
	}
	if raws[4].Confidence != nil {
		t.Errorf("a span with no score must stay nil, got %v", *raws[4].Confidence)
	}
	if raws[3].ChapterID != "c-0001" || raws[3].Quotes[0] != (extractionport.Quote{ParagraphID: "p-000002", Text: "Arelian rode the grey mare alone."}) {
		t.Errorf("grey mare = %+v", raws[3])
	}
}

func TestAQuoteThatIsNotInItsParagraphIsDroppedWithALogLine(t *testing.T) {
	source, logged := fake(t, "bad-quote")
	raws, err := extract(t, source, context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(raws) != 0 || len(*logged) != 1 || !strings.Contains((*logged)[0], "Dawnspyre") {
		t.Fatalf("raws = %+v, logged = %q", raws, *logged)
	}
}

func TestOutputBreakingTheContractIsRefused(t *testing.T) {
	for mode, want := range map[string]string{
		"alias":         "aliases",
		"speaker":       `kind "speaker"`,
		"type":          `type "Lore"`,
		"rules":         `source "rules"`,
		"unknown-field": `unknown field "status"`,
		"confidence":    "not within 0..1",
		"big-field":     "field over",
		"long-line":     "line over",
		"flood":         "more than",
		"fail":          "GLiNER could not be loaded: No module named 'torch'. Repair it in Analysis tools.",
	} {
		t.Run(mode, func(t *testing.T) {
			source, _ := fake(t, mode)
			done := make(chan struct{})
			var raws []extractionport.Raw
			var err error
			go func() { raws, err = extract(t, source, context.Background()); close(done) }()
			select {
			case <-done:
			case <-time.After(30 * time.Second):
				t.Fatal("Extract did not return: the sidecar was not stopped")
			}
			if err == nil || !strings.Contains(err.Error(), want) || raws != nil {
				t.Fatalf("Extract = (%v, %v), want an error containing %q", raws, err, want)
			}
		})
	}
}

func TestAFailureIsTheSidecarsSentenceWithoutItsLogPrefix(t *testing.T) {
	source, _ := fake(t, "fail")
	_, err := extract(t, source, context.Background())
	if err == nil || strings.Contains(err.Error(), "ERROR:") {
		t.Fatalf("err = %v, want the sentence alone", err)
	}
}

func TestCancellingKillsASidecarThatNeverEnds(t *testing.T) {
	source, _ := fake(t, "hang")
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := extract(t, source, ctx); done <- err }()
	time.Sleep(200 * time.Millisecond)
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("err = %v, want context.Canceled", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Extract did not return after cancellation: the sidecar was not killed")
	}
}

func TestUnavailableUntilTheRegistrySaysItIsInstalledAndVerified(t *testing.T) {
	source, _ := fake(t, "sample")
	for name, install := range map[string]func() (string, bool){
		"no install state":         nil,
		"not installed or damaged": func() (string, bool) { return installDir, false },
		"installed with no folder": func() (string, bool) { return "", true },
	} {
		t.Run(name, func(t *testing.T) {
			source.Install = install
			if a := source.Available(); a.OK || a.Reason != "GLiNER is not downloaded." {
				t.Fatalf("Available = %+v", a)
			}
			if _, err := source.Extractor(); !errors.Is(err, port.ErrNotSupported) || err.Error() != "GLiNER is not downloaded." {
				t.Fatalf("Extractor err = %v", err)
			}
		})
	}
}

func TestAnUnconfiguredSidecarIsUnavailableWithAReason(t *testing.T) {
	source := Source{Install: func() (string, bool) { return installDir, true }}
	if a := source.Available(); a.OK || a.Reason != "The Story Bible sidecar is not set up." {
		t.Fatalf("Available = %+v", a)
	}
}

func TestACommandThatCannotBeBuiltIsAnError(t *testing.T) {
	source, _ := fake(t, "golden")
	source.Command = func() (Command, error) { return Command{}, errors.New("Save the project first.") }
	if _, err := extract(t, source, context.Background()); err == nil || err.Error() != "Save the project first." {
		t.Fatalf("err = %v", err)
	}
}

func TestTheGlinerRowPassesThePortConformanceSuite(t *testing.T) {
	installed, _ := fake(t, "sample")
	uninstalled := installed
	uninstalled.Install = nil
	for name, source := range map[string]Source{"installed": installed, "not installed": uninstalled} {
		t.Run(name, func(t *testing.T) {
			r := &port.Registry[extractionport.Source]{Kind: "extraction source"}
			r.Register(Entry(source))
			extractionporttest.Run(t, r)
		})
	}
}

func TestTheRowMatchesTheProgramsGlinerRow(t *testing.T) {
	builtin, err := extractionport.Sources.Lookup(extractionport.Gliner)
	if err != nil {
		t.Fatal(err)
	}
	ours, theirs := Entry(Source{}), builtin.New()
	mine := ours.New()
	if ours.Name != builtin.Name || ours.Descriptor.Label != builtin.Descriptor.Label || mine.Icon() != theirs.Icon() ||
		mine.Runs() != theirs.Runs() || mine.Scored() != theirs.Scored() || !slices.Equal(mine.Assets(), theirs.Assets()) {
		t.Fatalf("the GLiNER row differs from the program's: %+v / %+v", ours.Descriptor, builtin.Descriptor)
	}
	if a := extractionport.AvailableNowIn(registryOf(Source{}), extractionport.Gliner, nil); a.Reason != "GLiNER is not downloaded." {
		t.Fatalf("AvailableNow with nothing installed = %+v", a)
	}
}

func registryOf(s Source) *port.Registry[extractionport.Source] {
	r := &port.Registry[extractionport.Source]{Kind: "extraction source"}
	r.Register(Entry(s))
	return r
}

func TestWorkersArePassedOnAndProgressRecordsAreReportedNotTakenForSuggestions(t *testing.T) {
	source, _ := fake(t, "pool")
	extractor, err := source.Extractor()
	if err != nil {
		t.Fatal(err)
	}
	type step struct {
		done, total int
		failed      []string
	}
	var steps []step
	in := extractionport.Input{
		Paragraphs: []extraction.Paragraph{{ID: "1-1", ChapterID: "1", Text: "Alice was beginning to get very tired of sitting by her sister on the bank."}},
		Workers:    3,
		Progress:   func(done, total int, failed []string) { steps = append(steps, step{done, total, failed}) },
	}
	raws, err := extractor.Extract(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if len(raws) != 1 || raws[0].Payload.Name != "Alice" {
		t.Fatalf("raws = %+v", raws)
	}
	want := []step{{1, 3, []string{}}, {3, 3, []string{"c-0002"}}}
	if !reflect.DeepEqual(steps, want) {
		t.Fatalf("progress = %+v, want %+v", steps, want)
	}
}

func TestAProgressRecordOutOfRangeIsRefusedAsABadSuggestion(t *testing.T) {
	source, _ := fake(t, "bad-progress")
	if _, err := extract(t, source, context.Background()); err == nil {
		t.Fatal("a progress record with done above total was accepted")
	}
}

func TestNoWorkersMeansNoFlag(t *testing.T) {
	source, _ := fake(t, "sample") // the fake sidecar of this mode refuses nothing, but a flag would show in the golden arguments
	for _, workers := range []int{0, 1} {
		extractor, _ := source.Extractor()
		in := book
		in.Workers = workers
		if _, err := extractor.Extract(context.Background(), in); err != nil {
			t.Fatalf("workers %d: %v", workers, err)
		}
	}
}

func TestThreadsAreAFlagOnlyWhenTheHostNamedABudget(t *testing.T) {
	source, _ := fake(t, "threads")
	extractor, _ := source.Extractor()
	in := book
	in.Threads = 2
	if _, err := extractor.Extract(context.Background(), in); err != nil {
		t.Fatalf("with a budget of 2: %v", err)
	}
	if _, err := extractor.Extract(context.Background(), book); err == nil {
		t.Fatal("with no budget the fake sidecar should have refused the missing --threads")
	}
}
