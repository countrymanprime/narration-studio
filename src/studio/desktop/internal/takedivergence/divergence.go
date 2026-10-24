// Package takedivergence says where one take of a fixed manuscript span
// diverges from the manuscript (docs/utilities/take-review.md). It is the Go
// port of the transcript-compare sidecar's take_divergence.py and of the
// results half of take_divergence_mode.py: the sidecar transcribes each take,
// and the host aligns the words to the span here, with the take markers' own
// diff (internal/compare), so a take's divergences and its markers never
// disagree about what was said. The results it writes are held byte for byte
// to the ones the Python wrote.
//
// For every manuscript word of the span the result says whether the take read
// it (matched), said something else there (misread), left it out between words
// it did read (skipped) or never reached it because the take starts late or
// stops early (unread); and it lists each divergence as a span of manuscript
// words with the take's time range it happened in. Nothing here ranks takes:
// the counts are evidence.
package takedivergence

import (
	"fmt"
	"sort"
	"strings"

	"desktop/internal/compare"
)

// The word statuses and divergence kinds.
const (
	Matched = "matched"
	Misread = "misread"
	Skipped = "skipped"
	Unread  = "unread"
	Extra   = "extra"
)

// WordStatuses are the statuses a span word can have, in the order the counts
// list them.
var WordStatuses = []string{Matched, Misread, Skipped, Unread}

// Where a divergence sits against the part of the span the take read.
const (
	Before = "before"
	Within = "within"
	After  = "after"
)

const timeDecimals = 3

// SpanError is a requested span that is not a run of sentences of the chapter.
type SpanError struct{ message string }

func (e SpanError) Error() string { return e.message }

func spanError(format string, args ...any) error { return SpanError{fmt.Sprintf(format, args...)} }

// SpanWord is one spoken manuscript word of the span: a whitespace word of a
// sentence that has at least one token.
type SpanWord struct {
	Index     int
	Text      string
	Unit      int
	Paragraph int
	Tokens    []string
}

// Span is a fixed run of a chapter's sentence units, FirstUnit to LastUnit
// inclusive, numbered as --find-repeats numbers them.
type Span struct {
	FirstUnit, LastUnit           int
	FirstParagraph, LastParagraph int
	Words                         []SpanWord
}

// BuildParagraphSpan is build_paragraph_span: every sentence unit of
// paragraphs first..last.
func BuildParagraphSpan(t compare.Tokenizer, paragraphs []string, first, last int) (Span, error) {
	units := t.BuildSentenceUnits(paragraphs)
	if !(0 <= first && first <= last && last < len(paragraphs)) {
		return Span{}, spanError("The paragraphs %d..%d are not within the chapter's %d paragraph(s)", first, last, len(paragraphs))
	}
	inside := []int{}
	for unit, sentence := range units {
		if first <= sentence.Paragraph && sentence.Paragraph <= last {
			inside = append(inside, unit)
		}
	}
	if len(inside) == 0 {
		return Span{}, spanError("The paragraphs %d..%d have no sentences", first, last)
	}
	return BuildSpan(t, paragraphs, inside[0], inside[len(inside)-1])
}

// BuildSpan is build_span: the spoken words of sentence units first..last.
func BuildSpan(t compare.Tokenizer, paragraphs []string, first, last int) (Span, error) {
	units := t.BuildSentenceUnits(paragraphs)
	if len(units) == 0 {
		return Span{}, spanError("The chapter has no sentences")
	}
	if !(0 <= first && first <= last && last < len(units)) {
		return Span{}, spanError("The span %d..%d is not within the chapter's %d sentence(s)", first, last, len(units))
	}
	span := Span{FirstUnit: first, LastUnit: last, FirstParagraph: units[first].Paragraph, LastParagraph: units[last].Paragraph}
	for unit := first; unit <= last; unit++ {
		for _, raw := range compare.PySplit(units[unit].Text) {
			if tokens := t.Tokenize(raw); len(tokens) > 0 {
				span.Words = append(span.Words, SpanWord{len(span.Words), raw, unit, units[unit].Paragraph, tokens})
			}
		}
	}
	if len(span.Words) == 0 {
		return Span{}, spanError("The span %d..%d has no spoken words", first, last)
	}
	return span, nil
}

// WordResult is one span word's status and the take's time it was heard at.
type WordResult struct {
	Index      int
	Status     string
	Start, End *float64
}

// Divergence is one place the take departs from the span. FirstWord and
// LastWord are the span words involved; an extra sits before FirstWord (nil
// after the last word). A skipped one's time is the pause where the words were
// left out; an unread one has none.
type Divergence struct {
	Kind, Position      string
	FirstWord, LastWord *int
	ManuscriptText      string
	AudioText           string
	Start, End          *float64
}

// Alignment is one take aligned to the span.
type Alignment struct {
	Words       []WordResult
	Divergences []Divergence
	ExtraWords  int
}

// Count is how many span words have status.
func (a Alignment) Count(status string) int {
	n := 0
	for _, word := range a.Words {
		if word.Status == status {
			n++
		}
	}
	return n
}

// Fidelity is matched span words over all span words (0 for an empty span).
func (a Alignment) Fidelity() float64 {
	if len(a.Words) == 0 {
		return 0
	}
	return float64(a.Count(Matched)) / float64(len(a.Words))
}

func ptr[T any](v T) *T { return &v }

// mergedOwners is _merged_owners: for each span token after number merging,
// the span words it came from.
func mergedOwners(span Span, chapterIndexMap []int) [][]int {
	flat := []int{}
	for _, word := range span.Words {
		for range word.Tokens {
			flat = append(flat, word.Index)
		}
	}
	bounds := append(append([]int{}, chapterIndexMap...), len(flat))
	out := make([][]int, len(chapterIndexMap))
	for k := range chapterIndexMap {
		set := map[int]bool{}
		for original := bounds[k]; original < bounds[k+1]; original++ {
			set[flat[original]] = true
		}
		out[k] = sortedKeys(set)
	}
	return out
}

func sortedKeys(set map[int]bool) []int {
	keys := make([]int, 0, len(set))
	for k := range set {
		keys = append(keys, k)
	}
	sort.Ints(keys)
	return keys
}

// audioRange is _audio_range: the time range and raw text of the transcript
// words behind audio tokens [j1, j2), j1 < j2.
func audioRange(indexMap []int, transcript []compare.Word, j1, j2 int) (float64, float64, string) {
	set := map[int]bool{}
	for j := j1; j < j2; j++ {
		set[indexMap[j]] = true
	}
	originals := sortedKeys(set)
	texts := make([]string, len(originals))
	for k, i := range originals {
		texts[k] = compare.PyStrip(transcript[i].Text)
	}
	return transcript[originals[0]].Start, transcript[originals[len(originals)-1]].End, strings.Join(texts, " ")
}

// gap is _gap: the pause at audio position j, from the end of the word before
// it to the start of the word at it.
func gap(indexMap []int, transcript []compare.Word, j int) (*float64, *float64) {
	var before, after *float64
	if 0 < j && j <= len(indexMap) {
		before = ptr(transcript[indexMap[j-1]].End)
	}
	if 0 <= j && j < len(indexMap) {
		after = ptr(transcript[indexMap[j]].Start)
	}
	if before != nil && after != nil && *after < *before {
		after = ptr(*before)
	}
	return before, after
}

// audioTokens is _audio_tokens: the audio tokens the opcodes index, rebuilt;
// nil when the rebuild does not reproduce the alignment's own index map.
func audioTokens(t compare.Tokenizer, transcript []compare.Word, indexMap []int) []string {
	tokens, owners := []string{}, []int{}
	for i, word := range transcript {
		for _, token := range t.Tokenize(word.Text) {
			if !compare.IsFiller(token) {
				tokens, owners = append(tokens, token), append(owners, i)
			}
		}
	}
	merged, mergedMap := compare.MergeNumberWords(tokens, owners)
	if len(mergedMap) != len(indexMap) {
		return nil
	}
	for k := range mergedMap {
		if mergedMap[k] != indexMap[k] {
			return nil
		}
	}
	return merged
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if a[k] != b[k] {
			return false
		}
	}
	return true
}

// preferEarlierCopy is _prefer_earlier_copy: when the diff matched the first
// of two copies of the same words and called the second extra, swap them, so
// the extra is the abandoned, earlier read.
func preferEarlierCopy(opcodes []compare.Opcode, audio []string) []compare.Opcode {
	out := []compare.Opcode{}
	for _, op := range opcodes {
		n := op.J2 - op.J1
		if audio != nil && op.Tag == "insert" && len(out) > 0 {
			previous := out[len(out)-1]
			if previous.Tag == "equal" && previous.I2 == op.I1 && previous.J2 == op.J1 && previous.I2-previous.I1 >= n &&
				op.J1-n >= 0 && equalStrings(audio[op.J1-n:op.J1], audio[op.J1:op.J2]) {
				out = out[:len(out)-1]
				a1, a2, b1, b2 := previous.I1, previous.I2, previous.J1, previous.J2
				if a2-n > a1 {
					out = append(out, compare.Opcode{Tag: "equal", I1: a1, I2: a2 - n, J1: b1, J2: b2 - n})
				}
				out = append(out, compare.Opcode{Tag: "insert", I1: a2 - n, I2: a2 - n, J1: b2 - n, J2: b2})
				out = append(out, compare.Opcode{Tag: "equal", I1: a2 - n, I2: a2, J1: op.J1, J2: op.J2})
				continue
			}
		}
		out = append(out, op)
	}
	return out
}

func position(i1, i2 int, alignedStart, alignedEnd *int) string {
	if alignedStart == nil || i2 <= *alignedStart {
		return Before
	}
	if i1 >= *alignedEnd {
		return After
	}
	return Within
}

// AlignTake is align_take: one take's transcript words aligned to the span
// with the markers' own diff, every divergence localized. Times stay in the
// transcript's own seconds.
func AlignTake(t compare.Tokenizer, span Span, transcript []compare.Word) Alignment {
	units := compare.ChapterUnits{}
	for _, word := range span.Words {
		for _, token := range word.Tokens {
			units.Tokens = append(units.Tokens, token)
			units.UnitIdx = append(units.UnitIdx, word.Unit)
			units.RawWords = append(units.RawWords, word.Text)
		}
	}
	alignment := t.Align(units, transcript)
	indexMap := alignment.IndexMap
	opcodes := preferEarlierCopy(alignment.Opcodes, audioTokens(t, transcript, indexMap))
	owners := mergedOwners(span, alignment.ChapterIndexMap)

	var alignedStart, alignedEnd *int
	for _, op := range opcodes {
		if op.Tag != "delete" {
			if alignedStart == nil {
				alignedStart = ptr(op.I1)
			}
			alignedEnd = ptr(op.I2)
		}
	}

	status := make([]string, len(owners))
	for k := range status {
		status[k] = Unread
	}
	times := make([]*[2]float64, len(owners))
	result := Alignment{}
	for _, op := range opcodes {
		where := position(op.I1, op.I2, alignedStart, alignedEnd)
		if op.Tag == "equal" {
			for offset := 0; offset < op.I2-op.I1; offset++ {
				start, end, _ := audioRange(indexMap, transcript, op.J1+offset, op.J1+offset+1)
				status[op.I1+offset], times[op.I1+offset] = Matched, &[2]float64{start, end}
			}
			continue
		}
		set := map[int]bool{}
		for i := op.I1; i < op.I2; i++ {
			for _, word := range owners[i] {
				set[word] = true
			}
		}
		words := sortedKeys(set)
		texts := make([]string, len(words))
		for k, w := range words {
			texts[k] = span.Words[w].Text
		}
		manuscriptText := strings.Join(texts, " ")
		var audioStart, audioEnd float64
		var audioText string
		if op.J2 > op.J1 {
			audioStart, audioEnd, audioText = audioRange(indexMap, transcript, op.J1, op.J2)
		}
		switch {
		case op.Tag == "replace":
			for i := op.I1; i < op.I2; i++ {
				status[i], times[i] = Misread, &[2]float64{audioStart, audioEnd}
			}
			result.Divergences = append(result.Divergences, Divergence{Misread, Within, ptr(words[0]), ptr(words[len(words)-1]), manuscriptText, audioText, ptr(audioStart), ptr(audioEnd)})
		case op.Tag == "delete":
			kind := Unread
			if where == Within {
				kind = Skipped
			}
			for i := op.I1; i < op.I2; i++ {
				status[i] = kind
			}
			var start, end *float64
			if kind == Skipped {
				start, end = gap(indexMap, transcript, op.J1)
			}
			result.Divergences = append(result.Divergences, Divergence{kind, where, ptr(words[0]), ptr(words[len(words)-1]), manuscriptText, "", start, end})
		case where == Before && span.FirstUnit == 0:
			// Said before a span that starts the chapter: the heading, read in the narrator's own words (#2251 item 7).
		default: // insert: said, but not in the span at this point
			heard := map[int]bool{}
			for j := op.J1; j < op.J2; j++ {
				heard[indexMap[j]] = true
			}
			result.ExtraWords += len(heard)
			var anchor *int
			if op.I1 < len(owners) {
				anchor = ptr(owners[op.I1][0])
			}
			result.Divergences = append(result.Divergences, Divergence{Extra, where, anchor, anchor, "", audioText, ptr(audioStart), ptr(audioEnd)})
		}
	}
	sort.SliceStable(result.Divergences, func(x, y int) bool {
		a, b := divergenceOrder(result.Divergences[x]), divergenceOrder(result.Divergences[y])
		return a[0] < b[0] || a[0] == b[0] && a[1] < b[1]
	})
	result.Words = wordResults(span, owners, status, times)
	return result
}

func divergenceOrder(d Divergence) [2]int {
	order := map[string]int{Before: 0, Within: 1, After: 2}[d.Position]
	word := 1 << 30
	if d.FirstWord != nil {
		word = *d.FirstWord
	}
	return [2]int{order, word}
}

// wordResults is _word_results: each span word's status (misread when its
// tokens were treated differently) and the time of the audio its tokens were
// matched or misread as.
func wordResults(span Span, owners [][]int, status []string, times []*[2]float64) []WordResult {
	statuses := make([]map[string]bool, len(span.Words))
	spans := make([][][2]float64, len(span.Words))
	for k := range statuses {
		statuses[k] = map[string]bool{}
	}
	for k, words := range owners {
		for _, word := range words {
			statuses[word][status[k]] = true
			if times[k] != nil {
				spans[word] = append(spans[word], *times[k])
			}
		}
	}
	out := make([]WordResult, len(span.Words))
	for _, word := range span.Words {
		result := WordResult{Index: word.Index, Status: Misread}
		if len(statuses[word.Index]) == 1 {
			for s := range statuses[word.Index] {
				result.Status = s
			}
		}
		if heard := spans[word.Index]; len(heard) > 0 {
			start, end := heard[0][0], heard[0][1]
			for _, h := range heard[1:] {
				start, end = min(start, h[0]), max(end, h[1])
			}
			result.Start, result.End = ptr(start), ptr(end)
		}
		out[word.Index] = result
	}
	return out
}
