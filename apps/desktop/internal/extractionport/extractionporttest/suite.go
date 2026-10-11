// Package extractionporttest is the conformance suite every extraction source row must pass (ADR 0301), and a fake source
// it runs against. The extractionport test runs it over the program's registry, so a new row cannot skip it:
//
//	extractionporttest.Run(t, extractionport.Sources)
package extractionporttest

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"math"
	"slices"
	"strings"
	"testing"
	"time"
	"unicode"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
)

// Patience is how long the suite waits for one Extract call before it reports that the source hangs.
var Patience = 5 * time.Second

// Sample is the input the suite gives an available source.
var Sample = extractionport.Input{Paragraphs: []extraction.Paragraph{{
	ID: "1-1", ChapterID: "1", Text: "Alice was beginning to get very tired of sitting by her sister on the bank.",
}}}

// Run checks every row of r, each as its own subtest, and fails when r has none.
func Run(t *testing.T, r *port.Registry[extractionport.Source]) {
	t.Helper()
	entries := r.Entries()
	if len(entries) == 0 {
		t.Fatal("no extraction source is registered")
	}
	for _, entry := range entries {
		t.Run(entry.Name, func(t *testing.T) {
			for _, p := range Problems(entry) {
				t.Error(p)
			}
		})
	}
}

// Problems is every way entry breaks the port's contract; empty when it conforms. It checks that:
//   - the row has a name and a label, declares the extract role, and each role and platform once and known to the port;
//   - New builds a non-nil source without panicking, which calls itself by the row's name, has an icon, and lists each
//     asset once; what it says is static;
//   - Available is ok with no reason, or not ok with a sentence; an unavailable source refuses its extractor with that
//     sentence and so starts nothing;
//   - an available source's extractor returns the context's error once it is cancelled, does not panic, and offers only
//     well-formed raw suggestions: a known kind with the fields it needs, a confidence that is nil or within 0..1 (always
//     nil from a source that gives none), quotes with text, and no flag but duplicate.
func Problems(entry port.Entry[extractionport.Source]) []string {
	var problems []string
	report := func(format string, args ...any) { problems = append(problems, fmt.Sprintf(format, args...)) }

	if entry.Name == "" {
		report("the row has no name")
	}
	if entry.Descriptor.Label == "" {
		report("%q has no label", entry.Name)
	}
	if !entry.Descriptor.Supports(extractionport.ModeExtract) {
		report("%q does not declare %s, the port's one role", entry.Name, extractionport.ModeExtract)
	}
	checkSet := func(what string, values, known []string) {
		for i, v := range values {
			if !slices.Contains(known, v) {
				report("%q declares the %s %q, which is not one of %v", entry.Name, what, v, known)
			}
			if slices.Contains(values[:i], v) {
				report("%q declares the %s %q twice", entry.Name, what, v)
			}
		}
	}
	checkSet("mode", entry.Descriptor.Modes, extractionport.Modes())
	checkSet("platform", entry.Descriptor.Platforms, port.Platforms)

	if entry.New == nil {
		report("%q has no New", entry.Name)
		return problems
	}
	first, broken := build(entry)
	if broken == "" {
		var second extractionport.Source
		if second, broken = build(entry); broken == "" {
			checkSource(entry, first, second, report)
			return problems
		}
	}
	report("%q: %s", entry.Name, broken)
	return problems
}

func checkSource(entry port.Entry[extractionport.Source], first, second extractionport.Source, report func(string, ...any)) {
	name := entry.Name
	if first.Name() != name {
		report("%q's source calls itself %q", name, first.Name())
	}
	if strings.TrimSpace(first.Icon()) == "" {
		report("%q has no icon", name)
	}
	assets := first.Assets()
	for i, id := range assets {
		if strings.TrimSpace(id) == "" {
			report("%q lists a blank asset id", name)
		}
		if slices.Contains(assets[:i], id) {
			report("%q lists the asset %q twice", name, id)
		}
	}
	available := first.Available()
	if first.Name() != second.Name() || first.Icon() != second.Icon() || first.Runs() != second.Runs() ||
		first.Scored() != second.Scored() || !slices.Equal(assets, second.Assets()) || available != second.Available() {
		report("%q's source is not static: two answers differed", name)
	}
	switch {
	case available.OK && available.Reason != "":
		report("%q is available but gives the reason %q", name, available.Reason)
	case !available.OK && !sentence(available.Reason):
		report("%q is unavailable, and %q is not a sentence saying why", name, available.Reason)
	}

	extractor, panicked, err := askExtractor(first)
	switch {
	case panicked != "":
		report("%q: Extractor panicked: %s", name, panicked)
	case !available.OK:
		if extractor != nil || !errors.Is(err, port.ErrNotSupported) {
			report("%q is unavailable, so Extractor must refuse with a *port.NotSupportedError; it gave (%v, %v)", name, extractor, err)
		} else if err.Error() != available.Reason {
			report("%q refused with %q, not its reason %q", name, err.Error(), available.Reason)
		}
	case err != nil || extractor == nil:
		report("%q is available, but Extractor gave (%v, %v)", name, extractor, err)
	default:
		checkExtractor(name, first.Scored(), extractor, report)
	}
}

func checkExtractor(name string, scored bool, extractor extractionport.Extractor, report func(string, ...any)) {
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	raws, broken, err := extract(cancelled, extractor)
	switch {
	case broken != "":
		report("%q with a cancelled context: %s", name, broken)
		return
	case !errors.Is(err, context.Canceled) || len(raws) > 0:
		report("%q ignores cancellation: a cancelled Extract gave %d suggestions and the error %v", name, len(raws), err)
	}

	raws, broken, err = extract(context.Background(), extractor)
	switch {
	case broken != "":
		report("%q: %s", name, broken)
		return
	case err != nil:
		report("%q failed on the sample: %v", name, err)
		return
	}
	for i, raw := range raws {
		for _, p := range RawProblems(raw, scored) {
			report("%q suggestion %d: %s", name, i, p)
		}
	}
}

// RawProblems is every way raw is malformed. A source that is not scored must give no confidence.
func RawProblems(raw extractionport.Raw, scored bool) []string {
	var problems []string
	report := func(format string, args ...any) { problems = append(problems, fmt.Sprintf(format, args...)) }
	p := raw.Payload
	blank := func(fields map[string]string) {
		for _, field := range slices.Sorted(maps.Keys(fields)) {
			if strings.TrimSpace(fields[field]) == "" {
				report("a %s payload needs %s", p.Kind, field)
			}
		}
	}
	switch p.Kind {
	case extraction.KindEntry:
		blank(map[string]string{"name": p.Name})
	case extraction.KindAlias:
		blank(map[string]string{"entry": p.Entry, "alias": p.Alias})
	case extraction.KindProperty:
		blank(map[string]string{"entry": p.Entry, "key": p.Key, "value": p.Value})
	case extraction.KindRelationship:
		blank(map[string]string{"entry": p.Entry, "to": p.To, "relation": p.Relation})
	case extraction.KindClaim:
		blank(map[string]string{"entry": p.Entry, "text": p.Text})
		if !slices.Contains([]extraction.ClaimKind{extraction.ClaimTalk, extraction.ClaimAct, extraction.ClaimKnow}, p.Claim) {
			report("the claim %q is not talk, act or know", p.Claim)
		}
	case extraction.KindSpeaker:
		blank(map[string]string{"quote": p.Quote, "speaker": p.Speaker})
	default:
		report("the payload kind %q is not one the port knows", p.Kind)
	}
	if c := raw.Confidence; c != nil {
		switch {
		case !scored:
			report("the source gives no confidence, but this one has the made-up number %v", *c)
		case math.IsNaN(*c) || *c < 0 || *c > 1:
			report("the confidence %v is not within 0..1", *c)
		}
	}
	for i, q := range raw.Quotes {
		if strings.TrimSpace(q.Text) == "" {
			report("quote %d has no text", i)
		}
	}
	if raw.Flag != "" && raw.Flag != extractionport.FlagDuplicate {
		report("the flag %q is not %q", raw.Flag, extractionport.FlagDuplicate)
	}
	return problems
}

// sentence is a reason the narrator can read: it starts with a capital or a digit and ends with a full stop.
func sentence(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" || !strings.HasSuffix(s, ".") {
		return false
	}
	r := []rune(s)[0]
	return unicode.IsUpper(r) || unicode.IsDigit(r)
}

// build calls entry.New, and says how it broke when it panics or returns nil.
func build(entry port.Entry[extractionport.Source]) (source extractionport.Source, broken string) {
	defer func() {
		if r := recover(); r != nil {
			broken = fmt.Sprintf("New panicked: %v", r)
		}
	}()
	if source = entry.New(); source == nil {
		return nil, "New returned a nil source"
	}
	return source, ""
}

func askExtractor(source extractionport.Source) (extractor extractionport.Extractor, panicked string, err error) {
	defer func() {
		if r := recover(); r != nil {
			panicked = fmt.Sprint(r)
		}
	}()
	extractor, err = source.Extractor()
	return extractor, "", err
}

// extract runs one Extract over Sample, and says how it broke when it panics or outlasts Patience.
func extract(ctx context.Context, extractor extractionport.Extractor) (raws []extractionport.Raw, broken string, err error) {
	type result struct {
		raws   []extractionport.Raw
		err    error
		broken string
	}
	done := make(chan result, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				done <- result{broken: fmt.Sprintf("Extract panicked: %v", r)}
			}
		}()
		raws, err := extractor.Extract(ctx, Sample)
		done <- result{raws: raws, err: err}
	}()
	select {
	case r := <-done:
		return r.raws, r.broken, r.err
	case <-time.After(Patience):
		return nil, fmt.Sprintf("Extract did not return within %v", Patience), nil
	}
}
