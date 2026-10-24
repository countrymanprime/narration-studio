package soundalike

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"

	"desktop/internal/contractfile"
)

type calibrationCase struct {
	Script string `json:"script"`
	Heard  string `json:"heard"`
	Band   string `json:"band"`
	Source string `json:"source"`
}

// bands are tests/fixtures/sound-alike/cases.json's: the misread confidence each band allows.
var bands = map[string][2]float64{"alike": {0, 0.35}, "near": {0.25, 0.6}, "different": {0.5, 1}}

func calibration(t *testing.T) []calibrationCase {
	t.Helper()
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(dir), "sound-alike", "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases []calibrationCase `json:"cases"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatal(err)
	}
	if len(file.Cases) < 20 {
		t.Fatalf("only %d calibration cases", len(file.Cases))
	}
	return file.Cases
}

// TestMisreadConfidenceFallsInEachCalibrationCasesBand holds the score to the owner's examples (#2251 item 27) and to
// what Whisper heard against the script in the committed LibriVox recordings.
func TestMisreadConfidenceFallsInEachCalibrationCasesBand(t *testing.T) {
	for _, c := range calibration(t) {
		band, ok := bands[c.Band]
		if !ok {
			t.Fatalf("%q/%q: unknown band %q", c.Script, c.Heard, c.Band)
		}
		got := MisreadConfidence(c.Script, c.Heard)
		if got < band[0] || got > band[1] {
			t.Errorf("%s: %q heard as %q: confidence %.2f, want %s (%.2f..%.2f)", c.Source, c.Script, c.Heard, got, c.Band, band[0], band[1])
		}
	}
}

func TestTheOwnersExamplesAreNeitherClearMissesNorClearHits(t *testing.T) {
	// "MBA" heard as "NBA" was shown at 100%: one letter of three, and M and N sound alike.
	if got := MisreadConfidence("MBA", "NBA"); got >= 0.35 || got <= 0 {
		t.Errorf("MBA/NBA = %.2f", got)
	}
	if got := MisreadConfidence("Veyra", "verus"); got <= 0.25 || got >= 0.6 {
		t.Errorf("Veyra/verus = %.2f", got)
	}
}

func TestSimilarityIsSymmetricBoundedAndOneForTheSameWords(t *testing.T) {
	pairs := [][2]string{{"MBA", "NBA"}, {"Veyra", "verus"}, {"cat", "dog"}, {"", "a"}, {"Ünïcode", "unicode"}, {"مرحبا", "مرحب"}, {"😀 hi", "hi"}}
	for _, p := range pairs {
		a, b := Similarity(p[0], p[1]), Similarity(p[1], p[0])
		if math.Abs(a-b) > 1e-9 || a < 0 || a > 1 {
			t.Errorf("%q/%q: %v vs %v", p[0], p[1], a, b)
		}
	}
	for _, same := range []string{"Gryphon", "jury-men", "Dinah'll", "MBA"} {
		if got := Similarity(same, same); got != 1 {
			t.Errorf("%q with itself: %v", same, got)
		}
	}
	// Case, punctuation and spacing are not sounds.
	if got := Similarity("Jury-men,", "jurymen"); got != 1 {
		t.Errorf("jury-men/jurymen: %v", got)
	}
}

func TestNothingToCompareIsNotSimilar(t *testing.T) {
	for _, p := range [][2]string{{"", ""}, {"…", "—"}, {"word", ""}, {"", "word"}} {
		if got := Similarity(p[0], p[1]); got != 0 {
			t.Errorf("%q/%q: %v", p[0], p[1], got)
		}
	}
}

func TestAHugeRunIsBoundedAndStillScored(t *testing.T) {
	long := make([]byte, 0, 5000)
	for range 1000 {
		long = append(long, "word "...)
	}
	if got := Similarity(string(long), string(long)+"x"); got <= 0.9 || got > 1 {
		t.Errorf("long run: %v", got)
	}
}

func TestCombineScalesAnotherScoreByHowUnlikeTheWordsSound(t *testing.T) {
	base := 0.9
	got := Combine(&base, "MBA", "NBA")
	if want := base * MisreadConfidence("MBA", "NBA"); math.Abs(got-want) > 0.005 {
		t.Errorf("Combine = %v, want %v", got, want)
	}
	if got := Combine(nil, "cat", "dog"); got != MisreadConfidence("cat", "dog") {
		t.Errorf("Combine(nil) = %v", got)
	}
}

func TestPrintCalibration(t *testing.T) {
	if os.Getenv("PRINT_CALIBRATION") == "" {
		t.Skip("set PRINT_CALIBRATION=1 to print every case's score")
	}
	for _, c := range calibration(t) {
		t.Logf("| %s | %s | %s | %.2f |", c.Script, c.Heard, c.Band, MisreadConfidence(c.Script, c.Heard))
	}
}

func TestOnlyTheWordsHeardDifferentlyAreCompared(t *testing.T) {
	if a, b := MisreadConfidence("Veyra Skyline", "verus skyline"), MisreadConfidence("Veyra", "verus"); a != b {
		t.Errorf("Veyra Skyline/verus skyline = %v, Veyra/verus = %v", a, b)
	}
	if got := Similarity("the quick brown fox", "the quick brown"); got != 0 {
		t.Errorf("a dropped word = %v, want 0", got)
	}
}
