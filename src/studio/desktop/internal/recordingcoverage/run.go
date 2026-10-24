package recordingcoverage

import (
	"fmt"
	"os"
	"path/filepath"

	"desktop/internal/compare"
)

// Request is one chapter's alignment over a run's files: the manifest the host
// wrote, the words files in WordsDir, and the canonical manuscript.
type Request struct {
	ManifestPath   string
	WordsDir       string
	ManuscriptPath string
	ChapterID      string
	// Out is the results file, written atomically.
	Out string
	// WordsReport is the sidecar's words report for a run that transcribed;
	// empty for an align-only re-run, which needs every playing item's words
	// cached and counts them all as reused.
	WordsReport string
	// Model and CheckedBy say which words files serve an align-only run: made
	// by Model, or by the larger CheckedBy model.
	Model     string
	CheckedBy string
	Language  *string
	Params    AlignmentParams
}

// Run aligns the chapter to the run's words and writes the results file. Any
// results file left from an earlier run is removed first, so a failure never
// leaves one that passes for this run's.
func Run(r Request) error {
	if err := os.Remove(r.Out); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := r.Params.Validate(); err != nil {
		return err
	}
	items, err := ReadManifest(r.ManifestPath)
	if err != nil {
		return err
	}
	groups, hash, err := ProjectEquivalences(r.ManuscriptPath)
	if err != nil {
		return err
	}
	chapter, err := LoadChapter(r.ManuscriptPath, r.ChapterID)
	if err != nil {
		return err
	}
	results, err := r.itemResults(items)
	if err != nil {
		return err
	}
	in := Input{
		Chapter: chapter, Items: results, Params: r.Params, Tokenizer: compare.NewTokenizer(groups),
		Analysis: Analysis{Model: r.Model, Language: r.Language, EquivalencesHash: hash},
	}
	if r.WordsReport != "" {
		report, err := ReadWordsReport(r.WordsReport)
		if err != nil {
			return err
		}
		in.Unsure, in.Rechecked = report.Unsure, report.Rechecked
	}
	text, err := Results(in)
	if err != nil {
		return err
	}
	return writeAtomically(r.Out, text)
}

func (r Request) itemResults(items []ManifestItem) ([]ItemResult, error) {
	var sources map[int]string
	if r.WordsReport != "" {
		report, err := ReadWordsReport(r.WordsReport)
		if err != nil {
			return nil, err
		}
		sources = report.Sources
	}
	results := make([]ItemResult, len(items))
	for k, item := range items {
		results[k].Item = item
		if item.Muted {
			continue
		}
		words := ReadWordsFile(filepath.Join(r.WordsDir, item.WordsFile))
		if sources == nil {
			if words == nil || !(words.Covers(item, r.Model) || r.CheckedBy != "" && words.Covers(item, r.CheckedBy)) {
				return nil, fmt.Errorf("Align again needs every item's words, but item %d has none cached for the part it plays. Run the recording check to transcribe it.", item.Index)
			}
			results[k].Source, results[k].Words = SourceReused, words
			continue
		}
		source, ok := sources[item.Index]
		if !ok || words == nil {
			return nil, fmt.Errorf("The recording check has no words for item %d.", item.Index)
		}
		results[k].Source, results[k].Words = source, words
	}
	return results, nil
}

// writeAtomically is coverage_mode._write_atomically: a temporary file, then a
// rename, so a reader never sees half a results file.
func writeAtomically(path, text string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, []byte(text), 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}
