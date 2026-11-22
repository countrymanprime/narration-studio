package comparerun

import (
	"path/filepath"
	"testing"
)

func TestRunOfFileReadsTheRunIDOfTheThreeFilesOfARun(t *testing.T) {
	for name, want := range map[string]string{
		"Chapter_1_1763800000000000.diff":           "1763800000000000",
		"Chapter_1_1763800000000000.manuscript.txt": "1763800000000000",
		"Chapter_1_1763800000000000.recorded.txt":   "1763800000000000",
		"a.b_c_7.diff":         "7",
		"トラック_42.recorded.txt": "42",
	} {
		if got, ok := RunOfFile(name); !ok || got != want {
			t.Errorf("RunOfFile(%q) = %q, %v; want %q", name, got, ok, want)
		}
	}
}

func TestRunOfFileRefusesWhatIsNotARunsFile(t *testing.T) {
	for _, name := range []string{"equivalences.csv", "vocab_hints.json", "vocabulary_hints.txt", "x_1763.diff.part", "x_1763.diff.tmp", "x_abc.diff", "x_1763.txt", "1763.diff", ".diff", ""} {
		if got, ok := RunOfFile(name); ok {
			t.Errorf("RunOfFile(%q) = %q, true; want not a run's file", name, got)
		}
	}
}

func TestDiffFolderIsBelowTheProjectFolder(t *testing.T) {
	if got, want := DiffFolder(), filepath.Join("TranscriptCompare", "diffs"); got != want {
		t.Fatalf("DiffFolder() = %q, want %q", got, want)
	}
}

// B6: the names the writers make include an empty track name and one with a newline (a track name is the narrator's own text).
func TestRunOfFileMatchesEveryNameTheWritersMake(t *testing.T) {
	for name, want := range map[string]string{"_1700.diff": "1700", "a\nb_17000.diff": "17000", "_5.manuscript.txt": "5", "é 🦎 עברית_9.recorded.txt": "9"} {
		if got, ok := RunOfFile(name); !ok || got != want {
			t.Errorf("RunOfFile(%q) = %q, %v; want %q", name, got, ok, want)
		}
	}
}
