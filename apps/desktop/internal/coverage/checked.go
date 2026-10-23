package coverage

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// checkedRanges are, per words file, the source ranges the re-check model has already transcribed: the ledger an
// incremental check reads (#2251). It lives in the words files themselves - their transcription model and the spans a
// windows-only re-check splices in (sidecars/transcript-compare/core/coverage_mode.py's checked_ranges) - and the words
// cache keeps them per source under a key that names both models (wordsParamHash), so a model change starts a new
// ledger and changed audio is a new source.
type checkedRanges map[string][][2]float64

// checkedWords is the part of a words file readCheckedRanges reads.
type checkedWords struct {
	SchemaVersion int     `json:"schemaVersion"`
	SourceStart   float64 `json:"sourceStart"`
	SourceEnd     float64 `json:"sourceEnd"`
	Transcription struct {
		Model string `json:"model"`
	} `json:"transcription"`
	Spans []struct {
		Start float64 `json:"start"`
		End   float64 `json:"end"`
		Model string  `json:"model"`
	} `json:"spans"`
}

// readCheckedRanges reads the ranges model has transcribed in each unmuted item's words file under dir. A missing or
// unreadable file is a miss: its windows are planned, never skipped.
func readCheckedRanges(dir string, items []plannedItem, model string) checkedRanges {
	checked := checkedRanges{}
	if model == "" {
		return checked
	}
	for _, item := range items {
		if item.Muted {
			continue
		}
		if _, done := checked[item.WordsFile]; done {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, item.WordsFile))
		if err != nil {
			continue
		}
		var words checkedWords
		if json.Unmarshal(raw, &words) != nil || words.SchemaVersion != 1 {
			continue
		}
		var ranges [][2]float64
		if len(words.Spans) == 0 {
			if words.Transcription.Model == model && words.SourceEnd > words.SourceStart {
				ranges = append(ranges, [2]float64{words.SourceStart, words.SourceEnd})
			}
		} else {
			for _, span := range words.Spans {
				if span.Model == model && span.End > span.Start {
					ranges = append(ranges, [2]float64{span.Start, span.End})
				}
			}
		}
		if len(ranges) > 0 {
			checked[item.WordsFile] = ranges
		}
	}
	return checked
}

// contains reports whether one of the file's checked ranges holds [start, end].
func (c checkedRanges) contains(wordsFile string, start, end float64) bool {
	for _, r := range c[wordsFile] {
		if r[0] <= start+rangeTolerance && r[1] >= end-rangeTolerance {
			return true
		}
	}
	return false
}
