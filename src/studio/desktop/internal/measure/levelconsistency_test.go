package measure

import (
	"math"
	"strings"
	"testing"

	"desktop/internal/findings"
)

func loudFile(name string, lufs ...float64) Diagnostics {
	points := make([]LoudnessPoint, len(lufs))
	for i := range lufs {
		level := lufs[i]
		points[i] = LoudnessPoint{StartSeconds: float64(i), EndSeconds: float64(i + 1), LUFS: &level}
	}
	return Diagnostics{File: name, SourceKind: SourceProcessedRender, DurationSeconds: float64(len(lufs)), ShortTermLoudness: points}
}

func TestLevelConsistencyFlagsTheFileFarFromTheOthers(t *testing.T) {
	files := []Diagnostics{loudFile("a.wav", -20, -20), loudFile("b.wav", -20.5, -20.5), loudFile("c.wav", -19.5, -19.5), loudFile("d.wav", -30, -30)}

	got := LevelConsistencyFindings(files)

	if len(got) != 1 || len(got[3]) != 1 {
		t.Fatalf("want one finding, on the fourth file; got %v", got)
	}
	finding := got[3][0]
	if finding.Category != findings.CategoryLevelConsistency || finding.Severity != findings.SeverityWarning || finding.Review.Status != findings.StatusUnreviewed {
		t.Fatalf("finding %+v", finding)
	}
	if delta, _ := finding.Evidence["delta_lu"].(float64); math.Abs(delta-(-10)) > 0.01 {
		t.Fatalf("delta_lu = %v, want about -10 against the others' median of -20", finding.Evidence["delta_lu"])
	}
	if finding.Evidence["level_consistency_lu"] != LevelConsistencyLU || finding.Evidence["files_compared"] != 3 {
		t.Fatalf("evidence must hold the threshold and how many files it was judged against: %v", finding.Evidence)
	}
	if finding.TimeRange == nil || finding.TimeRange.End != 2 || !strings.Contains(finding.ConfidenceReason, "candidate") {
		t.Fatalf("finding spans the file and says it is a candidate: %+v", finding)
	}
}

func TestLevelConsistencyLeavesFilesWithinTheThresholdAlone(t *testing.T) {
	files := []Diagnostics{loudFile("a.wav", -20), loudFile("b.wav", -21), loudFile("c.wav", -22.5), loudFile("d.wav", -18.1)}
	if got := LevelConsistencyFindings(files); len(got) != 0 {
		t.Fatalf("files within %v LU of the rest were flagged: %v", LevelConsistencyLU, got)
	}
}

func TestLevelConsistencyNeedsThreeMeasurableFilesToCompare(t *testing.T) {
	if got := LevelConsistencyFindings([]Diagnostics{loudFile("a.wav", -20), loudFile("b.wav", -35)}); len(got) != 0 {
		t.Fatalf("two files have no 'others' to be judged against: %v", got)
	}
	silent := Diagnostics{File: "silent.wav"}
	if got := LevelConsistencyFindings([]Diagnostics{loudFile("a.wav", -20), loudFile("b.wav", -35), silent}); len(got) != 0 {
		t.Fatalf("a file with no measurable loudness is not a comparison: %v", got)
	}
	if got := LevelConsistencyFindings(nil); len(got) != 0 {
		t.Fatalf("no files: %v", got)
	}
}

func TestLevelConsistencyNeverFlagsAFileItCouldNotMeasure(t *testing.T) {
	files := []Diagnostics{loudFile("a.wav", -20), loudFile("b.wav", -20), loudFile("c.wav", -20), {File: "silent.wav"}}
	if got := LevelConsistencyFindings(files); len(got) != 0 {
		t.Fatalf("%v", got)
	}
}
