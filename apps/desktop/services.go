package main

import (
	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/character"
	"github.com/countrymanprime/narration-utils/shell/internal/cleanuptools"
	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/editing"
	"github.com/countrymanprime/narration-utils/shell/internal/findings"
	"github.com/countrymanprime/narration-utils/shell/internal/guide"
	"github.com/countrymanprime/narration-utils/shell/internal/lineidentity"
	"github.com/countrymanprime/narration-utils/shell/internal/manuscript"
	"github.com/countrymanprime/narration-utils/shell/internal/pickups"
	"github.com/countrymanprime/narration-utils/shell/internal/production"
	"github.com/countrymanprime/narration-utils/shell/internal/projectstate"
	"github.com/countrymanprime/narration-utils/shell/internal/recording"
	"github.com/countrymanprime/narration-utils/shell/internal/renderconfig"
	"github.com/countrymanprime/narration-utils/shell/internal/retakelanes"
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
	"github.com/countrymanprime/narration-utils/shell/internal/stages"
	"github.com/countrymanprime/narration-utils/shell/internal/teleprompter"
	"github.com/countrymanprime/narration-utils/shell/internal/transcript"
)

// hostServices is one consistent view of the project-scoped state of a Host:
// the launch config and the service pointers that configureLocked replaces
// whenever a project is attached (the picker, "open recent", and a REAPER
// second launch). A service can legitimately be nil, so callers keep their
// nil checks. The asset managers are not here: they are not project-scoped,
// and the registry that holds them is built once (assetregistry.go).
type hostServices struct {
	config       config
	findings     *findings.Store
	guide        *guide.Service
	lineIdentity *lineidentity.Service
	manuscript   *manuscript.Service
	pickups      *pickups.Service
	projectState *projectstate.Service
	renderConfig *renderconfig.Service
	cleanupTools *cleanuptools.Service
	retakeLanes  *retakelanes.Service
	settings     *settings.Store
	teleprompter *teleprompter.Service
	recorder     *recording.Service
	transcript   *transcript.Service
	coverage     *coverage.Service
	stages       *stages.Service
	production   *production.Service
	editing      *editing.Service
	character    *character.Service
	// reachability tracks the current bridge client's PROJECT_STATUS heartbeat (ADR 0092), behind the
	// DAW port's Heartbeat role. Never a true nil interface: with no bridge client configureLocked
	// still sets it to an always-unreachable stand-in.
	reachability dawport.Heartbeat
	bridge       *bridge.Client
	// actions sends the bridge commands (internal/bridge/actions.go), create_regions among them, on the same
	// client; never nil once configured (with no client every request is bridge.ErrUnavailable).
	actions *bridge.Actions
	// navigation is the Review page's REAPER navigator (bindings_navigation.go); standalone when there is no bridge.
	navigation *findingNavigation
	// takeCreator is the DAW port's take_create role over the same bridge client; nil (a true nil
	// interface) with no bridge client or no such role.
	takeCreator dawport.TakeCreator
	// takeSelector is the DAW port's takes role over the same bridge client; nil (a true nil interface) with no bridge
	// client or no such role.
	takeSelector dawport.TakeSelector
	// puncher is the DAW port's punch role over the same bridge client; nil (a true nil interface) with no bridge client or
	// no such role.
	puncher dawport.Puncher
	// rangeCutter is the DAW port's cut_range role over the same bridge client; nil (a true nil interface) with no bridge
	// client or no such role.
	rangeCutter dawport.RangeCutter
	// rangeFX is the DAW port's fx_range role over the same bridge client; nil (a true nil interface) with no bridge client
	// or no such role.
	rangeFX dawport.RangeFXApplier
	// dawPortResolver is the DAW port's resolver for the roles bindings_navigation.go, readaloudreaper.go,
	// teleprompterinput.go and chapterregions.go ask for (ADR 0300); nil with no bridge client.
	dawPortResolver *dawport.Resolver
}

// services returns a snapshot of the swappable services. It is the only way a
// binding or helper reads them:
//
//	svc := h.services()
//	if svc.guide == nil { ... }
//	svc.guide.Entities()
//
// Use one snapshot for the whole call, so a call that needs several services
// (GuidePreview uses guide, settings and tts) sees one project even if the user
// switches while it runs, and pass the snapshot, not the Host, to goroutines
// that outlive the call.
//
// The lock is taken to copy and released before the snapshot is returned. Never
// hold h.mu across a service call: the emit callbacks re-enter h.mu.RLock, and a
// recursive read lock behind a queued writer (a project switch) deadlocks. For
// the same reason never call services() while holding h.mu yourself: with the
// write lock held (configureLocked and every unexported ...Locked function, ProjectSwitch
// and onSecondInstance between Lock and Unlock) it deadlocks on itself; use
// h.config there, or take the snapshot before locking.
//
// hostguard_test.go fails `go test` on any other read of these fields, so a new
// binding cannot regress this by accident. h.recents and h.sidecars are set once
// in NewHost and never reassigned, so they are read directly.
//
// Adding a binding:
//  1. Start the body with `svc := h.services()` (or `service := h.services().guide`
//     when one service is enough) and use it, and svc.config, only.
//  2. Add a row to stressReaders in hostrace_test.go if it reads a service.
//  3. Never call a service while holding h.mu; never re-read a field in a goroutine.
//  4. Run `go -C apps/desktop test ./...`. A direct h.guide read fails
//     TestHostReadsSwappableServicesOnlyThroughTheAccessor with the file, line and
//     function.
func (h *Host) services() hostServices {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return hostServices{
		config:          h.config,
		findings:        h.findings,
		guide:           h.guide,
		lineIdentity:    h.lineIdentity,
		manuscript:      h.manuscript,
		pickups:         h.pickups,
		projectState:    h.projectState,
		renderConfig:    h.renderConfig,
		cleanupTools:    h.cleanupTools,
		retakeLanes:     h.retakeLanes,
		settings:        h.settings,
		teleprompter:    h.teleprompter,
		recorder:        h.recorder,
		transcript:      h.transcript,
		coverage:        h.coverage,
		stages:          h.stages,
		production:      h.production,
		editing:         h.editing,
		character:       h.character,
		reachability:    h.reachability,
		bridge:          h.bridge,
		actions:         h.actions,
		navigation:      h.navigation,
		takeCreator:     h.takeCreator,
		takeSelector:    h.takeSelector,
		puncher:         h.puncher,
		rangeCutter:     h.rangeCutter,
		rangeFX:         h.rangeFX,
		dawPortResolver: h.dawPortResolver,
	}
}
