package guide

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// pronounceService is a Service over one Story Bible holding entity, whose named source answers answer for any name, recording what
// it was asked.
func pronounceService(t *testing.T, entity string, answer func(name string) (*pyObject, error)) (*Service, *[]string) {
	t.Helper()
	s := hostEditService(t)
	if err := os.WriteFile(s.guidePath(), []byte(`{"schema_version": 2, "entities": [`+entity+`]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	asked := &[]string{}
	s.sourceLookup = func(name, source string) (*pyObject, error) {
		*asked = append(*asked, source+":"+name)
		return answer(name)
	}
	return s, asked
}

func cmuAnswer(name string) (*pyObject, error) {
	return parseSourceAnswer(`{"ipa": "h ʌ l oʊ", "source": "cmu", "confidence": "medium"}`)
}

const wren = `{"id": "entity-1", "canonical_name": "hello", "category": "Character", "aliases": [{"text": "the Sparrow", "pronunciation": {}, "occurrences": []}]`

func pronunciationOf(t *testing.T, s *Service, alias int) map[string]any {
	t.Helper()
	entities, err := s.Entities()
	if err != nil {
		t.Fatal(err)
	}
	holder := entities[0]
	if alias >= 0 {
		holder = holder["aliases"].([]any)[alias].(map[string]any)
	}
	value, _ := holder["pronunciation"].(map[string]any)
	return value
}

// Ported from the sidecar's test_pronounce.py PronounceCommandTests.
func TestPronounceSetsTheNamesPronunciationAndMarksItChosen(t *testing.T) {
	s, asked := pronounceService(t, wren+`}`, cmuAnswer)
	if err := s.Pronounce("entity-1", nil, "cmu"); err != nil {
		t.Fatal(err)
	}
	if got := pronunciationOf(t, s, -1); got["source"] != "cmu" || got["chosen"] != true || got["ipa"] != "h ʌ l oʊ" {
		t.Fatalf("pronunciation = %v", got)
	}
	if strings.Join(*asked, ",") != "cmu:hello" {
		t.Fatalf("asked %q", *asked)
	}
}

func TestPronounceSetsAnAliasByIndexAndLeavesTheNameAlone(t *testing.T) {
	s, asked := pronounceService(t, wren+`}`, cmuAnswer)
	alias := 0
	if err := s.Pronounce("entity-1", &alias, "espeak"); err != nil {
		t.Fatal(err)
	}
	if got := pronunciationOf(t, s, 0); got["chosen"] != true {
		t.Fatalf("alias pronunciation = %v", got)
	}
	raw, _ := os.ReadFile(s.guidePath())
	if bytes.Count(raw, []byte(`"pronunciation"`)) != 1 || strings.Join(*asked, ",") != "espeak:the Sparrow" {
		t.Fatalf("the name was given a pronunciation too, or the wrong name was asked (%q): %s", *asked, raw)
	}
}

func TestPronounceRefusesWithoutAskingAndLeavesTheFile(t *testing.T) {
	far := 5
	for _, c := range []struct {
		entity, id string
		alias      *int
		want       error
	}{
		{wren + `}`, "entity-1", &far, errAliasRange},
		{wren + `, "locked": true}`, "entity-1", nil, errEntityLocked},
		{wren + `}`, "entity-2", nil, errEntityNotFound},
		{`{"id": "entity-1"}`, "entity-1", nil, errPronounceShape},
		{`{"id": "entity-1", "canonical_name": 7}`, "entity-1", nil, errPronounceShape},
	} {
		s, asked := pronounceService(t, c.entity, cmuAnswer)
		before, _ := os.ReadFile(s.guidePath())
		if err := s.Pronounce(c.id, c.alias, "cmu"); !errors.Is(err, c.want) {
			t.Errorf("%s: %v, want %v", c.entity, err, c.want)
		}
		after, _ := os.ReadFile(s.guidePath())
		if !bytes.Equal(before, after) || len(*asked) != 0 {
			t.Errorf("%s: the file changed or the source was asked (%q)", c.entity, *asked)
		}
	}
}

func TestASourceWithNothingForTheNameLeavesTheFileAndSaysWhy(t *testing.T) {
	s, _ := pronounceService(t, wren+`}`, func(string) (*pyObject, error) {
		return parseSourceAnswer(`{"miss": "The CMU dictionary has no entry for \"Zzyzxqq\"."}`)
	})
	before, _ := os.ReadFile(s.guidePath())
	err := s.Pronounce("entity-1", nil, "cmu")
	if err == nil || err.Error() != `The CMU dictionary has no entry for "Zzyzxqq".` {
		t.Fatalf("error = %v", err)
	}
	if after, _ := os.ReadFile(s.guidePath()); !bytes.Equal(before, after) {
		t.Fatal("a miss changed the file")
	}
}

// Ported from the sidecar's test_pronunciation_depth.py.
func TestADictionaryReplaceKeepsTheNarratorsOwnAsTheAlternate(t *testing.T) {
	s, _ := pronounceService(t, wren+`, "pronunciation": {"ipa": "mine", "source": "manual", "confidence": "narrator", "chosen": true}}`, cmuAnswer)
	if err := s.Pronounce("entity-1", nil, "cmu"); err != nil {
		t.Fatal(err)
	}
	got := pronunciationOf(t, s, -1)
	alternate, _ := got["alternate"].(map[string]any)
	if got["source"] != "cmu" || len(alternate) != 3 || alternate["ipa"] != "mine" || alternate["source"] != ManualSource || alternate["confidence"] != "narrator" {
		t.Fatalf("pronunciation = %v", got)
	}
}

func TestAStoredStatusIsNotCarriedButTheNoteIs(t *testing.T) {
	for _, status := range []string{"author_confirmed", "query_sent"} {
		s, _ := pronounceService(t, wren+`, "pronunciation": {"ipa": "wɹɛn", "source": "CMU dictionary", "confidence": "medium", "chosen": true, "status": "`+
			status+`", "note": "Confirmed by phone."}}`, cmuAnswer)
		if err := s.Pronounce("entity-1", nil, "cmu"); err != nil {
			t.Fatal(err)
		}
		raw, _ := os.ReadFile(s.guidePath())
		if bytes.Contains(raw, []byte(`"status"`)) || pronunciationOf(t, s, -1)["note"] != "Confirmed by phone." {
			t.Fatalf("%s: %s", status, raw)
		}
	}
}

func TestALegacyUserValueStillCountsAsTheNarratorsOwnForTheAlternate(t *testing.T) {
	value := setPyPronunciation(newPyObject("ipa", "mine", "source", "user", "confidence", "narrator"), newPyObject("ipa", "dict", "source", "cmu", "confidence", "medium"))
	if got := pyDumps(value); !strings.Contains(got, `"alternate": {`) || !strings.Contains(got, `"source": "user"`) {
		t.Fatalf("value = %s", got)
	}
	again := setPyPronunciation(newPyObject("ipa", "mine", "source", "manual", "confidence", "narrator"), newPyObject("ipa", "new", "source", "user", "confidence", "narrator"))
	if _, ok := again.get("alternate"); ok {
		t.Fatalf("value = %s", pyDumps(again))
	}
}

func TestTheSourcesAnswerIsReadInItsKeyOrderOrAsItsReason(t *testing.T) {
	value, err := parseSourceAnswer("{\"confidence\": \"low\", \"ipa\": \"a b\", \"source\": \"espeak\"}\r\n")
	if err != nil || strings.Join(value.keys, ",") != "confidence,ipa,source" {
		t.Fatalf("value = %v, %v", value, err)
	}
	if _, err := parseSourceAnswer(`{"miss": "two\nlines"}`); err == nil || err.Error() != "two\nlines" {
		t.Fatalf("miss = %v", err)
	}
	for _, bad := range []string{"", "[]", "not json", `{"miss": 3}`, `{"miss": "x", "ipa": "y"}`, "{\"ipa\": \"a\"}\n{\"ipa\": \"b\"}"} {
		if _, err := parseSourceAnswer(bad); !errors.Is(err, errPronunciationAnswer) {
			t.Errorf("%q: %v, want errPronunciationAnswer", bad, err)
		}
	}
}

// The lookup runs under editMu: an edit made while the source is asked waits for the pronunciation's write, and both are in the file.
func TestAnEditDuringTheLookupWaitsAndIsKept(t *testing.T) {
	asking, release := make(chan struct{}), make(chan struct{})
	s, _ := pronounceService(t, wren+`}`, func(name string) (*pyObject, error) {
		close(asking)
		<-release
		return cmuAnswer(name)
	})
	pronounced := make(chan error, 1)
	go func() { pronounced <- s.Pronounce("entity-1", nil, "cmu") }()
	<-asking
	edited := make(chan error, 1)
	go func() { edited <- s.Edit("entity-1", "description", "A wren.") }()
	select {
	case err := <-edited:
		t.Fatalf("the edit did not wait for the pronunciation: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	if err := <-pronounced; err != nil {
		t.Fatal(err)
	}
	if err := <-edited; err != nil {
		t.Fatal(err)
	}
	if got := pronunciationOf(t, s, -1); got["chosen"] != true {
		t.Fatalf("the pronunciation was lost under the edit: %v", got)
	}
	entities, _ := s.Entities()
	if description, _ := entities[0]["description"].(map[string]any); description["text"] != "A wren." {
		t.Fatalf("the edit was lost: %v", entities[0]["description"])
	}
}

func TestPronounceWithoutAProjectIsRefused(t *testing.T) {
	s := New("", "python", "", nil, nil)
	if err := s.Pronounce("entity-1", nil, "cmu"); !errors.Is(err, errNoProject) {
		t.Fatalf("error = %v", err)
	}
}

// The lines the sidecar's `pronunciation --source` printed (testdata/pronunciation-source-golden.json, written by test_pronounce.py)
// are read by the host's parser: a value in its key order, or the source's reason as the error.
func TestTheSourceAnswerMatchesTheGolden(t *testing.T) {
	golden := readJSONFile[struct {
		Words []string `json:"words"`
		Lines []string `json:"lines"`
	}](t, filepath.Join("testdata", "pronunciation-source-golden.json"))
	if len(golden.Lines) != len(golden.Words) || len(golden.Lines) < 6 {
		t.Fatalf("%d lines for %d words", len(golden.Lines), len(golden.Words))
	}
	reasons := map[string]string{"Zzyzxqq": `The CMU dictionary has no entry for "Zzyzxqq".`, "": "KeyError", "espeak": "espeak not installed on your system"}
	for i, line := range golden.Lines {
		value, err := parseSourceAnswer(line)
		if reason, missed := reasons[golden.Words[i]]; missed {
			if err == nil || err.Error() != reason {
				t.Errorf("%q: %v, want %q", golden.Words[i], err, reason)
			}
			continue
		}
		if err != nil || strings.Join(value.keys, ",") != "ipa,source,confidence" {
			t.Errorf("%q: %v %v", golden.Words[i], value, err)
		}
	}
}
