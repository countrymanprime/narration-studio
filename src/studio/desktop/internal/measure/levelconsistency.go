package measure

import (
	"fmt"
	"math"

	"desktop/internal/findings"
)

// LevelConsistencyLU is how far a file's loudness may sit from the median of the other files checked with it before it is
// raised as a level_consistency candidate. Three loudness units is a step a listener hears between chapters.
const LevelConsistencyLU = 3.0

// minLevelFiles is how many files with a measurable loudness a comparison needs: each is judged against the median of the
// others, and two files have only one other.
const minLevelFiles = 3

const kindLevelConsistency = "level_consistency"

// fileLoudness is the file's loudness in LUFS: the energy mean of its short-term loudness, nil when none was measured.
func fileLoudness(d Diagnostics) *float64 {
	var energy float64
	var count int
	for _, point := range d.ShortTermLoudness {
		if point.LUFS != nil && finite(*point.LUFS) {
			energy += math.Pow(10, *point.LUFS/10)
			count++
		}
	}
	if count == 0 {
		return nil
	}
	level := 10 * math.Log10(energy/float64(count))
	return &level
}

// LevelConsistencyFindings compares the files of one check with each other and raises a level_consistency candidate, keyed
// by the file's index, for each whose loudness is at least LevelConsistencyLU from the median of the others'. It raises
// nothing for fewer than three measurable files, and never for a file it could not measure. A deliberate change in
// delivery, or one character's quieter voice, moves a file too, so each is a candidate to listen to.
func LevelConsistencyFindings(files []Diagnostics) map[int][]findings.Finding {
	levels := make([]*float64, len(files))
	measured := 0
	for i, file := range files {
		if levels[i] = fileLoudness(file); levels[i] != nil {
			measured++
		}
	}
	out := map[int][]findings.Finding{}
	if measured < minLevelFiles {
		return out
	}
	for i, level := range levels {
		if level == nil {
			continue
		}
		others := make([]float64, 0, measured-1)
		for j, other := range levels {
			if j != i && other != nil {
				others = append(others, *other)
			}
		}
		middle := median(others)
		delta := *level - middle
		if math.Abs(delta) < LevelConsistencyLU {
			continue
		}
		file := files[i]
		evidence := file.evidence(kindLevelConsistency)
		evidence["file_lufs"], evidence["others_median_lufs"], evidence["delta_lu"] = *level, middle, delta
		evidence["level_consistency_lu"], evidence["files_compared"] = LevelConsistencyLU, len(others)
		reason := fmt.Sprintf("a candidate from this file's mean short-term loudness against the median of the %d other files checked with it, in a %s; a deliberate change in delivery moves it too, so listen before acting", len(others), file.SourceKind.label())
		out[i] = []findings.Finding{file.newFinding(kindLevelConsistency, findings.CategoryLevelConsistency, findings.SeverityWarning, 0, file.DurationSeconds, nil, reason, evidence)}
	}
	return out
}
