package main

// Port of sidecars/transcript-compare/core/take_divergence.py.

import (
	"errors"
	"fmt"
	"sort"
	"strings"
)

const (
	MATCHED = "matched"
	MISREAD = "misread"
	SKIPPED = "skipped"
	UNREAD  = "unread"
	EXTRA   = "extra"
	BEFORE  = "before"
	WITHIN  = "within"
	AFTER   = "after"
)

var wordStatuses = []string{MATCHED, MISREAD, SKIPPED, UNREAD}

type SpanWord struct {
	Index     int
	Text      string
	Unit      int
	Paragraph int
	Tokens    []string
}

type Span struct {
	FirstUnit, LastUnit, FirstParagraph, LastParagraph int
	Words                                              []SpanWord
}

type WordResult struct {
	Index      int
	Status     string
	Start, End *float64
}

type Divergence struct {
	Kind, Position      string
	FirstWord, LastWord *int
	ManuscriptText      string
	AudioText           string
	Start, End          *float64
}

type TakeAlignment struct {
	Words       []WordResult
	Divergences []Divergence
	ExtraWords  int
}

func (t TakeAlignment) Count(status string) int {
	n := 0
	for _, w := range t.Words {
		if w.Status == status {
			n++
		}
	}
	return n
}

func (t TakeAlignment) Fidelity() float64 {
	if len(t.Words) == 0 {
		return 0.0
	}
	return float64(t.Count(MATCHED)) / float64(len(t.Words))
}

var ErrSpan = errors.New("span error")

func buildSpan(paragraphs []string, firstUnit, lastUnit int) (Span, error) {
	units := buildSentenceUnits(paragraphs)
	if len(units) == 0 {
		return Span{}, fmt.Errorf("%w: The chapter has no sentences", ErrSpan)
	}
	if !(0 <= firstUnit && firstUnit <= lastUnit && lastUnit < len(units)) {
		return Span{}, fmt.Errorf("%w: The span %d..%d is not within the chapter's %d sentence(s)", ErrSpan, firstUnit, lastUnit, len(units))
	}
	var words []SpanWord
	for u := firstUnit; u <= lastUnit; u++ {
		for _, raw := range pySplit(units[u].sentence) {
			toks := tokenize(raw)
			if len(toks) > 0 {
				words = append(words, SpanWord{len(words), raw, u, units[u].paragraph, toks})
			}
		}
	}
	if len(words) == 0 {
		return Span{}, fmt.Errorf("%w: The span %d..%d has no spoken words", ErrSpan, firstUnit, lastUnit)
	}
	return Span{firstUnit, lastUnit, units[firstUnit].paragraph, units[lastUnit].paragraph, words}, nil
}

func sortedUnique(xs []int) []int {
	sort.Ints(xs)
	out := xs[:0]
	for i, x := range xs {
		if i == 0 || x != xs[i-1] {
			out = append(out, x)
		}
	}
	return out
}

func mergedOwners(span Span, chapterIndexMap []int) [][]int {
	var flat []int
	for _, w := range span.Words {
		for range w.Tokens {
			flat = append(flat, w.Index)
		}
	}
	bounds := append(append([]int{}, chapterIndexMap...), len(flat))
	out := make([][]int, len(chapterIndexMap))
	for k := range chapterIndexMap {
		var ws []int
		for orig := bounds[k]; orig < bounds[k+1]; orig++ {
			ws = append(ws, flat[orig])
		}
		out[k] = sortedUnique(ws)
	}
	return out
}

func audioRange(indexMap []int, tr []Word, j1, j2 int) (float64, float64, string) {
	var origs []int
	for j := j1; j < j2; j++ {
		origs = append(origs, indexMap[j])
	}
	origs = sortedUnique(origs)
	parts := make([]string, len(origs))
	for k, i := range origs {
		parts[k] = pyStrip(tr[i].Text)
	}
	return tr[origs[0]].Start, tr[origs[len(origs)-1]].End, strings.Join(parts, " ")
}

func gap(indexMap []int, tr []Word, j int) (*float64, *float64) {
	var before, after *float64
	if 0 < j && j <= len(indexMap) {
		v := tr[indexMap[j-1]].End
		before = &v
	}
	if 0 <= j && j < len(indexMap) {
		v := tr[indexMap[j]].Start
		after = &v
	}
	if before != nil && after != nil && *after < *before {
		v := *before
		after = &v
	}
	return before, after
}

func audioTokens(tr []Word, indexMap []int) []string {
	var toks []string
	var owners []int
	for i, w := range tr {
		for _, t := range tokenize(w.Text) {
			if !fillerWords[t] {
				toks = append(toks, t)
				owners = append(owners, i)
			}
		}
	}
	merged, mm := mergeNumberWords(toks, owners)
	if len(mm) != len(indexMap) {
		return nil
	}
	for i := range mm {
		if mm[i] != indexMap[i] {
			return nil
		}
	}
	if merged == nil {
		merged = []string{}
	}
	return merged
}

func eqStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func preferEarlierCopy(opcodes []Opcode, at []string) []Opcode {
	out := []Opcode{}
	for _, op := range opcodes {
		n := op.J2 - op.J1
		if at != nil && op.Tag == "insert" && len(out) > 0 {
			prev := out[len(out)-1]
			if prev.Tag == "equal" && prev.I2 == op.I1 && prev.J2 == op.J1 && prev.I2-prev.I1 >= n &&
				eqStrings(at[op.J1-n:op.J1], at[op.J1:op.J2]) {
				out = out[:len(out)-1]
				a1, a2, b1, b2 := prev.I1, prev.I2, prev.J1, prev.J2
				if a2-n > a1 {
					out = append(out, Opcode{"equal", a1, a2 - n, b1, b2 - n})
				}
				out = append(out, Opcode{"insert", a2 - n, a2 - n, b2 - n, b2})
				out = append(out, Opcode{"equal", a2 - n, a2, op.J1, op.J2})
				continue
			}
		}
		out = append(out, op)
	}
	return out
}

func position(i1, i2 int, alignedStart, alignedEnd *int) string {
	if alignedStart == nil || i2 <= *alignedStart {
		return BEFORE
	}
	if i1 >= *alignedEnd {
		return AFTER
	}
	return WITHIN
}

func ip(v int) *int         { return &v }
func fp(v float64) *float64 { return &v }

func alignTake(span Span, tr []Word) TakeAlignment {
	var docTokens []string
	for _, w := range span.Words {
		docTokens = append(docTokens, w.Tokens...)
	}
	al := diffAlignment(docTokens, tr)
	indexMap := al.IndexMap
	opcodes := preferEarlierCopy(al.Opcodes, audioTokens(tr, indexMap))
	owners := mergedOwners(span, al.ChapterIndexMap)

	var alignedStart, alignedEnd *int
	for _, op := range opcodes {
		if op.Tag != "delete" {
			if alignedStart == nil {
				alignedStart = ip(op.I1)
			}
			alignedEnd = ip(op.I2)
		}
	}
	tokenStatus := make([]string, len(owners))
	for i := range tokenStatus {
		tokenStatus[i] = UNREAD
	}
	type tt struct {
		ok         bool
		start, end float64
	}
	tokenTimes := make([]tt, len(owners))
	var divs []Divergence
	extra := 0
	for _, op := range opcodes {
		i1, i2, j1, j2 := op.I1, op.I2, op.J1, op.J2
		pos := position(i1, i2, alignedStart, alignedEnd)
		if op.Tag == "equal" {
			for off := 0; off < i2-i1; off++ {
				tokenStatus[i1+off] = MATCHED
				s, e, _ := audioRange(indexMap, tr, j1+off, j1+off+1)
				tokenTimes[i1+off] = tt{true, s, e}
			}
			continue
		}
		var wl []int
		for i := i1; i < i2; i++ {
			wl = append(wl, owners[i]...)
		}
		words := sortedUnique(wl)
		mt := make([]string, len(words))
		for k, w := range words {
			mt[k] = span.Words[w].Text
		}
		manuscriptText := strings.Join(mt, " ")
		var as, ae float64
		var atext string
		if j2 > j1 {
			as, ae, atext = audioRange(indexMap, tr, j1, j2)
		}
		switch op.Tag {
		case "replace":
			for i := i1; i < i2; i++ {
				tokenStatus[i] = MISREAD
				tokenTimes[i] = tt{true, as, ae}
			}
			divs = append(divs, Divergence{MISREAD, WITHIN, ip(words[0]), ip(words[len(words)-1]), manuscriptText, atext, fp(as), fp(ae)})
		case "delete":
			status := UNREAD
			if pos == WITHIN {
				status = SKIPPED
			}
			for i := i1; i < i2; i++ {
				tokenStatus[i] = status
			}
			var s, e *float64
			if status == SKIPPED {
				s, e = gap(indexMap, tr, j1)
			}
			divs = append(divs, Divergence{status, pos, ip(words[0]), ip(words[len(words)-1]), manuscriptText, "", s, e})
		default: // insert
			seen := map[int]bool{}
			for j := j1; j < j2; j++ {
				seen[indexMap[j]] = true
			}
			extra += len(seen)
			var anchor *int
			if i1 < len(owners) {
				anchor = ip(owners[i1][0])
			}
			var anchor2 *int
			if anchor != nil {
				anchor2 = ip(*anchor)
			}
			divs = append(divs, Divergence{EXTRA, pos, anchor, anchor2, "", atext, fp(as), fp(ae)})
		}
	}
	order := map[string]int{BEFORE: 0, WITHIN: 1, AFTER: 2}
	key := func(d Divergence) (int, int) {
		w := 1 << 30
		if d.FirstWord != nil {
			w = *d.FirstWord
		}
		return order[d.Position], w
	}
	sort.SliceStable(divs, func(a, b int) bool {
		oa, wa := key(divs[a])
		ob, wb := key(divs[b])
		if oa != ob {
			return oa < ob
		}
		return wa < wb
	})

	// _word_statuses / _word_results
	byWord := make([]map[string]bool, len(span.Words))
	wordTimes := make([][]tt, len(span.Words))
	for i := range byWord {
		byWord[i] = map[string]bool{}
	}
	for k, ws := range owners {
		for _, w := range ws {
			byWord[w][tokenStatus[k]] = true
			if tokenTimes[k].ok {
				wordTimes[w] = append(wordTimes[w], tokenTimes[k])
			}
		}
	}
	results := make([]WordResult, len(span.Words))
	for _, w := range span.Words {
		status := MISREAD
		if len(byWord[w.Index]) == 1 {
			for s := range byWord[w.Index] {
				status = s
			}
		}
		// Python: next(iter(set())) on an empty set raises StopIteration; a span word always owns >= 1 token.
		r := WordResult{Index: w.Index, Status: status}
		if t := wordTimes[w.Index]; len(t) > 0 {
			mn, mx := t[0].start, t[0].end
			for _, x := range t[1:] {
				if x.start < mn {
					mn = x.start
				}
				if x.end > mx {
					mx = x.end
				}
			}
			r.Start, r.End = fp(mn), fp(mx)
		}
		results[w.Index] = r
	}
	return TakeAlignment{results, divs, extra}
}

// ---------------------------------------------------------------------------
// output

func seconds(v *float64, offset float64) any {
	if v == nil {
		return nil
	}
	return PyFloat(pyRound(*v+offset, 3))
}

func intOrNil(v *int) any {
	if v == nil {
		return nil
	}
	return *v
}

func toJSON(a TakeAlignment, offset float64) Obj {
	counts := Obj{}
	for _, s := range wordStatuses {
		counts[s] = a.Count(s)
	}
	counts["extraWords"] = a.ExtraWords
	words := make([]any, len(a.Words))
	for i, w := range a.Words {
		words[i] = Obj{"index": w.Index, "status": w.Status, "start": seconds(w.Start, offset), "end": seconds(w.End, offset)}
	}
	divs := make([]any, len(a.Divergences))
	for i, d := range a.Divergences {
		divs[i] = Obj{
			"kind": d.Kind, "position": d.Position, "firstWord": intOrNil(d.FirstWord), "lastWord": intOrNil(d.LastWord),
			"manuscriptText": d.ManuscriptText, "audioText": d.AudioText,
			"start": seconds(d.Start, offset), "end": seconds(d.End, offset),
		}
	}
	return Obj{"fidelity": PyFloat(pyRound(a.Fidelity(), 4)), "counts": counts, "words": words, "divergences": divs}
}

func spanJSON(s Span) Obj {
	words := make([]any, len(s.Words))
	for i, w := range s.Words {
		words[i] = Obj{"index": w.Index, "text": w.Text, "unit": w.Unit, "paragraph": w.Paragraph}
	}
	return Obj{"firstUnit": s.FirstUnit, "lastUnit": s.LastUnit, "firstParagraph": s.FirstParagraph, "lastParagraph": s.LastParagraph, "words": words}
}
