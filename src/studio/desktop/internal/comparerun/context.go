package comparerun

import (
	"strings"

	"desktop/internal/compare"
)

// MarkerContext is build_marker_context: compact script and recorded excerpts around one marker, up to contextWords
// manuscript tokens either side, never past its sentence. Equal words reuse the manuscript's own word; a replacement
// or an insertion uses the words heard. Both are empty when the marker has no sentence of its own (the heading).
func MarkerContext(m Marker, a compare.Alignment, transcript []compare.Word) (string, string) {
	unitIdx := a.UnitIdx
	if len(unitIdx) == 0 || len(a.ChapterIndexMap) == 0 {
		return "", ""
	}
	n := len(unitIdx)
	source := m.I1
	if source >= n {
		source = m.I1 - 1
	}
	if source < 0 || source >= n || unitIdx[source] < 0 {
		return "", ""
	}
	unit := unitIdx[source]
	unitStart, unitEnd := source, source+1
	for unitStart > 0 && unitIdx[unitStart-1] == unit {
		unitStart--
	}
	for unitEnd < n && unitIdx[unitEnd] == unit {
		unitEnd++
	}
	windowStart, windowEnd := max(unitStart, m.I1-contextWords), min(unitEnd, m.I2+contextWords)
	if m.I1 == m.I2 {
		windowEnd = min(unitEnd, m.I1+contextWords)
	}
	addDocWords := func(parts []string, seen *int, lo, hi int) []string {
		for k := max(lo, windowStart); k < min(hi, windowEnd); k++ {
			if original := a.ChapterIndexMap[k]; original != *seen {
				parts = append(parts, a.ChapterRawWords[original])
				*seen = original
			}
		}
		return parts
	}
	scriptSeen, heardSeen := -1, -1
	script := addDocWords(nil, &scriptSeen, windowStart, windowEnd)
	var heard []string
	for _, op := range a.Opcodes {
		overlaps := op.I1 < windowEnd && op.I2 > windowStart
		target := op.I1 == op.I2 && op.I1 == m.I1 && op.J1 == m.J1 && op.J2 == m.J2
		inWindow := op.I1 == op.I2 && windowStart <= op.I1 && op.I1 <= windowEnd
		switch {
		case op.Tag == "equal" && overlaps:
			heard = addDocWords(heard, &heardSeen, op.I1, op.I2)
		case op.Tag == "replace" && overlaps, op.Tag == "insert" && (inWindow || target):
			for j := op.J1; j < op.J2; j++ {
				heard = append(heard, transcript[a.IndexMap[j]].Text)
			}
		}
	}
	if len(script) == 0 && len(heard) == 0 {
		return "", ""
	}
	prefix, suffix := "", ""
	if windowStart > unitStart {
		prefix = "... "
	}
	if windowEnd < unitEnd {
		suffix = " ..."
	}
	return prefix + strings.Join(script, " ") + suffix, prefix + strings.Join(heard, " ") + suffix
}

// unitAudio is one sentence unit's recorded side in the diff: exact (the manuscript's own sentence) or the text heard.
type unitAudio struct {
	exact bool
	text  string
}

// unitAudioInfo is build_unit_audio_info: for sentence units first..last, what the recording said. An equal match
// reuses the manuscript's word; a replacement or an insertion puts in the words heard; a unit no opcode touched is
// empty.
func unitAudioInfo(a compare.Alignment, transcript []compare.Word, first, last int) []unitAudio {
	count := max(last-first+1, 0)
	words := make([][]string, count)
	allEqual := make([]bool, count)
	touched := make([]bool, count)
	for k := range allEqual {
		allEqual[k] = true
	}
	inRange := func(u int) bool { return u >= first && u <= last }
	appendWord := func(u int, raw string) {
		if !inRange(u) {
			return
		}
		w := words[u-first]
		if len(w) == 0 || w[len(w)-1] != raw {
			words[u-first] = append(w, raw)
		}
		touched[u-first] = true
	}
	markDiff := func(units []int, j1, j2 int) {
		heard := make([]string, 0, j2-j1)
		for j := j1; j < j2; j++ {
			heard = append(heard, transcript[a.IndexMap[j]].Text)
		}
		for _, u := range units {
			if inRange(u) {
				words[u-first] = append(words[u-first], heard...)
				allEqual[u-first], touched[u-first] = false, true
			}
		}
	}
	n := len(a.UnitIdx)
	for _, op := range a.Opcodes {
		switch op.Tag {
		case "delete":
			for _, u := range sortedUnique(a.UnitIdx[op.I1:op.I2]) {
				if inRange(u) {
					allEqual[u-first], touched[u-first] = false, true
				}
			}
		case "equal":
			for k := op.I1; k < op.I2; k++ {
				appendWord(a.UnitIdx[k], a.ChapterRawWords[a.ChapterIndexMap[k]])
			}
		default:
			if op.I1 == op.I2 {
				units := []int{}
				if probe := min(op.I1, n-1); probe >= 0 && probe < n {
					units = append(units, a.UnitIdx[probe])
				}
				markDiff(units, op.J1, op.J2)
			} else {
				markDiff(sortedUnique(a.UnitIdx[op.I1:op.I2]), op.J1, op.J2)
			}
		}
	}
	info := make([]unitAudio, count)
	for k := range info {
		switch {
		case !touched[k]:
		case allEqual[k]:
			info[k].exact = true
		default:
			info[k].text = strings.Join(words[k], " ")
		}
	}
	return info
}

func sortedUnique(values []int) []int {
	seen := map[int]bool{}
	out := []int{}
	for _, v := range values {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// endsSentence is ends_sentence: the word ends in '.', '!' or '?', and not as an abbreviation's period ("Mr.").
func endsSentence(t compare.Tokenizer, word string) bool {
	if word == "" || !strings.ContainsRune(".!?", lastRune(word)) {
		return false
	}
	core := t.Tokenize(word)
	return len(core) == 0 || !compare.IsAbbreviation(core[len(core)-1]) || !strings.HasSuffix(word, ".")
}

func lastRune(s string) rune {
	runes := []rune(s)
	return runes[len(runes)-1]
}

// splitAudioSentences is split_audio_sentences: the words heard as lines, broken at sentence-final punctuation or at
// a pause of pauseGapSeconds.
func splitAudioSentences(t compare.Tokenizer, words []compare.Word) []string {
	lines := []string{}
	current := []string{}
	for i, w := range words {
		current = append(current, w.Text)
		pause := i+1 < len(words) && words[i+1].Start-w.End >= pauseGapSeconds
		if endsSentence(t, w.Text) || pause {
			lines = append(lines, strings.Join(current, " "))
			current = []string{}
		}
	}
	if len(current) > 0 {
		lines = append(lines, strings.Join(current, " "))
	}
	return lines
}
