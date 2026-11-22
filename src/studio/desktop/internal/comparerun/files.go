package comparerun

import (
	"path/filepath"
	"regexp"
)

// DiffFolder is where a run's diff and its two text files (<base>.manuscript.txt and <base>.recorded.txt, written beside the diff
// by Run) are kept, below the project folder. The folder also may hold nothing else this package writes.
func DiffFolder() string { return filepath.Join("TranscriptCompare", "diffs") }

// diffFile matches <track>_<run id>.diff and the two text files written beside it: the run id is the digits after the last underscore.
var diffFile = regexp.MustCompile(`(?s)^.*_(\d+)\.(?:diff|manuscript\.txt|recorded\.txt)$`)

// RunOfFile is the run a file of DiffFolder belongs to: the run id its name ends with, the same for the three files of one run. A
// name that is not one of those three (a stray file, a note) is not a run's file and answers false.
func RunOfFile(name string) (string, bool) {
	match := diffFile.FindStringSubmatch(name)
	if match == nil {
		return "", false
	}
	return match[1], true
}
