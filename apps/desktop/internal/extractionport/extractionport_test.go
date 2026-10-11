package extractionport_test

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport/extractionporttest"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
)

func TestEveryRegisteredSourcePassesTheSuite(t *testing.T) {
	extractionporttest.Run(t, extractionport.Sources)
}

func TestTheRegistryListsTheFiveSourcesInOrderWithRulesTheDefault(t *testing.T) {
	type row struct {
		name, label string
		runs        bool
	}
	var got []row
	for _, e := range extractionport.Sources.Entries() {
		got = append(got, row{e.Name, e.Descriptor.Label, e.New().Runs()})
	}
	want := []row{
		{"rules", "Rules", true}, {"imported", "Imported file", false}, {"local-model", "Local model", true},
		{"gliner", "GLiNER", true}, {"booknlp", "BookNLP", true},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("rows = %v, want %v", got, want)
	}
	for _, platform := range port.Platforms {
		if names := extractionport.Sources.Names(platform); names[0] != extractionport.Rules {
			t.Errorf("the default on %s is %q, want rules", platform, names[0])
		}
	}
	if got, want := extractionport.RunnableNames(), []string{"rules", "local-model", "gliner", "booknlp"}; !reflect.DeepEqual(got, want) {
		t.Errorf("RunnableNames = %v, want %v (an imported file is not started from the Story Bible)", got, want)
	}
}

func TestTheDescriptorCarriesWhatTheUINeeds(t *testing.T) {
	cases := map[string]struct {
		icon   string
		assets []string
	}{
		"rules": {"auto", nil}, "imported": {"import", nil}, "local-model": {"globe", nil},
		"gliner": {"locate", []string{"gliner"}}, "booknlp": {"dictionary", []string{"booknlp-small", "booknlp-big"}},
	}
	for _, e := range extractionport.Sources.Entries() {
		source := e.New()
		want := cases[e.Name]
		if !reflect.DeepEqual(e.Descriptor.Modes, []string{extractionport.ModeExtract}) {
			t.Errorf("%s modes = %v, want only extract", e.Name, e.Descriptor.Modes)
		}
		if source.Icon() != want.icon || !slices.Equal(source.Assets(), want.assets) {
			t.Errorf("%s icon %q assets %v, want %q %v", e.Name, source.Icon(), source.Assets(), want.icon, want.assets)
		}
	}
}

func TestTheLocalModelIsUnavailableWithThePRDsReasonAndStartsNothing(t *testing.T) {
	want := "No local model is installed."
	if got := extractionport.AvailableNow(extractionport.LocalModel, []string{"gliner", "booknlp-big"}); got.OK || got.Reason != want {
		t.Fatalf("AvailableNow(local-model) = %+v, want unavailable with %q", got, want)
	}
	entry, _ := extractionport.Sources.Lookup(extractionport.LocalModel)
	extractor, err := entry.New().Extractor()
	if extractor != nil || !errors.Is(err, port.ErrNotSupported) || err.Error() != want {
		t.Fatalf("Extractor() = (%v, %v), want a refusal saying %q", extractor, err, want)
	}
}

func TestAToolSourceIsNotDownloadedUntilOneOfItsAssetsIsInstalled(t *testing.T) {
	cases := []struct {
		name      string
		installed []string
		want      string
	}{
		{extractionport.Gliner, nil, "GLiNER is not downloaded."},
		{extractionport.BookNLP, []string{"gliner"}, "BookNLP is not downloaded."},
		// Installed, but its adapter is a later slice (SN-X71, SN-X72).
		{extractionport.Gliner, []string{"gliner"}, "GLiNER is not available yet."},
		{extractionport.BookNLP, []string{"booknlp-big"}, "BookNLP is not available yet."},
		{"spacy", nil, `There is no extraction source called "spacy".`},
	}
	for _, tc := range cases {
		if got := extractionport.AvailableNow(tc.name, tc.installed); got.OK || got.Reason != tc.want {
			t.Errorf("AvailableNow(%s, %v) = %+v, want %q", tc.name, tc.installed, got, tc.want)
		}
	}
}

func TestCheckExtractAcceptsEverySourceAndRefusesAnUnknownOne(t *testing.T) {
	for _, e := range extractionport.Sources.Entries() {
		if err := extractionport.CheckExtract(e.Name); err != nil {
			t.Errorf("CheckExtract(%q) = %v", e.Name, err)
		}
	}
	err := extractionport.CheckExtract("spacy")
	if !errors.Is(err, port.ErrNotSupported) || err.Error() != `There is no extraction source called "spacy".` {
		t.Fatalf("CheckExtract(spacy) = %v", err)
	}
}

func TestCheckExtractRefusesARowWithoutTheRole(t *testing.T) {
	sources := extractionport.NewRegistry()
	sources.Register(port.Entry[extractionport.Source]{
		Name: "silent", Descriptor: port.Descriptor{Label: "Silent"},
		New: func() extractionport.Source { return extractionporttest.NewFake("silent") },
	})
	err := extractionport.CheckExtractIn(sources, "silent")
	var ns *port.NotSupportedError
	if !errors.As(err, &ns) || ns.Support.Level != port.Unsupported || err.Error() != "Silent cannot look for suggestions." {
		t.Fatalf("CheckExtractIn(silent) = %v", err)
	}
}

func TestANewSourceIsOneRowAndNeedsNoChangeInAnyCaller(t *testing.T) {
	sources := extractionport.NewRegistry()
	sources.Register(port.Entry[extractionport.Source]{
		Name:       "spacy",
		Descriptor: port.Descriptor{Label: "spaCy", Modes: []string{extractionport.ModeExtract}},
		New: func() extractionport.Source {
			f := extractionporttest.NewFake("spacy", extractionport.Raw{Payload: extraction.Payload{Kind: extraction.KindEntry, Name: "Alice"}})
			f.AssetIDs = []string{"spacy-en"}
			return f
		},
	})
	extractionporttest.Run(t, sources)
	if got := extractionport.RunnableNamesIn(sources); got[len(got)-1] != "spacy" {
		t.Errorf("RunnableNamesIn = %v, want spacy last", got)
	}
	if err := extractionport.CheckExtractIn(sources, "spacy"); err != nil {
		t.Errorf("CheckExtractIn(spacy) = %v", err)
	}
	if got := extractionport.AvailableNowIn(sources, "spacy", nil); got.OK || got.Reason != "spaCy is not downloaded." {
		t.Errorf("AvailableNowIn(spacy, none) = %+v", got)
	}
	if got := extractionport.AvailableNowIn(sources, "spacy", []string{"spacy-en"}); !got.OK {
		t.Errorf("AvailableNowIn(spacy, installed) = %+v", got)
	}
	if slices.Contains(extractionport.Sources.Names("linux"), "spacy") {
		t.Error("registering on a new registry changed the program's")
	}
}

func TestARawSuggestionHasNoOffsetStatusOrFingerprint(t *testing.T) {
	// Only code computes those (internal/extraction): a source has no field to set them in.
	for _, typ := range []reflect.Type{reflect.TypeFor[extractionport.Raw](), reflect.TypeFor[extractionport.Quote]()} {
		for field := range typ.Fields() {
			for _, banned := range []string{"Start", "End", "Offset", "Status", "Fingerprint", "FP", "Evidence", "ID"} {
				if field.Name == banned {
					t.Errorf("%s has the field %s, which only code may compute", typ.Name(), field.Name)
				}
			}
		}
	}
}

// TestTheSourcesTableInTheDocsMatchesTheRegistry is half of the Go-Python agreement: the Python test reads the same table,
// so the two registries cannot list different sources.
func TestTheSourcesTableInTheDocsMatchesTheRegistry(t *testing.T) {
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "..", "..", "..", "docs", "architecture", "provider-ports.md"))
	if err != nil {
		t.Fatal(err)
	}
	_, section, _ := strings.Cut(string(data), "\n## Extraction sources\n")
	section, _, _ = strings.Cut(section, "\n## ")
	var docs [][]string
	for line := range strings.Lines(section) {
		if !strings.HasPrefix(line, "| `") {
			continue
		}
		cells := strings.Split(line, "|")
		row := make([]string, 0, 5)
		for _, c := range cells[1:6] {
			row = append(row, strings.TrimSpace(c))
		}
		docs = append(docs, row)
	}
	var code [][]string
	for _, e := range extractionport.Sources.Entries() {
		s := e.New()
		runs, assets := "no", "none"
		if s.Runs() {
			runs = "yes"
		}
		if ids := s.Assets(); len(ids) > 0 {
			assets = "`" + strings.Join(ids, "`, `") + "`"
		}
		code = append(code, []string{"`" + e.Name + "`", e.Descriptor.Label, "`" + s.Icon() + "`", runs, assets})
	}
	if !reflect.DeepEqual(docs, code) {
		t.Fatalf("the extraction sources table in provider-ports.md:\n%v\nthe registry:\n%v", docs, code)
	}
}
