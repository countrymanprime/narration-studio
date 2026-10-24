// Package recordingcoverage measures how much of a chapter's body text a
// recording contains, in order (docs/utilities/recording-coverage.md, "What
// counts as read"), and writes the recording check's results lines. It is the
// Go port of the sidecar's recording_coverage.py and of the alignment and
// report half of coverage_mode.py: the sidecar transcribes items into words
// files, and the host aligns the chapter to them here. The results it writes
// are held byte for byte to the ones the Python wrote
// (src/studio/sidecars/transcript-compare/tests/fixtures/coverage/results.golden.json).
//
// The rules, as that page states them:
//
//   - Anchors. An equal block of at least MinAnchorRun tokens is read text. A
//     shorter one with non-equal neighbours on both sides is a chance match and
//     joins the gap around it. A short block at either end of the alignment,
//     or next to another equal block, stays an anchor.
//   - Gaps. Everything between two anchors is one gap of d body tokens against
//     a transcript tokens. With a == 0 the text was not read. With d <=
//     MaxMisreadRun, up to min(d, a) tokens are a misread and count as
//     present, and the rest are a short read. A larger gap is text skipped
//     (when what was said there is chapter text read again) or different text.
//   - Heading. Title and subtitle tokens carry paragraph Heading, are never in
//     the denominator and never missing; nor is anything said before the
//     chapter's first word heard extra.
//   - Head and tail. Missing text before the first present body token is a
//     head, after the last a tail.
//   - Extra transcript tokens are counted and never count against the
//     narrator.
package recordingcoverage

import (
	"fmt"
	"sort"
)

// Heading is the paragraph index of a title or subtitle token: optional,
// outside the denominator.
const Heading = -1

// rereadShare is the share of what was said in a large gap that must be
// chapter text (a MinAnchorRun-gram of it) for the gap to be a skip, not
// different text.
const rereadShare = 0.5

// The token statuses. A missing token carries its region kind instead.
const (
	statusPresent = "present"
	StatusRead    = "read"
	StatusMisread = "misread"
	StatusHeading = "heading"
)

// AlignmentParams decide which tokens count as read; a result is tied to them
// (Q13).
type AlignmentParams struct {
	MaxMisreadRun int
	MinAnchorRun  int
}

// DefaultParams are the parameters the app ships.
var DefaultParams = AlignmentParams{MaxMisreadRun: 8, MinAnchorRun: 3}

// Validate is AlignmentParams.__post_init__.
func (p AlignmentParams) Validate() error {
	if p.MaxMisreadRun < 0 {
		return fmt.Errorf("max_misread_run must be a whole number of tokens, 0 or more")
	}
	if p.MinAnchorRun < 1 {
		return fmt.Errorf("min_anchor_run must be a whole number of tokens, 1 or more")
	}
	return nil
}

// Opcode is a difflib opcode over the chapter's and the transcript's tokens.
type Opcode struct {
	Tag            string
	I1, I2, J1, J2 int
}

// AlignedChapter is one chapter aligned to one transcript. DocTokens,
// DocWords (the manuscript word each token came from) and TokenParagraph (an
// index into ParagraphIDs, or Heading) run in parallel.
type AlignedChapter struct {
	DocTokens      []string
	DocWords       []string
	TokenParagraph []int
	ParagraphIDs   []string
	AudioTokens    []string
	Opcodes        []Opcode
}

// Validate is AlignedChapter.__post_init__: parallel lengths, paragraph
// indexes in range, and opcodes that tile both sequences in order.
func (a *AlignedChapter) Validate() error {
	count := len(a.DocTokens)
	if len(a.DocWords) != count || len(a.TokenParagraph) != count {
		return fmt.Errorf("doc_tokens, doc_words and token_paragraph must be the same length")
	}
	for _, index := range a.TokenParagraph {
		if index != Heading && (index < 0 || index >= len(a.ParagraphIDs)) {
			return fmt.Errorf("token_paragraph must index paragraph_ids, or be HEADING")
		}
	}
	i, j := 0, 0
	for _, op := range a.Opcodes {
		switch op.Tag {
		case "equal", "replace", "delete", "insert":
		default:
			return fmt.Errorf("opcode %v does not continue the alignment at (%d, %d)", op, i, j)
		}
		if op.I1 != i || op.J1 != j || op.I2 < op.I1 || op.J2 < op.J1 {
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

// Region is a run of missing body text of one kind: head, tail, skip,
// short_read or different_text.
type Region struct {
	Kind         string
	ParagraphIDs []string
	TokenCount   int
	FirstWord    string
	LastWord     string
	DocStart     int // the first missing token
	DocEnd       int // after the last
	AudioIndex   int // the transcript token where the missing text would sit
	// AudioBefore and AudioAfter bound the region in the transcript: the last
	// token of the nearest anchor with body text before it and the first of
	// the nearest after it, or nil where there is none.
	AudioBefore *int
	AudioAfter  *int
}

// ParagraphCoverage is one paragraph's figures. LongestMissingRun is the
// longest run touching it, counted across paragraph boundaries.
type ParagraphCoverage struct {
	ID                string
	Tokens            int
	Present           int
	LongestMissingRun int
}

// ChapterCoverage is compute_coverage's result.
type ChapterCoverage struct {
	Params            AlignmentParams
	BodyTokens        int
	PresentTokens     int
	ExtraTokens       int
	LongestMissingRun int
	Paragraphs        []ParagraphCoverage
	Regions           []Region
}

// MissingTokens is body tokens not present.
func (c ChapterCoverage) MissingTokens() int { return c.BodyTokens - c.PresentTokens }

type gap struct{ i1, i2, j1, j2 int }

type segment struct {
	anchor bool
	gap    gap
}

// isChanceMatch is a short equal block with a non-equal neighbour on both
// sides.
func isChanceMatch(opcodes []Opcode, index, minAnchorRun int) bool {
	op := opcodes[index]
	if op.Tag != "equal" || op.I2-op.I1 >= minAnchorRun || index == 0 || index == len(opcodes)-1 {
		return false
	}
	return opcodes[index-1].Tag != "equal" && opcodes[index+1].Tag != "equal"
}

// segments are the anchors and the gaps between them, in order; a chance match
// joins the gap around it.
func segments(opcodes []Opcode, minAnchorRun int) []segment {
	out := make([]segment, 0, len(opcodes))
	for index, op := range opcodes {
		span := gap{op.I1, op.I2, op.J1, op.J2}
		switch {
		case op.Tag == "equal" && !isChanceMatch(opcodes, index, minAnchorRun):
			out = append(out, segment{true, span})
		case len(out) > 0 && !out[len(out)-1].anchor:
			previous := out[len(out)-1].gap
			out[len(out)-1].gap = gap{previous.i1, op.I2, previous.j1, op.J2}
		default:
			out = append(out, segment{false, span})
		}
	}
	return out
}

// ngramKey joins tokens with NUL, which the tokenizer never produces, standing
// in for Python's tuple key.
func ngramKey(tokens []string) string {
	size := len(tokens)
	for _, token := range tokens {
		size += len(token)
	}
	b := make([]byte, 0, size)
	for k, token := range tokens {
		if k > 0 {
			b = append(b, 0)
		}
		b = append(b, token...)
	}
	return string(b)
}

// isReread is whether most of what was said in a gap is chapter text.
func isReread(audio []string, docNgrams map[string]bool, n int) bool {
	if len(audio) < n {
		return false
	}
	covered := make([]bool, len(audio))
	for start := 0; start+n <= len(audio); start++ {
		if docNgrams[ngramKey(audio[start:start+n])] {
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
	return float64(sum) >= rereadShare*float64(len(audio))
}

func (a *AlignedChapter) body(i1, i2 int) []int {
	body := []int{}
	for i := i1; i < i2; i++ {
		if a.TokenParagraph[i] != Heading {
			body = append(body, i)
		}
	}
	return body
}

type tokenStatus struct {
	index  int
	status string
}

// gapStatuses is the status of each body token in a gap, and how many
// transcript tokens the gap accounts for.
func (a *AlignedChapter) gapStatuses(g gap, params AlignmentParams, docNgrams map[string]bool) ([]tokenStatus, int) {
	body := a.body(g.i1, g.i2)
	said := g.j2 - g.j1
	if len(body) == 0 {
		return nil, min(g.i2-g.i1, said)
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
		return out, min(g.i2-g.i1, said)
	}
	kind := "different_text"
	if isReread(a.AudioTokens[g.j1:g.j2], docNgrams, params.MinAnchorRun) {
		kind = "skip"
	}
	for n, i := range body {
		out[n] = tokenStatus{i, kind}
	}
	return out, 0
}

// statuses is, per doc token, its status ("" for a heading token) and the
// transcript index it sits at.
func (a *AlignedChapter) statuses(params AlignmentParams, segs []segment) ([]string, []int) {
	n := params.MinAnchorRun
	docNgrams := map[string]bool{}
	for k := 0; k+n <= len(a.DocTokens); k++ {
		docNgrams[ngramKey(a.DocTokens[k:k+n])] = true
	}
	status := make([]string, len(a.DocTokens))
	audioAt := make([]int, len(a.DocTokens))
	for _, seg := range segs {
		var statuses []tokenStatus
		if seg.anchor {
			for i := seg.gap.i1; i < seg.gap.i2; i++ {
				if a.TokenParagraph[i] != Heading {
					statuses = append(statuses, tokenStatus{i, statusPresent})
				}
			}
		} else {
			statuses, _ = a.gapStatuses(seg.gap, params, docNgrams)
		}
		for _, s := range statuses {
			status[s.index] = s.status
			audioAt[s.index] = seg.gap.j1
		}
	}
	return markHeadAndTail(status), audioAt
}

func markHeadAndTail(status []string) []string {
	first, last := len(status), len(status)
	for i, value := range status {
		if value == statusPresent {
			if first == len(status) {
				first = i
			}
			last = i
		}
	}
	out := make([]string, len(status))
	for i, value := range status {
		switch {
		case value == "" || value == statusPresent:
			out[i] = value
		case i < first:
			out[i] = "head"
		case i > last:
			out[i] = "tail"
		default:
			out[i] = value
		}
	}
	return out
}

// missingRuns are the maximal runs of missing body tokens as [start, end) doc
// indexes; heading tokens are skipped over.
func missingRuns(status []string) [][2]int {
	runs := [][2]int{}
	start := -1
	for i, value := range status {
		if value == "" {
			continue
		}
		if value != statusPresent && start < 0 {
			start = i
		} else if value == statusPresent && start >= 0 {
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
	for _, value := range status[start:end] {
		if value != "" {
			n++
		}
	}
	return n
}

// bodyAnchors are the anchors that hold body text, in order.
func (a *AlignedChapter) bodyAnchors(segs []segment) []gap {
	out := []gap{}
	for _, seg := range segs {
		if !seg.anchor {
			continue
		}
		for i := seg.gap.i1; i < seg.gap.i2; i++ {
			if a.TokenParagraph[i] != Heading {
				out = append(out, seg.gap)
				break
			}
		}
	}
	return out
}

// bounds are the transcript tokens that bound the doc tokens [docStart,
// docEnd): the last token of the last anchor ending at or before docStart and
// the first token of the first anchor starting at or after docEnd.
func bounds(anchors []gap, docStart, docEnd int) (before, after *int) {
	for k := len(anchors) - 1; k >= 0; k-- {
		if anchors[k].i2 <= docStart {
			v := anchors[k].j2 - 1
			before = &v
			break
		}
	}
	for _, anchor := range anchors {
		if anchor.i1 >= docEnd {
			v := anchor.j1
			after = &v
			break
		}
	}
	return before, after
}

// region is one missing run as a region of its first token's kind.
func (a *AlignedChapter) region(status []string, audioAt []int, anchors []gap, start, end int) Region {
	tokens := []int{}
	for i := start; i < end; i++ {
		if status[i] != "" {
			tokens = append(tokens, i)
		}
	}
	first, last := tokens[0], tokens[len(tokens)-1]
	kind := status[first]
	ids := []string{}
	seen := map[string]bool{}
	for _, i := range tokens {
		if id := a.ParagraphIDs[a.TokenParagraph[i]]; !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	audioIndex := audioAt[first]
	switch kind {
	case "head":
		audioIndex = 0
	case "tail":
		audioIndex = len(a.AudioTokens)
	}
	before, after := bounds(anchors, first, last+1)
	return Region{kind, ids, len(tokens), a.DocWords[first], a.DocWords[last], first, last + 1, audioIndex, before, after}
}

func (a *AlignedChapter) paragraphs(status []string, runs [][2]int) []ParagraphCoverage {
	count := len(a.ParagraphIDs)
	tokens, present, longest := make([]int, count), make([]int, count), make([]int, count)
	for i, value := range status {
		if value == "" {
			continue
		}
		p := a.TokenParagraph[i]
		tokens[p]++
		if value == statusPresent {
			present[p]++
		}
	}
	for _, run := range runs {
		length := runLength(status, run[0], run[1])
		for i := run[0]; i < run[1]; i++ {
			if status[i] != "" {
				p := a.TokenParagraph[i]
				longest[p] = max(longest[p], length)
			}
		}
	}
	out := make([]ParagraphCoverage, count)
	for k, id := range a.ParagraphIDs {
		out[k] = ParagraphCoverage{id, tokens[k], present[k], longest[k]}
	}
	return out
}

// AlignedToken is one chapter token as the check judged it: read, misread,
// a region kind (missing) or heading; and the transcript token it was heard
// as, or nil when nothing was said for it.
type AlignedToken struct {
	Status string
	Audio  *int
}

// gapAudio is the transcript token each doc token of a gap was heard as, by
// the rule gapStatuses counts with, in doc order.
func (a *AlignedChapter) gapAudio(g gap, params AlignmentParams) [][2]int {
	said := g.j2 - g.j1
	body := a.body(g.i1, g.i2)
	out := [][2]int{}
	if len(body) == 0 {
		for n, i := 0, g.i1; i < g.i2; n, i = n+1, i+1 {
			if n < said {
				out = append(out, [2]int{i, g.j1 + n})
			}
		}
		return out
	}
	if len(body) > params.MaxMisreadRun {
		return out
	}
	for n, i := range body {
		if n < said {
			out = append(out, [2]int{i, g.j1 + n})
		}
	}
	return out
}

// AlignTokens is align_tokens: every doc token's status and the transcript
// token it was heard as, and the runs [start, end) of transcript tokens no doc
// token accounts for (the extra words).
func (a *AlignedChapter) AlignTokens(params AlignmentParams) ([]AlignedToken, [][2]int) {
	segs := segments(a.Opcodes, params.MinAnchorRun)
	status, _ := a.statuses(params, segs)
	heard := make([]int, len(a.DocTokens))
	for i := range heard {
		heard[i] = -1
	}
	used := make([]bool, len(a.AudioTokens))
	inAnchor := make([]bool, len(a.DocTokens))
	for _, seg := range segs {
		g := seg.gap
		if seg.anchor {
			said := g.j2 - g.j1
			for n, i := 0, g.i1; i < g.i2; n, i = n+1, i+1 {
				heard[i] = g.j1 + min(n, said-1)
				inAnchor[i] = true
			}
			for j := g.j1; j < g.j2; j++ {
				used[j] = true
			}
			continue
		}
		for _, pair := range a.gapAudio(g, params) {
			heard[pair[0]] = pair[1]
			used[pair[1]] = true
		}
	}
	hasHeading := false
	for _, p := range a.TokenParagraph {
		if p == Heading {
			hasHeading = true
			break
		}
	}
	if hasHeading {
		// Everything said before the chapter's first word heard is the heading, read in the narrator's own words.
		for i, value := range status {
			if value == statusPresent && heard[i] >= 0 {
				for j := 0; j < heard[i]; j++ {
					used[j] = true
				}
				break
			}
		}
	}
	tokens := make([]AlignedToken, len(status))
	for i, value := range status {
		var audio *int
		if heard[i] >= 0 {
			h := heard[i]
			audio = &h
		}
		switch value {
		case "":
			tokens[i] = AlignedToken{StatusHeading, audio}
		case statusPresent:
			if !inAnchor[i] && audio != nil && a.AudioTokens[*audio] != a.DocTokens[i] {
				tokens[i] = AlignedToken{StatusMisread, audio}
			} else {
				tokens[i] = AlignedToken{StatusRead, audio}
			}
		default:
			tokens[i] = AlignedToken{value, nil}
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

// minRepeatTokens is the fewest chapter words an extra run must say again to
// be a repeat, unless they are a whole line.
const minRepeatTokens = 3

// Repeat is an extra run that says chapter text again: its tokens [First,
// Last) are the chapter's tokens [Start, End).
type Repeat struct {
	Start int `json:"start"`
	End   int `json:"end"`
	First int `json:"first"`
	Last  int `json:"last"`
}

// RepeatOf is repeat_of: whether a run of extra tokens says the chapter text
// beside it again. before is the doc token heard just before the run and
// after the one just after it (nil at either end). The run is a retake when it
// ends with the words up to before, or a restart when it begins with the words
// from after; the longer wins, a tie is a retake. lineOf names each doc
// token's line.
func RepeatOf(run, doc []string, lineOf []int, before, after *int) *Repeat {
	var best *Repeat
	if before != nil {
		k := 0
		for k < len(run) && k <= *before && run[len(run)-1-k] == doc[*before-k] {
			k++
		}
		if k > 0 {
			best = &Repeat{Start: *before + 1 - k, End: *before + 1, First: len(run) - k, Last: len(run)}
		}
	}
	if after != nil {
		k := 0
		for k < len(run) && *after+k < len(doc) && run[k] == doc[*after+k] {
			k++
		}
		if k > 0 && (best == nil || k > best.End-best.Start) {
			best = &Repeat{Start: *after, End: *after + k, First: 0, Last: k}
		}
	}
	if best == nil {
		return nil
	}
	if best.End-best.Start >= minRepeatTokens || wholeLine(lineOf, best.Start, best.End) {
		return best
	}
	return nil
}

func wholeLine(lineOf []int, start, end int) bool {
	line := lineOf[start]
	for i := start; i < end; i++ {
		if lineOf[i] != line {
			return false
		}
	}
	return (start == 0 || lineOf[start-1] != line) && (end == len(lineOf) || lineOf[end] != line)
}

// Repeats is repeats: for each extra run of AlignTokens, the Repeat it is, or
// nil.
func (a *AlignedChapter) Repeats(tokens []AlignedToken, extras [][2]int) []*Repeat {
	type heardAt struct{ audio, doc int }
	heard := []heardAt{}
	for i, token := range tokens {
		if token.Audio != nil {
			heard = append(heard, heardAt{*token.Audio, i})
		}
	}
	sort.Slice(heard, func(x, y int) bool {
		if heard[x].audio != heard[y].audio {
			return heard[x].audio < heard[y].audio
		}
		return heard[x].doc < heard[y].doc
	})
	out := make([]*Repeat, len(extras))
	for k, extra := range extras {
		var before, after *int
		for _, h := range heard {
			if h.audio < extra[0] {
				v := h.doc
				before = &v
			}
		}
		for _, h := range heard {
			if h.audio >= extra[1] {
				v := h.doc
				after = &v
				break
			}
		}
		out[k] = RepeatOf(a.AudioTokens[extra[0]:extra[1]], a.DocTokens, a.TokenParagraph, before, after)
	}
	return out
}

// ComputeCoverage is compute_coverage: present, missing and extra tokens,
// per-paragraph figures and regions for one alignment.
func (a *AlignedChapter) ComputeCoverage(params AlignmentParams) ChapterCoverage {
	segs := segments(a.Opcodes, params.MinAnchorRun)
	status, audioAt := a.statuses(params, segs)
	runs := missingRuns(status)
	paragraphs := a.paragraphs(status, runs)
	anchors := a.bodyAnchors(segs)
	_, extras := a.AlignTokens(params)
	coverage := ChapterCoverage{Params: params, Paragraphs: paragraphs, Regions: []Region{}}
	for _, p := range paragraphs {
		coverage.BodyTokens += p.Tokens
		coverage.PresentTokens += p.Present
	}
	for _, extra := range extras {
		coverage.ExtraTokens += extra[1] - extra[0]
	}
	for _, run := range runs {
		coverage.LongestMissingRun = max(coverage.LongestMissingRun, runLength(status, run[0], run[1]))
		coverage.Regions = append(coverage.Regions, a.region(status, audioAt, anchors, run[0], run[1]))
	}
	return coverage
}
