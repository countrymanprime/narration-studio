package booknlp

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

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport/extractionporttest"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
)

// The test binary doubles as the sidecar: started with fakeEnv set, TestMain runs fakeSidecar instead of the tests.
const (
	fakeEnv    = "BOOKNLP_FAKE_SIDECAR"
	installEnv = "BOOKNLP_FAKE_INSTALL"
	spacyEnv   = "BOOKNLP_FAKE_SPACY"
)

// The install folders the fake host reports; the fake sidecar refuses any folder but the one installEnv names.
const (
	smallDir = "C:/cache/analysis/booknlp-small/booknlp/1.0"
	bigDir   = "C:/cache/analysis/booknlp-big/booknlp/1.0"
)

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

// fakeSidecar prints what mode says, as `suggest --source booknlp` would, and exits.
func fakeSidecar(mode string) {
	args := os.Args[1:]
	if len(args) == 0 || args[0] != "suggest" || argument(args, "--source") != "booknlp" || argument(args, "--install") != os.Getenv(installEnv) ||
		argument(args, "--manuscript") == "" || argument(args, "--guide") == "" || argument(args, "--spacy-model") != os.Getenv(spacyEnv) {
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
		line(`{"source":"booknlp","payload":{"kind":"entry","name":"Alice","type":"Character","aliases":["Miss Alice"],"description":"","appearsIn":[]},"confidence":null,"quotes":[{"paragraphId":"1-1","text":"Alice was beginning to get very tired of sitting by her sister on the bank."}],"chapterId":"1"}`)
	case "bad-quote":
		line(`{"source":"booknlp","payload":{"kind":"speaker","quote":"“Who are yuo?”","speaker":"Caterpillar"},"confidence":0.95,"quotes":[{"paragraphId":"5-2","text":"“Who are yuo?”"}],"chapterId":"5"}`)
	case "relationship":
		line(`{"source":"booknlp","payload":{"kind":"relationship","entry":"Alice"},"confidence":null,"quotes":[]}`)
	case "place":
		line(`{"source":"booknlp","payload":{"kind":"entry","name":"Wonderland","type":"Place"},"confidence":null,"quotes":[]}`)
	case "property-key":
		line(`{"source":"booknlp","payload":{"kind":"property","entry":"Alice","key":"Age","value":"7"},"confidence":0.9,"quotes":[]}`)
	case "gender-value":
		line(`{"source":"booknlp","payload":{"kind":"property","entry":"Alice","key":"Gender","value":"Unknown"},"confidence":0.9,"quotes":[]}`)
	case "missing-speaker":
		line(`{"source":"booknlp","payload":{"kind":"speaker","quote":"“Hi.”"},"confidence":0.95,"quotes":[]}`)
	case "flag":
		line(`{"source":"booknlp","payload":{"kind":"alias","entry":"The Pigeon","alias":"Pigeon"},"confidence":null,"quotes":[],"flag":"merged","note":"x"}`)
	case "flagged-entry":
		line(`{"source":"booknlp","payload":{"kind":"entry","name":"Pigeon","type":"Character"},"confidence":null,"quotes":[],"flag":"duplicate","note":"x"}`)
	case "unnoted":
		line(`{"source":"booknlp","payload":{"kind":"alias","entry":"The Pigeon","alias":"Pigeon"},"confidence":null,"quotes":[],"flag":"duplicate"}`)
	case "rules":
		line(`{"source":"rules","payload":{"kind":"entry","name":"Ash","type":"Character"},"confidence":0.9,"quotes":[]}`)
	case "unknown-field":
		line(`{"source":"booknlp","payload":{"kind":"entry","name":"Ash","type":"Character"},"confidence":0.9,"quotes":[],"status":"accepted"}`)
	case "unknown-payload-field":
		line(`{"source":"booknlp","payload":{"kind":"entry","name":"Ash","type":"Character","event":"walked"},"confidence":0.9,"quotes":[]}`)
	case "confidence":
		line(`{"source":"booknlp","payload":{"kind":"entry","name":"Ash","type":"Character"},"confidence":1.5,"quotes":[]}`)
	case "big-field":
		line(`{"source":"booknlp","payload":{"kind":"entry","name":"` + strings.Repeat("A", MaxFieldBytes+1) + `","type":"Character"},"confidence":null,"quotes":[]}`)
	case "big-alias":
		line(`{"source":"booknlp","payload":{"kind":"entry","name":"Ash","type":"Character","aliases":["` + strings.Repeat("A", MaxFieldBytes+1) + `"]},"confidence":null,"quotes":[]}`)
	case "long-line":
		line(`{"source":"booknlp","payload":{"kind":"entry","name":"Ash","type":"Character","description":"` + strings.Repeat("a", MaxLineBytes) + `"},"confidence":null,"quotes":[]}`)
	case "flood":
		entry := `{"source":"booknlp","payload":{"kind":"entry","name":"` + strings.Repeat("A", 1000) + `","type":"Character"},"confidence":null,"quotes":[]}`
		for range MaxOutputBytes/len(entry) + 10 {
			line(entry)
		}
		time.Sleep(time.Hour)
	case "hang":
		time.Sleep(time.Hour)
	case "fail":
		// What manuscript_guide.py's main prints for any failure: one JSON log record.
		fmt.Fprintln(os.Stderr, `{"level": "info", "msg": "ERROR: BookNLP could not be loaded: No module named 'transformers'. Repair it in Analysis tools.", "ts": "2026-10-12T00:00:00Z"}`)
		os.Exit(1)
	}
	os.Exit(0)
}

// installed answers the install state of each variant: the folder of every id in ids, installed and verified.
func installed(ids ...string) func(string) (string, bool) {
	return func(id string) (string, bool) {
		if !slices.Contains(ids, id) {
			return "", false
		}
		return map[string]string{AssetSmall: smallDir, AssetBig: bigDir}[id], true
	}
}

// fake is a BookNLP source with the small weights installed whose sidecar is this test binary in mode.
func fake(t *testing.T, mode string) (Source, *[]string) {
	t.Helper()
	t.Setenv(fakeEnv, mode)
	t.Setenv(installEnv, smallDir)
	t.Setenv(spacyEnv, "C:/cache/spacy/en_core_web_sm")
	supervisor := process.NewSupervisor()
	t.Cleanup(func() { _ = supervisor.Close() })
	var mu sync.Mutex
	var logged []string
	return Source{
		Supervisor: supervisor,
		Command: func() (Command, error) {
			return Command{Program: os.Args[0], Manuscript: "m.json", Guide: "g.json", SpacyModel: "C:/cache/spacy/en_core_web_sm"}, nil
		},
		Install: installed(AssetSmall),
		Log:     func(s string) { mu.Lock(); logged = append(logged, s); mu.Unlock() },
	}, &logged
}

var book = extractionport.Input{Paragraphs: []extraction.Paragraph{
	{ID: "5-2", ChapterID: "5", Text: "“Who are you?” said the Caterpillar."},
	{ID: "5-15", ChapterID: "5", Text: "“Serpent!” cried the Pigeon. Alice looked up; she was not a serpent."},
	{ID: "8-15", ChapterID: "8", Text: "“Can you play croquet?” The Queen was looking at Alice, and Pigeon flew off."},
}}

func extract(t *testing.T, source Source, ctx context.Context) ([]extractionport.Raw, error) {
	t.Helper()
	extractor, err := source.Extractor()
	if err != nil {
		t.Fatal(err)
	}
	return extractor.Extract(ctx, book)
}

func TestTheSidecarsLinesBecomeNamesSpeakersAndGender(t *testing.T) {
	source, logged := fake(t, "golden")
	raws, err := extract(t, source, context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(raws) != 10 {
		t.Fatalf("raws = %d, want the golden's 10 (logged %q)", len(raws), *logged)
	}
	kinds := map[extraction.Kind]int{}
	for _, raw := range raws {
		for _, p := range extractionporttest.RawProblems(raw, true) {
			t.Error(p)
		}
		kinds[raw.Payload.Kind]++
	}
	want := map[extraction.Kind]int{extraction.KindEntry: 4, extraction.KindAlias: 1, extraction.KindSpeaker: 3, extraction.KindProperty: 2}
	if fmt.Sprint(kinds) != fmt.Sprint(want) {
		t.Errorf("kinds = %v, want %v", kinds, want)
	}
	merge := raws[4]
	if !reflect.DeepEqual(merge.Payload, extraction.Payload{Kind: extraction.KindAlias, Entry: "the Pigeon", Alias: "Pigeon"}) || merge.Flag != extractionport.FlagDuplicate ||
		!strings.Contains(merge.Note, "the Pigeon") || !strings.Contains(merge.Note, "“Pigeon”") || merge.Confidence != nil {
		t.Errorf("the split group = %+v, want a flagged merge naming both, with no score", merge)
	}
	tagged, implicit := raws[5], raws[7]
	if tagged.Payload.Speaker != "the Caterpillar" || tagged.Payload.Quote != "“Who are you?”" || tagged.Confidence == nil || *tagged.Confidence != 0.95 {
		t.Errorf("tagged speaker = %+v", tagged)
	}
	if implicit.Confidence == nil || *implicit.Confidence >= 0.75 || implicit.ChapterID != "8" {
		t.Errorf("implicit speaker = %+v, want a confidence under the 75%% rule", implicit)
	}
	gender := raws[8]
	if !reflect.DeepEqual(gender.Payload, extraction.Payload{Kind: extraction.KindProperty, Entry: "Alice", Key: "Gender", Value: "Female"}) || gender.Confidence == nil || *gender.Confidence != 0.93 {
		t.Errorf("gender = %+v", gender)
	}
	if raws[0].Confidence != nil {
		t.Errorf("a character BookNLP gives no score for must stay nil, got %v", *raws[0].Confidence)
	}
}

func TestAQuoteThatIsNotInItsParagraphIsDroppedWithALogLine(t *testing.T) {
	source, logged := fake(t, "bad-quote")
	raws, err := extract(t, source, context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(raws) != 0 || len(*logged) != 1 || !strings.Contains((*logged)[0], "yuo") {
		t.Fatalf("raws = %+v, logged = %q", raws, *logged)
	}
}

func TestOutputBreakingTheContractIsRefused(t *testing.T) {
	for mode, want := range map[string]string{
		"relationship":          `kind "relationship"`,
		"place":                 `type "Place"`,
		"property-key":          `property "Age"`,
		"gender-value":          `gender "Unknown"`,
		"missing-speaker":       "needs speaker",
		"flag":                  `flag "merged"`,
		"flagged-entry":         "only a merge",
		"unnoted":               "note",
		"rules":                 `source "rules"`,
		"unknown-field":         `unknown field "status"`,
		"unknown-payload-field": `unknown field "event"`,
		"confidence":            "not within 0..1",
		"big-field":             "field over",
		"big-alias":             "field over",
		"long-line":             "line over",
		"flood":                 "more than",
		"fail":                  "BookNLP could not be loaded: No module named 'transformers'. Repair it in Analysis tools.",
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

func TestTheVariantFollowsTheInstall(t *testing.T) {
	for name, tc := range map[string]struct {
		install func(string) (string, bool)
		want    string
	}{
		"both installed: the large weights": {installed(AssetSmall, AssetBig), bigDir},
		"only the large weights":            {installed(AssetBig), bigDir},
		"only the small weights":            {installed(AssetSmall), smallDir},
	} {
		t.Run(name, func(t *testing.T) {
			source, _ := fake(t, "sample")
			t.Setenv(installEnv, tc.want)
			source.Install = tc.install
			if dir, ok := source.installed(); !ok || dir != tc.want {
				t.Fatalf("installed = %q, %v; want %q", dir, ok, tc.want)
			}
			raws, err := extract(t, source, context.Background())
			if err != nil || len(raws) != 0 {
				// The sample's quote is not in this book, so a run given the right folder drops it; a wrong folder exits 3.
				t.Fatalf("Extract = (%v, %v)", raws, err)
			}
		})
	}
}

func TestUnavailableUntilTheRegistrySaysItIsInstalledAndVerified(t *testing.T) {
	source, _ := fake(t, "sample")
	for name, install := range map[string]func(string) (string, bool){
		"no install state":         nil,
		"not installed or damaged": func(string) (string, bool) { return smallDir, false },
		"installed with no folder": func(string) (string, bool) { return "", true },
	} {
		t.Run(name, func(t *testing.T) {
			source.Install = install
			if a := source.Available(); a.OK || a.Reason != "BookNLP is not downloaded." {
				t.Fatalf("Available = %+v", a)
			}
			if _, err := source.Extractor(); !errors.Is(err, port.ErrNotSupported) || err.Error() != "BookNLP is not downloaded." {
				t.Fatalf("Extractor err = %v", err)
			}
		})
	}
}

func TestAnUnconfiguredSidecarIsUnavailableWithAReason(t *testing.T) {
	source := Source{Install: installed(AssetSmall)}
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

func TestNoSpacyModelPassesNoFlag(t *testing.T) {
	source, _ := fake(t, "sample")
	t.Setenv(spacyEnv, "")
	source.Command = func() (Command, error) {
		return Command{Program: os.Args[0], Manuscript: "m.json", Guide: "g.json"}, nil
	}
	if _, err := extract(t, source, context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestTheBookNLPRowPassesThePortConformanceSuite(t *testing.T) {
	present, _ := fake(t, "sample")
	absent := present
	absent.Install = nil
	for name, source := range map[string]Source{"installed": present, "not installed": absent} {
		t.Run(name, func(t *testing.T) {
			extractionporttest.Run(t, registryOf(source))
		})
	}
}

func TestTheRowMatchesTheProgramsBookNLPRow(t *testing.T) {
	builtin, err := extractionport.Sources.Lookup(extractionport.BookNLP)
	if err != nil {
		t.Fatal(err)
	}
	ours, theirs := Entry(Source{}), builtin.New()
	mine := ours.New()
	if ours.Name != builtin.Name || ours.Descriptor.Label != builtin.Descriptor.Label || mine.Icon() != theirs.Icon() ||
		mine.Runs() != theirs.Runs() || mine.Scored() != theirs.Scored() || !slices.Equal(mine.Assets(), theirs.Assets()) {
		t.Fatalf("the BookNLP row differs from the program's: %+v / %+v", ours.Descriptor, builtin.Descriptor)
	}
	if a := extractionport.AvailableNowIn(registryOf(Source{}), extractionport.BookNLP, nil); a.Reason != "BookNLP is not downloaded." {
		t.Fatalf("AvailableNow with nothing installed = %+v", a)
	}
	if !slices.Equal(Preference, []string{AssetBig, AssetSmall}) || !slices.Contains(mine.Assets(), AssetBig) || !slices.Contains(mine.Assets(), AssetSmall) {
		t.Fatalf("Preference = %v, Assets = %v", Preference, mine.Assets())
	}
}

func registryOf(s Source) *port.Registry[extractionport.Source] {
	r := &port.Registry[extractionport.Source]{Kind: "extraction source"}
	r.Register(Entry(s))
	return r
}
