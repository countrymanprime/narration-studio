package main

import (
	"slices"
	"strings"
	"testing"
)

// The narrator's own pronunciation and switching to the kept alternate. Each is one sidecar call; free text goes as
// --ipa=VALUE so a value starting with "-" stays a value.

func TestGuidePronounceUserSendsTheTextAsOneArgument(t *testing.T) {
	service, calls := countingGuide(t)
	host := &Host{guide: service}
	aliasIndex := 1
	if _, err := host.GuidePronounceUser("entity-1", &aliasIndex, "-wɹɛn"); err != nil {
		t.Fatal(err)
	}
	got := calls()
	if len(got) != 1 {
		t.Fatalf("calls = %d", len(got))
	}
	call := got[0]
	if call[0] != "pronounce-user" || !slices.Contains(call, "entity-1") || !slices.Contains(call, "--ipa=-wɹɛn") || !slices.Contains(call, "1") {
		t.Fatalf("call = %v", call)
	}
}

func TestGuidePronounceUserRefusesBlankMultiLineAndOverlongTextBeforeStartingTheSidecar(t *testing.T) {
	for _, bad := range []string{"  ", "one\ntwo", strings.Repeat("x", 201)} {
		service, calls := countingGuide(t)
		host := &Host{guide: service}
		if _, err := host.GuidePronounceUser("entity-1", nil, bad); err == nil {
			t.Fatalf("GuidePronounceUser(%q) accepted", bad[:2])
		}
		if len(calls()) != 0 {
			t.Fatal("the sidecar started")
		}
	}
}

func TestGuidePronunciationUseAlternateSendsTheEntity(t *testing.T) {
	service, calls := countingGuide(t)
	host := &Host{guide: service}
	if _, err := host.GuidePronunciationUseAlternate("entity-1", nil); err != nil {
		t.Fatal(err)
	}
	call := calls()[0]
	if call[0] != "pronunciation-use-alternate" || !slices.Contains(call, "entity-1") || slices.Contains(call, "--alias-index") {
		t.Fatalf("call = %v", call)
	}
}

func TestPronunciationDepthBindingsAreUnavailableWithoutTheStoryBible(t *testing.T) {
	host := &Host{}
	if _, err := host.GuidePronounceUser("entity-1", nil, "x"); err == nil {
		t.Fatal("GuidePronounceUser: expected an error")
	}
	if _, err := host.GuidePronunciationUseAlternate("entity-1", nil); err == nil {
		t.Fatal("GuidePronunciationUseAlternate: expected an error")
	}
}
