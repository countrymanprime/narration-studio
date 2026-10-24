package comparerun

import (
	"strings"

	"desktop/internal/chaptermatch"
	"desktop/internal/compare"
	"desktop/internal/recordingcoverage"
)

// NeedChapter is a track name that matched no chapter well enough: the narrator picks one of Candidates, the
// chapters' display titles (compare.DisplayTitle), and the run starts again with it as the chapter title.
type NeedChapter struct {
	Candidates []string
}

func (NeedChapter) Error() string { return "Choose the manuscript chapter." }

// Choose is the chapter choice compare.py's run made before it decoded anything: with a chapterTitle (the narrator's
// pick after a NeedChapter), the chapter whose display title is exactly that, at score 1; otherwise the chapter the track
// name matches (chaptermatch.MatchTitleWith, the project's equivalences on both sides) and its score. A credits track
// or a name that matches nothing well enough is a NeedChapter.
func Choose(t compare.Tokenizer, chapters []compare.Chapter, trackName, chapterTitle string) (compare.Chapter, float64, error) {
	if chapterTitle != "" {
		for _, chapter := range chapters {
			if compare.DisplayTitle(chapter.Title) == chapterTitle {
				return chapter, 1.0, nil
			}
		}
		return compare.Chapter{}, 0, sentence("Chapter title override '%s' not found in the document.", chapterTitle)
	}
	titles := make([]string, len(chapters))
	for k, chapter := range chapters {
		titles[k] = chapter.Title
	}
	match := chaptermatch.MatchTitleWith(t, titles, trackName)
	if match.Index < 0 {
		candidates := make([]string, len(chapters))
		for k, chapter := range chapters {
			// The NEED_CHAPTER line the sidecar wrote was pipe-separated, so a pipe in a title became a slash.
			candidates[k] = strings.ReplaceAll(compare.DisplayTitle(chapter.Title), "|", "/")
		}
		return compare.Chapter{}, 0, NeedChapter{Candidates: candidates}
	}
	return chapters[match.Index], match.Score, nil
}

// LoadChapters reads the project's equivalences and the manuscript's narration chapters: what a run chooses its chapter
// from and builds its markers with.
func LoadChapters(manuscriptPath string) (compare.Tokenizer, []compare.Chapter, error) {
	groups, _, err := recordingcoverage.ProjectEquivalences(manuscriptPath)
	if err != nil {
		return compare.Tokenizer{}, nil, err
	}
	chapters, err := compare.LoadManuscriptChapters(manuscriptPath)
	if err != nil {
		return compare.Tokenizer{}, nil, err
	}
	return compare.NewTokenizer(groups), chapters, nil
}
