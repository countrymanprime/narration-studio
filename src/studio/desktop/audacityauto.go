package main

import (
	"log/slog"

	"desktop/internal/audacitylink"
)

// audacityAutoConnect does for an Audacity project what the narrator would otherwise do by hand, as far as Audacity allows, at most
// once each per opened project:
//   - scripting off and Audacity closed: the app turns mod-script-pipe on in Audacity's settings file (AudacityEnableModule's write);
//   - scripting on, Audacity closed and an Audacity project linked: the app starts Audacity on it (DawLaunch's start).
//
// What it cannot do, the link state's sentence says: Audacity writes its settings file when it closes, so scripting cannot be turned
// on while it runs, and it makes that file only on its first start, which cannot load scripting; nothing Audacity loads can start a
// program, so there is no Audacity-side bridge (docs/architecture/daw-integration.md#audacity-boundary). Only the app's real start
// enables it (dawAutoEnabled).
func (h *Host) audacityAutoConnect(svc hostServices, conn *audacityConn, link AudacityLink) {
	if !h.dawAutoEnabled.Load() || conn == nil || conn.closed.Load() || !link.Chosen || link.Running {
		return
	}
	conn.mu.Lock()
	enable := link.Action == string(audacitylink.ActionEnableModule) && !conn.autoEnabled
	start := link.State == string(audacitylink.StateNotRunning) && link.Linked && !conn.autoStarted
	if enable {
		conn.autoEnabled = true
	}
	if start {
		conn.autoStarted = true
	}
	conn.mu.Unlock()
	if enable {
		err := audacitylink.EnableModule(h.audacitySettingsPath(), h.isAudacityRunning())
		h.runLog.App().Event(slog.LevelInfo, "daw.autoconnect", "turned Audacity's scripting on", "action", "enable_module", "ok", err == nil, "error", errText(err))
		link = h.audacityLinkRefresh(svc, false)
		start = err == nil && link.State == string(audacitylink.StateNotRunning) && link.Linked
		if start {
			conn.mu.Lock()
			start = !conn.autoStarted
			conn.autoStarted = true
			conn.mu.Unlock()
		}
	}
	if start {
		_, err := h.launchAudacity(svc)
		h.runLog.App().Event(slog.LevelInfo, "daw.autoconnect", "opened Audacity on the linked project", "action", "start", "ok", err == nil, "error", errText(err))
	}
}
