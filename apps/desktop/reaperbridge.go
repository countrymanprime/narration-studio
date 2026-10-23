package main

import (
	"errors"
	"io/fs"
	"log/slog"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/reaperinstall"
)

// The app's bridge in REAPER (internal/reaperinstall): the host puts the bridge into REAPER's Scripts folder and hooks
// __startup.lua, so REAPER runs the bridge whenever it opens and the app finds it by its heartbeat (dawautoconnect.go). The host also
// starts REAPER itself, once per opened project, when that project records with REAPER, its file is linked and REAPER is not running.
// Nothing here runs unless dawAutoEnabled is set: the app's real start sets it, and a test sets it with its own seams, so no test
// writes into a REAPER folder on the machine running it.

// reaperStartWait is how long a REAPER the app started has to answer before the start counts as failed.
const reaperStartWait = 90 * time.Second

// reaperBridgeState is what the host knows about its bridge in REAPER and about a start it made. Its own lock guards it, apart from h.mu.
type reaperBridgeState struct {
	mu sync.Mutex
	// installed is the last successful install; installErr the last refusal or failure ("" while none).
	installed  reaperinstall.Result
	installOK  bool
	installErr string
	// resourceDir is REAPER's resource folder as last resolved.
	resourceDir string
	// startedFor is the project folder the app last started REAPER for, startedAt when, and startErr why that start failed.
	startedFor string
	startedAt  time.Time
	startErr   string
}

// reaperBridgeStatus is the DawChoice payload's account of the bridge.
type reaperBridgeStatus struct {
	// Installed is whether the bridge files are in REAPER's Scripts folder.
	Installed bool `json:"installed"`
	// StartsWithReaper is whether REAPER runs the bridge when it opens (__startup.lua holds the app's block).
	StartsWithReaper bool `json:"startsWithReaper"`
	// Problem is the sentence the narrator reads when either is false or a start failed; null when there is none.
	Problem *string `json:"problem"`
}

// dawStarting is the DawChoice payload's account of a REAPER start in progress: when the app started it.
type dawStarting struct {
	Since string `json:"since"`
}

func (h *Host) bridgeState() *reaperBridgeState {
	h.reaperBridgeOnce.Do(func() { h.reaperBridge = &reaperBridgeState{} })
	return h.reaperBridge
}

// reaperResourceDir is REAPER's resource folder on this computer: the test seam when set, else the portable folder beside the REAPER
// program the app resolves, else the per-user default.
func (h *Host) reaperResourceDir(svc hostServices) string {
	if h.reaperResourceSeam != nil {
		return h.reaperResourceSeam()
	}
	executable := ""
	locate := h.reaperLocate
	if locate == nil {
		locate = daw.LocateReaperExecutable
	}
	if svc.settings != nil {
		override, _ := svc.settings.Effective("DAW", "reaper_path", "")
		if path, _, err := daw.Resolve(override, locate); err == nil {
			executable = path
		}
	}
	home, _ := os.UserHomeDir()
	return reaperinstall.ResourceDir(reaperinstall.Environment{GOOS: runtime.GOOS, Getenv: os.Getenv, Home: home}, executable)
}

// reaperBridgeFiles is the bridge to install: the release's embedded copy, or, in a checkout whose embedded resources hold no
// bridge, the folder the launcher is in.
func (h *Host) reaperBridgeFiles(launcher string) fs.FS {
	if h.reaperFilesSeam != nil {
		return h.reaperFilesSeam
	}
	if embedded, err := fs.Sub(resources, path.Join(resourcesRoot, "reaper")); err == nil {
		if _, statErr := fs.Stat(embedded, reaperinstall.StartupScript); statErr == nil {
			return embedded
		}
	}
	if launcher != "" {
		dir := filepath.Dir(launcher)
		if _, err := os.Stat(filepath.Join(dir, reaperinstall.StartupScript)); err == nil {
			return os.DirFS(dir)
		}
	}
	return nil
}

// ensureReaperBridge installs or updates the bridge for a project that records with REAPER and points this launch at the installed
// launcher. Install writes only what changed, so it runs on every check. DAW.auto_start_launcher off means the narrator does not want
// the app to run its script in REAPER: nothing is installed then.
func (h *Host) ensureReaperBridge(svc hostServices) {
	if !h.dawAutoEnabled.Load() || svc.settings == nil {
		return
	}
	state := h.bridgeState()
	if autoStart, _ := svc.settings.Effective("DAW", "auto_start_launcher", "true"); autoStart != "true" {
		state.mu.Lock()
		state.installOK, state.installErr = false, "Turned off in Settings: REAPER does not start the app's bridge."
		state.mu.Unlock()
		return
	}
	resource := h.reaperResourceDir(svc)
	result, err := reaperinstall.Install(reaperinstall.Options{
		ResourceDir: resource, Files: h.reaperBridgeFiles(svc.config.reaperLauncher), Executable: executablePath(), Version: version,
	})
	state.mu.Lock()
	state.resourceDir = resource
	previouslyOK := state.installOK
	if err != nil {
		state.installOK, state.installErr = false, installProblem(err)
	} else {
		state.installed, state.installOK, state.installErr = result, true, ""
	}
	state.mu.Unlock()
	if err == nil && (len(result.Written) > 0 || !previouslyOK) {
		h.runLog.App().Event(slog.LevelInfo, "daw.bridge_install", "put the REAPER bridge in REAPER's Scripts folder",
			"written", len(result.Written), "backed_up", len(result.BackedUp), "startup_hooked", result.StartupHooked)
	} else if err != nil && previouslyOK {
		h.runLog.App().Event(slog.LevelWarn, "daw.bridge_install", "could not put the REAPER bridge in REAPER's Scripts folder", "error", err.Error())
	}
	if err == nil {
		h.mu.Lock()
		h.config.reaperLauncher = result.Launcher
		h.config.reaperStartupHooked = result.StartupHooked
		h.mu.Unlock()
	}
}

// installProblem words an install failure for the narrator.
func installProblem(err error) string {
	if errors.Is(err, reaperinstall.ErrNoResourceDir) {
		return "REAPER has not been opened on this computer yet, so its Scripts folder does not exist. The app opens REAPER with its bridge, and puts the bridge in REAPER's Scripts folder once REAPER has made it."
	}
	return "The app could not put its bridge in REAPER's Scripts folder: " + err.Error()
}

// reaperStartsBridge is whether REAPER runs the app's bridge when it opens, as of the last install.
func (h *Host) reaperStartsBridge() bool {
	if h.reaperBridge == nil {
		return false
	}
	state := h.bridgeState()
	state.mu.Lock()
	defer state.mu.Unlock()
	return state.installOK && state.installed.StartupHooked && reaperinstall.Installed(state.resourceDir)
}

// noteReaperStart records a start the app made for project, or why it failed.
func (h *Host) noteReaperStart(project string, at time.Time, err error) {
	state := h.bridgeState()
	state.mu.Lock()
	state.startedFor, state.startedAt, state.startErr = project, at, ""
	if err != nil {
		state.startErr = "The app could not open REAPER: " + err.Error()
	}
	state.mu.Unlock()
}

// startedReaperFor is whether the app already started REAPER for project in this run, whatever came of it.
func (h *Host) startedReaperFor(project string) bool {
	if h.reaperBridge == nil {
		return false
	}
	state := h.bridgeState()
	state.mu.Lock()
	defer state.mu.Unlock()
	return state.startedFor != "" && state.startedFor == project
}

// reaperStarting is when the app started REAPER for project, while that start is under reaperStartWait old and REAPER has not
// answered; nil otherwise.
func (h *Host) reaperStarting(project string, reachable bool, now time.Time) *dawStarting {
	if reachable || h.reaperBridge == nil {
		return nil
	}
	state := h.bridgeState()
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.startedFor != project || state.startErr != "" || now.Sub(state.startedAt) >= reaperStartWait {
		return nil
	}
	return &dawStarting{Since: state.startedAt.UTC().Format(time.RFC3339)}
}

// reaperBridgeReport is the DawChoice payload's bridge field for project; nil when the bridge was never checked (a project that
// does not record with REAPER, or a launch where the app does not manage it).
func (h *Host) reaperBridgeReport(project string, reachable bool, now time.Time) *reaperBridgeStatus {
	if !h.dawAutoEnabled.Load() || h.reaperBridge == nil {
		return nil
	}
	state := h.bridgeState()
	state.mu.Lock()
	report := &reaperBridgeStatus{
		Installed:        state.installOK,
		StartsWithReaper: state.installOK && state.installed.StartupHooked,
	}
	problem := state.installErr
	if problem == "" && state.startedFor == project && !reachable {
		switch {
		case state.startErr != "":
			problem = state.startErr
		case now.Sub(state.startedAt) >= reaperStartWait:
			problem = "The app opened REAPER, but REAPER's bridge has not answered. If REAPER shows a dialog, answer it; the app connects once the bridge runs."
		}
	}
	state.mu.Unlock()
	if problem != "" {
		report.Problem = &problem
	}
	return report
}

// emitDawCapabilities sends daw_capabilities_changed even when the report is unchanged: a REAPER start changes no capability, and the
// pages re-read DawChoice on that event, so they show the start at once.
func (h *Host) emitDawCapabilities() {
	svc := h.services()
	resolver, runtime := h.dawResolverFor(svc)
	payload := dawCapabilitiesPayload(resolver, runtime)
	h.mu.Lock()
	ctx := h.ctx
	h.mu.Unlock()
	if ctx != nil {
		emitEvent("daw_capabilities_changed", payload)
	}
}
