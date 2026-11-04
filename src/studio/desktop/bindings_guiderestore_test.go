package main

import (
	"reflect"
	"strings"
	"testing"
)

// The undo of a pronunciation edit: the whole object goes back as given, with no sidecar process, and the payload is the object as
// written (the golden the UI's schema is checked against).
func TestGuidePronunciationRestoreWritesTheWholeObject(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	aliasIndex := 1
	if _, err := host.GuidePronounceUser("entity-1", &aliasIndex, "AL-fee"); err != nil {
		t.Fatal(err)
	}
	value := GuidePronunciationValue{IPA: "ælfi", Source: "cmu", Confidence: "medium", Chosen: true, Note: "Asked the author.",
		Alternate: &GuidePronunciationAlternate{IPA: "AL-fee", Source: "manual", Confidence: "narrator"}}
	payload, err := host.GuidePronunciationRestore("entity-1", &aliasIndex, value)
	checkBindingContract(t, "guide-pronunciation-restore", payload)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"ipa": "ælfi", "source": "cmu", "confidence": "medium", "chosen": true, "note": "Asked the author.",
		"alternate": map[string]any{"ipa": "AL-fee", "source": "manual", "confidence": "narrator"}}
	if got := aliasPronunciation(t, project, 1); !reflect.DeepEqual(got, want) {
		t.Fatalf("Alfie's pronunciation = %v", got)
	}
	if _, err := host.GuidePronunciationRestore("entity-1", &aliasIndex, GuidePronunciationValue{IPA: "", Source: "not generated", Confidence: "unknown"}); err != nil {
		t.Fatal(err)
	}
	if got := aliasPronunciation(t, project, 1); !reflect.DeepEqual(got, map[string]any{"ipa": "", "source": "not generated", "confidence": "unknown"}) {
		t.Fatalf("after restoring nothing generated = %v", got)
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("the sidecar was started: %v", got)
	}
}

func TestGuidePronunciationRestoreRefusals(t *testing.T) {
	service, _, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	nine := 9
	if _, err := host.GuidePronunciationRestore("entity-1", &nine, GuidePronunciationValue{IPA: "x", Source: "manual"}); err == nil || !strings.Contains(err.Error(), "Alias index out of range") {
		t.Fatalf("alias out of range = %v", err)
	}
	if _, err := host.GuidePronunciationRestore("entity-1", nil, GuidePronunciationValue{IPA: "x", Source: "C:/path"}); err == nil {
		t.Fatal("a path-shaped source was restored")
	}
	if _, err := newTestHost(t).GuidePronunciationRestore("entity-1", nil, GuidePronunciationValue{IPA: "x", Source: "manual"}); err == nil {
		t.Fatal("a restore with no project succeeded")
	}
}
