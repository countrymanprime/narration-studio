package compare

import "strings"

// Word is one transcript word and its start and end, in seconds.
type Word struct {
	Text       string
	Start, End float64
}

// Alignment is the alignment diff_and_build_markers computes and returns
// beside its markers: the opcodes over the chapter's merged tokens (DocTokens)
// and the transcript's filtered, merged tokens (AudioTokens). UnitIdx is each
// doc token's sentence unit (HeadingUnit for the heading), IndexMap each audio
// token's transcript word, ChapterIndexMap each doc token's original chapter
// token, and ChapterRawWords each original chapter token's word.
type Alignment struct {
	Opcodes         []Opcode
	DocTokens       []string
	AudioTokens     []string
	UnitIdx         []int
	IndexMap        []int
	ChapterIndexMap []int
	ChapterRawWords []string
}

// Align is the alignment half of compare.py's diff_and_build_markers: the
// transcript's tokens without fillers, both sides' number words merged, and
// SequenceMatcher's opcodes (autojunk off) with the hyphen-split fuse.
func (t Tokenizer) Align(chapter ChapterUnits, transcript []Word) Alignment {
	filtered, indexMap := []string{}, []int{}
	for i, word := range transcript {
		for _, token := range t.Tokenize(word.Text) {
			if IsFiller(token) {
				continue
			}
			filtered = append(filtered, token)
			indexMap = append(indexMap, i)
		}
	}
	identity := make([]int, len(chapter.Tokens))
	for k := range identity {
		identity[k] = k
	}
	doc, chapterIndexMap := MergeNumberWords(chapter.Tokens, identity)
	filtered, indexMap = MergeNumberWords(filtered, indexMap)
	unitIdx := make([]int, len(chapterIndexMap))
	for k, original := range chapterIndexMap {
		if original < len(chapter.UnitIdx) {
			unitIdx[k] = chapter.UnitIdx[original]
		}
	}
	opcodes := fuseHyphenSplitOpcodes(NewSequenceMatcher(doc, filtered, false).Opcodes(), doc, filtered)
	return Alignment{
		Opcodes: opcodes, DocTokens: doc, AudioTokens: filtered, UnitIdx: unitIdx,
		IndexMap: indexMap, ChapterIndexMap: chapterIndexMap, ChapterRawWords: chapter.RawWords,
	}
}

// fuseHyphenSplitOpcodes is compare.py's _fuse_hyphen_split_opcodes: a
// replace whose one side, joined with no separator, is the other side's one
// token ("superpowered" against "super-powered") is equal.
func fuseHyphenSplitOpcodes(opcodes []Opcode, doc, audio []string) []Opcode {
	fixed := make([]Opcode, 0, len(opcodes))
	for _, op := range opcodes {
		if op.Tag == "replace" {
			docWords, audioWords := doc[op.I1:op.I2], audio[op.J1:op.J2]
			if len(docWords) == 1 && len(audioWords) > 1 && docWords[0] == strings.Join(audioWords, "") ||
				len(audioWords) == 1 && len(docWords) > 1 && audioWords[0] == strings.Join(docWords, "") {
				op.Tag = "equal"
			}
		}
		fixed = append(fixed, op)
	}
	return fixed
}
