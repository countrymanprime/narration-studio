package compare

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/layout"
)

// parity is tests/fixtures/compare-parity/cases.json: Python's own answers,
// which compare.py wrote before its tokenizer was deleted; the file is frozen.
type parity struct {
	Texts           []string             `json:"texts"`
	Tokenize        [][]string           `json:"tokenize"`
	TokenizeWithRaw [][2][]string        `json:"tokenizeWithRaw"`
	SplitSentences  [][]string           `json:"splitSentences"`
	RawMerge        [][2]json.RawMessage `json:"mergeNumberWords"`
	Split           [][]string           `json:"split"`
	Strip           []string             `json:"strip"`
	Chapter         struct {
		Title      string   `json:"title"`
		Paragraphs []string `json:"paragraphs"`
		Units      [][2]any `json:"units"`
		Tokens     []string `json:"tokens"`
		UnitIdx    []int    `json:"unitIdx"`
		RawWords   []string `json:"rawWords"`
	} `json:"chapter"`
	Equivalences struct {
		Text   string     `json:"text"`
		Groups [][]string `json:"groups"`
	} `json:"equivalences"`
	Lower   [][2]string `json:"lower"`
	Difflib []struct {
		A, B     string
		Autojunk bool
		Opcodes  [][5]any
		Ratio    float64
	} `json:"difflib"`
	FloatRepr [][2]any `json:"floatRepr"`
	Round3    [][2]any `json:"round3"`
	Sum       [][2]any `json:"sum"`
}

func loadParity(t *testing.T) parity {
	t.Helper()
	working, _ := os.Getwd()
	raw, err := os.ReadFile(filepath.Join(layout.FindRoot(working), "tests", "fixtures", "compare-parity", "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases parity
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases.Texts) == 0 || len(cases.Difflib) == 0 {
		t.Fatal("the parity file has no cases")
	}
	return cases
}

func same(t *testing.T, what string, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("%s:\n got %#v\nwant %#v", what, got, want)
	}
}

func TestTheTokenizerSplitsAndSentencesArePythons(t *testing.T) {
	cases := loadParity(t)
	var tokenizer Tokenizer
	for k, text := range cases.Texts {
		same(t, "tokenize "+text, tokenizer.Tokenize(text), cases.Tokenize[k])
		tokens, raw := tokenizer.TokenizeWithRaw(text)
		same(t, "tokenize_with_raw "+text, [2][]string{tokens, raw}, cases.TokenizeWithRaw[k])
		same(t, "split_sentences "+text, tokenizer.SplitSentences(text), cases.SplitSentences[k])
		same(t, "str.split "+text, PySplit(text), cases.Split[k])
		same(t, "str.strip "+text, PyStrip(text), cases.Strip[k])
		var wantTokens []string
		var wantIndex []int
		_ = json.Unmarshal(cases.RawMerge[k][0], &wantTokens)
		_ = json.Unmarshal(cases.RawMerge[k][1], &wantIndex)
		identity := make([]int, len(cases.Tokenize[k]))
		for n := range identity {
			identity[n] = n
		}
		merged, index := MergeNumberWords(cases.Tokenize[k], identity)
		same(t, "merge_number_words "+text, [2]any{merged, index}, [2]any{wantTokens, wantIndex})
	}
}

func TestTheChapterUnitsArePythons(t *testing.T) {
	cases := loadParity(t)
	var tokenizer Tokenizer
	units := tokenizer.BuildChapterUnits(cases.Chapter.Title, cases.Chapter.Paragraphs)
	want := make([]SentenceUnit, len(cases.Chapter.Units))
	for k, unit := range cases.Chapter.Units {
		want[k] = SentenceUnit{unit[0].(string), int(unit[1].(float64))}
	}
	same(t, "units", units.Sentences, want)
	same(t, "tokens", units.Tokens, cases.Chapter.Tokens)
	same(t, "unit_idx", units.UnitIdx, cases.Chapter.UnitIdx)
	same(t, "raw_words", units.RawWords, cases.Chapter.RawWords)
}

func TestTheEquivalenceListAndLowercasingArePythons(t *testing.T) {
	cases := loadParity(t)
	same(t, "load_equivalence_groups", LoadEquivalenceGroups(cases.Equivalences.Text), cases.Equivalences.Groups)
	for _, pair := range cases.Lower {
		same(t, "str.lower "+pair[0], PyLower(pair[0]), pair[1])
	}
	tokenizer := NewTokenizer(LoadEquivalenceGroups(cases.Equivalences.Text))
	same(t, "a project's own canon", tokenizer.Tokenize("Alyce met alice"), []string{"alice", "met", "alice"})
	same(t, "no project list", NewTokenizer(nil), Tokenizer{})
}

func TestSequenceMatcherIsCPythons(t *testing.T) {
	for _, c := range loadParity(t).Difflib {
		m := NewSequenceMatcher([]rune(c.A), []rune(c.B), c.Autojunk)
		want := make([]Opcode, len(c.Opcodes))
		for k, op := range c.Opcodes {
			want[k] = Opcode{op[0].(string), int(op[1].(float64)), int(op[2].(float64)), int(op[3].(float64)), int(op[4].(float64))}
		}
		same(t, "opcodes "+c.A+" / "+c.B, m.Opcodes(), want)
		if m.Ratio() != c.Ratio {
			t.Errorf("ratio %q %q = %v, want %v", c.A, c.B, m.Ratio(), c.Ratio)
		}
	}
}

func TestFloatsAreWrittenRoundedAndSummedAsPythonDoes(t *testing.T) {
	cases := loadParity(t)
	for _, pair := range cases.FloatRepr {
		same(t, "repr", PyFloatRepr(pair[0].(float64)), pair[1])
	}
	for _, pair := range cases.Round3 {
		same(t, "round", PyFloatRepr(PyRound(pair[0].(float64), 3)), pair[1])
	}
	for _, pair := range cases.Sum {
		values := []float64{}
		for _, v := range pair[0].([]any) {
			values = append(values, v.(float64))
		}
		total, ok := PySum(values)
		got := "0" // Python's sum of no floats is the integer 0
		if ok {
			got = PyFloatRepr(total)
		}
		same(t, "sum", got, pair[1])
	}
}

func TestAlignDropsFillersMergesNumbersAndFusesHyphenSplits(t *testing.T) {
	var tokenizer Tokenizer
	units := tokenizer.BuildChapterUnits("Chapter 4", []string{"They carried 214 barrels and a notebook."})
	words := []Word{}
	for k, text := range strings.Fields("chapter four um they carried two hundred fourteen barrels and a note book") {
		words = append(words, Word{text, float64(k), float64(k) + 0.5})
	}
	a := tokenizer.Align(units, words)
	same(t, "doc tokens", a.DocTokens, []string{"chapter", "4", "they", "carried", "214", "barrels", "and", "a", "notebook"})
	same(t, "audio tokens", a.AudioTokens, []string{"chapter", "4", "they", "carried", "214", "barrels", "and", "a", "note", "book"})
	same(t, "index map", a.IndexMap, []int{0, 1, 3, 4, 5, 8, 9, 10, 11, 12})
	same(t, "opcodes", a.Opcodes, []Opcode{{"equal", 0, 8, 0, 8}, {"equal", 8, 9, 8, 10}})
	same(t, "unit idx", a.UnitIdx, []int{HeadingUnit, HeadingUnit, 0, 0, 0, 0, 0, 0, 0})
}

func TestANumberRunPastInt64IsSummedExactly(t *testing.T) {
	tokens := strings.Fields(strings.Repeat("billion ", 12))
	merged, _ := MergeNumberWords(tokens, make([]int, len(tokens)))
	// Python: total += (chunk or 1) * value for each, so twelve billions sum to 12e9, and "billion" after "hundred" grows the chunk.
	same(t, "twelve billions", merged, []string{"12000000000"})
	tokens = strings.Fields("nine hundred " + strings.Repeat("hundred ", 20) + "one")
	merged, _ = MergeNumberWords(tokens, make([]int, len(tokens)))
	same(t, "hundreds past int64", merged, []string{"9" + strings.Repeat("0", 41) + "1"})
}

func TestThePythonJSONWriterSortsKeysAndEscapesOnlyWhatPythonEscapes(t *testing.T) {
	value := PyObject{"b": []any{1, 2.5, nil, true}, "a": "é\"\\\n\x01\u2028<>&", "c": PyObject{}, "d": RawJSON(`{"x":1}`)}
	same(t, "compact", DumpPy(value, true), `{"a":"é\"\\\n\u0001`+"\u2028"+`<>&","b":[1,2.5,null,true],"c":{},"d":{"x":1}}`)
	same(t, "default", DumpPy([]any{1, PyObject{"k": "v"}}, false), `[1, {"k": "v"}]`)
	same(t, "indent", DumpPyIndent(PyObject{"a": []any{}, "b": []any{1, PyObject{"c": nil}}}, 1), "{\n \"a\": [],\n \"b\": [\n  1,\n  {\n   \"c\": null\n  }\n ]\n}")
}
