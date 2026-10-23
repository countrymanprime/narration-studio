package main

// Port of the alignment half of compare.diff_and_build_markers (the markers themselves and the
// debug log line are discarded by take_divergence.align_take, so they are not ported).

type Word struct {
	Text       string
	Start, End float64
}

type Alignment struct {
	Opcodes         []Opcode
	DocTokens       []string
	AudioTokens     []string
	IndexMap        []int
	ChapterIndexMap []int
}

func fuseHyphenSplitOpcodes(opcodes []Opcode, chapterNorm, filtered []string) []Opcode {
	fixed := make([]Opcode, 0, len(opcodes))
	join := func(s []string) string {
		n := 0
		for _, x := range s {
			n += len(x)
		}
		b := make([]byte, 0, n)
		for _, x := range s {
			b = append(b, x...)
		}
		return string(b)
	}
	for _, op := range opcodes {
		if op.Tag == "replace" {
			doc := chapterNorm[op.I1:op.I2]
			aud := filtered[op.J1:op.J2]
			if len(doc) == 1 && len(aud) > 1 && doc[0] == join(aud) {
				fixed = append(fixed, Opcode{"equal", op.I1, op.I2, op.J1, op.J2})
				continue
			}
			if len(aud) == 1 && len(doc) > 1 && aud[0] == join(doc) {
				fixed = append(fixed, Opcode{"equal", op.I1, op.I2, op.J1, op.J2})
				continue
			}
		}
		fixed = append(fixed, op)
	}
	return fixed
}

func diffAlignment(chapterTokens []string, transcript []Word) Alignment {
	var filtered []string
	var indexMap []int
	for i, w := range transcript {
		for _, t := range tokenize(w.Text) {
			if fillerWords[t] {
				continue
			}
			filtered = append(filtered, t)
			indexMap = append(indexMap, i)
		}
	}
	ident := make([]int, len(chapterTokens))
	for i := range ident {
		ident[i] = i
	}
	chapterNorm, chapterIndexMap := mergeNumberWords(chapterTokens, ident)
	filtered, indexMap = mergeNumberWords(filtered, indexMap)
	in := Interner{}
	sm := NewSequenceMatcher(nil, in.IDs(chapterNorm), in.IDs(filtered), false)
	opcodes := fuseHyphenSplitOpcodes(sm.GetOpcodes(), chapterNorm, filtered)
	return Alignment{opcodes, chapterNorm, filtered, indexMap, chapterIndexMap}
}
