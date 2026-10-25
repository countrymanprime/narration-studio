// Command proof-align serves the host's Proof analyses (the recording check's
// alignment, internal/recordingcoverage, and the take comparison's,
// internal/takedivergence, and the Transcript Compare run's markers,
// internal/comparerun) to the Python test tooling of the transcript-compare
// sidecar: its coverage harness, calibration, alignment spike and divergence
// harness (src/studio/sidecars/transcript-compare/tests/go_coverage.py and
// go_divergence.py), so they measure what the app ships. It is a development
// tool and is not packaged.
//
// It reads one JSON request per line on standard input and writes one JSON
// reply per line on standard output:
//
//	{"op": "results", ...}  a run's results file, as the host writes it (Request's fields)
//	{"op": "align", ...}    a chapter aligned to transcript words: the AlignedChapter and its maps
//	{"op": "coverage", ...} coverage, token statuses, extra runs and repeats of an AlignedChapter
//	{"op": "measure", ...}  a manuscript chapter measured against items' words, as a run measures it
//	{"op": "span", ...}     the spoken words of sentence units firstUnit..lastUnit of paragraphs
//	{"op": "alignTake", ...} one take's words aligned to that span: each word's status, the divergences
//	{"op": "compareRun", ...} a Transcript Compare run's results and diff files, as the host writes them
//	{"op": "matchChapter", ...} the chapter title a track name matches, with the project's equivalences
//	{"op": "findRepeats", ...} a pickup and duplicate scan's tagged output for a manifest and each read's words
//	{"op": "tokenize", ...} the tokens of a text, with the project's equivalences
//	{"op": "fuseHyphenSplits", ...} opcodes over doc and audio tokens with their hyphen splits fused, as Align fuses them
//
// A reply is {"error": "..."} when the request fails.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"

	"desktop/internal/chaptermatch"
	"desktop/internal/compare"
	"desktop/internal/comparerun"
	"desktop/internal/recordingcoverage"
	"desktop/internal/takedivergence"
)

type request struct {
	Op string `json:"op"`

	// results
	Manifest      string  `json:"manifest"`
	WordsDir      string  `json:"wordsDir"`
	Manuscript    string  `json:"manuscript"`
	ChapterID     string  `json:"chapterId"`
	Out           string  `json:"out"`
	WordsReport   string  `json:"wordsReport"`
	Model         string  `json:"model"`
	CheckedBy     string  `json:"checkedBy"`
	Language      *string `json:"language"`
	MaxMisreadRun *int    `json:"maxMisreadRun"`
	MinAnchorRun  *int    `json:"minAnchorRun"`

	// align
	Heading      string          `json:"heading"`
	Paragraphs   []string        `json:"paragraphs"`
	ParagraphIDs []string        `json:"paragraphIds"`
	Words        [][3]any        `json:"words"`
	Equivalences [][]string      `json:"equivalences"`
	Aligned      *alignedChapter `json:"aligned"`

	// measure
	Items []measureItem `json:"items"`

	// span, alignTake
	FirstUnit int `json:"firstUnit"`
	LastUnit  int `json:"lastUnit"`

	// compareRun (and manuscript, chapterId, wordsReport, out)
	DiffOut string  `json:"diffOut"`
	Score   float64 `json:"score"`

	// matchChapter (and equivalences)
	Titles []string `json:"titles"`
	Track  string   `json:"track"`

	// tokenize (and equivalences)
	Text string `json:"text"`

	// fuseHyphenSplits
	Doc     []string `json:"doc"`
	Audio   []string `json:"audio"`
	Opcodes [][5]any `json:"opcodes"`

	// findRepeats (and manuscript, manifest, track)
	ChapterTitle   string     `json:"chapterTitle"`
	Heard          [][][3]any `json:"heard"`
	MinWords       int        `json:"minWords"`
	MinSpanOverlap float64    `json:"minSpanOverlap"`
}

type measureItem struct {
	Index       int      `json:"index"`
	ItemGUID    string   `json:"itemGuid"`
	StartOffset float64  `json:"startOffset"`
	Length      float64  `json:"length"`
	Muted       bool     `json:"muted"`
	Words       [][3]any `json:"words"`
}

type alignedChapter struct {
	DocTokens      []string `json:"docTokens"`
	DocWords       []string `json:"docWords"`
	TokenParagraph []int    `json:"tokenParagraph"`
	ParagraphIDs   []string `json:"paragraphIds"`
	AudioTokens    []string `json:"audioTokens"`
	Opcodes        [][5]any `json:"opcodes"`
}

func (r request) params() recordingcoverage.AlignmentParams {
	params := recordingcoverage.DefaultParams
	if r.MaxMisreadRun != nil {
		params.MaxMisreadRun = *r.MaxMisreadRun
	}
	if r.MinAnchorRun != nil {
		params.MinAnchorRun = *r.MinAnchorRun
	}
	return params
}

func main() {
	if err := serve(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func serve(in io.Reader, out io.Writer) error {
	scanner := bufio.NewScanner(in)
	scanner.Buffer(make([]byte, 1<<20), 1<<30)
	writer := bufio.NewWriter(out)
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	for scanner.Scan() {
		var req request
		var reply any
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			reply = map[string]string{"error": "malformed request: " + err.Error()}
		} else if result, err := handle(req); err != nil {
			reply = map[string]string{"error": err.Error()}
		} else {
			reply = result
		}
		if err := encoder.Encode(reply); err != nil {
			return err
		}
		if err := writer.Flush(); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func handle(req request) (any, error) {
	switch req.Op {
	case "results":
		err := recordingcoverage.Run(recordingcoverage.Request{
			ManifestPath: req.Manifest, WordsDir: req.WordsDir, ManuscriptPath: req.Manuscript, ChapterID: req.ChapterID,
			Out: req.Out, WordsReport: req.WordsReport, Model: req.Model, CheckedBy: req.CheckedBy, Language: req.Language, Params: req.params(),
		})
		if err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case "align":
		return align(req)
	case "coverage":
		return coverage(req)
	case "measure":
		return measure(req)
	case "span":
		span, err := takedivergence.BuildSpan(compare.NewTokenizer(req.Equivalences), req.Paragraphs, req.FirstUnit, req.LastUnit)
		if err != nil {
			return nil, err
		}
		return spanJSON(span), nil
	case "alignTake":
		return alignTake(req)
	case "matchChapter":
		match := chaptermatch.MatchTitleWith(compare.NewTokenizer(req.Equivalences), req.Titles, req.Track)
		return map[string]any{"index": match.Index, "score": match.Score}, nil
	case "compareRun":
		markers, err := comparerun.Run(comparerun.Request{ManuscriptPath: req.Manuscript, ChapterID: req.ChapterID, Score: req.Score, WordsReport: req.WordsReport, Out: req.Out, DiffOut: req.DiffOut})
		if err != nil {
			return nil, err
		}
		return map[string]int{"markers": markers}, nil
	case "findRepeats":
		return findRepeats(req)
	case "tokenize":
		return map[string][]string{"tokens": compare.NewTokenizer(req.Equivalences).Tokenize(req.Text)}, nil
	case "fuseHyphenSplits":
		return fuseHyphenSplits(req)
	default:
		return nil, fmt.Errorf("unknown op %q", req.Op)
	}
}

func align(req request) (any, error) {
	if len(req.Paragraphs) != len(req.ParagraphIDs) {
		return nil, errors.New("paragraphs and paragraphIds must be the same length")
	}
	words, err := parseWords(req.Words)
	if err != nil {
		return nil, err
	}
	tokenizer := compare.NewTokenizer(req.Equivalences)
	units := tokenizer.BuildChapterUnits(req.Heading, req.Paragraphs)
	alignment := tokenizer.Align(units, words)
	aligned := recordingcoverage.AlignedFromAlignment(alignment, units.Sentences, req.ParagraphIDs)
	opcodes := make([][5]any, len(aligned.Opcodes))
	for k, op := range aligned.Opcodes {
		opcodes[k] = [5]any{op.Tag, op.I1, op.I2, op.J1, op.J2}
	}
	return map[string]any{
		"aligned": alignedChapter{
			DocTokens: aligned.DocTokens, DocWords: aligned.DocWords, TokenParagraph: aligned.TokenParagraph,
			ParagraphIDs: aligned.ParagraphIDs, AudioTokens: aligned.AudioTokens, Opcodes: opcodes,
		},
		"indexMap": alignment.IndexMap, "chapterIndexMap": alignment.ChapterIndexMap, "unitIdx": alignment.UnitIdx,
	}, nil
}

func parseWords(raw [][3]any) ([]compare.Word, error) {
	words := make([]compare.Word, len(raw))
	for k, word := range raw {
		text, ok1 := word[0].(string)
		start, ok2 := word[1].(float64)
		end, ok3 := word[2].(float64)
		if !ok1 || !ok2 || !ok3 {
			return nil, fmt.Errorf("word %d is not [text, start, end]", k)
		}
		words[k] = compare.Word{Text: text, Start: start, End: end}
	}
	return words, nil
}

func measure(req request) (any, error) {
	groups, _, err := recordingcoverage.ProjectEquivalences(req.Manuscript)
	if err != nil {
		return nil, err
	}
	chapter, err := recordingcoverage.LoadChapter(req.Manuscript, req.ChapterID)
	if err != nil {
		return nil, err
	}
	items := make([]recordingcoverage.ItemResult, len(req.Items))
	for k, raw := range req.Items {
		item := recordingcoverage.ManifestItem{Index: raw.Index, ItemGUID: raw.ItemGUID, StartOffset: raw.StartOffset, Length: raw.Length, Muted: raw.Muted}
		items[k].Item = item
		if raw.Muted {
			continue
		}
		words, err := parseWords(raw.Words)
		if err != nil {
			return nil, fmt.Errorf("item %d: %w", raw.Index, err)
		}
		items[k].Source = recordingcoverage.SourceReused
		items[k].Words = &recordingcoverage.ItemWords{Words: words, SourceStart: item.StartOffset, SourceEnd: item.End()}
	}
	m, err := recordingcoverage.Measure(recordingcoverage.Input{Chapter: chapter, Items: items, Params: req.params(), Tokenizer: compare.NewTokenizer(groups)})
	if err != nil {
		return nil, err
	}
	reply := coverageReply(m.Coverage, &m.Aligned, req.params())
	regions := reply["coverage"].(map[string]any)["regions"].([]map[string]any)
	for k, region := range m.Coverage.Regions {
		regions[k]["position"] = m.RegionPosition(region)
	}
	opcodes := make([][5]any, len(m.Alignment.Opcodes))
	for k, op := range m.Alignment.Opcodes {
		opcodes[k] = [5]any{op.Tag, op.I1, op.I2, op.J1, op.J2}
	}
	reply["opcodes"], reply["indexMap"] = opcodes, m.Alignment.IndexMap
	return reply, nil
}

func (a *alignedChapter) chapter() (*recordingcoverage.AlignedChapter, error) {
	opcodes := make([]recordingcoverage.Opcode, len(a.Opcodes))
	for k, raw := range a.Opcodes {
		op, err := opcode(raw)
		if err != nil {
			return nil, fmt.Errorf("opcode %d: %w", k, err)
		}
		opcodes[k] = recordingcoverage.Opcode{Tag: op.Tag, I1: op.I1, I2: op.I2, J1: op.J1, J2: op.J2}
	}
	chapter := &recordingcoverage.AlignedChapter{
		DocTokens: a.DocTokens, DocWords: a.DocWords, TokenParagraph: a.TokenParagraph,
		ParagraphIDs: a.ParagraphIDs, AudioTokens: a.AudioTokens, Opcodes: opcodes,
	}
	return chapter, chapter.Validate()
}

func coverage(req request) (any, error) {
	if req.Aligned == nil {
		return nil, errors.New("coverage needs an aligned chapter")
	}
	params := req.params()
	if err := params.Validate(); err != nil {
		return nil, err
	}
	chapter, err := req.Aligned.chapter()
	if err != nil {
		return nil, err
	}
	return coverageReply(chapter.ComputeCoverage(params), chapter, params), nil
}

func coverageReply(result recordingcoverage.ChapterCoverage, chapter *recordingcoverage.AlignedChapter, params recordingcoverage.AlignmentParams) map[string]any {
	paragraphs := make([]map[string]any, len(result.Paragraphs))
	for k, p := range result.Paragraphs {
		paragraphs[k] = map[string]any{"id": p.ID, "tokens": p.Tokens, "present": p.Present, "longestMissingRun": p.LongestMissingRun}
	}
	regions := make([]map[string]any, len(result.Regions))
	for k, r := range result.Regions {
		regions[k] = map[string]any{
			"kind": r.Kind, "paragraphIds": r.ParagraphIDs, "tokenCount": r.TokenCount, "firstWord": r.FirstWord, "lastWord": r.LastWord,
			"docStart": r.DocStart, "docEnd": r.DocEnd, "audioIndex": r.AudioIndex, "audioBefore": r.AudioBefore, "audioAfter": r.AudioAfter,
		}
	}
	tokens, extras := chapter.AlignTokens(params)
	statuses := make([]map[string]any, len(tokens))
	for k, token := range tokens {
		statuses[k] = map[string]any{"status": token.Status, "audio": token.Audio}
	}
	return map[string]any{
		"coverage": map[string]any{
			"bodyTokens": result.BodyTokens, "presentTokens": result.PresentTokens, "missingTokens": result.MissingTokens(),
			"extraTokens": result.ExtraTokens, "longestMissingRun": result.LongestMissingRun, "paragraphs": paragraphs, "regions": regions,
		},
		"tokens": statuses, "extras": extras, "repeats": chapter.Repeats(tokens, extras),
	}
}

func spanJSON(span takedivergence.Span) map[string]any {
	words := make([]map[string]any, len(span.Words))
	for k, w := range span.Words {
		words[k] = map[string]any{"index": w.Index, "text": w.Text, "unit": w.Unit, "paragraph": w.Paragraph, "tokens": w.Tokens}
	}
	return map[string]any{
		"firstUnit": span.FirstUnit, "lastUnit": span.LastUnit,
		"firstParagraph": span.FirstParagraph, "lastParagraph": span.LastParagraph, "words": words,
	}
}

func alignTake(req request) (any, error) {
	tokenizer := compare.NewTokenizer(req.Equivalences)
	span, err := takedivergence.BuildSpan(tokenizer, req.Paragraphs, req.FirstUnit, req.LastUnit)
	if err != nil {
		return nil, err
	}
	words, err := parseWords(req.Words)
	if err != nil {
		return nil, err
	}
	alignment := takedivergence.AlignTake(tokenizer, span, words)
	results := make([]map[string]any, len(alignment.Words))
	for k, w := range alignment.Words {
		results[k] = map[string]any{"index": w.Index, "status": w.Status, "start": w.Start, "end": w.End}
	}
	divergences := make([]map[string]any, len(alignment.Divergences))
	for k, d := range alignment.Divergences {
		divergences[k] = map[string]any{
			"kind": d.Kind, "position": d.Position, "firstWord": d.FirstWord, "lastWord": d.LastWord,
			"manuscriptText": d.ManuscriptText, "audioText": d.AudioText, "start": d.Start, "end": d.End,
		}
	}
	return map[string]any{"words": results, "divergences": divergences, "extraWords": alignment.ExtraWords}, nil
}

// findRepeats scans as the host's take review does once the sidecar has heard each read: the chapter chosen from the
// track name or title (a NEED_CHAPTER line when none is), then the reads grouped.
func findRepeats(req request) (any, error) {
	tokenizer, chapters, err := comparerun.LoadChapters(req.Manuscript)
	if err != nil {
		return nil, err
	}
	chapter, _, err := comparerun.Choose(tokenizer, chapters, req.Track, req.ChapterTitle)
	var need comparerun.NeedChapter
	if errors.As(err, &need) {
		return map[string]string{"output": comparerun.NeedChapterLine(need)}, nil
	}
	if err != nil {
		return nil, err
	}
	reads, err := comparerun.ReadRepeatManifest(req.Manifest)
	if err != nil {
		return nil, err
	}
	if len(req.Heard) != len(reads) {
		return nil, fmt.Errorf("%d reads heard of %d", len(req.Heard), len(reads))
	}
	heard := make([][]compare.Word, len(reads))
	for k, words := range req.Heard {
		if heard[k], err = parseWords(words); err != nil {
			return nil, err
		}
	}
	return map[string]string{"output": comparerun.FindRepeats(tokenizer, chapter, reads, heard, req.MinWords, req.MinSpanOverlap)}, nil
}

// fuseHyphenSplits fuses the hyphen splits of opcodes over doc and audio, for an aligner other than SequenceMatcher.
func fuseHyphenSplits(req request) (any, error) {
	opcodes := make([]compare.Opcode, len(req.Opcodes))
	for k, raw := range req.Opcodes {
		op, err := opcode(raw)
		if err != nil {
			return nil, fmt.Errorf("opcode %d: %w", k, err)
		}
		opcodes[k] = op
	}
	fused := [][5]any{}
	for _, op := range compare.FuseHyphenSplits(opcodes, req.Doc, req.Audio) {
		fused = append(fused, [5]any{op.Tag, op.I1, op.I2, op.J1, op.J2})
	}
	return map[string]any{"opcodes": fused}, nil
}

// opcode reads one [tag, i1, i2, j1, j2] opcode from JSON.
func opcode(raw [5]any) (compare.Opcode, error) {
	tag, ok := raw[0].(string)
	numbers := [4]int{}
	for n := range numbers {
		value, isNumber := raw[n+1].(float64)
		if !isNumber || value != float64(int(value)) {
			ok = false
			break
		}
		numbers[n] = int(value)
	}
	if !ok {
		return compare.Opcode{}, errors.New("not [tag, i1, i2, j1, j2]")
	}
	return compare.Opcode{Tag: tag, I1: numbers[0], I2: numbers[1], J1: numbers[2], J2: numbers[3]}, nil
}
