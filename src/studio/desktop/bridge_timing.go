package main

import (
	"log/slog"
	"time"

	"desktop/internal/bridge"
)

// slowBridgeStep is how long one REAPER request may take before the app's run log says so in a warning of its own.
const slowBridgeStep = time.Second

// recordBridgeTiming writes one `bridge.timing` record to the app run in run.jsonl for each REAPER request, always, with nothing for the
// narrator to switch on: the command's name, a fixed outcome word and the milliseconds from writing the command to its outcome, split into
// `queue_ms` (the command file waiting for REAPER to read it: its next tick, and the handlers of the commands in front of it in that tick) and
// `reaper_ms` (REAPER's own time to answer, the host's poll for the answer included); both are -1 when REAPER answered but the file's
// going could not be seen. `taken` is false when REAPER never read the command (a REAPER that is busy, hung or behind a dialog), and
// `queue_ms` is then the whole wait. It is what tells a slow answer (REAPER's tick, a busy REAPER) from a slow script. No argument or
// answer reaches it.
//
// A request that took slowBridgeStep or longer, or ended with no answer or could not be sent, also writes a `bridge.slow` warning with the same fields, so the
// next slow Booth action is explained by one line of the log that needs nothing from the narrator.
func (h *Host) recordBridgeTiming(timing bridge.RequestTiming) {
	if timing.Queue < 0 {
		timing.Queue = bridge.QueueUnknown
	}
	if timing.Queue > timing.Elapsed {
		timing.Queue = timing.Elapsed
	}
	reaper := timing.Elapsed - timing.Queue
	switch {
	case !timing.Taken:
		reaper = 0
	case timing.Queue < 0:
		reaper = -time.Millisecond
	}
	attrs := []any{
		"command", timing.Command, "outcome", timing.Outcome, "elapsed_ms", timing.Elapsed.Milliseconds(),
		"queue_ms", timing.Queue.Milliseconds(), "reaper_ms", reaper.Milliseconds(), "taken", timing.Taken,
	}
	h.runLog.App().Event(slog.LevelInfo, "bridge.timing", "bridge request timing", attrs...)
	if timing.Elapsed >= slowBridgeStep || timing.Outcome == "no_answer" || timing.Outcome == "send_failed" {
		h.runLog.App().Event(slog.LevelWarn, "bridge.slow", "bridge request over "+slowBridgeStep.String()+" or unanswered", attrs...)
	}
}
