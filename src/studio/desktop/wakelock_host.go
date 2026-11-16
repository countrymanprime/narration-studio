package main

import (
	"log/slog"

	"desktop/internal/wakelock"
)

// wakeKeeper is the one Keeper of this host: it holds the operating system's "do not sleep" request while a take is recording (#3574).
func (h *Host) wakeKeeper() *wakelock.Keeper {
	h.wakeOnce.Do(func() {
		inhibitor := h.wakeInhibitor
		if inhibitor == nil {
			inhibitor = wakelock.OS()
		}
		h.wake = wakelock.New(inhibitor)
	})
	return h.wake
}

// keepAwake follows the transport state's `recording`: true from any engine's take (the built-in recorder, or REAPER's heartbeat saying it
// records, including a take the narrator started in REAPER), false once every one has ended or the DAW went quiet or away. It runs on
// every tick of transcriptLoop and on each recorder state change, so a refused request is tried again on the next one; the run log says so
// once, not every tick. It reads the transport itself, under wakeMu: two callers at once cannot apply an older answer after a newer one.
func (h *Host) keepAwake() {
	h.wakeMu.Lock()
	defer h.wakeMu.Unlock()
	recording, _ := h.dawTransport()["recording"].(bool)
	err := h.wakeKeeper().Set(recording)
	if err == nil {
		h.wakeRefused.Store(false)
		return
	}
	if h.wakeRefused.Swap(true) || h.runLog == nil {
		return
	}
	h.runLog.App().Event(slog.LevelWarn, "app.wake_lock_refused", "the computer could not be asked to stay awake while recording", "error", err.Error())
}

// stopKeepingAwake gives the request back for good: the app is quitting.
func (h *Host) stopKeepingAwake() { h.wakeKeeper().Close() }
