package compare

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"

	"desktop/internal/layout"
)

// textRules is tests/fixtures/booth-parity/text-rules.json: Python's own str.lower, \w, str.isspace and spoken_key,
// written by src/studio/libs/python/tests/test_pyunicode_tables.py, which also holds pyunicode_gen.go to that Python.
type textRules struct {
	Unicode   string      `json:"unicode"`
	Lower     string      `json:"lower"`
	Word      string      `json:"word"`
	Space     string      `json:"space"`
	Casefold  string      `json:"casefold"`
	Printable string      `json:"printable"`
	SpokenKey [][2]string `json:"spokenKey"`
	Repr      [][2]string `json:"repr"`
}

func readTextRules(t *testing.T) textRules {
	t.Helper()
	working, _ := os.Getwd()
	raw, err := os.ReadFile(filepath.Join(layout.FindRoot(working), "tests", "fixtures", "booth-parity", "text-rules.json"))
	if err != nil {
		t.Fatal(err)
	}
	var rules textRules
	if err := json.Unmarshal(raw, &rules); err != nil {
		t.Fatal(err)
	}
	return rules
}

// codePointDigest is the test's digest: sha256 over each non-surrogate code point's part, each followed by a NUL.
func codePointDigest(part func(r rune) []string) string {
	h := sha256.New()
	for r := rune(0); r <= utf8.MaxRune; r++ {
		if r >= 0xd800 && r <= 0xdfff {
			continue
		}
		for _, p := range part(r) {
			h.Write([]byte(p))
			h.Write([]byte{0})
		}
	}
	return hex.EncodeToString(h.Sum(nil))
}

func bit(ok bool) []string {
	if ok {
		return []string{"1"}
	}
	return []string{"0"}
}

func TestLowercasingWordAndSpaceArePython312sForEveryCodePoint(t *testing.T) {
	rules := readTextRules(t)
	if rules.Unicode != PyUnicodeVersion {
		t.Fatalf("the fixture is Unicode %s, the tables %s", rules.Unicode, PyUnicodeVersion)
	}
	// Each code point lowercased alone, between "A" and a capital sigma, before "Σa" and after "AΣ": the final-sigma
	// rule's cased and case-ignorable tests are crossed on both sides of the sigma for every one.
	lower := codePointDigest(func(r rune) []string {
		c := string(r)
		return []string{PyLower(c), PyLower("A" + c + "Σ"), PyLower(c + "Σa"), PyLower("AΣ" + c)}
	})
	if lower != rules.Lower {
		t.Error("PyLower differs from str.lower over the code points")
	}
	if codePointDigest(func(r rune) []string { return bit(IsPyWord(r)) }) != rules.Word {
		t.Error(`IsPyWord differs from re's \w over the code points`)
	}
	if codePointDigest(func(r rune) []string { return bit(IsPySpace(r)) }) != rules.Space {
		t.Error("IsPySpace differs from str.isspace over the code points")
	}
	if codePointDigest(func(r rune) []string { return []string{PyCasefold(string(r))} }) != rules.Casefold {
		t.Error("PyCasefold differs from str.casefold over the code points")
	}
	if codePointDigest(func(r rune) []string { return bit(IsPyPrintable(r)) }) != rules.Printable {
		t.Error("IsPyPrintable differs from str.isprintable over the code points")
	}
}

func TestReprQuotesAndEscapesAsPythonDoes(t *testing.T) {
	rules := readTextRules(t)
	if len(rules.Repr) < 200 {
		t.Fatalf("%d cases", len(rules.Repr))
	}
	for _, c := range rules.Repr {
		if got := PyRepr(c[0]); got != c[1] {
			t.Errorf("PyRepr(%q) = %s, want %s", c[0], got, c[1])
		}
	}
}

func TestTheSpokenKeyIsSpokenForms(t *testing.T) {
	rules := readTextRules(t)
	if len(rules.SpokenKey) < 300 {
		t.Fatalf("%d cases", len(rules.SpokenKey))
	}
	for _, c := range rules.SpokenKey {
		if got := SpokenKey(c[0]); got != c[1] {
			t.Errorf("SpokenKey(%q) = %q, want %q", c[0], got, c[1])
		}
	}
	if SpokenKey("Twenty-three o'clock") != SpokenKey("23 o clock") || SpokenKey("there") != SpokenKey("their") {
		t.Error("the same words said differently key differently")
	}
	if strings.Contains(SpokenKey("Ada's"), "'") {
		t.Error("a key kept an apostrophe")
	}
}
