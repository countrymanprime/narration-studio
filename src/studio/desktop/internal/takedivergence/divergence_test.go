package takedivergence

import (
	"math/rand"
	"reflect"
	"sort"
	"strings"
	"testing"

	"desktop/internal/compare"
)

// Localizing where one take of a fixed span diverges (docs/utilities/take-review.md). Transcripts here are hand-timed
// words, so every expected time is exact. Ported from the sidecar's tests/test_take_divergence.py when
// take_divergence.py moved here.

var paragraphs = []string{
	"Alice was beginning to get very tired of sitting by her sister on the bank. She had nothing to do.",
	"Once or twice she had peeped into the book her sister was reading.",
}

var tok compare.Tokenizer

// timed is the words of text, one every step seconds, each lasting 0.8 of a step, rounded as the Python did.
func timed(text string, start, step float64) []compare.Word {
	words := []compare.Word{}
	for i, word := range strings.Fields(text) {
		at := start + float64(i)*step
		words = append(words, compare.Word{Text: word, Start: compare.PyRound(at, 3), End: compare.PyRound(at+step*0.8, 3)})
	}
	return words
}

func half(text string) []compare.Word { return timed(text, 0, 0.5) }

func mustSpan(t *testing.T, ps []string, first, last int) Span {
	t.Helper()
	s, err := BuildSpan(tok, ps, first, last)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func statuses(a Alignment) []string {
	out := make([]string, len(a.Words))
	for k, w := range a.Words {
		out[k] = w.Status
	}
	return out
}

func set(values []string) map[string]bool {
	out := map[string]bool{}
	for _, v := range values {
		out[v] = true
	}
	return out
}

func eq(t *testing.T, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

func val(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

func ival(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}

func one(t *testing.T, a Alignment) Divergence {
	t.Helper()
	if len(a.Divergences) != 1 {
		t.Fatalf("want one divergence, got %+v", a.Divergences)
	}
	return a.Divergences[0]
}

func TestAParagraphSpanIsEverySentenceOfThoseParagraphs(t *testing.T) {
	s, err := BuildParagraphSpan(tok, []string{"One two. Three four.", "Five six.", "Seven."}, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, []int{s.FirstUnit, s.LastUnit, s.FirstParagraph, s.LastParagraph}, []int{0, 2, 0, 1})
	texts := []string{}
	for _, w := range s.Words {
		texts = append(texts, w.Text)
	}
	eq(t, texts, []string{"One", "two.", "Three", "four.", "Five", "six."})
}

func TestASpanOutsideTheChapterIsRefused(t *testing.T) {
	for _, r := range [][2]int{{-1, 0}, {2, 1}, {0, 3}} {
		if _, err := BuildParagraphSpan(tok, []string{"One two.", "Three four."}, r[0], r[1]); err == nil || !strings.Contains(err.Error(), "not within") {
			t.Errorf("paragraphs %v: %v", r, err)
		}
		if _, err := BuildSpan(tok, paragraphs, r[0], r[1]); err == nil || !strings.Contains(err.Error(), "not within") {
			t.Errorf("sentences %v: %v", r, err)
		}
	}
	if _, err := BuildParagraphSpan(tok, []string{"One two.", "", "Three."}, 1, 1); err == nil || !strings.Contains(err.Error(), "have no sentences") {
		t.Errorf("paragraphs without sentences: %v", err)
	}
	if _, err := BuildSpan(tok, nil, 0, 0); err == nil || !strings.Contains(err.Error(), "no sentences") {
		t.Errorf("no sentences: %v", err)
	}
	if _, err := BuildSpan(tok, []string{"— —."}, 0, 0); err == nil || !strings.Contains(err.Error(), "no spoken words") {
		t.Errorf("no spoken words: %v", err)
	}
	if _, err := BuildSpan(tok, []string{"— —."}, 0, 0); err != nil {
		if _, isSpan := err.(SpanError); !isSpan {
			t.Errorf("a span refusal is a SpanError: %T", err)
		}
	}
}

func TestTheSpanNumbersSentencesAsTheMarkersDoAndKeepsOnlySpokenWords(t *testing.T) {
	s := mustSpan(t, []string{"One two. Three — four.", "Five six."}, 1, 2)
	got := [][4]any{}
	for _, w := range s.Words {
		got = append(got, [4]any{w.Index, w.Text, w.Unit, w.Paragraph})
	}
	eq(t, got, [][4]any{{0, "Three", 1, 0}, {1, "four.", 1, 0}, {2, "Five", 2, 1}, {3, "six.", 2, 1}})
	eq(t, []int{s.FirstUnit, s.LastUnit, s.FirstParagraph, s.LastParagraph}, []int{1, 2, 0, 1})
}

func TestACleanTakeMatchesEveryWordWithItsOwnTime(t *testing.T) {
	words := half("Alice was beginning to get very tired of sitting by her sister on the bank.")
	r := AlignTake(tok, mustSpan(t, paragraphs, 0, 0), words)
	eq(t, set(statuses(r)), map[string]bool{Matched: true})
	eq(t, len(r.Divergences), 0)
	eq(t, r.Fidelity(), 1.0)
	eq(t, []any{val(r.Words[11].Start), val(r.Words[11].End)}, []any{words[11].Start, words[11].End})
}

func TestAMisreadWordPartwayIsLocalizedToThatWordAndItsTime(t *testing.T) {
	words := half("Alice was beginning to get very tired of sitting by her sitter on the bank")
	r := AlignTake(tok, mustSpan(t, paragraphs, 0, 0), words)
	d := one(t, r)
	eq(t, []any{d.Kind, d.Position, ival(d.FirstWord), ival(d.LastWord), d.ManuscriptText, d.AudioText, val(d.Start), val(d.End)},
		[]any{Misread, Within, 11, 11, "sister", "sitter", words[11].Start, words[11].End})
	eq(t, []any{r.Words[11].Status, r.Count(Matched)}, []any{Misread, 14})
}

func TestASkippedPhraseIsThePauseWhereItWasLeftOut(t *testing.T) {
	words := half("Alice was beginning to get very tired of sitting on the bank")
	r := AlignTake(tok, mustSpan(t, paragraphs, 0, 0), words)
	d := one(t, r)
	eq(t, []any{d.Kind, ival(d.FirstWord), ival(d.LastWord), d.ManuscriptText, val(d.Start), val(d.End)},
		[]any{Skipped, 9, 11, "by her sister", words[8].End, words[9].Start})
	eq(t, statuses(r)[9:12], []string{Skipped, Skipped, Skipped})
	eq(t, r.Words[9].Start == nil, true)
}

func TestARestartIsAnExtraAtTheFalseStartBeforeTheWordReadAgain(t *testing.T) {
	words := half("She had nothing to she had nothing to do")
	r := AlignTake(tok, mustSpan(t, paragraphs, 1, 1), words)
	d := one(t, r)
	eq(t, []any{d.Kind, ival(d.FirstWord), d.Position, d.AudioText, val(d.Start), val(d.End), r.ExtraWords, r.Fidelity()},
		[]any{Extra, 0, Before, "She had nothing to", words[0].Start, words[3].End, 4, 1.0})
}

func TestARepeatedWordInsideTheSpanIsAnExtraWithinIt(t *testing.T) {
	d := one(t, AlignTake(tok, mustSpan(t, paragraphs, 1, 1), half("She had had nothing to do")))
	eq(t, []any{d.Kind, d.Position, d.AudioText}, []any{Extra, Within, "had"})
}

func TestARestartTheDiffMatchedFirstIsStillTheEarlierCopy(t *testing.T) {
	words := half("alpha bravo charlie delta echo charlie delta echo foxtrot golf")
	r := AlignTake(tok, mustSpan(t, []string{"alpha bravo charlie delta echo foxtrot golf."}, 0, 0), words)
	d := one(t, r)
	eq(t, []any{d.Kind, d.Position, ival(d.FirstWord), d.AudioText, val(d.Start), val(d.End)}, []any{Extra, Within, 2, "charlie delta echo", words[2].Start, words[4].End})
	eq(t, val(r.Words[2].Start), words[5].Start) // timed by the copy that continued
}

func TestNothingIsReinterpretedWhenTheAudioTokensCannotBeRebuilt(t *testing.T) {
	opcodes := []compare.Opcode{{Tag: "equal", I1: 0, I2: 2, J1: 0, J2: 2}, {Tag: "insert", I1: 2, I2: 2, J1: 2, J2: 4}}
	eq(t, preferEarlierCopy(opcodes, nil), opcodes)
	eq(t, audioTokens(tok, half("a b"), []int{0, 0}) == nil, true)
}

func TestATakeThatStopsEarlyLeavesTheRestUnreadWithNoTime(t *testing.T) {
	r := AlignTake(tok, mustSpan(t, paragraphs, 0, 1), half("Alice was beginning to get very tired of sitting by her sister on the bank"))
	d := one(t, r)
	eq(t, []any{d.Kind, d.Position, ival(d.FirstWord), val(d.Start), val(d.End), r.Count(Unread)}, []any{Unread, After, 15, nil, nil, 5})
}

func kinds(a Alignment) [][4]any {
	out := [][4]any{}
	for _, d := range a.Divergences {
		out = append(out, [4]any{d.Kind, d.Position, d.AudioText, ival(d.FirstWord)})
	}
	return out
}

func TestChatterBeforeTheSpanIsAnExtraBeforeItAndATakeAfterItToo(t *testing.T) {
	r := AlignTake(tok, mustSpan(t, paragraphs, 1, 1), half("okay from the top She had nothing to do cut"))
	eq(t, kinds(r), [][4]any{{Extra, Before, "okay from the top", 0}, {Extra, After, "cut", nil}})
}

func TestAHeadingSaidBeforeASpanThatStartsTheChapterIsNotAnExtra(t *testing.T) {
	// Issue #2251 item 7: a take of the chapter's first sentences opens with the heading, in the narrator's own words.
	r := AlignTake(tok, mustSpan(t, paragraphs, 0, 0), half("chapter one down the rabbit hole Alice was beginning to get very tired of sitting by her sister on the bank cut"))
	eq(t, kinds(r), [][4]any{{Extra, After, "cut", nil}})
	eq(t, r.ExtraWords, 1)
}

func TestATakeOfSomethingElseIsOneMisreadOfTheWholeSpan(t *testing.T) {
	r := AlignTake(tok, mustSpan(t, paragraphs, 1, 1), half("completely different words"))
	eq(t, set(statuses(r)), map[string]bool{Misread: true})
	d := one(t, r)
	eq(t, []any{d.Kind, ival(d.FirstWord), ival(d.LastWord), r.Fidelity()}, []any{Misread, 0, 4, 0.0})
}

func TestATakeWithNoWordsLeavesTheWholeSpanUnread(t *testing.T) {
	r := AlignTake(tok, mustSpan(t, paragraphs, 1, 1), nil)
	eq(t, set(statuses(r)), map[string]bool{Unread: true})
	d := one(t, r)
	eq(t, []string{d.Kind, d.Position}, []string{Unread, Before})
}

func TestSpokenNumbersAndCompoundsMatchTheWrittenWordsTheyStandFor(t *testing.T) {
	words := []compare.Word{{Text: "23", Start: 0, End: 0.8}, {Text: "super-powered", Start: 1, End: 1.6}, {Text: "men", Start: 1.7, End: 1.9}, {Text: "ran", Start: 2, End: 2.3}}
	r := AlignTake(tok, mustSpan(t, []string{"Twenty three superpowered men ran."}, 0, 0), words)
	eq(t, set(statuses(r)), map[string]bool{Matched: true})
	eq(t, []any{val(r.Words[0].Start), val(r.Words[1].Start), val(r.Words[1].End)}, []any{0.0, 0.0, 0.8}) // both number words take the digit's time
}

func TestAWordOnlyPartlyReadIsAMisread(t *testing.T) {
	r := AlignTake(tok, mustSpan(t, []string{"The rock-hard ground was cold."}, 0, 0), half("The rock ground was cold"))
	eq(t, r.Words[1].Status, Misread)
	d := one(t, r)
	eq(t, []any{d.Kind, ival(d.FirstWord)}, []any{Skipped, 1})
}

func TestFillersAreNotExtras(t *testing.T) {
	eq(t, len(AlignTake(tok, mustSpan(t, paragraphs, 1, 1), half("She had um nothing to do")).Divergences), 0)
}

func TestJSONTimesAreSourceSecondsAndRounded(t *testing.T) {
	r := AlignTake(tok, mustSpan(t, paragraphs, 1, 1), timed("She had nothing to", 0, 0.3333))
	got := compare.DumpPy(compare.PyOrdered(alignmentJSON(r, 10.0)), true)
	for _, want := range []string{
		`"fidelity":0.8`, `"counts":{"matched":4,"misread":0,"skipped":0,"unread":1,"extraWords":0}`,
		`{"index":1,"status":"matched","start":10.333,"end":10.6}`,
		`"divergences":[{"kind":"unread","position":"after","firstWord":4,"lastWord":4,"manuscriptText":"do.","audioText":"","start":null,"end":null}]`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("%s lacks %s", got, want)
		}
	}
}

var vocabulary = []string{"alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf"}

// The properties the Python checked with Hypothesis, over seeded random spans and drops.
func TestEverySpanWordGetsOneStatusAndTimesKeepTheOrderSaid(t *testing.T) {
	rng := rand.New(rand.NewSource(2251))
	for range 500 {
		manuscript := make([]string, 1+rng.Intn(12))
		for k := range manuscript {
			manuscript[k] = vocabulary[rng.Intn(len(vocabulary))]
		}
		said := []string{}
		for _, w := range manuscript {
			if rng.Intn(2) == 0 {
				said = append(said, w)
			}
		}
		r := AlignTake(tok, mustSpan(t, []string{strings.Join(manuscript, " ") + "."}, 0, 0), half(strings.Join(said, " ")))
		if len(r.Words) != len(manuscript) || r.Count(Matched) > len(said) {
			t.Fatalf("%v / %v: %+v", manuscript, said, r)
		}
		starts := []float64{}
		for _, w := range r.Words {
			if !set(WordStatuses)[w.Status] {
				t.Fatalf("status %q", w.Status)
			}
			if w.Status == Matched {
				starts = append(starts, *w.Start)
			}
		}
		if !sort.Float64sAreSorted(starts) {
			t.Fatalf("matched words must keep the order they were said in: %v / %v", manuscript, said)
		}
		for _, d := range r.Divergences {
			if !map[string]bool{Misread: true, Skipped: true, Unread: true, Extra: true}[d.Kind] || !map[string]bool{Before: true, Within: true, After: true}[d.Position] {
				t.Fatalf("divergence %+v", d)
			}
		}
	}
}

func TestWhenNoWordRepeatsEveryWordSaidMatchesAndEveryDroppedWordDiverges(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	for range 500 {
		perm := rng.Perm(len(vocabulary))[:1+rng.Intn(7)]
		manuscript, said := []string{}, []string{}
		for _, k := range perm {
			manuscript = append(manuscript, vocabulary[k])
			if rng.Intn(2) == 0 {
				said = append(said, vocabulary[k])
			}
		}
		r := AlignTake(tok, mustSpan(t, []string{strings.Join(manuscript, " ") + "."}, 0, 0), half(strings.Join(said, " ")))
		inSaid := set(said)
		for k, w := range r.Words {
			if (w.Status == Matched) != inSaid[manuscript[k]] {
				t.Fatalf("%v / %v: word %d is %s", manuscript, said, k, w.Status)
			}
		}
		if (len(r.Divergences) == 0) != (len(said) == len(manuscript)) {
			t.Fatalf("%v / %v: %+v", manuscript, said, r.Divergences)
		}
	}
}
