package recordingcoverage

import (
	"fmt"
	"strings"

	"desktop/internal/compare"
)

// ItemResult is one manifest item as the run found it: Source is "reused" or
// "transcribed" for an analyzed item and "" for a muted one, and Words its
// words file (nil when muted).
type ItemResult struct {
	Item   ManifestItem
	Source string
	Words  *ItemWords
	played []compare.Word
}

// Analysis is what shaped the words: the results' analysis object.
type Analysis struct {
	Model            string
	Language         *string
	EquivalencesHash *string
}

// Input is everything one chapter's results are computed from.
type Input struct {
	Chapter   Chapter
	Items     []ItemResult // in play order
	Params    AlignmentParams
	Analysis  Analysis
	Tokenizer compare.Tokenizer
	// Unsure and Rechecked are the sidecar's COVERAGE_UNSURE and
	// COVERAGE_RECHECKED payloads, carried as written.
	Unsure    []compare.RawJSON
	Rechecked []compare.RawJSON
}

// timeline is coverage_mode._Timeline: the analyzed items' words joined in
// play order, each item starting where the last one ended.
type timeline struct {
	words     []compare.Word
	starts    []itemStart
	wordItems []itemStart // per word: its item and where that item starts
}

type itemStart struct {
	at   float64
	item ManifestItem
}

func newTimeline(items []ItemResult) timeline {
	var t timeline
	offset := 0.0
	for _, result := range items {
		if result.Source == "" {
			continue
		}
		t.starts = append(t.starts, itemStart{offset, result.Item})
		shift := offset - result.Item.StartOffset
		for _, word := range result.played {
			t.words = append(t.words, compare.Word{Text: word.Text, Start: word.Start + shift, End: word.End + shift})
			t.wordItems = append(t.wordItems, itemStart{offset, result.Item})
		}
		offset += result.Item.Length
	}
	return t
}

// position is _Timeline.position: the item a joined time falls in (the last
// one starting at or before it) and the time in that item's source.
func (t timeline) position(joined float64) compare.PyObject {
	start := t.starts[0]
	for _, candidate := range t.starts {
		if candidate.at <= joined {
			start = candidate
		}
	}
	return compare.PyObject{"itemIndex": start.item.Index, "itemGuid": start.item.ItemGUID, "sourceTime": compare.PyRound(start.item.StartOffset+joined-start.at, 3)}
}

// wordEdge is _Timeline.word_edge: a word's start (or end) in its own item's
// source, so a word ending where the next item starts stays in its own item.
func (t timeline) wordEdge(index int, end bool) compare.PyObject {
	start := t.wordItems[index]
	edge := t.words[index].Start
	if end {
		edge = t.words[index].End
	}
	return compare.PyObject{"itemIndex": start.item.Index, "itemGuid": start.item.ItemGUID, "sourceTime": compare.PyRound(start.item.StartOffset+edge-start.at, 3)}
}

func line(tag string, payload any) string {
	return tag + "|" + compare.DumpPy(payload, true) + "\n"
}

func intOrNil(v *int) any {
	if v == nil {
		return nil
	}
	return *v
}

// Results computes the chapter's coverage and returns the results file
// coverage_mode.run wrote: the COVERAGE, COVERAGE_ITEM, COVERAGE_PARAGRAPH,
// COVERAGE_REGION, COVERAGE_UNSURE and COVERAGE_RECHECKED lines, then the word
// alignment (COVERAGE_TOKEN, COVERAGE_EXTRA).
func Results(in Input) (string, error) {
	if err := in.Params.Validate(); err != nil {
		return "", err
	}
	for k := range in.Items {
		if in.Items[k].Source != "" {
			in.Items[k].played = in.Items[k].Words.Played(in.Items[k].Item)
		}
	}
	tl := newTimeline(in.Items)
	heading := in.Chapter.Heading()
	units := in.Tokenizer.BuildChapterUnits(heading, in.Chapter.Paragraphs)
	alignment := in.Tokenizer.Align(units, tl.words)
	aligned := AlignedFromAlignment(alignment, units.Sentences, in.Chapter.ParagraphIDs)
	if err := aligned.Validate(); err != nil {
		return "", err
	}
	coverage := aligned.ComputeCoverage(in.Params)
	words := tokenWords(in.Tokenizer, heading, in.Chapter.Paragraphs)
	if len(words) != len(units.RawWords) {
		return "", fmt.Errorf("The chapter's words could not be matched to its tokens (%d against %d).", len(words), len(units.RawWords))
	}
	var out strings.Builder
	out.WriteString(report(in, coverage, alignment, tl))
	out.WriteString(alignmentLines(&aligned, alignment, tl, words, in.Params))
	return out.String(), nil
}

// AlignedFromAlignment is recording_coverage.aligned_chapter_from_markers: the input
// coverage reads, from the alignment compare.Align computed.
func AlignedFromAlignment(alignment compare.Alignment, sentences []compare.SentenceUnit, paragraphIDs []string) AlignedChapter {
	a := AlignedChapter{
		DocTokens:      alignment.DocTokens,
		DocWords:       make([]string, len(alignment.ChapterIndexMap)),
		TokenParagraph: make([]int, len(alignment.UnitIdx)),
		ParagraphIDs:   paragraphIDs,
		AudioTokens:    alignment.AudioTokens,
		Opcodes:        make([]Opcode, len(alignment.Opcodes)),
	}
	for k, original := range alignment.ChapterIndexMap {
		a.DocWords[k] = alignment.ChapterRawWords[original]
	}
	for k, unit := range alignment.UnitIdx {
		if unit < 0 {
			a.TokenParagraph[k] = Heading
		} else {
			a.TokenParagraph[k] = sentences[unit].Paragraph
		}
	}
	for k, op := range alignment.Opcodes {
		a.Opcodes[k] = Opcode(op)
	}
	return a
}

// report is coverage_mode._report: the measurement lines.
func report(in Input, coverage ChapterCoverage, alignment compare.Alignment, tl timeline) string {
	analyzed, transcribed, reused := 0, 0, 0
	lengths := []float64{}
	for _, result := range in.Items {
		if result.Source == "" {
			continue
		}
		analyzed++
		lengths = append(lengths, result.Item.Length)
		switch result.Source {
		case SourceTranscribed:
			transcribed++
		case SourceReused:
			reused++
		}
	}
	var played any = 0 // Python's sum of no floats is the integer 0
	if total, ok := compare.PySum(lengths); ok {
		played = compare.PyRound(total, 3)
	}
	summary := compare.PyObject{
		"schemaVersion":     ResultSchemaVersion,
		"chapterId":         in.Chapter.ID,
		"bodyTokens":        coverage.BodyTokens,
		"presentTokens":     coverage.PresentTokens,
		"missingTokens":     coverage.MissingTokens(),
		"extraTokens":       coverage.ExtraTokens,
		"longestMissingRun": coverage.LongestMissingRun,
		"alignment":         compare.PyObject{"maxMisreadRun": coverage.Params.MaxMisreadRun, "minAnchorRun": coverage.Params.MinAnchorRun},
		"items": compare.PyObject{
			"analyzed": analyzed, "muted": len(in.Items) - analyzed, "playedSeconds": played,
			"transcribed": transcribed, "reused": reused,
		},
		"analysis": compare.PyObject{"model": in.Analysis.Model, "language": in.Analysis.Language, "equivalencesHash": in.Analysis.EquivalencesHash},
	}
	var out strings.Builder
	out.WriteString(line("COVERAGE", summary))
	for _, result := range in.Items {
		out.WriteString(line("COVERAGE_ITEM", itemLine(result)))
	}
	for _, p := range coverage.Paragraphs {
		out.WriteString(line("COVERAGE_PARAGRAPH", compare.PyObject{"id": p.ID, "tokens": p.Tokens, "present": p.Present, "longestMissingRun": p.LongestMissingRun}))
	}
	for _, region := range coverage.Regions {
		ids := make([]any, len(region.ParagraphIDs))
		for k, id := range region.ParagraphIDs {
			ids[k] = id
		}
		before, after := regionBounds(region, alignment, tl)
		out.WriteString(line("COVERAGE_REGION", compare.PyObject{
			"kind": region.Kind, "paragraphIds": ids, "tokenCount": region.TokenCount,
			"firstWord": region.FirstWord, "lastWord": region.LastWord,
			"position": regionPosition(region, alignment, tl), "before": before, "after": after,
		}))
	}
	for _, passage := range in.Unsure {
		out.WriteString(line("COVERAGE_UNSURE", passage))
	}
	for _, summary := range in.Rechecked {
		out.WriteString(line("COVERAGE_RECHECKED", summary))
	}
	return out.String()
}

func itemLine(result ItemResult) compare.PyObject {
	status, source := "analyzed", any(result.Source)
	if result.Item.Muted {
		status = "muted"
	}
	if result.Source == "" {
		source = nil
	}
	var model, language any
	if result.Words != nil {
		model, language = result.Words.Model, result.Words.Language
	}
	return compare.PyObject{
		"index": result.Item.Index, "itemGuid": result.Item.ItemGUID, "status": status, "words": source,
		"playedSeconds": result.Item.Length, "wordCount": len(result.played), "model": model, "language": language,
	}
}

// regionPosition is _region_position: where the missing text would sit in the
// audio, the start of the transcript word at the region's audio index, or the
// end of the last word for a region after everything said.
func regionPosition(region Region, alignment compare.Alignment, tl timeline) any {
	if len(tl.words) == 0 {
		return nil
	}
	if region.AudioIndex < len(alignment.IndexMap) {
		return tl.position(tl.words[alignment.IndexMap[region.AudioIndex]].Start)
	}
	return tl.position(tl.words[len(tl.words)-1].End)
}

// regionBounds is _region_bounds: the end of the last matched word before the
// region and the start of the first one after it, each in its own item's
// source seconds, or nil on a side with no matched word.
func regionBounds(region Region, alignment compare.Alignment, tl timeline) (before, after any) {
	if region.AudioBefore != nil {
		before = tl.wordEdge(alignment.IndexMap[*region.AudioBefore], true)
	}
	if region.AudioAfter != nil {
		after = tl.wordEdge(alignment.IndexMap[*region.AudioAfter], false)
	}
	return before, after
}

type tokenWord struct{ paragraph, ordinal int }

// tokenWords is coverage_mode._token_words: per chapter token, in
// build_chapter_units' order, its paragraph (Heading for the heading) and the
// ordinal of the whitespace word it came from in that paragraph's text.
func tokenWords(t compare.Tokenizer, heading string, paragraphs []string) []tokenWord {
	out := []tokenWord{}
	for n, raw := range compare.PySplit(heading) {
		for range t.Tokenize(raw) {
			out = append(out, tokenWord{Heading, n})
		}
	}
	counters := map[int]int{}
	for _, sentence := range t.BuildSentenceUnits(paragraphs) {
		for _, raw := range compare.PySplit(sentence.Text) {
			ordinal := counters[sentence.Paragraph]
			counters[sentence.Paragraph] = ordinal + 1
			for range t.Tokenize(raw) {
				out = append(out, tokenWord{sentence.Paragraph, ordinal})
			}
		}
	}
	return out
}

// alignmentLines is coverage_mode._alignment_lines: each token's word, status
// and where it was heard, and each run of extra words with the token it
// follows and the chapter text it repeats.
func alignmentLines(aligned *AlignedChapter, alignment compare.Alignment, tl timeline, words []tokenWord, params AlignmentParams) string {
	tokens, extras := aligned.AlignTokens(params)
	var out strings.Builder
	for i, token := range tokens {
		word := words[alignment.ChapterIndexMap[i]]
		var paragraph any
		if word.paragraph != Heading {
			paragraph = aligned.ParagraphIDs[word.paragraph]
		}
		payload := compare.PyObject{
			"i": i, "p": paragraph, "w": word.ordinal, "text": aligned.DocWords[i], "status": token.Status,
			"heard": nil, "item": nil, "start": nil, "end": nil,
		}
		if token.Audio != nil {
			heard := alignment.IndexMap[*token.Audio]
			start, end := tl.wordEdge(heard, false), tl.wordEdge(heard, true)
			payload["item"], payload["start"], payload["end"] = start["itemIndex"], start["sourceTime"], end["sourceTime"]
			if token.Status == StatusMisread {
				payload["heard"] = tl.words[heard].Text
			}
		}
		out.WriteString(line("COVERAGE_TOKEN", payload))
	}
	type heardAt struct{ audio, doc int }
	heardAtList := []heardAt{}
	for i, token := range tokens {
		if token.Audio != nil {
			heardAtList = append(heardAtList, heardAt{*token.Audio, i})
		}
	}
	repeats := aligned.Repeats(tokens, extras)
	for k, extra := range extras {
		first, last := alignment.IndexMap[extra[0]], alignment.IndexMap[extra[1]-1]
		said := []string{}
		for w := first; w <= last; w++ {
			said = append(said, tl.words[w].Text)
		}
		var afterToken any
		for _, h := range heardAtList {
			if h.audio < extra[0] {
				afterToken = h.doc
			}
		}
		var repeatOf any
		if repeat := repeats[k]; repeat != nil {
			repeatOf = compare.PyObject{
				"start": repeat.Start, "end": repeat.End, "first": repeat.First, "last": repeat.Last,
				"text": strings.Join(aligned.DocWords[repeat.Start:repeat.End], " "),
			}
		}
		out.WriteString(line("COVERAGE_EXTRA", compare.PyObject{
			"text": strings.Join(said, " "), "tokens": extra[1] - extra[0],
			"start": tl.wordEdge(first, false), "end": tl.wordEdge(last, true),
			"afterToken": afterToken, "repeatOf": repeatOf,
		}))
	}
	return out.String()
}
