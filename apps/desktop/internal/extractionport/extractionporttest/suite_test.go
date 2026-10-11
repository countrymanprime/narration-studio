package extractionporttest

import (
	"context"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
)

type src = extractionport.Source

func score(v float64) *float64 { return &v }

func entryRaw(confidence *float64) extractionport.Raw {
	return extractionport.Raw{
		Payload:    extraction.Payload{Kind: extraction.KindEntry, Name: "The Dodo", Type: "Character"},
		Confidence: confidence,
		Quotes:     []extractionport.Quote{{ParagraphID: "3-4", Text: "Then the Dodo solemnly presented the thimble"}},
	}
}

func fakeEntry(edit func(*Fake)) port.Entry[src] {
	f := NewFake("fake", entryRaw(score(0.91)), entryRaw(nil),
		extractionport.Raw{Payload: extraction.Payload{Kind: extraction.KindAlias, Entry: "The Pigeon", Alias: "Pigeon"},
			Confidence: score(0.5), Flag: extractionport.FlagDuplicate, Note: "Possible duplicate of Pigeon."})
	if edit != nil {
		edit(&f)
	}
	return port.Entry[src]{
		Name:       "fake",
		Descriptor: port.Descriptor{Label: "Fake", Modes: []string{extractionport.ModeExtract}},
		New:        func() src { return f },
	}
}

func registryOf(entries ...port.Entry[src]) *port.Registry[src] {
	r := &port.Registry[src]{Kind: "extraction source"}
	for _, e := range entries {
		r.Register(e)
	}
	return r
}

func TestTheFakesPassTheSuite(t *testing.T) {
	unscored := port.Entry[src]{
		Name: "unscored", Descriptor: port.Descriptor{Label: "Unscored", Modes: []string{extractionport.ModeExtract}},
		New: func() src { f := NewFake("unscored", entryRaw(nil)); f.Scores = false; return f },
	}
	unavailable := port.Entry[src]{
		Name: "later", Descriptor: port.Descriptor{Label: "Later", Modes: []string{extractionport.ModeExtract}},
		New: func() src { f := NewFake("later"); f.Unavailable = "Later is not downloaded."; return f },
	}
	Run(t, registryOf(fakeEntry(nil), unscored, unavailable))
}

type hanging struct{ Fake }

func (h hanging) Extractor() (extractionport.Extractor, error) { return hangingExtractor{}, nil }

type hangingExtractor struct{}

func (hangingExtractor) Extract(context.Context, extractionport.Input) ([]extractionport.Raw, error) {
	time.Sleep(time.Hour)
	return nil, nil
}

type flipping struct {
	Fake
	calls *int
}

func (f flipping) Icon() string {
	*f.calls++
	if *f.calls%2 == 0 {
		return "other"
	}
	return "list"
}

type lying struct{ Fake }

func (lying) Extractor() (extractionport.Extractor, error) { return nil, nil }

func TestTheSuiteCatchesABrokenRow(t *testing.T) {
	raw := func(edit func(*extractionport.Raw)) func(*Fake) {
		return func(f *Fake) {
			r := entryRaw(score(0.8))
			edit(&r)
			f.Raws = []extractionport.Raw{r}
		}
	}
	newSrc := func(s src) func(*port.Entry[src]) {
		return func(e *port.Entry[src]) { e.New = func() src { return s } }
	}
	cases := map[string]struct {
		fake  func(*Fake)
		entry func(*port.Entry[src])
		want  string
	}{
		"no name":            {entry: func(e *port.Entry[src]) { e.Name = "" }, want: "has no name"},
		"no label":           {entry: func(e *port.Entry[src]) { e.Descriptor.Label = "" }, want: "has no label"},
		"no role":            {entry: func(e *port.Entry[src]) { e.Descriptor.Modes = nil }, want: "does not declare extract"},
		"a second role":      {entry: func(e *port.Entry[src]) { e.Descriptor.Modes = []string{"extract", "progress"} }, want: `mode "progress"`},
		"role twice":         {entry: func(e *port.Entry[src]) { e.Descriptor.Modes = []string{"extract", "extract"} }, want: `"extract" twice`},
		"unknown platform":   {entry: func(e *port.Entry[src]) { e.Descriptor.Platforms = []string{"plan9"} }, want: `platform "plan9"`},
		"no New":             {entry: func(e *port.Entry[src]) { e.New = nil }, want: "has no New"},
		"nil source":         {entry: func(e *port.Entry[src]) { e.New = func() src { return nil } }, want: "nil source"},
		"panicking New":      {entry: func(e *port.Entry[src]) { e.New = func() src { panic("boom") } }, want: "New panicked: boom"},
		"wrong name":         {fake: func(f *Fake) { f.ID = "other" }, want: `calls itself "other"`},
		"no icon":            {fake: func(f *Fake) { f.IconName = " " }, want: "has no icon"},
		"blank asset":        {fake: func(f *Fake) { f.AssetIDs = []string{""} }, want: "blank asset id"},
		"asset twice":        {fake: func(f *Fake) { f.AssetIDs = []string{"gliner", "gliner"} }, want: `"gliner" twice`},
		"reason no stop":     {fake: func(f *Fake) { f.Unavailable = "not downloaded" }, want: "is not a sentence"},
		"panicking Extract":  {fake: func(f *Fake) { f.Panics = true }, want: "Extract panicked"},
		"ignores cancel":     {fake: func(f *Fake) { f.IgnoresCancel = true }, want: "ignores cancellation"},
		"unknown kind":       {fake: raw(func(r *extractionport.Raw) { r.Payload.Kind = "theme" }), want: `kind "theme"`},
		"entry without name": {fake: raw(func(r *extractionport.Raw) { r.Payload.Name = "" }), want: "entry payload needs name"},
		"alias without alias": {fake: raw(func(r *extractionport.Raw) {
			r.Payload = extraction.Payload{Kind: extraction.KindAlias, Entry: "Alice"}
		}), want: "alias payload needs alias"},
		"claim kind": {fake: raw(func(r *extractionport.Raw) {
			r.Payload = extraction.Payload{Kind: extraction.KindClaim, Entry: "Alice", Claim: "feel", Text: "x"}
		}), want: `claim "feel"`},
		"speaker without quote": {fake: raw(func(r *extractionport.Raw) {
			r.Payload = extraction.Payload{Kind: extraction.KindSpeaker, Speaker: "Alice"}
		}), want: "speaker payload needs quote"},
		"confidence over 1": {fake: raw(func(r *extractionport.Raw) { r.Confidence = score(1.2) }), want: "not within 0..1"},
		"confidence NaN":    {fake: raw(func(r *extractionport.Raw) { r.Confidence = score(math.NaN()) }), want: "not within 0..1"},
		"blank quote":       {fake: raw(func(r *extractionport.Raw) { r.Quotes = []extractionport.Quote{{Text: " "}} }), want: "quote 0 has no text"},
		"unknown flag":      {fake: raw(func(r *extractionport.Raw) { r.Flag = "maybe" }), want: `flag "maybe"`},
		// nil-confidence-stays-nil: a source that gives no score cannot make one up.
		"made-up confidence":      {fake: func(f *Fake) { f.Scores = false }, want: "made-up number 0.91"},
		"available with a reason": {entry: newSrc(availableWithReason{NewFake("fake")}), want: "available but gives the reason"},
		"unavailable but extracts": {entry: newSrc(extractsAnyway{func() Fake { f := NewFake("fake"); f.Unavailable = "Not yet."; return f }()}),
			want: "must refuse"},
		"available but no extractor": {entry: newSrc(lying{NewFake("fake")}), want: "is available, but Extractor gave"},
		"not static": {entry: func(e *port.Entry[src]) {
			calls := 0
			e.New = func() src { return flipping{NewFake("fake"), &calls} }
		}, want: "not static"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			entry := fakeEntry(tc.fake)
			if tc.entry != nil {
				tc.entry(&entry)
			}
			problems := Problems(entry)
			for _, p := range problems {
				if strings.Contains(p, tc.want) {
					return
				}
			}
			t.Fatalf("Problems = %q, want one containing %q", problems, tc.want)
		})
	}
}

type availableWithReason struct{ Fake }

func (availableWithReason) Available() extractionport.Availability {
	return extractionport.Availability{OK: true, Reason: "Ready."}
}

type extractsAnyway struct{ Fake }

func (e extractsAnyway) Extractor() (extractionport.Extractor, error) {
	return fakeExtractor{e.Fake}, nil
}

func TestTheSuiteReportsAnExtractorThatHangs(t *testing.T) {
	defer func(p time.Duration) { Patience = p }(Patience)
	Patience = 50 * time.Millisecond
	entry := fakeEntry(nil)
	entry.New = func() src { return hanging{NewFake("fake")} }
	problems := Problems(entry)
	if len(problems) != 1 || !strings.Contains(problems[0], "did not return within") {
		t.Fatalf("Problems = %q", problems)
	}
}
