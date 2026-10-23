// Driver: reads inputs.jsonl (from py/capture.py), writes Python-identical result lines.
//
//	coverage -mode core   -in inputs.jsonl -out go.out          AlignedChapter from the record
//	coverage -mode full   -in inputs.jsonl -out gofull.out -opcodes opcodes.go.out -aligned aligned.go.out
//	                                                            AlignedChapter from chapter text + transcript words
//	-repeat N runs the compute N times (output written once); in-process compute time to stderr.
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"
)

type record struct {
	Case   string `json:"case"`
	Params struct {
		MaxMisreadRun int `json:"max_misread_run"`
		MinAnchorRun  int `json:"min_anchor_run"`
	} `json:"params"`
	Chapter struct {
		Heading      string   `json:"heading"`
		Paragraphs   []string `json:"paragraphs"`
		ParagraphIDs []string `json:"paragraph_ids"`
	} `json:"chapter"`
	Words   [][3]json.RawMessage `json:"words"`
	Aligned struct {
		DocTokens      []string `json:"doc_tokens"`
		DocWords       []string `json:"doc_words"`
		TokenParagraph []int    `json:"token_paragraph"`
		ParagraphIDs   []string `json:"paragraph_ids"`
		AudioTokens    []string `json:"audio_tokens"`
		Opcodes        [][5]any `json:"opcodes"`
	} `json:"aligned"`
}

var shipped = Thresholds{0.8, 3}

func ints(xs []int) []any {
	out := make([]any, len(xs))
	for k, x := range xs {
		out[k] = x
	}
	return out
}

func strs(xs []string) []any {
	out := make([]any, len(xs))
	for k, x := range xs {
		out[k] = x
	}
	return out
}

func opcodesJSON(ops []Opcode) []any {
	out := make([]any, len(ops))
	for k, o := range ops {
		out[k] = []any{o.Tag, o.I1, o.I2, o.J1, o.J2}
	}
	return out
}

func resultJSON(id string, c ChapterCoverage, tokens []AlignedToken, extras [][2]int) obj {
	paras := make([]any, len(c.Paragraphs))
	for k, p := range c.Paragraphs {
		paras[k] = obj{"id": p.ID, "tokens": p.Tokens, "present": p.Present, "longest_missing_run": p.LongestMissingRun,
			"present_fraction": p.PresentFraction(), "passes": p.Passes(shipped)}
	}
	regions := make([]any, len(c.Regions))
	for k, r := range c.Regions {
		regions[k] = obj{"kind": r.Kind, "paragraph_ids": strs(r.ParagraphIDs), "token_count": r.TokenCount, "first_word": r.FirstWord,
			"last_word": r.LastWord, "doc_start": r.DocStart, "doc_end": r.DocEnd, "audio_index": r.AudioIndex,
			"audio_before": r.AudioBefore, "audio_after": r.AudioAfter}
	}
	toks := make([]any, len(tokens))
	for k, t := range tokens {
		toks[k] = []any{t.Status, t.Audio}
	}
	ex := make([]any, len(extras))
	for k, e := range extras {
		ex[k] = []any{e[0], e[1]}
	}
	return obj{"case": id, "tokens": toks, "extras": ex, "coverage": obj{
		"params":      obj{"max_misread_run": c.Params.MaxMisreadRun, "min_anchor_run": c.Params.MinAnchorRun},
		"body_tokens": c.BodyTokens, "present_tokens": c.PresentTokens, "extra_tokens": c.ExtraTokens,
		"longest_missing_run": c.LongestMissingRun, "paragraphs": paras, "regions": regions,
		"missing_tokens": c.MissingTokens(), "present_fraction": c.PresentFraction(), "text_complete": c.TextComplete(shipped),
	}}
}

func fromRecord(r *record) *AlignedChapter {
	a := &AlignedChapter{DocTokens: r.Aligned.DocTokens, DocWords: r.Aligned.DocWords, TokenParagraph: r.Aligned.TokenParagraph,
		ParagraphIDs: r.Aligned.ParagraphIDs, AudioTokens: r.Aligned.AudioTokens}
	for _, o := range r.Aligned.Opcodes {
		a.Opcodes = append(a.Opcodes, Opcode{o[0].(string), int(o[1].(float64)), int(o[2].(float64)), int(o[3].(float64)), int(o[4].(float64))})
	}
	return a
}

func wordTexts(r *record) []string {
	out := make([]string, len(r.Words))
	for k, w := range r.Words {
		if err := json.Unmarshal(w[0], &out[k]); err != nil {
			panic(err)
		}
	}
	return out
}

func writeLines(path string, lines []obj) {
	f, err := os.Create(path)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	for _, l := range lines {
		var sb strings.Builder
		pyDump(&sb, l)
		w.WriteString(sb.String())
		w.WriteByte('\n')
	}
	w.Flush()
}

func main() {
	mode := flag.String("mode", "core", "core or full")
	in := flag.String("in", "inputs.jsonl", "")
	out := flag.String("out", "", "")
	opOut := flag.String("opcodes", "", "")
	alOut := flag.String("aligned", "", "")
	repeat := flag.Int("repeat", 1, "")
	check := flag.String("selfcheck", "", "floats, spaces or text")
	flag.Parse()
	if *check != "" {
		selfcheck(*check)
		return
	}

	f, err := os.Open(*in)
	if err != nil {
		panic(err)
	}
	records := []*record{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<30)
	for sc.Scan() {
		r := &record{}
		if err := json.Unmarshal(sc.Bytes(), r); err != nil {
			panic(err)
		}
		records = append(records, r)
	}
	f.Close()
	texts := make([][]string, len(records))
	if *mode == "full" {
		for k, r := range records {
			texts[k] = wordTexts(r)
		}
	}

	var results, opLines, alLines []obj
	started := time.Now()
	for rep := 0; rep < *repeat; rep++ {
		results, opLines, alLines = results[:0], opLines[:0], alLines[:0]
		for k, r := range records {
			params := AlignmentParams{r.Params.MaxMisreadRun, r.Params.MinAnchorRun}
			if err := params.validate(); err != nil {
				panic(err)
			}
			var a *AlignedChapter
			if *mode == "full" {
				a = alignChapter(r.Chapter.Heading, r.Chapter.Paragraphs, r.Chapter.ParagraphIDs, texts[k])
			} else {
				a = fromRecord(r)
			}
			if err := a.validate(); err != nil {
				panic(err)
			}
			c := ComputeCoverage(a, params)
			tokens, extras := AlignTokens(a, params)
			if rep == 0 {
				results = append(results, resultJSON(r.Case, c, tokens, extras))
				if *mode == "full" {
					opLines = append(opLines, obj{"case": r.Case, "opcodes": opcodesJSON(a.Opcodes)})
					alLines = append(alLines, obj{"case": r.Case, "doc_tokens": strs(a.DocTokens), "doc_words": strs(a.DocWords),
						"token_paragraph": ints(a.TokenParagraph), "paragraph_ids": strs(a.ParagraphIDs), "audio_tokens": strs(a.AudioTokens), "opcodes": opcodesJSON(a.Opcodes)})
				}
			}
		}
	}
	elapsed := time.Since(started)
	fmt.Fprintf(os.Stderr, "go %s: %d records x %d repeat, compute %.3f ms\n", *mode, len(records), *repeat, float64(elapsed.Microseconds())/1000)
	if *out != "" {
		writeLines(*out, results)
	}
	if *opOut != "" {
		writeLines(*opOut, opLines)
	}
	if *alOut != "" {
		writeLines(*alOut, alLines)
	}
}
