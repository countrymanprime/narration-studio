package comparerun

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"unicode/utf8"

	"desktop/internal/compare"
)

// sentence makes an error whose text is a sentence for the narrator, shown as written in the run's failure message, so
// it starts with a capital and ends with a full stop: ST1005's rule is for errors wrapped into other messages.
func sentence(format string, args ...any) error { return fmt.Errorf(format, args...) }

// Segment is one item of the joined recording: the item's index, where its range starts in its source file, and where
// it starts in the joined recording (build_concatenated_audio's concat_start).
type Segment struct {
	ItemIndex   int
	StartOffset float64
	ConcatStart float64
}

// WordsReport is what the sidecar's compare run writes: the segments in joined order and the words heard, timed in
// seconds of the joined recording.
type WordsReport struct {
	Segments []Segment
	Words    []compare.Word
}

func parseWords(raw [][3]any) ([]compare.Word, bool) {
	words := make([]compare.Word, len(raw))
	for k, word := range raw {
		text, ok1 := word[0].(string)
		start, ok2 := word[1].(float64)
		end, ok3 := word[2].(float64)
		if !ok1 || !ok2 || !ok3 {
			return nil, false
		}
		words[k] = compare.Word{Text: text, Start: start, End: end}
	}
	return words, true
}

// ReadWordsReport reads the sidecar's words report: a COMPARE_SEGMENT line per segment and one COMPARE_WORDS line. An unknown tag, a malformed line or a missing line is an error.
func ReadWordsReport(path string) (WordsReport, error) {
	raw, err := compare.ReadBounded(path)
	if err != nil {
		return WordsReport{}, sentence("The comparison's words report could not be read: %v", err)
	}
	var report WordsReport
	words := false
	for number, line := range strings.Split(strings.TrimRight(string(raw), "\n"), "\n") {
		if line == "" {
			continue
		}
		malformed := sentence("The comparison's words report has a malformed line %d.", number+1)
		tag, payload, _ := strings.Cut(line, "|")
		switch tag {
		case "COMPARE_SEGMENT":
			var entry struct {
				ItemIndex   *int     `json:"itemIndex"`
				StartOffset *float64 `json:"startOffset"`
				ConcatStart *float64 `json:"concatStart"`
			}
			if json.Unmarshal([]byte(payload), &entry) != nil || entry.ItemIndex == nil || entry.StartOffset == nil || entry.ConcatStart == nil {
				return WordsReport{}, malformed
			}
			report.Segments = append(report.Segments, Segment{*entry.ItemIndex, *entry.StartOffset, *entry.ConcatStart})
		case "COMPARE_WORDS":
			var entry struct {
				Words [][3]any `json:"words"`
			}
			if json.Unmarshal([]byte(payload), &entry) != nil || entry.Words == nil {
				return WordsReport{}, malformed
			}
			var ok bool
			if report.Words, ok = parseWords(entry.Words); !ok {
				return WordsReport{}, malformed
			}
			words = true
		default:
			return WordsReport{}, sentence("The comparison's words report has an unknown line %q.", tag)
		}
	}
	if !words {
		return WordsReport{}, sentence("The comparison's words report is incomplete.")
	}
	return report, nil
}

// locate is locate_in_segments: a time in the joined recording as an item's index and a position in its source file.
func locate(t float64, segments []Segment) (int, float64) {
	if len(segments) == 0 {
		return 0, 0.0
	}
	chosen := segments[0]
	for _, s := range segments {
		if s.ConcatStart > t {
			break
		}
		chosen = s
	}
	return chosen.ItemIndex, chosen.StartOffset + pyMax(0.0, t-chosen.ConcatStart)
}

// globalParagraph is resolve_global_paragraph: the reader's global index of the chapter's local-th paragraph, or of
// the nearest one that has an index, "0" when none does.
func globalParagraph(c compare.Chapter, local int) string {
	indices := c.ParagraphIndices
	if len(indices) == 0 {
		return "0"
	}
	local = min(max(local, 0), len(indices)-1)
	if indices[local] != nil {
		return *indices[local]
	}
	for distance := 1; distance < len(indices); distance++ {
		for _, k := range []int{local - distance, local + distance} {
			if k >= 0 && k < len(indices) && indices[k] != nil {
				return *indices[k]
			}
		}
	}
	return "0"
}

func squash(text string) string { return strings.Join(compare.PySplit(text), " ") }

// ChapterName is compare.py's chapter_name, narration_common.chapter_names.chapter_display_name(title, subtitle) with
// Python's whitespace: the title's first line and the subtitle, joined with " — " after one trailing separator of the
// title is dropped.
func ChapterName(c compare.Chapter) string {
	first, _, _ := strings.Cut(c.Title, "\n")
	name, sub := squash(first), squash(c.Subtitle)
	if sub == "" {
		return name
	}
	stripped := name
	if r, size := utf8.DecodeLastRuneInString(name); size > 0 && strings.ContainsRune(":—–-", r) {
		stripped = name[:len(name)-size]
	}
	if stripped = compare.PyStrip(stripped); stripped == "" {
		return sub
	}
	return stripped + " — " + sub
}

// spokenHeading is spoken_heading: the title, then the subtitle, the blank ones left out.
func spokenHeading(c compare.Chapter) string {
	parts := []string{}
	for _, part := range []string{c.Title, c.Subtitle} {
		if compare.PyStrip(part) != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(parts, " ")
}

// Output is a run's three texts beside the results: the unified diff and the line-for-line manuscript and recorded
// pair, each with "\n" line ends.
type Output struct {
	Results, Diff, Manuscript, Recorded string
	Markers                             int
}

// Build is the tail of compare.py's run for one matched chapter and the match's score: the markers, the results file (SUMMARY, DIFF naming
// diffPath, a MARKER line per marker) and the diff texts.
func Build(t compare.Tokenizer, c compare.Chapter, score float64, report WordsReport, minWords int, diffPath string) Output {
	units := t.BuildChapterUnits(spokenHeading(c), c.Paragraphs)
	alignment := t.Align(units, report.Words)
	markers, covered := Markers(alignment, units, report.Words, minWords)
	if covered != nil {
		covered[1] = min(covered[1]+excerptTailBufferSentences, len(units.Sentences)-1)
	}
	out := Output{Markers: len(markers)}
	out.Diff, out.Manuscript, out.Recorded = diffTexts(t, c, units, alignment, report.Words, covered)

	var results strings.Builder
	fmt.Fprintf(&results, "SUMMARY|MATCH: '%s' (score %s) - %d discrepancy marker(s)\n", ChapterName(c), strconv.FormatFloat(score, 'f', 2, 64), len(markers))
	fmt.Fprintf(&results, "DIFF|%s\n", diffPath)
	for _, m := range markers {
		item, srcpos := locate(m.Time, report.Segments)
		local := 0
		if m.Unit >= 0 && m.Unit < len(units.Sentences) {
			local = units.Sentences[m.Unit].Paragraph
		}
		script, heard := MarkerContext(m, alignment, report.Words)
		if script == "" {
			script = m.Doc
			if m.Unit >= 0 && m.Unit < len(units.Sentences) {
				script = units.Sentences[m.Unit].Text
			}
		}
		if heard == "" {
			heard = m.Audio
		}
		gap := ""
		if m.TimingGap != nil {
			gap = strconv.FormatFloat(*m.TimingGap, 'f', 3, 64)
		}
		fmt.Fprintf(&results, "MARKER|%d|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s\n", item, strconv.FormatFloat(srcpos, 'f', 3, 64), m.Kind, m.Name, m.Doc, m.Audio,
			compare.CleanMarkerField(c.Title), globalParagraph(c, local), compare.CleanMarkerField(script), compare.CleanMarkerField(heard), m.Confidence, gap, m.RepeatOf)
	}
	out.Results = results.String()
	return out
}

// diffTexts is write_unified_diff's three texts: the diff ('-' manuscript, '+' recording, ' ' the same), and the
// manuscript and recorded sides one sentence per line, for the covered units (every unit, heard as split audio
// sentences, when nothing aligned).
func diffTexts(t compare.Tokenizer, c compare.Chapter, units compare.ChapterUnits, a compare.Alignment, words []compare.Word, covered *[2]int) (string, string, string) {
	heading := ChapterName(c)
	sentences := units.Sentences
	first, last := 0, len(sentences)-1
	var info []unitAudio
	if covered != nil {
		first, last = covered[0], covered[1]
		info = unitAudioInfo(a, words, first, last)
	} else {
		// compare.py skipped the spoken title first (find_transcript_title_boundary), but nothing aligned only when every
		// word heard is a filler or the chapter has no tokens, and either way that search found no title: every word is
		// shown.
		for _, line := range splitAudioSentences(t, words) {
			info = append(info, unitAudio{text: line})
		}
	}
	diff := []string{"--- " + heading + " (manuscript)", "+++ " + heading + " (recorded)"}
	var doc, heard []string
	if first > 0 {
		diff, doc, heard = append(diff, " ..."), append(doc, "..."), append(heard, "...")
	}
	for offset, u := 0, first; u <= last; offset, u = offset+1, u+1 {
		text := sentences[u].Text
		var audio unitAudio
		if offset < len(info) {
			audio = info[offset]
		}
		doc = append(doc, text)
		if audio.exact {
			heard = append(heard, text)
			diff = append(diff, " "+text)
			continue
		}
		heard = append(heard, audio.text)
		diff = append(diff, "-"+text)
		if audio.text != "" {
			diff = append(diff, "+"+audio.text)
		}
	}
	if last < len(sentences)-1 {
		diff, doc, heard = append(diff, " ..."), append(doc, "..."), append(heard, "...")
	}
	return strings.Join(diff, "\n") + "\n", heading + "\n\n" + strings.Join(doc, "\n") + "\n", heading + "\n\n" + strings.Join(heard, "\n") + "\n"
}

// MinWords is the shortest change, in tokens, that makes a marker (compare.py's --min-words default; the host never
// set another).
const MinWords = 1

// Request is one run: the manuscript, the chapter chosen for it and the match's score (Choose), the sidecar's words
// report, and where the results and the diff go.
type Request struct {
	ManuscriptPath string
	ChapterID      string
	Score          float64
	WordsReport    string
	Out            string
	DiffOut        string
}

// splitextBase is os.path.splitext(path)[0]: the path without its last extension, where a name's leading dots are not
// an extension (".diff" has none).
func splitextBase(path string) string {
	name := filepath.Base(path)
	if path == "" || strings.HasSuffix(path, string(filepath.Separator)) || strings.HasSuffix(path, "/") {
		return path
	}
	dot := strings.LastIndex(name, ".")
	if dot <= 0 || strings.Trim(name[:dot], ".") == "" {
		return path
	}
	return path[:len(path)-(len(name)-dot)]
}

// lineEnd is the line end the diff texts are written with: Python's text mode wrote "\r\n" on Windows, and the diff
// view and the editors it is opened in read what the sidecar wrote.
func lineEnd() string {
	if runtime.GOOS == "windows" {
		return "\r\n"
	}
	return "\n"
}

// Load reads the project's equivalences and the manuscript's narration chapter chapterID: the tokenizer and the
// chapter a run is built with.
func Load(manuscriptPath, chapterID string) (compare.Tokenizer, compare.Chapter, error) {
	tokenizer, chapters, err := LoadChapters(manuscriptPath)
	if err != nil {
		return compare.Tokenizer{}, compare.Chapter{}, err
	}
	for _, chapter := range chapters {
		if chapter.ID == chapterID {
			return tokenizer, chapter, nil
		}
	}
	return compare.Tokenizer{}, compare.Chapter{}, sentence("The manuscript has no narratable chapter with id '%s'.", chapterID)
}

// Run builds the results for the request's chapter, writes the diff, the manuscript and recorded pair
// (<DiffOut without its extension>.manuscript.txt and .recorded.txt) and then the results file, the last atomically.
// It answers the number of markers.
func Run(req Request) (int, error) {
	report, err := ReadWordsReport(req.WordsReport)
	if err != nil {
		return 0, err
	}
	tokenizer, chapter, err := Load(req.ManuscriptPath, req.ChapterID)
	if err != nil {
		return 0, err
	}
	out := Build(tokenizer, chapter, req.Score, report, MinWords, req.DiffOut)
	base := splitextBase(req.DiffOut)
	for path, text := range map[string]string{req.DiffOut: out.Diff, base + ".manuscript.txt": out.Manuscript, base + ".recorded.txt": out.Recorded} {
		if err := os.WriteFile(path, []byte(strings.ReplaceAll(text, "\n", lineEnd())), 0o600); err != nil {
			return 0, sentence("The comparison's diff could not be written: %v", err)
		}
	}
	tmp := req.Out + ".tmp"
	if err := os.WriteFile(tmp, []byte(out.Results), 0o600); err != nil {
		return 0, sentence("The comparison's results could not be written: %v", err)
	}
	if err := os.Rename(tmp, req.Out); err != nil {
		_ = os.Remove(tmp)
		return 0, sentence("The comparison's results could not be written: %v", err)
	}
	return out.Markers, nil
}
