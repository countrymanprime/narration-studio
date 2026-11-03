package process

import (
	"context"
	"log/slog"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"desktop/internal/runlog"
	"desktop/internal/trace"
)

// firstOutput notes how long after the spawn a child first wrote to stdout. It is an io.Writer so Run and Start can tee their
// stdout through it; a sidecar's start-up cost (bootloader, imports) is the gap before that first byte.
type firstOutput struct {
	started time.Time
	// at is the nanoseconds from started to the first byte, plus one so zero means "none yet".
	at atomic.Int64
}

func (f *firstOutput) Write(p []byte) (int, error) {
	if len(p) > 0 {
		f.at.CompareAndSwap(0, time.Since(f.started).Nanoseconds()+1)
	}
	return len(p), nil
}

// note is Write for a caller that already holds a line, not bytes.
func (f *firstOutput) note() { f.at.CompareAndSwap(0, time.Since(f.started).Nanoseconds()+1) }

// milliseconds is the first-output time in whole milliseconds, or -1 when the child never wrote.
func (f *firstOutput) milliseconds() int64 {
	at := f.at.Load()
	if at == 0 {
		return -1
	}
	return (at - 1) / int64(time.Millisecond)
}

// SetFallbackRun gives the run that receives a sidecar's timing record when the context of the launch carries none (the Story
// Bible's edits start a sidecar with a bare context). It is optional, and a launch without either is not timed. Set it once,
// before the first launch.
func (s *Supervisor) SetFallbackRun(run func() *runlog.Run) { s.fallback = run }

// recordTiming writes one `sidecar.timing` record: which program kind ran, how it was launched (run, start or stream), the
// milliseconds from spawn to its first output and to its exit, and its exit code. Durations and a program name only: the arguments
// carry paths and the narrator's words, so they never reach the log.
func (s *Supervisor) recordTiming(ctx context.Context, mode, program string, first *firstOutput, exitCode int) {
	run := runlog.FromContext(ctx)
	if run == nil && s.fallback != nil {
		run = s.fallback()
	}
	s.tracer.Emit(trace.SidecarExit, trace.IDValue("kind", traceKind(program)), trace.EnumValue("mode", mode),
		trace.IntValue("first_output_ms", first.milliseconds()), trace.DurValue("total", time.Since(first.started)), trace.IntValue("exit_code", int64(exitCode)))
	run.Event(slog.LevelInfo, "sidecar.timing", "sidecar timing", "kind", programKind(program), "mode", mode,
		"first_output_ms", first.milliseconds(), "total_ms", time.Since(first.started).Milliseconds(), "exit_code", exitCode)
}

// programKind is the executable's name without folder or extension ("manuscript-guide", "python"), the same for any install location.
func programKind(program string) string {
	name := filepath.Base(strings.ReplaceAll(program, `\`, "/"))
	return strings.ToLower(strings.TrimSuffix(name, filepath.Ext(name)))
}

// SetTracer gives the supervisor the activity trace (docs/prds/activity-trace.prd.md). Set it once, before the first launch.
func (s *Supervisor) SetTracer(tracer *trace.Tracer) { s.tracer = tracer }

// traceKind is programKind made safe for an id field: lower case, anything outside the id alphabet replaced by an underscore,
// cut to 64. A program named with a space or a non-ASCII letter is still one id.
func traceKind(program string) string {
	kind := []byte(programKind(program))
	for i, b := range kind {
		if !(b >= 'a' && b <= 'z' || b >= '0' && b <= '9' || b == '_' || b == '.' || b == ':' || b == '-') {
			kind[i] = '_'
		}
	}
	if len(kind) == 0 {
		return "unknown"
	}
	if len(kind) > 64 {
		kind = kind[:64]
	}
	return string(kind)
}

func (s *Supervisor) traceStart(mode, program string) {
	s.tracer.Emit(trace.SidecarStart, trace.IDValue("kind", traceKind(program)), trace.EnumValue("mode", mode))
}

func (s *Supervisor) traceStartFailed(mode, program string, err error) {
	s.tracer.Emit(trace.SidecarStartFailed, trace.IDValue("kind", traceKind(program)), trace.EnumValue("mode", mode), trace.ErrValue("err", err))
}
