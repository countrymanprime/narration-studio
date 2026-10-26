package scripttrack

import (
	"encoding/json"
	"fmt"
	"maps"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"desktop/internal/layout"
)

// Timing one script word from a stretch of recording (Punch from here's offline fallback), and its accuracy on real
// narration (the LibriVox Alice readings). Ported from the sidecar's test_align_word.py.

var punchText = "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do. " +
	"Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, " +
	"and what is the use of a book, thought Alice, without pictures or conversations?"

var punchTokens = ScriptWords(punchText)

const wordSeconds = 0.4

// evenlyRead is what Whisper gives for a narrator reading tokens[start:end] at an even pace from origin seconds: each
// word lasts 0.3 s, then 0.1 s to the next.
func evenlyRead(start, end int, tokens []string, origin float64) []TimedWord {
	out := []TimedWord{}
	for i := start; i < end; i++ {
		at := origin + float64(i-start)*wordSeconds
		out = append(out, TimedWord{tokens[i], at, at + 0.3})
	}
	return out
}

// near is pytest.approx's default: within a millionth of want.
func near(got, want float64) bool { return math.Abs(got-want) <= max(1e-6*math.Abs(want), 1e-12) }

func TestAHeardWordIsTimedAtItsOwnStart(t *testing.T) {
	result := WordTime(evenlyRead(10, 40, punchTokens, 5.0), punchTokens, 25)

	if !result.Found || !near(result.Time, 5.0+15*wordSeconds) || !result.Exact || result.Matched != 30 {
		t.Fatalf("got %+v", result)
	}
}

func TestAMisreadWordIsPlacedBetweenTheWordsHeardAroundIt(t *testing.T) {
	timed := evenlyRead(10, 40, punchTokens, 0)
	timed[15].Text = "pitchers" // punchTokens[25] misheard as a word that is nowhere near

	result := WordTime(timed, punchTokens, 25)

	// Halfway from word 24's start (5.6 s) to word 26's (6.4 s).
	if result.Exact || !result.Found || !near(result.Time, 6.0) {
		t.Fatalf("got %+v", result)
	}
}

func TestARunOfDroppedWordsIsSpreadAcrossTheGap(t *testing.T) {
	timed := []TimedWord{}
	for index, entry := range evenlyRead(10, 40, punchTokens, 0) {
		if index < 12 || index > 14 { // words 22-24 not heard
			timed = append(timed, entry)
		}
	}

	// The narrator's pace: words 22-24 start where they were really spoken, 0.4 s apart.
	for k, w := range []int{22, 23, 24} {
		if result := WordTime(timed, punchTokens, w); !result.Found || !near(result.Time, float64(12+k)*wordSeconds) {
			t.Errorf("word %d: got %+v", w, result)
		}
	}
}

func TestFillersAndAGarbledFirstWordDoNotMoveTheTime(t *testing.T) {
	timed := slices.Concat(
		[]TimedWord{{"ning", 0.0, 0.2}}, evenlyRead(10, 20, punchTokens, 0.5),
		[]TimedWord{{"um", 4.5, 4.7}}, evenlyRead(20, 40, punchTokens, 5.0),
	)

	result := WordTime(timed, punchTokens, 30)

	if !result.Exact || !near(result.Time, 5.0+10*wordSeconds) {
		t.Fatalf("got %+v", result)
	}
}

func TestAWordOutsideWhatWasHeardHasNoTime(t *testing.T) {
	timed := evenlyRead(10, 40, punchTokens, 0)

	for _, w := range []int{5, 45, len(punchTokens) + 3} {
		if result := WordTime(timed, punchTokens, w); result.Found {
			t.Errorf("word %d: got %+v", w, result)
		}
	}
}

func TestSilenceAndSpeechNotInTheChapterTimeNothing(t *testing.T) {
	if result := WordTime(nil, punchTokens, 12); result.Found {
		t.Fatalf("silence: got %+v", result)
	}
	foreign := []TimedWord{}
	for i, text := range []string{"the", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog", "today"} {
		foreign = append(foreign, TimedWord{text, float64(i) * 0.4, float64(i)*0.4 + 0.3})
	}
	if result := WordTime(foreign, punchTokens, 12); result.Found {
		t.Fatalf("foreign speech: got %+v", result)
	}
}

func TestTooFewFittingWordsAreNotTrusted(t *testing.T) {
	result := WordTime(evenlyRead(20, 22, punchTokens, 0), punchTokens, 21)

	if result.Found || result.Matched != 2 {
		t.Fatalf("got %+v", result)
	}
}

func TestIndicesCountPunctuationOnlyTokensAndOneIsTimedAsTheNextWord(t *testing.T) {
	tokens := slices.Concat([]string{"Alice", "—"}, punchTokens[1:])
	timed := []TimedWord{{tokens[0], 0.0, 0.3}}
	for i, text := range tokens[2:30] {
		timed = append(timed, TimedWord{text, 0.4 * float64(i+1), 0.4*float64(i+1) + 0.3})
	}

	for _, w := range []int{2, 1} {
		if result := WordTime(timed, tokens, w); !result.Found || !near(result.Time, 0.4) {
			t.Errorf("word %d: got %+v", w, result)
		}
	}
}

func TestTheEventIsInSecondsOfTheFile(t *testing.T) {
	event := WordTimeEvent(evenlyRead(10, 40, punchTokens, 0), punchTokens, 25, 700.0)

	at, _ := event["time"].(float64)
	if !near(at, 706.0) || event["type"] != "word_time" || event["word"] != 25 || event["exact"] != true ||
		event["matched"] != 30 || event["heard"] != 30 || event["tokens"] != len(punchTokens) || len(event) != 7 {
		t.Fatalf("got %v", event)
	}
}

func TestTheEventForAWordNotHeardHasANullTime(t *testing.T) {
	event := WordTimeEvent(nil, punchTokens, 25, 700.0)

	if event["time"] != nil || event["exact"] != false || event["matched"] != 0 {
		t.Fatalf("got %v", event)
	}
}

// The timed words a decoder printed for a stretch are placed by the host, the sidecar's run() and `--align-word` CLI
// before it: the stretch's own seconds plus where it starts in the file.

func TestTheWordDecodedFromAStretchIsTimedInSecondsOfTheFile(t *testing.T) {
	event := WordTimeEvent(evenlyRead(10, 40, punchTokens, 0.25), punchTokens, 25, 2.0)

	if at, _ := event["time"].(float64); !near(at, 2.0+0.25+15*wordSeconds) {
		t.Fatalf("got %v", event)
	}
}

// punchManuscript is the sidecar test's _manuscript: Chapter One, the text as one paragraph.
func punchManuscript(t *testing.T) string {
	t.Helper()
	return writeManuscript(t, map[string]any{
		"schemaVersion": 1,
		"documentId":    "alice",
		"chapters":      []any{map[string]any{"id": "c1", "title": "Chapter One", "contentKind": "narration"}},
		"paragraphs":    []any{map[string]any{"id": "p1", "chapterId": "c1", "index": 0, "text": punchText}},
	})
}

func TestAWordInAManuscriptChapterIsTimedPastTheHeading(t *testing.T) {
	tokens, _ := chapterOf(t, punchManuscript(t), "c1")
	if !slices.Equal(tokens, slices.Concat([]string{"Chapter", "One"}, punchTokens)) {
		t.Fatalf("chapter tokens %q", tokens)
	}

	event := WordTimeEvent(evenlyRead(12, 42, tokens, 0), tokens, 27, 1.0)

	at, _ := event["time"].(float64)
	if event["type"] != "word_time" || event["word"] != 27 || event["exact"] != true || event["tokens"] != len(tokens) || !near(at, 1.0+15*wordSeconds) {
		t.Fatalf("got %v", event)
	}
}

func TestTheWordTimeLineMatchesTheCommittedContractFile(t *testing.T) {
	tokens, _ := chapterOf(t, punchManuscript(t), "c1")
	timed := slices.Concat([]TimedWord{{"ning", 0.0, 0.2}}, evenlyRead(12, 42, tokens, 0.5))

	pinnedContract(t, "teleprompter-word-time", []any{WordTimeEvent(timed, tokens, 27, 700.0), WordTimeEvent(nil, tokens, 27, 700.0)})
}

// Real narration: the LibriVox Alice readings (tests/fixtures/audio/librivox-alice).

// The window is as long as the host ever asks for (teleprompter.MaxTailSeconds), well inside Chapter I's reading. A
// word placed between two heard neighbours may land this far from where it was really spoken, measured on four windows
// of Chapter I (2026-09-28: 95th percentile 0.13-0.22 s, worst 0.52-1.01 s, at a dropped word after a pause).
var (
	librivoxWindow  = [2]float64{200.0, 320.0}
	librivoxWindows = [][2]float64{{60.0, 180.0}, librivoxWindow, {400.0, 520.0}, {600.0, 720.0}}
)

const (
	placedP95Seconds = 0.3
	placedMaxSeconds = 1.2
	// decodedToleranceSeconds is how far the tiny model's word start may be from large-v3-turbo's for the same word.
	decodedToleranceSeconds = 0.5
)

func librivoxFolder() string {
	working, _ := os.Getwd()
	return filepath.Join(layout.FindRoot(working), "tests", "fixtures", "audio", "librivox-alice")
}

var (
	aliceHeading = regexp.MustCompile(`^CHAPTER ([IVXL]+)\. (.+)$`)
	aliceWord    = regexp.MustCompile(`[a-z0-9]`)
)

// romanValue is alice_text.roman.
func romanValue(numeral string) int {
	values := map[rune]int{'I': 1, 'V': 5, 'X': 10, 'L': 50}
	digits := []rune(numeral)
	total := 0
	for i, digit := range digits {
		if i+1 < len(digits) && values[digit] < values[digits[i+1]] {
			total -= values[digit]
		} else {
			total += values[digit]
		}
	}
	return total
}

// aliceManuscript is alice_text.load_chapters then manuscript_json: every chapter of the repo's Alice text, one
// paragraph per blank-line-separated block (a block with no words, a scene break, is not one), written as the
// canonical manuscript.
func aliceManuscript(t *testing.T) string {
	t.Helper()
	working, _ := os.Getwd()
	raw, err := os.ReadFile(filepath.Join(layout.FindRoot(working), "src", "studio", "ui", "src", "api", "fixtures", "alice-in-wonderland.txt"))
	if err != nil {
		t.Fatal(err)
	}
	text := strings.TrimPrefix(string(raw), "\ufeff")
	chapters, paragraphs := []any{}, []any{}
	var heading []string
	blocks, block := []string{}, []string{}
	closeChapter := func() {
		if heading == nil {
			return
		}
		id := fmt.Sprintf("c-%04d", romanValue(heading[1]))
		chapters = append(chapters, map[string]any{"id": id, "title": "Chapter " + heading[1], "subtitle": strings.TrimSpace(heading[2]), "contentKind": "narration"})
		index := 0
		for _, paragraph := range blocks {
			if !aliceWord.MatchString(strings.ToLower(paragraph)) {
				continue
			}
			paragraphs = append(paragraphs, map[string]any{"id": fmt.Sprintf("%s-p%03d", id, index+1), "chapterId": id, "index": index, "text": paragraph})
			index++
		}
	}
	for _, line := range lineBreak.Split(text, -1) {
		line = strings.TrimSpace(line)
		match := aliceHeading.FindStringSubmatch(line)
		if match != nil || line == "THE END" {
			if len(block) > 0 {
				blocks = append(blocks, strings.Join(strings.Fields(strings.Join(block, " ")), " "))
			}
			closeChapter()
			if match == nil {
				break
			}
			heading, blocks, block = match, []string{}, []string{}
			continue
		}
		switch {
		case heading == nil:
		case line != "":
			block = append(block, line)
		case len(block) > 0:
			blocks = append(blocks, strings.Join(strings.Fields(strings.Join(block, " ")), " "))
			block = []string{}
		}
	}
	return writeManuscript(t, map[string]any{"schemaVersion": 1, "documentId": "alice", "chapters": chapters, "paragraphs": paragraphs})
}

// referenceWords is large-v3-turbo's committed word timings (alignment/<id>.words.json) inside window, relative to its
// start.
func referenceWords(t *testing.T, source string, window [2]float64) []TimedWord {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(librivoxFolder(), "alignment", source+".words.json"))
	if err != nil {
		t.Fatal(err)
	}
	out := []TimedWord{}
	for _, entry := range wordsOf(t, raw) {
		if window[0] <= entry.Start && entry.End <= window[1] {
			out = append(out, TimedWord{entry.Text, entry.Start - window[0], entry.End - window[0]})
		}
	}
	return out
}

// wordsOf reads the "words" of a words.json or a `heard` line: [text, start, end] each.
func wordsOf(t *testing.T, raw []byte) []TimedWord {
	t.Helper()
	var file struct {
		Words [][3]any `json:"words"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	out := make([]TimedWord, len(file.Words))
	for k, entry := range file.Words {
		text, textOK := entry[0].(string)
		start, startOK := entry[1].(float64)
		end, endOK := entry[2].(float64)
		if !textOK || !startOK || !endOK {
			t.Fatalf("bad word %v", entry)
		}
		out[k] = TimedWord{text, start, end}
	}
	return out
}

// heardPositions is each script word the reference heard in the window, with its start: the word's time where it
// was heard.
func heardPositions(timed []TimedWord, tokens []string) map[int]float64 {
	stretch := alignStretch(timed, tokens)
	heard := map[int]float64{}
	for w := range tokens {
		if result := timeOf(stretch, w); result.Exact {
			heard[w] = result.Time
		}
	}
	return heard
}

func TestOnARealReadingEveryHeardWordInTheWindowIsTimedWhereItWasSpoken(t *testing.T) {
	tokens, _ := chapterOf(t, aliceManuscript(t), "c-0001")

	heard := heardPositions(referenceWords(t, "kara_01", librivoxWindow), tokens)

	positions := slices.Sorted(maps.Keys(heard))
	if len(positions) == 0 {
		t.Fatal("nothing heard")
	}
	span := positions[len(positions)-1] - positions[0] + 1
	if float64(len(heard))/float64(span) < 0.95 {
		t.Fatalf("the window's script words were not found in the real reading: %d of %d", len(heard), span)
	}
	for k := 1; k < len(positions); k++ {
		if heard[positions[k-1]] >= heard[positions[k]] {
			t.Fatalf("word %d at %v is not before word %d at %v", positions[k-1], heard[positions[k-1]], positions[k], heard[positions[k]])
		}
	}
}

func TestOnARealReadingWordsWhisperDroppedOrMisheardLandCloseToWhereTheyWereSpoken(t *testing.T) {
	tokens, _ := chapterOf(t, aliceManuscript(t), "c-0001")
	for _, window := range librivoxWindows {
		t.Run(fmt.Sprintf("%g-%gs", window[0], window[1]), func(t *testing.T) {
			timed := referenceWords(t, "kara_01", window)
			truth := heardPositions(timed, tokens)
			// Knock out every fifth heard word and garble every seventh: the decoder the app runs (tiny) drops and
			// mishears words the reference heard, and those are the words the punch must still place.
			damaged := []TimedWord{}
			for index, entry := range timed {
				switch {
				case index%5 == 2:
				case index%7 == 3:
					damaged = append(damaged, TimedWord{"zzkq", entry.Start, entry.End})
				default:
					damaged = append(damaged, entry)
				}
			}

			stretch := alignStretch(damaged, tokens)
			errs := []float64{}
			for w, at := range truth {
				if result := timeOf(stretch, w); result.Found {
					errs = append(errs, math.Abs(result.Time-at))
				}
			}
			slices.Sort(errs)

			if float64(len(errs)) < 0.95*float64(len(truth)) {
				t.Fatalf("placed %d of %d words", len(errs), len(truth))
			}
			if m := median(errs); m > 0.05 {
				t.Errorf("most words are still heard exactly: median error %v", m)
			}
			if p95 := errs[int(0.95*float64(len(errs)))-1]; p95 > placedP95Seconds {
				t.Errorf("95th percentile error %v", p95)
			}
			if worst := errs[len(errs)-1]; worst > placedMaxSeconds {
				t.Errorf("worst error %v", worst)
			}
		})
	}
}

func TestOnARealReadingAParagraphsFirstWordIsTimedAtTheMarkersParagraphStart(t *testing.T) {
	script, err := LoadChapterScript(aliceManuscript(t), "c-0001")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(librivoxFolder(), "alignment", "kara_01.markers.json"))
	if err != nil {
		t.Fatal(err)
	}
	var markers struct {
		Paragraphs []struct {
			ID     string  `json:"id"`
			StartS float64 `json:"start_s"`
		} `json:"paragraphs"`
	}
	if err := json.Unmarshal(raw, &markers); err != nil {
		t.Fatal(err)
	}
	starts := map[string]float64{}
	for _, paragraph := range markers.Paragraphs {
		starts[paragraph.ID] = paragraph.StartS
	}

	stretch := alignStretch(referenceWords(t, "kara_01", librivoxWindow), script.Tokens)
	checked := 0
	for _, span := range script.Spans {
		if span.Kind != "paragraph" {
			continue
		}
		start, ok := starts[span.ID]
		if !ok {
			t.Fatalf("no marker for %s", span.ID)
		}
		if !(librivoxWindow[0]+5 < start && start < librivoxWindow[1]-5) {
			continue
		}
		result := timeOf(stretch, span.Start)
		if !result.Found || math.Abs(result.Time+librivoxWindow[0]-start) > 0.3 {
			t.Errorf("%s: got %+v, marker at %v", span.ID, result, start)
		}
		checked++
	}
	if checked < 2 {
		t.Fatalf("checked %d paragraphs", checked)
	}
}

// TestTheRealDecodeTimesWordsWhereTheReferenceHeardThem is the whole mode on real audio: the shipped decoder over
// a window of Kara Shallenberg's Chapter I, each timed word checked against large-v3-turbo's committed timing for it.
// The decode stays in the sidecar, so this reads the `heard` line it printed (`--align-word 0` over
// kara_01's 200-320 s with the tiny model) from the file NARRATION_REAL_DECODE_HEARD names, and is skipped without it,
// as the sidecar's test is skipped without the recordings and a model.
func TestTheRealDecodeTimesWordsWhereTheReferenceHeardThem(t *testing.T) {
	path := os.Getenv("NARRATION_REAL_DECODE_HEARD")
	if path == "" {
		t.Skip("needs NARRATION_REAL_DECODE_HEARD: the sidecar's `heard` line for kara_01's 200-320 s")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	timed := wordsOf(t, raw)
	tokens, _ := chapterOf(t, aliceManuscript(t), "c-0001")
	truth := heardPositions(referenceWords(t, "kara_01", librivoxWindow), tokens)

	stretch := alignStretch(timed, tokens)
	sample := slices.Sorted(maps.Keys(truth))
	step := max(1, len(truth)/40)
	errs := []float64{}
	checked := 0
	for k := 0; k < len(sample); k += step {
		checked++
		if result := timeOf(stretch, sample[k]); result.Found {
			errs = append(errs, math.Abs(result.Time-truth[sample[k]]))
		}
	}
	slices.Sort(errs)

	if len(errs) == 0 || float64(len(errs)) < 0.9*float64(checked) {
		t.Fatalf("timed %d of %d sampled words", len(errs), checked)
	}
	if m := median(errs); m > decodedToleranceSeconds/2 {
		t.Errorf("median error %v", m)
	}
	if p90 := errs[int(0.9*float64(len(errs)))-1]; p90 > decodedToleranceSeconds {
		t.Errorf("90th percentile error %v", p90)
	}
}
