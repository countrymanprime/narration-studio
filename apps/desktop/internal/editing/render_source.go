// This file holds a second, whole-file analysis source for a chapter's
// rendered WAV, alongside the played-range item source (source.go,
// decode.go). It lets the narrator check a render without silently replacing
// the item check (ADR 0550): DecodeRender below is the render path's one
// decode, mirroring Decode's own shape and error handling, but over the
// whole file, so it passes measure.DiagnosticInput.Range as nil rather than
// a range clipped to some item's SOFFS/LENGTH. The chapter-to-render
// association and its own fingerprint/staleness are owned entirely by
// apps/desktop/internal/proofing (RenderStore/EvaluateRender) and
// reused as-is - this file only ever decodes
// a path proofing has already told the caller is the chapter's current
// render (render_signal.go, service.go).

package editing

import (
	"context"
	"fmt"

	"github.com/countrymanprime/narration-utils/shell/internal/measure"
)

// RenderScan is what one whole-file decode of a chapter's rendered WAV
// measured: the same three fields ItemScan carries (decode.go), so the empty-
// space composition and the click/breath evidence builders (render_signal.go)
// can treat a render's own single ItemAudible the same way they already treat
// an item's. Every silence time is in the render file's own seconds from 0
// (the whole file, never a played-range offset - there is no played range for
// a render).
type RenderScan struct {
	DurationSeconds float64
	Silences        []measure.SilenceRegion
	Cleanup         measure.CleanupDiagnostics
}

// DecodeRender runs the same windowed analyzers Decode runs (decode.go), over
// the whole file at path rather than one item's played range: Range is left
// nil, and measure.DiagnoseFile/diagnose treat a nil Range as "the whole
// file" (apps/desktop/internal/measure/diagnostics.go's diagnose: "if
// in.Range != nil" guards every range-specific step, so a nil Range decodes
// start to finish with no skip-ahead and no clipped limit). opts.Silence
// resolves to measure.DefaultDiagnosticOptions() exactly as Decode's own
// silenceOpts does when the caller has no opinion (ScanOptions{}); opts.Cleanup
// is passed through to DiagnosticInput.Cleanup unchanged, resolving to
// measure.DefaultCleanupOptions() inside diagnose itself the same way every
// other caller of DiagnoseFile already relies on.
//
// A decode failure is classified with the same classifyDecodeError helper
// Decode uses (decode.go), so a render and an item report the same stable
// UnknownReason for the same kind of unreadable file - never a second,
// diverging guess at what a raw error means. ctx being done is not a
// refusal, exactly like Decode: DecodeRender returns ctx.Err() with an empty
// reason, and a caller records that as a cancelled run, not an unknown one.
func DecodeRender(ctx context.Context, path string, opts ScanOptions) (RenderScan, UnknownReason, error) {
	silenceOpts := opts.Silence
	if silenceOpts == (measure.DiagnosticOptions{}) {
		silenceOpts = measure.DefaultDiagnosticOptions()
	}
	diagnostics, err := measure.DiagnoseFile(ctx, path, measure.DiagnosticInput{
		SourceKind: measure.SourceRawRecording,
		Options:    silenceOpts,
		Range:      nil,
		Cleanup:    opts.Cleanup,
	})
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return RenderScan{}, "", ctxErr
		}
		return RenderScan{}, classifyDecodeError(err), fmt.Errorf("%s: %w", path, err)
	}
	return RenderScan{
		DurationSeconds: diagnostics.DurationSeconds,
		Silences:        diagnostics.Silences,
		Cleanup:         diagnostics.Cleanup,
	}, "", nil
}
