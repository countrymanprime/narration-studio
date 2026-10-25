package scripttrack

import (
	"encoding/json"
	"math/rand"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"desktop/internal/compare"
	"desktop/internal/layout"
)

// Placing a recording's last words in the chapter (Resume from here): the resume word, the sentence shown for
// confirmation, the `locate` line, and the accuracy on recorded tails. Ported from the sidecar's test_locate.py.

const (
	aliceOpening = "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do."
	aliceMiddle  = "Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, " +
		"and what is the use of a book, thought Alice, without pictures or conversations?"
	aliceClosing = "So she was considering in her own mind, as well as she could, for the hot day made her feel very sleepy and stupid, " +
		"whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies."
)

var tailTokens = ScriptWords(aliceOpening + " " + aliceMiddle + " " + aliceClosing)

// spoken is what a narrator says reading tailTokens[start:end], as Whisper would print it (punctuation kept on the words).
func spoken(start, end int) []string { return slices.Clone(tailTokens[start:end]) }

func joined(parts ...[]string) []string { return slices.Concat(parts...) }

func TestTheResumeWordIsTheOneAfterTheLastWordHeard(t *testing.T) {
	location := LocateTail(spoken(20, 50), tailTokens)

	if location.Word != 50 || location.Last != 49 || !location.Confident || location.Matched != 30 {
		t.Fatalf("got %+v", location)
	}
}

func TestAGarbledFirstWordAFillerAndAMisheardWordStillPlaceTheTail(t *testing.T) {
	heard := joined([]string{"ning"}, spoken(20, 30), []string{"um"}, spoken(30, 36), []string{"pitchers"}, spoken(37, 50))

	location := LocateTail(heard, tailTokens)

	if location.Word != 50 || !location.Confident {
		t.Fatalf("got %+v", location)
	}
}

func TestARetakeOfTheLastSentenceResumesAfterItNotAtAStrayWordAhead(t *testing.T) {
	sentenceStart, sentenceEnd := slices.Index(tailTokens, "Once"), slices.Index(tailTokens, "So")
	heard := joined(spoken(sentenceStart-12, sentenceEnd), spoken(sentenceStart, sentenceEnd))

	location := LocateTail(heard, tailTokens)

	if location.Word != sentenceEnd || !location.Confident {
		t.Fatalf("got %+v, want word %d", location, sentenceEnd)
	}
}

func TestARetakeThatStopsPartwayResumesWhereTheRecordingStops(t *testing.T) {
	sentenceStart := slices.Index(tailTokens, "So")
	heard := joined(spoken(sentenceStart-12, len(tailTokens)), spoken(sentenceStart, sentenceStart+8))

	if location := LocateTail(heard, tailTokens); location.Word != sentenceStart+8 {
		t.Fatalf("got %+v, want word %d", location, sentenceStart+8)
	}
}

func TestANarratorWhoStoppedMidSentenceResumesAtTheNextWord(t *testing.T) {
	if location := LocateTail(spoken(10, 33), tailTokens); location.Word != 33 {
		t.Fatalf("got %+v", location)
	}
}

func TestAPassageTheChapterRepeatsIsNeverConfident(t *testing.T) {
	refrain := "The Queen of Hearts, she made some tarts, all on a summer day: the Knave of Hearts, he stole those tarts, and took them quite away!"
	tokens := ScriptWords(strings.Join([]string{aliceOpening, refrain, aliceMiddle, refrain, aliceClosing}, " "))
	first := len(ScriptWords(aliceOpening))
	heard := tokens[first : first+len(ScriptWords(refrain))]

	location := LocateTail(heard, tokens)

	if location.Word == None || location.Confident || location.Confidence >= 0.1 || location.RunnerUp != location.Matched {
		t.Fatalf("got %+v", location)
	}
}

func TestALongTailThatReachesPastTheRepeatedPassageIsConfidentAgain(t *testing.T) {
	refrain := "The Queen of Hearts, she made some tarts, all on a summer day."
	tokens := ScriptWords(strings.Join([]string{aliceOpening, refrain, aliceMiddle, refrain, aliceClosing}, " "))
	second := len(ScriptWords(strings.Join([]string{aliceOpening, refrain, aliceMiddle}, " ")))
	heard := tokens[second-20 : second+len(ScriptWords(refrain))]

	location := LocateTail(heard, tokens)

	if location.Word != second+len(ScriptWords(refrain)) || !location.Confident {
		t.Fatalf("got %+v", location)
	}
}

func TestSilencePlacesNothing(t *testing.T) {
	location := LocateTail([]string{}, tailTokens)

	if location.Word != None || location.Last != None || location.Confidence != 0 || location.Confident || location.Heard != 0 {
		t.Fatalf("got %+v", location)
	}
}

func TestSpeechThatIsNotInTheChapterPlacesNothing(t *testing.T) {
	location := LocateTail([]string{"sphinx", "quartz", "jumbo", "vexing", "waltz", "nymph", "glyph"}, tailTokens)

	if location.Word != None || location.Confident {
		t.Fatalf("got %+v", location)
	}
}

func TestAFewFittingWordsArePlacedButNotConfident(t *testing.T) {
	location := LocateTail([]string{"daisy-chain", "would", "be", "worth"}, tailTokens)

	if location.Word != slices.Index(tailTokens, "worth")+1 || location.Confident {
		t.Fatalf("got %+v", location)
	}
}

func TestIndicesCountPunctuationOnlyTokensLikeTheLiveTrackerDoes(t *testing.T) {
	tokens := []string{"It", "was", "dark", "—", "very", "dark", "—", "and", "the", "rain", "would", "not", "stop", "falling", "on", "the", "roof"}

	location := LocateTail([]string{"very", "dark", "and", "the", "rain", "would", "not", "stop"}, tokens)

	if location.Last == None || tokens[location.Last] != "stop" || location.Word != slices.Index(tokens, "stop")+1 {
		t.Fatalf("got %+v", location)
	}
}

func TestTheSentenceRunsBetweenSentenceEnds(t *testing.T) {
	start, end := SentenceBounds(tailTokens, slices.Index(tailTokens, "thought"), map[int]bool{})

	if tailTokens[start] != "Once" || tailTokens[end-1] != "conversations?" {
		t.Fatalf("got %q to %q", tailTokens[start], tailTokens[end-1])
	}
}

func TestTheSentenceStopsAtAParagraphBreak(t *testing.T) {
	tokens := []string{"Chapter", "One", "The", "rain", "came", "down.", "It", "did", "not", "stop"}
	breaks := map[int]bool{0: true, 2: true}

	if start, end := SentenceBounds(tokens, 3, breaks); start != 2 || end != 6 {
		t.Fatalf("word 3: got (%d, %d)", start, end)
	}
	if start, end := SentenceBounds(tokens, 1, breaks); start != 0 || end != 2 {
		t.Fatalf("word 1: got (%d, %d)", start, end)
	}
}

func TestTheSentenceEndsAtClosingQuotesAfterTheStop(t *testing.T) {
	tokens := []string{"“Well!”", "thought", "Alice", "to", "herself."}

	if start, end := SentenceBounds(tokens, 2, map[int]bool{}); start != 1 || end != 5 {
		t.Fatalf("got (%d, %d)", start, end)
	}
}

func TestTheLocateEventCarriesTheWordTheSentenceAndTheScores(t *testing.T) {
	event := LocateEvent(spoken(20, 50), tailTokens, nil)

	if event["type"] != "locate" || event["word"] != 50 || event["last"] != 49 || event["confident"] != true || event["tokens"] != len(tailTokens) {
		t.Fatalf("got %v", event)
	}
	sentence, _ := event["sentence"].(compare.PyObject)
	start, _ := sentence["start"].(int)
	end, _ := sentence["end"].(int)
	if sentence == nil || start > 49 || 49 >= end || sentence["text"] != strings.Join(tailTokens[start:end], " ") {
		t.Fatalf("sentence %v", sentence)
	}
	if event["heardText"] != strings.Join(spoken(20, 50), " ") {
		t.Fatalf("heardText %q", event["heardText"])
	}
	keys := []string{}
	for key := range event {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	want := []string{"confidence", "confident", "heard", "heardText", "last", "matched", "runnerUp", "sentence", "tokens", "type", "word"}
	if !slices.Equal(keys, want) {
		t.Fatalf("keys %q", keys)
	}
}

func TestTheLocateEventForSilenceHasNoWordAndNoSentence(t *testing.T) {
	event := LocateEvent([]string{}, tailTokens, nil)

	if event["word"] != nil || event["last"] != nil || event["sentence"] != nil || event["heardText"] != "" {
		t.Fatalf("got %v", event)
	}
}

func TestALongChapterIsSearchedQuickly(t *testing.T) {
	// The sidecar drew its chapter with numpy's generator; this is the same shape from Go's.
	rng := rand.New(rand.NewSource(7))
	pool := []string{}
	for index := range 1500 {
		pool = append(pool, "word"+strconv.Itoa(index))
	}
	for range 200 {
		pool = append(pool, "the", "and", "of", "a", "to")
	}
	tokens := make([]string, 12000)
	for k := range tokens {
		tokens[k] = pool[rng.Intn(len(pool))]
	}

	started := time.Now()
	location := LocateTail(tokens[9000:9080], tokens)
	elapsed := time.Since(started)

	if location.Word != 9080 || elapsed >= 5*time.Second {
		t.Fatalf("got %+v in %v", location, elapsed)
	}
}

// The words a decoder printed for a tail are placed by the host, the sidecar's run() and `--locate` CLI before it.

// tailManuscript is the sidecar test's _manuscript: Chapter One, the opening and middle as one paragraph, the
// closing as the next.
func tailManuscript(t *testing.T) string {
	t.Helper()
	data := map[string]any{
		"schemaVersion": 1,
		"documentId":    "alice",
		"chapters":      []any{map[string]any{"id": "c1", "title": "Chapter One", "contentKind": "narration"}},
		"paragraphs": []any{
			map[string]any{"id": "p1", "chapterId": "c1", "index": 0, "text": aliceOpening + " " + aliceMiddle},
			map[string]any{"id": "p2", "chapterId": "c1", "index": 1, "text": aliceClosing},
		},
	}
	return writeManuscript(t, data)
}

func writeManuscript(t *testing.T, data any) string {
	t.Helper()
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "manuscript.json")
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// chapterOf is locate.load_script for --manuscript/--chapter: the chapter's tokens and each span's first token.
func chapterOf(t *testing.T, manuscript, chapter string) ([]string, map[int]bool) {
	t.Helper()
	script, err := LoadChapterScript(manuscript, chapter)
	if err != nil {
		t.Fatal(err)
	}
	breaks := map[int]bool{}
	for _, span := range script.Spans {
		breaks[span.Start] = true
	}
	return script.Tokens, breaks
}

func TestTheWordsDecodedFromAManuscriptChapterTailArePlacedAfterTheHeading(t *testing.T) {
	tokens, breaks := chapterOf(t, tailManuscript(t), "c1")
	if !slices.Equal(tokens, joined([]string{"Chapter", "One"}, tailTokens)) {
		t.Fatalf("chapter tokens %q", tokens)
	}

	event := LocateEvent(tokens[22:52], tokens, breaks)

	if event["type"] != "locate" || event["word"] != 52 || event["tokens"] != len(tokens) {
		t.Fatalf("got %v", event)
	}
}

func TestTheWordsDecodedFromAPlainScriptTailArePlacedToo(t *testing.T) {
	tokens := ScriptWords(strings.Join(tailTokens, " "))

	if event := LocateEvent(tokens[20:50], tokens, nil); event["word"] != 50 {
		t.Fatalf("got %v", event)
	}
}

// pinnedContract compares value, written as json.dumps(indent=2, sort_keys=True) writes it, with the committed
// tests/fixtures/contracts/<name>.json the UI's contract tests read, or rewrites the file when UPDATE_CONTRACTS is set.
// (internal/contractfile does this for the host; this package may only reach compare and layout.)
func pinnedContract(t *testing.T, name string, value any) {
	t.Helper()
	working, _ := os.Getwd()
	path := filepath.Join(layout.FindRoot(working), "tests", "fixtures", "contracts", name+".json")
	encoded := compare.DumpPyIndent(value, 2) + "\n"
	if os.Getenv("UPDATE_CONTRACTS") != "" {
		if err := os.WriteFile(path, []byte(encoded), 0o600); err != nil {
			t.Fatal(err)
		}
		return
	}
	committed, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(committed) != encoded {
		t.Fatalf("%s no longer matches what the placement produces.\ncommitted:\n%s\nnow:\n%s", path, committed, encoded)
	}
}

func TestTheLocateLineMatchesTheCommittedContractFile(t *testing.T) {
	tokens, breaks := chapterOf(t, tailManuscript(t), "c1")
	heard := joined([]string{"ning"}, tokens[22:40], []string{"um"}, tokens[40:52])

	pinnedContract(t, "teleprompter-locate", LocateEvent(heard, tokens, breaks))
}

// Accuracy on recorded tails (spikes/record_locate_tails.py: Piper speech, transcribed by the tiny Whisper model).

// resumeToleranceWords is the accuracy target: a tail that can be placed resumes within this many words of where the
// reading really stopped, and is confident; a tail that lies wholly in a repeated passage is never confident.
const resumeToleranceWords = 2

type recordedTail struct {
	Name            string   `json:"name"`
	Script          string   `json:"script"`
	ExpectedWord    int      `json:"expectedWord"`
	ExpectConfident bool     `json:"expectConfident"`
	Heard           []string `json:"heard"`
}

func tailsFolder() string {
	working, _ := os.Getwd()
	return filepath.Join(layout.FindRoot(working), "tests", "fixtures", "teleprompter-locate")
}

func recordedTails(t *testing.T) []recordedTail {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(tailsFolder(), "tails.json"))
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases []recordedTail `json:"cases"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	return file.Cases
}

func tailScript(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(tailsFolder(), name))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// tailBreaks is _fixture_breaks: each line of the script is a paragraph.
func tailBreaks(text string) map[int]bool {
	breaks, start := map[int]bool{}, 0
	for _, line := range lineBreak.Split(strings.TrimSuffix(strings.TrimSuffix(text, "\n"), "\r"), -1) {
		breaks[start] = true
		start += len(ScriptWords(line))
	}
	return breaks
}

func TestARecordedTailResumesWithinTheTargetAndIsConfident(t *testing.T) {
	for _, tail := range recordedTails(t) {
		if !tail.ExpectConfident {
			continue
		}
		t.Run(tail.Name, func(t *testing.T) {
			location := LocateTail(tail.Heard, ScriptWords(tailScript(t, tail.Script)))

			if !location.Confident || location.Word == None || max(location.Word-tail.ExpectedWord, tail.ExpectedWord-location.Word) > resumeToleranceWords {
				t.Fatalf("got %+v, want word %d", location, tail.ExpectedWord)
			}
		})
	}
}

func TestARecordedTailInARepeatedPassageIsLowConfidence(t *testing.T) {
	for _, tail := range recordedTails(t) {
		if tail.ExpectConfident {
			continue
		}
		t.Run(tail.Name, func(t *testing.T) {
			location := LocateTail(tail.Heard, ScriptWords(tailScript(t, tail.Script)))

			if location.Confident || location.Confidence >= 0.1 {
				t.Fatalf("got %+v", location)
			}
		})
	}
}

func TestTheRecordedTailsCoverTheCasesThePRDNames(t *testing.T) {
	names, anyUnconfident := map[string]bool{}, false
	for _, tail := range recordedTails(t) {
		names[tail.Name] = true
		anyUnconfident = anyUnconfident || !tail.ExpectConfident
	}
	for _, name := range []string{"retake", "repeated-passage", "chapter-end", "mid-sentence", "short-tail"} {
		if !names[name] {
			t.Errorf("no %q tail", name)
		}
	}
	if !anyUnconfident {
		t.Error("no tail is expected to be low confidence")
	}
}

func TestTheSentenceOfARecordedTailIsTheOneTheReadingStoppedIn(t *testing.T) {
	tails := recordedTails(t)
	at := slices.IndexFunc(tails, func(tail recordedTail) bool { return tail.Name == "mid-sentence" })
	if at < 0 {
		t.Fatal("no mid-sentence tail")
	}
	tail := tails[at]
	text := tailScript(t, tail.Script)

	event := LocateEvent(tail.Heard, ScriptWords(text), tailBreaks(text))

	sentence, _ := event["sentence"].(compare.PyObject)
	start, _ := sentence["start"].(int)
	end, _ := sentence["end"].(int)
	if sentence == nil || start > tail.ExpectedWord-1 || tail.ExpectedWord-1 >= end || end <= tail.ExpectedWord {
		t.Fatalf("sentence %v, want one holding word %d and ending after it", sentence, tail.ExpectedWord-1)
	}
}
