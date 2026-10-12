package main

import (
	"slices"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
)

// Each review and colour binding is one sidecar call naming the entry, and the alias index only when one is given.

func TestGuideReviewBindingsSendTheEntryAndTheAliasIndex(t *testing.T) {
	one := 1
	for _, tc := range []struct {
		command string
		call    func(*Host, *int) (string, error)
	}{
		{"mark-reviewed", func(h *Host, alias *int) (string, error) { return h.GuideMarkReviewed("entity-1", alias) }},
		{"review-flag", func(h *Host, alias *int) (string, error) { return h.GuideFlagReview("entity-1", alias) }},
	} {
		for _, alias := range []*int{nil, &one} {
			service, calls := countingGuide(t)
			result, err := tc.call(&Host{guide: service}, alias)
			if err != nil || result != "null" {
				t.Fatalf("%s: %q, %v", tc.command, result, err)
			}
			call := calls()[0]
			if call[0] != tc.command || !slices.Contains(call, "entity-1") || slices.Contains(call, "--alias-index") != (alias != nil) {
				t.Fatalf("call = %v", call)
			}
			if alias != nil && !slices.Contains(call, "1") {
				t.Fatalf("call = %v", call)
			}
		}
	}
}

func TestGuideSetSpeakerColorSendsTheIndexAndNilAsAutomatic(t *testing.T) {
	three := 3
	for _, tc := range []struct {
		index *int
		want  string
	}{{&three, "3"}, {nil, "0"}} {
		service, calls := countingGuide(t)
		if _, err := (&Host{guide: service}).GuideSetSpeakerColor("entity-1", tc.index); err != nil {
			t.Fatal(err)
		}
		call := calls()[0]
		at := slices.Index(call, "--index")
		if call[0] != "speaker-color" || !slices.Contains(call, "entity-1") || at < 0 || call[at+1] != tc.want {
			t.Fatalf("call = %v", call)
		}
	}
}

func TestGuideSetSpeakerColorRefusesAnIndexOutsideOneToSevenBeforeTheSidecar(t *testing.T) {
	for _, bad := range []int{-1, 8} {
		service, calls := countingGuide(t)
		if _, err := (&Host{guide: service}).GuideSetSpeakerColor("entity-1", &bad); err == nil {
			t.Fatalf("GuideSetSpeakerColor(%d) accepted", bad)
		}
		if len(calls()) != 0 {
			t.Fatal("the sidecar started")
		}
	}
}

func TestGuideReviewBindingsWithoutAStoryBible(t *testing.T) {
	host := &Host{}
	if _, err := host.GuideMarkReviewed("a", nil); err == nil {
		t.Fatal("GuideMarkReviewed accepted")
	}
	if _, err := host.GuideFlagReview("a", nil); err == nil {
		t.Fatal("GuideFlagReview accepted")
	}
	if _, err := host.GuideSetSpeakerColor("a", nil); err == nil {
		t.Fatal("GuideSetSpeakerColor accepted")
	}
}

// The host, not only the button, refuses Mark reviewed on an entry with a suggestion still to verify (extraction.test.tsx row 18): the
// refusal is the reason the button gives, and the sidecar is never asked, so no flag is cleared. One name, or an entry with nothing to
// verify, is still marked.
func TestGuideMarkReviewedRefusesAnEntryWithSuggestionsToVerify(t *testing.T) {
	host, _ := extractionHost(t)
	service, calls := countingGuide(t)
	host.guide = service
	follows := suggestionAbout(t, host, "follows")
	if follows.Status != extraction.StatusNeedsVerification || follows.EntryID == nil || *follows.EntryID != "alice" {
		t.Fatalf("the fixture's relationship waits on Alice: %+v", follows)
	}
	before, err := host.ExtractionList()
	if err != nil {
		t.Fatal(err)
	}

	if result, err := host.GuideMarkReviewed("alice", nil); err == nil || err.Error() != sentenceVerifyFirst || result != "" {
		t.Fatalf("GuideMarkReviewed(alice) = %q, %v; want the refusal %q", result, err, sentenceVerifyFirst)
	}
	if len(calls()) != 0 {
		t.Fatalf("the sidecar was asked: %v", calls())
	}
	if after, err := host.ExtractionList(); err != nil || after != before {
		t.Fatalf("the suggestions changed: %v", err)
	}

	one := 0
	if _, err := host.GuideMarkReviewed("alice", &one); err != nil {
		t.Fatalf("one name of Alice: %v", err)
	}
	dodo := suggestionAbout(t, host, "The Dodo")
	if _, err := host.GuideMarkReviewed(*dodo.EntryID, nil); err != nil {
		t.Fatalf("an entry with nothing to verify: %v", err)
	}
	if got := calls(); len(got) != 2 || got[0][0] != "mark-reviewed" || got[1][0] != "mark-reviewed" {
		t.Fatalf("calls = %v", got)
	}
}
