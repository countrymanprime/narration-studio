package main

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// The class guard for "the credits are chapters": the chapter list the manuscript service answers holds the credits, so every host file
// that reads it either handles a credits entry or leaves it out on purpose. A new reader in neither table fails here.
var creditsListReaders = map[string]string{
	"bindings.go":                       "ManuscriptChapters: the list itself",
	"bindings_production.go":            "the overview, the timer and the recorded figures list the credits like chapters",
	"chapterlinks.go":                   "ChapterTrackLinks lists them; the region plan skips them (they come from the picked tracks)",
	"mapping.go":                        "chapterTitle answers a credits id before it reads the list",
	"readaloudreaper.go":                "a credits entry is read like a chapter (chapterLinksFor)",
	"bindings_stages.go":                "the stage engine leaves them out (internal/stages)",
	"bindings_preview.go":               "skips them: no text to pick a window from",
	"bindings_preview_pin.go":           "looks up one chapter by id for a pin; the credits have no paragraphs to pin",
	"bindings_pickuplist.go":            "skips them: no line of text to re-read",
	"chaptermatch.go":                   "skips them: a track is never matched to the credits by name",
	"chaptersync.go":                    "skips them: the credits are linked by hand",
	"internal/stages/assess.go":         "skips them: no stage evidence of their own",
	"internal/pickuplist/pickuplist.go": "reads the list through pickupChapters, which skips them",
}

func TestEveryHostReaderOfTheChapterListHandlesTheCredits(t *testing.T) {
	call := regexp.MustCompile(`\.(Chapters|ChaptersUnmeasured)\(\)|config\.Chapters|Chapters:\s+text\.ChaptersUnmeasured`)
	found := map[string]bool{}
	err := filepath.Walk(".", func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		if strings.HasPrefix(filepath.ToSlash(path), "internal/manuscript/") || strings.HasPrefix(filepath.ToSlash(path), "cmd/") {
			return nil
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if call.Match(data) {
			found[filepath.ToSlash(path)] = true
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	var missing []string
	for path := range found {
		if _, declared := creditsListReaders[path]; !declared {
			missing = append(missing, path)
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Fatalf("these files read the chapter list, which holds the credits; list each in creditsListReaders with what it does with them: %v", missing)
	}
}
