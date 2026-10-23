package main

import (
	"log/slog"

	"desktop/internal/bridge"
)

// recordBridgeTiming writes one `bridge.timing` record to the app run in run.jsonl for each REAPER request: the command's name, a fixed
// outcome word and the milliseconds from writing the command to its outcome. It is what tells a slow answer (the 150 ms
// transcriptLoop tick) from a slow script. No argument or answer reaches it.
func (h *Host) recordBridgeTiming(timing bridge.RequestTiming) {
	h.runLog.App().Event(slog.LevelInfo, "bridge.timing", "bridge request timing", "command", timing.Command, "outcome", timing.Outcome, "elapsed_ms", timing.Elapsed.Milliseconds())
}
