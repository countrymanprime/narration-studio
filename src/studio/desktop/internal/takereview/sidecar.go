package takereview

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"desktop/internal/comparerun"
	"desktop/internal/process"
)

// SidecarRequest is a scan's manifest and what it is scanned against: the
// manuscript, the chapter (TrackName matched against its headings unless
// ChapterTitle names one), the sidecar's model and language for
// transcribing, and how much two reads' spans must overlap to group.
type SidecarRequest struct {
	ManifestPath   string
	ManuscriptPath string
	TrackName      string
	ChapterTitle   string
	Model          string
	Language       string
	MinSpanOverlap float64
	// ProgressPath is where the sidecar writes its stage|pct|message progress line, and where a
	// "<ProgressPath>.cancel" file asks it to stop; empty runs it without either.
	ProgressPath string
}

// SidecarRunner runs a scan and returns its tagged output text (the
// SUMMARY/SPAN_GROUP/SPAN_MEMBER lines repeats.ParseOutput reads, or a
// NEED_CHAPTER line when no chapter matches). Scanner depends on this interface, not
// a concrete process invocation, so it can be unit-tested with a fake;
// ProcessRunner is the real implementation.
type SidecarRunner interface {
	FindRepeats(ctx context.Context, req SidecarRequest) (string, error)
}

// ProcessRunner is the real SidecarRunner. It chooses the chapter, then runs
// the Transcript Compare sidecar's --find-repeats via process.Supervisor.Run,
// the same synchronous helper the packaged smoke test and Story Bible
// mutations use, to hear each read, and groups the reads
// (comparerun.FindRepeats). It blocks until the sidecar exits; the host's
// scan job (src/studio/desktop/takereview.go) tails the progress file it
// names meanwhile, and cancelling ctx stops the process.
type ProcessRunner struct {
	Sidecars   *process.Supervisor
	Python     string
	Backend    string
	SessionDir string
}

func (r *ProcessRunner) FindRepeats(ctx context.Context, req SidecarRequest) (string, error) {
	if r.Python == "" || r.Sidecars == nil {
		return "", fmt.Errorf("takereview: configure the Transcript Compare executable before scanning")
	}
	tokenizer, chapters, err := comparerun.LoadChapters(req.ManuscriptPath)
	if err != nil {
		return "", fmt.Errorf("takereview: %w", err)
	}
	chapter, _, err := comparerun.Choose(tokenizer, chapters, req.TrackName, req.ChapterTitle)
	var need comparerun.NeedChapter
	if errors.As(err, &need) {
		return comparerun.NeedChapterLine(need), nil
	}
	if err != nil {
		return "", fmt.Errorf("takereview: %w", err)
	}
	reads, err := comparerun.ReadRepeatManifest(req.ManifestPath)
	if err != nil {
		return "", fmt.Errorf("takereview: %w", err)
	}
	if err := os.MkdirAll(r.SessionDir, 0o755); err != nil {
		return "", fmt.Errorf("takereview: could not create the scan session directory: %w", err)
	}

	out := filepath.Join(r.SessionDir, fmt.Sprintf("repeats_%d.txt", time.Now().UnixNano()))
	defer func() { _ = os.Remove(out) }()
	args := findRepeatsArgs(req, out)
	if r.Backend != "" {
		args = append([]string{r.Backend}, args...)
	}

	code, _, stderr, err := r.Sidecars.Run(ctx, r.Python, args...)
	if err != nil {
		return "", fmt.Errorf("takereview: could not start the repeated-span detector: %w", err)
	}
	if code != 0 {
		return "", fmt.Errorf("takereview: repeated-span detector exited %d: %s", code, stderr)
	}

	heard, err := comparerun.ReadRepeatWords(out, len(reads))
	if err != nil {
		return "", fmt.Errorf("takereview: %w", err)
	}
	overlap := req.MinSpanOverlap
	if overlap <= 0 {
		overlap = defaultMinSpanOverlap
	}
	return comparerun.FindRepeats(tokenizer, chapter, reads, heard, minDiscrepancyWords, overlap), nil
}

// defaultMinSpanOverlap is how much of the shorter of two reads' spans must
// overlap for them to group when the request names none, and
// minDiscrepancyWords the shortest discrepancy the alignment counts: the
// defaults --find-repeats had.
const (
	defaultMinSpanOverlap = 0.5
	minDiscrepancyWords   = 1
)

// findRepeatsArgs is the sidecar's --find-repeats argument list for req, writing each read's words to out.
func findRepeatsArgs(req SidecarRequest, out string) []string {
	args := []string{"--manifest", req.ManifestPath, "--manuscript", req.ManuscriptPath, "--find-repeats", "--out", out}
	if req.Model != "" {
		args = append(args, "--model", req.Model)
	}
	if req.Language != "" {
		args = append(args, "--language", req.Language)
	}
	if req.ProgressPath != "" {
		args = append(args, "--progress", req.ProgressPath)
	}
	return args
}
