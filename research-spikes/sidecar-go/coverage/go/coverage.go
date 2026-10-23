// Port of sidecars/transcript-compare/core/recording_coverage.py.
package main

import (
	"fmt"
)

const heading = -1

const (
	statusNone    = ""
	statusPresent = "present"
	readStatus    = "read"
	misreadStatus = "misread"
	headingStatus = "heading"
)

var opcodeTags = map[string]bool{"equal": true, "replace": true, "delete": true, "insert": true}

type Opcode struct {
	Tag            string
	I1, I2, J1, J2 int
}

type AlignmentParams struct {
	MaxMisreadRun int
	MinAnchorRun  int
}

func (p AlignmentParams) validate() error {
	if p.MaxMisreadRun < 0 {
		return fmt.Errorf("max_misread_run must be a whole number of tokens, 0 or more")
	}
	if p.MinAnchorRun < 1 {
		return fmt.Errorf("min_anchor_run must be a whole number of tokens, 1 or more")
	}
	return nil
}

type Thresholds struct {
	MinParagraphPresent float64
	MaxMissingRun       int
}

type AlignedChapter struct {
	DocTokens      []string
	DocWords       []string
	TokenParagraph []int
	ParagraphIDs   []string
	AudioTokens    []string
	Opcodes        []Opcode
}

func (a *AlignedChapter) validate() error {
	count := len(a.DocTokens)
	if len(a.DocWords) != count || len(a.TokenParagraph) != count {
		return fmt.Errorf("doc_tokens, doc_words and token_paragraph must be the same length")
	}
	for _, index := range a.TokenParagraph {
		if index != heading && !(0 <= index && index < len(a.ParagraphIDs)) {
			return fmt.Errorf("token_paragraph must index paragraph_ids, or be HEADING")
		}
	}
	i, j := 0, 0
	for _, op := range a.Opcodes {
		if !opcodeTags[op.Tag] || op.I1 != i || op.J1 != j || op.I2 < op.I1 || op.J2 < op.J1 {
			return fmt.Errorf("opcode %v does not continue the alignment at (%d, %d)", op, i, j)
		}
		if op.Tag == "equal" && (op.I2 == op.I1 || op.J2 == op.J1) {
			return fmt.Errorf("equal opcode %v has an empty side", op)
		}
		i, j = op.I2, op.J2
	}
	if i != count || j != len(a.AudioTokens) {
		return fmt.Errorf("opcodes end at (%d, %d), not at the ends of the sequences (%d, %d)", i, j, count, len(a.AudioTokens))
	}
	return nil
}

type Region struct {
	Kind         string
	ParagraphIDs []string
	TokenCount   int
	FirstWord    string
	LastWord     string
	DocStart     int
	DocEnd       int
	AudioIndex   int
	AudioBefore  *int
	AudioAfter   *int
}

type ParagraphCoverage struct {
	ID                string
	Tokens            int
	Present           int
	LongestMissingRun int
}

func (p ParagraphCoverage) PresentFraction() float64 {
	if p.Tokens == 0 {
		return 1.0
	}
	return float64(p.Present) / float64(p.Tokens)
}

func (p ParagraphCoverage) Passes(t Thresholds) bool {
	return p.PresentFraction() >= t.MinParagraphPresent && p.LongestMissingRun <= t.MaxMissingRun
}

type ChapterCoverage struct {
	Params            AlignmentParams
	BodyTokens        int
	PresentTokens     int
	ExtraTokens       int
	LongestMissingRun int
	Paragraphs        []ParagraphCoverage
	Regions           []Region
}

func (c *ChapterCoverage) MissingTokens() int { return c.BodyTokens - c.PresentTokens }

func (c *ChapterCoverage) PresentFraction() float64 {
	if c.BodyTokens == 0 {
		return 1.0
	}
	return float64(c.PresentTokens) / float64(c.BodyTokens)
}

func (c *ChapterCoverage) TextComplete(t Thresholds) bool {
	if c.LongestMissingRun > t.MaxMissingRun {
		return false
	}
	for _, p := range c.Paragraphs {
		if !p.Passes(t) {
			return false
		}
	}
	return true
}

type span struct{ i1, i2, j1, j2 int }

type segment struct {
	anchor bool
	gap    span
}

func isChanceMatch(opcodes []Opcode, index, minAnchorRun int) bool {
	op := opcodes[index]
	if op.Tag != "equal" || op.I2-op.I1 >= minAnchorRun || index == 0 || index == len(opcodes)-1 {
		return false
	}
	return opcodes[index-1].Tag != "equal" && opcodes[index+1].Tag != "equal"
}

func segments(opcodes []Opcode, minAnchorRun int) []segment {
	out := make([]segment, 0, len(opcodes))
	for index, op := range opcodes {
		if op.Tag == "equal" && !isChanceMatch(opcodes, index, minAnchorRun) {
			out = append(out, segment{true, span{op.I1, op.I2, op.J1, op.J2}})
		} else if len(out) > 0 && !out[len(out)-1].anchor {
			prev := out[len(out)-1].gap
			out[len(out)-1] = segment{false, span{prev.i1, op.I2, prev.j1, op.J2}}
		} else {
			out = append(out, segment{false, span{op.I1, op.I2, op.J1, op.J2}})
		}
	}
	return out
}

// ngramKey joins n tokens with NUL, which TOKEN_RE never produces, standing in for Python's tuple key.
func ngramKey(tokens []string) string {
	size := len(tokens)
	for _, t := range tokens {
		size += len(t)
	}
	b := make([]byte, 0, size)
	for k, t := range tokens {
		if k > 0 {
			b = append(b, 0)
		}
		b = append(b, t...)
	}
	return string(b)
}

func isReread(audio []string, docNgrams map[string]struct{}, n int) bool {
	if len(audio) < n {
		return false
	}
	covered := make([]bool, len(audio))
	for start := 0; start+n <= len(audio); start++ {
		if _, ok := docNgrams[ngramKey(audio[start:start+n])]; ok {
			for k := start; k < start+n; k++ {
				covered[k] = true
			}
		}
	}
	sum := 0
	for _, c := range covered {
		if c {
			sum++
		}
	}
	// Python: sum(covered) >= 0.5 * len(audio), exact in float64 for any realistic length.
	return float64(sum) >= 0.5*float64(len(audio))
}

type tokenStatus struct {
	index  int
	status string
}

func bodyTokens(a *AlignedChapter, i1, i2 int) []int {
	body := []int{}
	for i := i1; i < i2; i++ {
		if a.TokenParagraph[i] != heading {
			body = append(body, i)
		}
	}
	return body
}

func gapStatuses(a *AlignedChapter, gap span, params AlignmentParams, docNgrams map[string]struct{}) ([]tokenStatus, int) {
	body := bodyTokens(a, gap.i1, gap.i2)
	said := gap.j2 - gap.j1
	if len(body) == 0 {
		return nil, min(gap.i2-gap.i1, said)
	}
	out := make([]tokenStatus, len(body))
	if said == 0 {
		for n, i := range body {
			out[n] = tokenStatus{i, "skip"}
		}
		return out, 0
	}
	if len(body) <= params.MaxMisreadRun {
		read := min(len(body), said)
		for n, i := range body {
			if n < read {
				out[n] = tokenStatus{i, statusPresent}
			} else {
				out[n] = tokenStatus{i, "short_read"}
			}
		}
		return out, min(gap.i2-gap.i1, said)
	}
	kind := "different_text"
	if isReread(a.AudioTokens[gap.j1:gap.j2], docNgrams, params.MinAnchorRun) {
		kind = "skip"
	}
	for n, i := range body {
		out[n] = tokenStatus{i, kind}
	}
	return out, 0
}

func statuses(a *AlignedChapter, params AlignmentParams, segs []segment) ([]string, []int, int) {
	n := params.MinAnchorRun
	tokens := a.DocTokens
	docNgrams := map[string]struct{}{}
	for k := 0; k+n <= len(tokens); k++ {
		docNgrams[ngramKey(tokens[k:k+n])] = struct{}{}
	}
	status := make([]string, len(tokens))
	audioAt := make([]int, len(tokens))
	matched := 0
	for _, seg := range segs {
		gap := seg.gap
		var gs []tokenStatus
		if seg.anchor {
			for i := gap.i1; i < gap.i2; i++ {
				if a.TokenParagraph[i] != heading {
					gs = append(gs, tokenStatus{i, statusPresent})
				}
			}
			matched += gap.j2 - gap.j1
		} else {
			var accounted int
			gs, accounted = gapStatuses(a, gap, params, docNgrams)
			matched += accounted
		}
		for _, ts := range gs {
			status[ts.index] = ts.status
			audioAt[ts.index] = gap.j1
		}
	}
	return markHeadAndTail(status), audioAt, matched
}

func markHeadAndTail(status []string) []string {
	first, last := len(status), len(status)
	found := false
	for i, v := range status {
		if v == statusPresent {
			if !found {
				first, found = i, true
			}
			last = i
		}
	}
	out := make([]string, len(status))
	for i, v := range status {
		switch {
		case v == statusNone || v == statusPresent:
			out[i] = v
		case i < first:
			out[i] = "head"
		case i > last:
			out[i] = "tail"
		default:
			out[i] = v
		}
	}
	return out
}

func missingRuns(status []string) [][2]int {
	runs := [][2]int{}
	start := -1
	for i, v := range status {
		if v == statusNone {
			continue
		}
		if v != statusPresent && start < 0 {
			start = i
		} else if v == statusPresent && start >= 0 {
			runs = append(runs, [2]int{start, i})
			start = -1
		}
	}
	if start >= 0 {
		runs = append(runs, [2]int{start, len(status)})
	}
	return runs
}

func runLength(status []string, start, end int) int {
	n := 0
	for _, v := range status[start:end] {
		if v != statusNone {
			n++
		}
	}
	return n
}

func bodyAnchors(a *AlignedChapter, segs []segment) []span {
	out := []span{}
	for _, seg := range segs {
		if !seg.anchor {
			continue
		}
		for i := seg.gap.i1; i < seg.gap.i2; i++ {
			if a.TokenParagraph[i] != heading {
				out = append(out, seg.gap)
				break
			}
		}
	}
	return out
}

func bounds(anchors []span, docStart, docEnd int) (*int, *int) {
	var before, after *int
	for k := len(anchors) - 1; k >= 0; k-- {
		if anchors[k].i2 <= docStart {
			v := anchors[k].j2 - 1
			before = &v
			break
		}
	}
	for _, an := range anchors {
		if an.i1 >= docEnd {
			v := an.j1
			after = &v
			break
		}
	}
	return before, after
}

func region(a *AlignedChapter, status []string, audioAt []int, anchors []span, start, end int) Region {
	tokens := []int{}
	for i := start; i < end; i++ {
		if status[i] != statusNone {
			tokens = append(tokens, i)
		}
	}
	kind := status[tokens[0]]
	ids := []string{}
	seen := map[string]bool{}
	for _, i := range tokens {
		id := a.ParagraphIDs[a.TokenParagraph[i]]
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	audioIndex := audioAt[tokens[0]]
	if kind == "head" {
		audioIndex = 0
	} else if kind == "tail" {
		audioIndex = len(a.AudioTokens)
	}
	first, last := tokens[0], tokens[len(tokens)-1]
	before, after := bounds(anchors, first, last+1)
	return Region{kind, ids, len(tokens), a.DocWords[first], a.DocWords[last], first, last + 1, audioIndex, before, after}
}

func paragraphs(a *AlignedChapter, status []string, runs [][2]int) []ParagraphCoverage {
	np := len(a.ParagraphIDs)
	tokens, present, longest := make([]int, np), make([]int, np), make([]int, np)
	for i, v := range status {
		if v == statusNone {
			continue
		}
		p := a.TokenParagraph[i]
		tokens[p]++
		if v == statusPresent {
			present[p]++
		}
	}
	for _, r := range runs {
		length := runLength(status, r[0], r[1])
		for i := r[0]; i < r[1]; i++ {
			if status[i] != statusNone {
				p := a.TokenParagraph[i]
				longest[p] = max(longest[p], length)
			}
		}
	}
	out := make([]ParagraphCoverage, np)
	for k, id := range a.ParagraphIDs {
		out[k] = ParagraphCoverage{id, tokens[k], present[k], longest[k]}
	}
	return out
}

type AlignedToken struct {
	Status string
	Audio  *int
}

// gapAudio returns, in order, (doc index, transcript index) pairs.
func gapAudio(a *AlignedChapter, gap span, params AlignmentParams) [][2]int {
	said := gap.j2 - gap.j1
	body := bodyTokens(a, gap.i1, gap.i2)
	out := [][2]int{}
	if len(body) == 0 {
		for n, i := 0, gap.i1; i < gap.i2; n, i = n+1, i+1 {
			if n < said {
				out = append(out, [2]int{i, gap.j1 + n})
			}
		}
		return out
	}
	if len(body) > params.MaxMisreadRun {
		return out
	}
	for n, i := range body {
		if n < said {
			out = append(out, [2]int{i, gap.j1 + n})
		}
	}
	return out
}

func AlignTokens(a *AlignedChapter, params AlignmentParams) ([]AlignedToken, [][2]int) {
	segs := segments(a.Opcodes, params.MinAnchorRun)
	status, _, _ := statuses(a, params, segs)
	heard := make([]int, len(a.DocTokens))
	for i := range heard {
		heard[i] = -1
	}
	used := make([]bool, len(a.AudioTokens))
	inAnchor := make([]bool, len(a.DocTokens))
	for _, seg := range segs {
		gap := seg.gap
		if seg.anchor {
			said := gap.j2 - gap.j1
			for n, i := 0, gap.i1; i < gap.i2; n, i = n+1, i+1 {
				heard[i] = gap.j1 + min(n, said-1)
				inAnchor[i] = true
			}
			for j := gap.j1; j < gap.j2; j++ {
				used[j] = true
			}
		} else {
			for _, pair := range gapAudio(a, gap, params) {
				heard[pair[0]] = pair[1]
				used[pair[1]] = true
			}
		}
	}
	tokens := make([]AlignedToken, len(status))
	for i, v := range status {
		var audio *int
		if heard[i] >= 0 {
			h := heard[i]
			audio = &h
		}
		switch {
		case v == statusNone:
			tokens[i] = AlignedToken{headingStatus, audio}
		case v == statusPresent:
			misread := !inAnchor[i] && audio != nil && a.AudioTokens[*audio] != a.DocTokens[i]
			if misread {
				tokens[i] = AlignedToken{misreadStatus, audio}
			} else {
				tokens[i] = AlignedToken{readStatus, audio}
			}
		default:
			tokens[i] = AlignedToken{v, nil}
		}
	}
	extras := [][2]int{}
	start := -1
	for j := 0; j <= len(used); j++ {
		taken := j == len(used) || used[j]
		if !taken && start < 0 {
			start = j
		} else if taken && start >= 0 {
			extras = append(extras, [2]int{start, j})
			start = -1
		}
	}
	return tokens, extras
}

func ComputeCoverage(a *AlignedChapter, params AlignmentParams) ChapterCoverage {
	segs := segments(a.Opcodes, params.MinAnchorRun)
	status, audioAt, matched := statuses(a, params, segs)
	runs := missingRuns(status)
	paras := paragraphs(a, status, runs)
	anchors := bodyAnchors(a, segs)
	c := ChapterCoverage{Params: params, Paragraphs: paras, ExtraTokens: len(a.AudioTokens) - matched}
	for _, p := range paras {
		c.BodyTokens += p.Tokens
		c.PresentTokens += p.Present
	}
	for _, r := range runs {
		c.LongestMissingRun = max(c.LongestMissingRun, runLength(status, r[0], r[1]))
		c.Regions = append(c.Regions, region(a, status, audioAt, anchors, r[0], r[1]))
	}
	return c
}
