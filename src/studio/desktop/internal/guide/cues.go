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
