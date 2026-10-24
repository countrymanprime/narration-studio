package compare

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The manuscript as compare.py's load_manuscript_chapters reads it, refused with the sidecar's own sentences.
func TestTheManuscriptIsReadAsTheSidecarValidatesIt(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "manuscript.json")
	for _, missing := range []string{path, dir} {
		if _, err := LoadManuscriptChapters(missing); err == nil || err.Error() != "Import a manuscript first." {
			t.Fatalf("%s: %v", missing, err)
		}
	}
	for content, message := range map[string]string{
		"not json":   "could not be read",
		"\xff\xfe{}": "could not be read",
		`{"schemaVersion": 2, "documentId": "d", "chapters": [], "paragraphs": []}`:                                                                                                                                        "unsupported schema version",
		`{"schemaVersion": "1", "documentId": "d", "chapters": [], "paragraphs": []}`:                                                                                                                                      "unsupported schema version",
		`{"schemaVersion": 1, "documentId": 3, "chapters": [], "paragraphs": []}`:                                                                                                                                          "is invalid",
		`{"schemaVersion": 1, "documentId": "d", "paragraphs": []}`:                                                                                                                                                        "is invalid",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"title": "T"}], "paragraphs": []}`:                                                                                                                          "is invalid",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c"}], "paragraphs": [{"id": "p", "chapterId": "x", "text": "t"}]}`:                                                                                   "invalid paragraph records",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c"}], "paragraphs": [{"id": "p", "chapterId": "c", "text": null}]}`:                                                                                  "invalid paragraph records",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c"}], "paragraphs": [7]}`:                                                                                                                            "invalid paragraph records",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "T"}], "paragraphs": [{"id": "p", "chapterId": "c", "text": "a", "index": 0}, {"id": "p", "chapterId": "c", "text": "b", "index": 1}]}`: "invalid paragraph records",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "T", "contentKind": "opening"}], "paragraphs": [{"id": "p", "chapterId": "c", "text": "a", "index": 0}]}`:                               "no narratable chapters",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "T"}], "paragraphs": []}`:                                                                                                               "no narratable chapters",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": null}], "paragraphs": [{"id": "p", "chapterId": "c", "text": "a", "index": 0}]}`:                                                        `The chapter "c" has no title.`,
		// load_manuscript_chapters reads paragraph["index"] and fails with a KeyError, whose message is the key.
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "T"}], "paragraphs": [{"id": "p", "chapterId": "c", "text": "a"}]}`: "'index'",
	} {
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := LoadManuscriptChapters(path); err == nil || !strings.Contains(err.Error(), message) {
			t.Errorf("%s: want %q, got %v", content, message, err)
		}
	}
}

func TestOnlyNarrationChaptersWithParagraphsAreReadInFileOrder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "manuscript.json")
	content := `{"schemaVersion": 1.0, "documentId": "d", "chapters": [
		{"id": "b", "title": "Two", "subtitle": "The Return", "contentKind": "narration"},
		{"id": "f", "title": "Contents", "contentKind": "front-matter"},
		{"id": "e", "title": "Empty"},
		{"id": "a", "title": "One", "subtitle": 5}],
	"paragraphs": [
		{"id": "p1", "chapterId": "a", "text": "first", "index": 0},
		{"id": "p2", "chapterId": "f", "text": "Two"},
		{"id": "p3", "chapterId": "b", "text": "second", "index": 1},
		{"id": "p4", "chapterId": "a", "text": "third", "index": 2}]}`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	chapters, err := LoadManuscriptChapters(path)
	if err != nil {
		t.Fatal(err)
	}
	same(t, "chapters", chapters, []Chapter{
		{ID: "b", Title: "Two", Subtitle: "The Return", Paragraphs: []string{"second"}, ParagraphIDs: []string{"p3"}, ParagraphIndices: []*string{new("1")}},
		{ID: "a", Title: "One", Paragraphs: []string{"first", "third"}, ParagraphIDs: []string{"p1", "p4"}, ParagraphIndices: []*string{new("0"), new("2")}},
	})
	same(t, "headings", []string{chapters[0].Heading(), chapters[1].Heading(), Chapter{}.Heading()}, []string{"Two The Return", "One", ""})
}

func TestAFileLargerThanTheBoundIsRefused(t *testing.T) {
	path := filepath.Join(t.TempDir(), "big.json")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(MaxInputBytes + 1); err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	if _, err := ReadBounded(path); err == nil || !strings.Contains(err.Error(), "larger than") {
		t.Fatalf("got %v", err)
	}
	if _, err := LoadManuscriptChapters(path); err == nil || err.Error() != "The canonical manuscript data could not be read." {
		t.Fatalf("got %v", err)
	}
}

// Python's json reads these the way JSONString, JSONNumber and IsVersionOne say.
func TestJSONValuesAreReadAsPythonsJSONReadsThem(t *testing.T) {
	for raw, want := range map[string]bool{`"a"`: true, `null`: false, `3`: false, ``: false, `"\x"`: false} {
		if _, ok := JSONString([]byte(raw)); ok != want {
			t.Errorf("JSONString(%s) = %v", raw, ok)
		}
	}
	for raw, want := range map[string][2]bool{`3`: {true, true}, `-3.5`: {false, true}, `1e2`: {false, true}, `true`: {false, false}, ` `: {false, false}, `"1"`: {false, false}, `1.2.3`: {false, false}} {
		if _, integer, ok := JSONNumber([]byte(raw)); integer != want[0] || ok != want[1] {
			t.Errorf("JSONNumber(%s) = %v, %v", raw, integer, ok)
		}
	}
	for raw, want := range map[string]bool{`1`: true, `1.0`: true, `true`: true, `false`: false, `2`: false, `"1"`: false} {
		if IsVersionOne([]byte(raw)) != want {
			t.Errorf("IsVersionOne(%s) != %v", raw, want)
		}
	}
}

func TestTitlesAndMarkerFieldsAreCleanedAsComparePyCleansThem(t *testing.T) {
	same(t, "display", []string{DisplayTitle(""), DisplayTitle("CHAPTER ONE\n  Bad Ideas \r\n\n"), DisplayTitle("One\x1cTwo Three")},
		[]string{"", "CHAPTER ONE: Bad Ideas", "One: Two: Three"})
	same(t, "lines", PySplitLines("a\r\nb\rc\n\nd\n"), []string{"a", "b", "c", "", "d"})
	same(t, "field", CleanMarkerField("a|b"), "a/b")
	same(t, "long field", CleanMarkerField(strings.Repeat("é", 201)), strings.Repeat("é", 200))
	same(t, "prefix", []string{PyPrefix("héllo", 2), PyPrefix("hé", 5), PyPrefix("", 0)}, []string{"hé", "hé", ""})
}

func TestEveryValueTheWriterTakesIsWrittenAsPythonWritesIt(t *testing.T) {
	one, half, text := 1, 0.5, "x"
	value := PyOrdered{
		{Key: "z", Value: &one}, {Key: "a", Value: (*int)(nil)}, {Key: "f", Value: &half}, {Key: "g", Value: (*float64)(nil)},
		{Key: "s", Value: &text}, {Key: "n", Value: (*string)(nil)}, {Key: "b", Value: false}, {Key: "e", Value: "\r\t\b\f"},
	}
	same(t, "ordered", DumpPy(value, true), `{"z":1,"a":null,"f":0.5,"g":null,"s":"x","n":null,"b":false,"e":"\r\t\b\f"}`)
	same(t, "ordered default", DumpPy(PyOrdered{{Key: "a", Value: []any{1, 2}}, {Key: "b", Value: PyObject{"c": 1, "b": 2}}}, false), `{"a": [1, 2], "b": {"b": 2, "c": 1}}`)
	same(t, "indent empty", DumpPyIndent(PyObject{}, 2), "{}")
	defer func() {
		if recover() == nil {
			t.Error("an unsupported value must panic")
		}
	}()
	DumpPy(struct{}{}, true)
}

// A paragraph's index as Python's str() writes it into a MARKER line: json.loads' types, null as none.
func TestAParagraphIndexIsWrittenAsPythonsStrWritesIt(t *testing.T) {
	for raw, want := range map[string]string{
		`7`: "7", `-0`: "0", `123456789012345678901234567890`: "123456789012345678901234567890", `3.5`: "3.5", `1e2`: "100.0", `1E400`: "inf",
		`-1e400`: "-inf", `true`: "True", `false`: "False", `"7"`: "7", `"a\u00e9"`: "aé", `[1]`: "[1]",
	} {
		if got := pyStr([]byte(raw)); got == nil || *got != want {
			t.Errorf("%s: %v, want %q", raw, got, want)
		}
	}
	if pyStr([]byte(` null `)) != nil {
		t.Error("null is no index")
	}
}
