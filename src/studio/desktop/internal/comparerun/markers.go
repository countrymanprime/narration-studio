// Package comparerun writes a Transcript Compare run's results: the discrepancy markers (docs/utilities/transcript-compare.md)
// and the manuscript-against-recording diff. It is the Go port of the pure tail of the transcript-compare sidecar's
// compare.py run (diff_and_build_markers' markers, _marker_timing_confidence, build_marker_context,
// build_unit_audio_info, find_transcript_title_boundary, split_audio_sentences and write_unified_diff): the sidecar
// matches the chapter and transcribes, and the host builds the markers here from the words it reports, over the same
// alignment the recording check and the take comparison use (internal/compare). The files it writes are held byte for
// byte to the ones the Python wrote.
//
// The results file (results_<run>.txt, read by narration_compare.lua, the Audacity review and the findings adapter) is
// tagged lines:
//
//	SUMMARY|MATCH: '<chapter>' (score <0.00>) - <n> discrepancy marker(s)
//	DIFF|<diff_file_path>
//	MARKER|<item_index>|<srcpos_seconds>|<kind>|<name>|<doc_text>|<audio_text>|<chapter_title>|<paragraph>|
//	       <script_context>|<audio_context>|<confidence>|<timing_gap_seconds>|<repeat_of>
//
// kind is MISREAD, SKIPPED or EXTRA; doc_text or audio_text may be empty (a skip has no audio, an extra no
// manuscript text). confidence is high, medium, low or unknown, from the pause at the marker's edges
// (TimingConfidence), with timing_gap_seconds empty when unknown: a secondary signal, never proof. repeat_of is set only
// on an EXTRA that says the chapter text beside it again (a second take, recordingcoverage.RepeatOf): the chapter
// words it repeats, as written. It was appended last, so a reader that splits 12 fields keeps it inside the timing gap.
package comparerun

import (
	"fmt"
	"sort"
	"strings"

	"desktop/internal/compare"
	"desktop/internal/recordingcoverage"
)

// The marker kinds.
const (
	Misread = "MISREAD"
	Skipped = "SKIPPED"
	Extra   = "EXTRA"
)

// pauseGapSeconds is PAUSE_GAP_SECONDS: a silence this long is a real pause, both between audio sentences and as the
// "high" timing confidence.
const pauseGapSeconds = 0.6

// tightGapSeconds is TIGHT_GAP_SECONDS: below it the words ran together, the "low" timing confidence.
const tightGapSeconds = 0.05

// excerptTailBufferSentences is EXCERPT_TAIL_BUFFER_SENTENCES: the diff shows this many sentences past the last one
// heard.
const excerptTailBufferSentences = 2

// snippetWords is the most words a marker's snippet shows before " ...".
const snippetWords = 8

// contextWords is how many manuscript tokens a marker's context keeps on either side of it.
const contextWords = 6

// Marker is one discrepancy, as diff_and_build_markers returns it: its time in the joined recording, its kind, its
// name and snippets (already cleaned for the results file), the sentence unit it belongs to and its bounds in the
// alignment's token spaces.
type Marker struct {
	Time           float64
	Kind, Name     string
	Doc, Audio     string
	Unit           int
	I1, I2, J1, J2 int
	Confidence     string
	TimingGap      *float64
	RepeatOf       string
}

// pyMax is Python's max(a, b) for two floats: a unless b is greater (so a NaN b gives a).
func pyMax(a, b float64) float64 {
	if b > a {
		return b
	}
	return a
}

func snippet(tokens []string, lo, hi int) string {
	words := tokens[lo:hi]
	if len(words) == 0 {
		return ""
	}
	if len(words) > snippetWords {
		return strings.Join(words[:snippetWords], " ") + " ..."
	}
	return strings.Join(words, " ")
}

// boundaryGap is _boundary_gap_seconds: the silence in the transcript between the word before filtered token idx and
// the word at it, nil at either edge.
func boundaryGap(indexMap []int, transcript []compare.Word, idx int) *float64 {
	if idx <= 0 || idx >= len(indexMap) {
		return nil
	}
	prev, next := indexMap[idx-1], indexMap[idx]
	if prev >= len(transcript) || next >= len(transcript) {
		return nil
	}
	gap := pyMax(0.0, transcript[next].Start-transcript[prev].End)
	return &gap
}

// TimingConfidence is _marker_timing_confidence: a label for the pause around audio tokens [j1, j2) and the gap it
// comes from ("unknown" and nil when neither edge has a neighbour).
func TimingConfidence(j1, j2 int, indexMap []int, transcript []compare.Word) (string, *float64) {
	before := boundaryGap(indexMap, transcript, j1)
	after := before
	if j2 != j1 {
		after = boundaryGap(indexMap, transcript, j2)
	}
	var gap *float64
	for _, candidate := range []*float64{before, after} {
		if candidate != nil && (gap == nil || *candidate > *gap) {
			gap = candidate
		}
	}
	switch {
	case gap == nil:
		return "unknown", nil
	case *gap >= pauseGapSeconds:
		return "high", gap
	case *gap < tightGapSeconds:
		return "low", gap
	}
	return "medium", gap
}

// Markers is diff_and_build_markers' marker half over an alignment (compare.Tokenizer.Align of units and transcript):
// the markers in time order and the covered range of sentence units (nil when nothing aligned). A heading read aloud
// makes no marker, a manuscript run outside the recorded span is not a skip, and a change shorter than minWords tokens
// is left out.
func Markers(a compare.Alignment, units compare.ChapterUnits, transcript []compare.Word, minWords int) ([]Marker, *[2]int) {
	doc, audio := a.DocTokens, a.AudioTokens
	headingEnd := len(a.UnitIdx)
	for k, unit := range a.UnitIdx {
		if unit != compare.HeadingUnit {
			headingEnd = k
			break
		}
	}
	alignedStart, alignedEnd := -1, -1
	for _, op := range a.Opcodes {
		if op.Tag != "delete" {
			if alignedStart < 0 {
				alignedStart = op.I1
			}
			alignedEnd = op.I2
		}
	}
	timeFor := func(idx int) float64 {
		if len(transcript) == 0 {
			return 0.0
		}
		if idx >= len(a.IndexMap) {
			return transcript[len(transcript)-1].End
		}
		return transcript[a.IndexMap[idx]].Start
	}

	markers := []Marker{}
	for _, op := range a.Opcodes {
		if op.Tag == "equal" {
			continue
		}
		if max(op.I2-op.I1, op.J2-op.J1) < minWords {
			continue
		}
		if headingEnd != 0 && (op.Tag == "insert" && op.I1 <= headingEnd || op.Tag != "insert" && op.I2 <= headingEnd) {
			continue
		}
		m := Marker{Time: timeFor(op.J1), I1: op.I1, I2: op.I2, J1: op.J1, J2: op.J2}
		switch op.Tag {
		case "replace":
			m.Doc, m.Audio, m.Kind = snippet(doc, op.I1, op.I2), snippet(audio, op.J1, op.J2), Misread
			m.Name = fmt.Sprintf("MISREAD: '%s' as '%s'", m.Doc, m.Audio)
		case "delete":
			if alignedStart < 0 || op.I2 <= alignedStart || op.I1 >= alignedEnd {
				continue // outside the recorded span: not a real skip
			}
			m.Doc, m.Kind = snippet(doc, op.I1, op.I2), Skipped
			m.Name = fmt.Sprintf("SKIPPED: '%s'", m.Doc)
		case "insert":
			m.Audio, m.Kind = snippet(audio, op.J1, op.J2), Extra
			m.Name = fmt.Sprintf("EXTRA: '%s'", m.Audio)
		default:
			continue
		}
		if op.Tag == "insert" {
			var before, after *int
			if op.I1 > 0 {
				before = ptr(op.I1 - 1)
			}
			if op.I1 < len(doc) {
				after = ptr(op.I1)
			}
			if repeat := recordingcoverage.RepeatOf(audio[op.J1:op.J2], doc, a.UnitIdx, before, after); repeat != nil {
				seen := map[int]bool{}
				words := []string{}
				for k := repeat.Start; k < repeat.End; k++ {
					original := a.ChapterIndexMap[k]
					if seen[original] {
						continue
					}
					seen[original] = true
					if original < len(a.ChapterRawWords) {
						words = append(words, a.ChapterRawWords[original])
					}
				}
				m.RepeatOf = strings.Join(words, " ")
			}
		}
		sourceToken := op.I1
		if sourceToken >= len(doc) {
			sourceToken = max(0, op.I1-1)
		}
		sourceOriginal := 0
		if len(a.ChapterIndexMap) > 0 {
			sourceOriginal = a.ChapterIndexMap[sourceToken]
		}
		if sourceOriginal < len(units.UnitIdx) {
			m.Unit = units.UnitIdx[sourceOriginal]
		}
		m.Confidence, m.TimingGap = TimingConfidence(op.J1, op.J2, a.IndexMap, transcript)
		m.Name, m.Doc, m.Audio, m.RepeatOf = compare.CleanMarkerField(m.Name), compare.CleanMarkerField(m.Doc), compare.CleanMarkerField(m.Audio), compare.CleanMarkerField(m.RepeatOf)
		markers = append(markers, m)
	}
	sort.SliceStable(markers, func(i, j int) bool { return markers[i].Time < markers[j].Time })

	if alignedStart < 0 || alignedEnd <= alignedStart {
		return markers, nil
	}
	first := max(units.UnitIdx[a.ChapterIndexMap[alignedStart]], 0) // the heading (-1) is the first real unit
	last := max(units.UnitIdx[a.ChapterIndexMap[alignedEnd-1]], 0)
	return markers, &[2]int{first, last}
}

func ptr(v int) *int { return &v }
