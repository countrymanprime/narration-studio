package guide

import (
	"bytes"
	"os"
	"reflect"
	"strings"
	"testing"
)

// The undo of a pronunciation edit: the name's whole pronunciation object goes back exactly as given, and a key the value does not
// have is gone from the file.
func TestRestorePronunciationWritesTheWholeValue(t *testing.T) {
	entity := `{"id": "entity-1", "canonical_name": "Wren", "category": "Character", "pronunciation": {"ipa": "wɹɛn", "source": "manual", "confidence": "narrator", "chosen": true, "note": "Said slowly.", "alternate": {"ipa": "wren", "source": "cmu"}}, "aliases": [{"text": "the Sparrow", "pronunciation": {}, "occurrences": []}]}`
	s, _ := pronounceService(t, entity, cmuAnswer)
	value := Pronunciation{IPA: "w ɹ ɛ n", Source: "cmu", Confidence: "medium"}
	if err := s.RestorePronunciation("entity-1", nil, value, nil); err != nil {
		t.Fatal(err)
	}
	if got, want := pronunciationOf(t, s, -1), map[string]any{"ipa": "w ɹ ɛ n", "source": "cmu", "confidence": "medium"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("restored = %v", got)
	}
	full := Pronunciation{IPA: "spæɹoʊ", Source: "wiktextract", Confidence: "high", Chosen: true, Note: "Two syllables.", Alternate: &PronunciationCore{IPA: "sparrow", Source: "manual", Confidence: "narrator"}}
	zero := 0
	if err := s.RestorePronunciation("entity-1", &zero, full, nil); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"ipa": "spæɹoʊ", "source": "wiktextract", "confidence": "high", "chosen": true, "note": "Two syllables.",
		"alternate": map[string]any{"ipa": "sparrow", "source": "manual", "confidence": "narrator"}}
	if got := pronunciationOf(t, s, 0); !reflect.DeepEqual(got, want) {
		t.Fatalf("restored alias = %v", got)
	}
	// A name that had nothing generated goes back to the sidecar's own "not generated" value; a source only the host knows (the
	// keyed online one) is taken when the caller names it.
	if err := s.RestorePronunciation("entity-1", nil, Pronunciation{IPA: "", Source: "not generated", Confidence: "unknown"}, nil); err != nil {
		t.Fatal(err)
	}
	if err := s.RestorePronunciation("entity-1", nil, Pronunciation{IPA: "ˈwɹɛn", Source: "merriam-webster"}, []string{"merriam-webster"}); err != nil {
		t.Fatal(err)
	}
}

// A refusal is in the words the other pronunciation edits use, and changes nothing.
func TestRestorePronunciationRefusesWhatTheOtherEditsRefuse(t *testing.T) {
	locked := `{"id": "entity-2", "canonical_name": "Kit", "category": "Character", "locked": true, "aliases": []}`
	s, _ := pronounceService(t, wren+`}, `+locked, cmuAnswer)
	before, _ := os.ReadFile(s.guidePath())
	value := Pronunciation{IPA: "x", Source: "manual"}
	nine := 9
	long := strings.Repeat("ə", maxUserPronunciation+1)
	for label, call := range map[string]struct {
		id    string
		alias *int
		value Pronunciation
		want  string
	}{
		"unknown id":          {"entity-9", nil, value, "Entity not found."},
		"locked entry":        {"entity-2", nil, value, "This entity is locked."},
		"alias out of range":  {"entity-1", &nine, value, "Alias index out of range."},
		"ipa too long":        {"entity-1", nil, Pronunciation{IPA: long, Source: "manual"}, "at most 200 characters"},
		"ipa two lines":       {"entity-1", nil, Pronunciation{IPA: "a\nb", Source: "manual"}, "one line"},
		"unknown source":      {"entity-1", nil, Pronunciation{IPA: "x", Source: "made-up"}, "not one of yours"},
		"path-shaped source":  {"entity-1", nil, Pronunciation{IPA: "x", Source: "../cmu"}, "not one of yours"},
		"alternate too long":  {"entity-1", nil, Pronunciation{IPA: "x", Source: "manual", Alternate: &PronunciationCore{IPA: long, Source: "cmu"}}, "at most 200 characters"},
		"alternate bad":       {"entity-1", nil, Pronunciation{IPA: "x", Source: "manual", Alternate: &PronunciationCore{IPA: "y", Source: "nope"}}, "not one of yours"},
		"note too long":       {"entity-1", nil, Pronunciation{IPA: "x", Source: "manual", Note: strings.Repeat("n", maxPronunciationNote+1)}, "at most 1000 characters"},
		"confidence too long": {"entity-1", nil, Pronunciation{IPA: "x", Source: "manual", Confidence: strings.Repeat("c", 41)}, "confidence"},
	} {
		err := s.RestorePronunciation(call.id, call.alias, call.value, nil)
		if err == nil || !strings.Contains(err.Error(), call.want) {
			t.Errorf("%s: err = %v, want %q", label, err, call.want)
		}
	}
	if after, _ := os.ReadFile(s.guidePath()); !bytes.Equal(before, after) {
		t.Fatalf("a refused restore changed the file:\n%s", after)
	}
}
