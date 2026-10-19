package main

import (
	"github.com/countrymanprime/narration-utils/shell/internal/project"
	"github.com/countrymanprime/narration-utils/shell/internal/recents"
)

// ProjectRunningDaw answers {linked, path, name} for the project picker's "REAPER is running with a project linked to <name>"
// banner: the recent project, other than the open one, whose linked REAPER file is the project REAPER has open now. It reads
// the Heartbeat role (as DawProjectState does), so it answers only while a bridge is up: a launch with no REAPER session has
// no heartbeat, and the answer is {linked: false, path: "", name: ""}. The wire schema, golden payloads, wireContracts row and
// mock live in apps/ui/src/api (docs/architecture/wire-contracts.md).
func (h *Host) ProjectRunningDaw() (string, error) {
	return encodeBinding(h.projectRunningDaw(), nil)
}

func (h *Host) projectRunningDaw() recents.Running {
	svc := h.services()
	if h.recents == nil || svc.reachability == nil || !svc.reachability.Reachable() {
		return recents.Running{}
	}
	entries, err := h.recents.List()
	if err != nil {
		return recents.Running{}
	}
	return recents.MatchRunning(svc.reachability, svc.config.projectFolder, entries, func(folder string) (string, bool) {
		manifest, ok, err := project.Load(h.persist, folder)
		if err != nil || !ok || manifest == nil || manifest.DawProjectFile == nil {
			return "", false
		}
		return manifest.DawProjectFile.Resolve(folder)
	})
}
