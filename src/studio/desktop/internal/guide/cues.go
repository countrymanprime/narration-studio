package guide

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// CueCounts is what a cue refresh found: every quoted line, and how many of them have a speaker.
type CueCounts struct {
	Cues       int
	Attributed int
}

// RefreshCues writes the dialogue cues without a Story Bible build (the sidecar's cues command), against the entries already filed under
// a speaking type, keeping the narrator's corrections. With chapterIDs, only those chapters' cues are recomputed. With no Story Bible yet,
// the sidecar starts an empty one. It holds editMu while the sidecar rewrites the file, so a host edit is not lost under it.
func (s *Service) RefreshCues(ctx context.Context, chapterIDs ...string) (CueCounts, error) {
	if s.project == "" {
		return CueCounts{}, errNoProject
	}
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		return CueCounts{}, err
	}
	args := []string{"cues", "--guide", s.guidePath(), "--manuscript", s.manuscript()}
	for _, id := range chapterIDs {
		args = append(args, "--chapter-id", id)
	}
	s.editMu.Lock()
	defer s.editMu.Unlock()
	out, err := s.runContext(ctx, args...)
	s.held = nil
	if err != nil {
		return CueCounts{}, err
	}
	return parseCueCounts(out)
}

// parseCueCounts reads the CUES|<cues>|<with a speaker> line the sidecar prints last.
func parseCueCounts(out string) (CueCounts, error) {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	fields := strings.Split(strings.TrimSpace(lines[len(lines)-1]), "|")
	if len(fields) == 3 && fields[0] == "CUES" {
		cues, errCues := strconv.Atoi(fields[1])
		attributed, errAttributed := strconv.Atoi(fields[2])
		if errCues == nil && errAttributed == nil && cues >= 0 && attributed >= 0 && attributed <= cues {
			return CueCounts{Cues: cues, Attributed: attributed}, nil
		}
	}
	return CueCounts{}, fmt.Errorf("the Story Bible sidecar did not say how many quoted lines it found")
}

// SpeakerChapters is the chapters an entry's names appear in, by chapter id in first-seen order, and whether its type speaks: the
// chapters whose cues change when the entry is filed under, or out of, a speaking type. An entry that is not there has none.
func (s *Service) SpeakerChapters(id string) (chapters []string, speaks bool, err error) {
	types, err := s.Types()
	if err != nil {
		return nil, false, err
	}
	entities, err := s.Entities()
	if err != nil {
		return nil, false, err
	}
	for _, entity := range entities {
		if text(entity, "id") != id {
			continue
		}
		for _, row := range types {
			if row.Name == text(entity, "category") {
				speaks = row.Speaks
			}
		}
		seen := map[string]bool{}
		add := func(occurrences any) {
			list, _ := occurrences.([]any)
			for _, raw := range list {
				occurrence, _ := raw.(map[string]any)
				if chapter := text(occurrence, "chapterId"); chapter != "" && !seen[chapter] {
					seen[chapter] = true
					chapters = append(chapters, chapter)
				}
			}
		}
		add(entity["occurrences"])
		aliases, _ := entity["aliases"].([]any)
		for _, raw := range aliases {
			if alias, ok := raw.(map[string]any); ok {
				add(alias["occurrences"])
			}
		}
		return chapters, speaks, nil
	}
	return nil, false, nil
}
