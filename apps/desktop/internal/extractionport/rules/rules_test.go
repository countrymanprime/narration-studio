package rules

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport/extractionporttest"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
)

// The test binary doubles as the sidecar: started with fakeEnv set, TestMain runs fakeSidecar instead of the tests.
const fakeEnv = "RULES_FAKE_SIDECAR"

func TestMain(m *testing.M) {
	if mode := os.Getenv(fakeEnv); mode != "" {
		fakeSidecar(mode)
	}
	os.Exit(m.Run())
}

// fakeSidecar prints what mode says, as `suggest` would, and exits.
func fakeSidecar(mode string) {
	args := os.Args[1:]
	if len(args) == 0 || args[0] != "suggest" || !slices.Contains(args, "--manuscript") || !slices.Contains(args, "--guide") {
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
		line(`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"Alice","type":"","aliases":[],"description":"","appearsIn":[]},"confidence":null,"quotes":[{"paragraphId":"1-1","text":"Alice was beginning"}],"chapterId":"1","note":"The rules give no score for this."}`)
	case "bad-quote":
		line(`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"Dawnspyre"},"confidence":null,"quotes":[{"paragraphId":"p-000001","text":"the road to Dawnspyre"}],"chapterId":"c-0001"}`)
		line(`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"Dawnspire"},"confidence":null,"quotes":[{"paragraphId":"p-000002","text":"Captain Arelian said"}],"chapterId":"c-0001"}`)
	case "unknown-kind":
		line(`{"source":"rules","rule":"new-name","payload":{"kind":"theme","name":"Loss"},"confidence":null,"quotes":[{"paragraphId":"p-000001","text":"Captain Arelian said"}]}`)
	case "unknown-field":
		line(`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"Ash"},"confidence":null,"quotes":[],"status":"accepted"}`)
	case "big-field":
		line(`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"` + strings.Repeat("A", MaxFieldBytes+1) + `"},"confidence":null,"quotes":[]}`)
	case "long-line":
		line(`{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"Ash","aliases":["` + strings.Repeat("a\",\"", MaxLineBytes/4) + `"]},"confidence":null,"quotes":[]}`)
	case "flood":
		entry := `{"source":"rules","rule":"new-name","payload":{"kind":"entry","name":"` + strings.Repeat("A", 1000) + `"},"confidence":null,"quotes":[]}`
		for range MaxOutputBytes/len(entry) + 10 {
			line(entry)
		}
		time.Sleep(time.Hour)
	case "hang":
		time.Sleep(time.Hour)
	case "fail":
		fmt.Fprintln(os.Stderr, "The manuscript has no readable text paragraphs.")
		os.Exit(1)
	}
	os.Exit(0)
}

// fake is a rules source whose sidecar is this test binary in mode.
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
		Log: func(s string) { mu.Lock(); logged = append(logged, s); mu.Unlock() },
	}, &logged
}

var book = extractionport.Input{Paragraphs: []extraction.Paragraph{
	{ID: "p-000001", ChapterID: "c-0001", Text: "Captain Arelian said the Council of Ash would meet in Dawnspire."},
	{ID: "p-000002", ChapterID: "c-0001", Text: "Later they saw Dawnspire burning. The road to Dawnspire was long, and Arelian rode it alone."},
	{ID: "p-000003", ChapterID: "c-0001", Text: "“We ride at dawn,” Ada said. Everyone knew Dawnspire well."},
}}

func extract(t *testing.T, source Source, ctx context.Context) ([]extractionport.Raw, error) {
	t.Helper()
	extractor, err := source.Extractor()
	if err != nil {
		t.Fatal(err)
	}
	return extractor.Extract(ctx, book)
}

func TestTheSidecarsLinesBecomeRawSuggestions(t *testing.T) {
	source, logged := fake(t, "golden")
	raws, err := extract(t, source, context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var kinds []extraction.Kind
	for _, raw := range raws {
		kinds = append(kinds, raw.Payload.Kind)
		for _, p := range extractionporttest.RawProblems(raw, true) {
			t.Error(p)
		}
	}
	if want := []extraction.Kind{extraction.KindAlias, extraction.KindEntry, extraction.KindEntry, extraction.KindSpeaker}; !slices.Equal(kinds, want) {
		t.Fatalf("kinds = %v, want %v (logged %q)", kinds, want, *logged)
	}
	alias, speaker := raws[0], raws[3]
	if alias.Payload.Entry != "Arelian" || alias.Payload.Alias != "Captain Arelian" || alias.Confidence != nil || alias.Note == "" {
		t.Errorf("alias = %+v", alias)
	}
	if speaker.Payload.Speaker != "Ada" || speaker.Payload.Quote != "“We ride at dawn,”" || speaker.Confidence == nil || *speaker.Confidence != 0.96 {
		t.Errorf("speaker = %+v", speaker)
	}
	if want := (extractionport.Quote{ParagraphID: "p-000003", Text: "“We ride at dawn,” Ada said"}); !slices.Equal(speaker.Quotes, []extractionport.Quote{want}) {
		t.Errorf("speaker quotes = %+v", speaker.Quotes)
	}
	if speaker.ChapterID != "c-0001" {
		t.Errorf("chapter = %q", speaker.ChapterID)
	}
}

func TestAQuoteThatIsNotInItsParagraphIsDroppedWithALogLine(t *testing.T) {
	source, logged := fake(t, "bad-quote")
	raws, err := extract(t, source, context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(raws) != 0 {
		t.Fatalf("raws = %+v, want both dropped (one is not in the book, one is in another paragraph)", raws)
	}
	if len(*logged) != 2 || !strings.Contains((*logged)[0], "Dawnspyre") {
		t.Fatalf("logged = %q", *logged)
	}
}

func TestOutputBreakingTheContractIsRefused(t *testing.T) {
	for mode, want := range map[string]string{
		"unknown-kind":  `kind "theme"`,
		"unknown-field": `unknown field "status"`,
		"big-field":     "field over",
		"long-line":     "line over",
		"flood":         "more than",
		"fail":          "The manuscript has no readable text paragraphs.",
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

func TestACommandThatCannotBeBuiltIsAnError(t *testing.T) {
	source, _ := fake(t, "golden")
	source.Command = func() (Command, error) { return Command{}, errors.New("Save the REAPER project first.") }
	if _, err := extract(t, source, context.Background()); err == nil || err.Error() != "Save the REAPER project first." {
		t.Fatalf("err = %v", err)
	}
}

func TestAnUnconfiguredSourceIsUnavailableWithAReason(t *testing.T) {
	a := (Source{}).Available()
	if a.OK || a.Reason == "" {
		t.Fatalf("Available = %+v", a)
	}
	if _, err := (Source{}).Extractor(); !errors.Is(err, port.ErrNotSupported) {
		t.Fatalf("Extractor err = %v", err)
	}
}

func TestTheRulesRowPassesThePortConformanceSuite(t *testing.T) {
	source, _ := fake(t, "sample")
	r := &port.Registry[extractionport.Source]{Kind: "extraction source"}
	r.Register(Entry(source))
	extractionporttest.Run(t, r)
	if got := extractionport.RunnableNamesIn(r); !slices.Equal(got, []string{extractionport.Rules}) {
		t.Fatalf("runnable = %v", got)
	}
	if entry, _ := r.Lookup(extractionport.Rules); entry.Descriptor.Label != "Rules" {
		t.Fatalf("label = %q", entry.Descriptor.Label)
	}
}

func TestTheRowMatchesTheProgramsRulesRow(t *testing.T) {
	builtin, err := extractionport.Sources.Lookup(extractionport.Rules)
	if err != nil {
		t.Fatal(err)
	}
	ours, theirs := Entry(Source{}), builtin.New()
	mine := ours.New()
	if ours.Descriptor.Label != builtin.Descriptor.Label || mine.Icon() != theirs.Icon() || mine.Runs() != theirs.Runs() ||
		mine.Scored() != theirs.Scored() || !slices.Equal(mine.Assets(), theirs.Assets()) {
		t.Fatalf("the rules row differs from the program's: %+v / %+v", ours.Descriptor, builtin.Descriptor)
	}
}
