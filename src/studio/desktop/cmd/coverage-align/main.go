// Command coverage-align serves the host's recording-coverage alignment
// (internal/recordingcoverage) to the Python test tooling of the
// transcript-compare sidecar: its coverage harness, calibration and alignment
// spike (src/studio/sidecars/transcript-compare/tests/go_coverage.py), so they
// measure what the app ships. It is a development tool and is not packaged.
//
// It reads one JSON request per line on standard input and writes one JSON
// reply per line on standard output:
//
//	{"op": "results", ...}  a run's results file, as the host writes it (Request's fields)
//	{"op": "align", ...}    a chapter aligned to transcript words: the AlignedChapter and its maps
//	{"op": "coverage", ...} coverage, token statuses, extra runs and repeats of an AlignedChapter
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

	"desktop/internal/compare"
	"desktop/internal/recordingcoverage"
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
}

type alignedChapter struct {
	DocTokens      []string `json:"docTokens"`
	DocWords       []string `json:"docWords"`
	TokenParagraph []int    `json:"tokenParagraph"`
	ParagraphIDs   []string `json:"paragraphIds"`
	AudioTokens    []string `json:"audioTokens"`
	Opcodes        [][5]any `json:"opcodes"`
	parsed         []recordingcoverage.Opcode
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
	default:
		return nil, fmt.Errorf("unknown op %q", req.Op)
	}
}

func align(req request) (any, error) {
	if len(req.Paragraphs) != len(req.ParagraphIDs) {
		return nil, errors.New("paragraphs and paragraphIds must be the same length")
	}
	words := make([]compare.Word, len(req.Words))
	for k, raw := range req.Words {
		text, ok1 := raw[0].(string)
		start, ok2 := raw[1].(float64)
		end, ok3 := raw[2].(float64)
		if !ok1 || !ok2 || !ok3 {
			return nil, fmt.Errorf("word %d is not [text, start, end]", k)
		}
		words[k] = compare.Word{Text: text, Start: start, End: end}
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

func (a *alignedChapter) chapter() (*recordingcoverage.AlignedChapter, error) {
	opcodes := make([]recordingcoverage.Opcode, len(a.Opcodes))
	for k, raw := range a.Opcodes {
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
			return nil, fmt.Errorf("opcode %d is not [tag, i1, i2, j1, j2]", k)
		}
		opcodes[k] = recordingcoverage.Opcode{Tag: tag, I1: numbers[0], I2: numbers[1], J1: numbers[2], J2: numbers[3]}
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
	result := chapter.ComputeCoverage(params)
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
	}, nil
}
