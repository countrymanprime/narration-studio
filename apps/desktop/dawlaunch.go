package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
	"github.com/countrymanprime/narration-utils/shell/internal/project"
)

// DawLaunch starts REAPER on the current project's linked DAW file: it resolves
// reaper.exe (a Settings override always wins, otherwise auto-detect -
// daw.Resolve / daw.LocateReaperExecutable), and passes the linked
// .rpp, plus, when the DAW.auto_start_launcher setting is on (default off), the
// launcher script too - the exact `reaper.exe "<project.rpp>" "<script.lua>"`
// form spike S6 confirmed REAPER runs automatically at startup, so
// the bridge is live without the narrator running the action by hand. The
// launch is detached (daw.Launch): never through the sidecar supervisor's
// kill-on-close job object (internal/process/job_windows.go), so REAPER
// outlives the app when the narrator closes it.
func (h *Host) DawLaunch() (string, error) {
	if svc := h.services(); h.projectDaw(svc).kind.HasScriptingPipe() {
		result, err := h.launchAudacity(svc)
		if err != nil {
			return "", err
		}
		return encodeBinding(result, nil)
	}
	result, err := launchReaper(h.services(), h.persist, h.reaperLocate, h.reaperLaunch, h.reaperRunning)
	if err != nil {
		return "", err
	}
	return encodeBinding(result, nil)
}

// launchReaper is DawLaunch's pure logic, kept apart from the host so it can be unit tested directly with fake
// locate/launch seams: locate defaults to daw.LocateReaperExecutable and launch to daw.Launch, exactly as
// h.reaperLocate/h.reaperLaunch being nil means in production.
func launchReaper(svc hostServices, reporter *persist.Reporter, locate func() (path, source string, err error), launch func(program string, args []string) error, running func() bool) (map[string]any, error) {
	if svc.config.projectFolder == "" {
		return nil, fmt.Errorf("open a project before starting REAPER")
	}
	manifest, ok, err := project.Load(reporter, svc.config.projectFolder)
	if err != nil {
		return nil, fmt.Errorf("could not read the project manifest: %w", err)
	}
	if !ok || manifest == nil || manifest.DawProjectFile == nil {
		return nil, fmt.Errorf("link a REAPER project file before starting REAPER")
	}
	rpp, resolved := manifest.DawProjectFile.Resolve(svc.config.projectFolder)
	if !resolved {
		return nil, fmt.Errorf("the linked REAPER project file no longer exists on disk")
	}

	override, _ := svc.settings.Effective("DAW", "reaper_path", "")
	autoStart, _ := svc.settings.Effective("DAW", "auto_start_launcher", "true")

	if locate == nil {
		locate = daw.LocateReaperExecutable
	}
	execPath, source, err := daw.Resolve(override, locate)
	if err != nil {
		return nil, fmt.Errorf("could not find reaper.exe: %w", err)
	}

	if running == nil {
		running = func() bool { return daw.IsRunning(filepath.Base(execPath)) }
	}
	alreadyRunning := running()
	withLauncher := autoStart == "true" && svc.config.reaperLauncher != ""
	args := []string{rpp}
	switch {
	case alreadyRunning && withLauncher:
		// The narrator's open REAPER runs the launcher alone: reopening the linked file would stack a second copy of the project,
		// and the launcher reads whichever project that REAPER has open (the Booth then says if it is not the linked one).
		args = []string{svc.config.reaperLauncher}
	case withLauncher:
		args = append(args, svc.config.reaperLauncher)
	}

	if launch == nil {
		launch = func(program string, args []string) error { return daw.Launch(program, args...) }
	}
	if err := launch(execPath, args); err != nil {
		return nil, fmt.Errorf("could not start REAPER: %w", err)
	}
	return map[string]any{"launched": true, "path": execPath, "source": source}, nil
}

// launchAudacity starts Audacity for an Audacity project: on the linked project file when the link names one that still exists,
// and bare otherwise. It starts nothing while Audacity runs (a second start would open the file in the running one, or a second
// Audacity, and the pipe serves only one), and says what to do instead. Audacity reads its scripting setting when it starts, so the
// state it left behind is the link state's to word (bindings_audacity_link.go): this only starts the program, detached
// (daw.Launch) so it outlives the app.
func (h *Host) launchAudacity(svc hostServices) (map[string]any, error) {
	if svc.config.projectFolder == "" {
		return nil, fmt.Errorf("open a project before starting Audacity")
	}
	exe, err := h.locateAudacity()
	if err != nil {
		return nil, fmt.Errorf("Audacity was not found on this computer. Install Audacity 3, or choose another recorder.")
	}
	if h.isAudacityRunning() {
		return nil, fmt.Errorf("Audacity is already running. If the app cannot reach it, close Audacity and start it from here.")
	}
	var args []string
	if svc.settings != nil {
		if linked := svc.settings.Project(recordingSettingsTool)[audacityLinkFileKey]; linked != "" {
			if info, statErr := os.Stat(linked); statErr == nil && !info.IsDir() {
				args = append(args, linked)
			}
		}
	}
	launch := h.audacityLaunch
	if launch == nil {
		launch = func(program string, args []string) error { return daw.Launch(program, args...) }
	}
	if err := launch(exe, args); err != nil {
		return nil, fmt.Errorf("could not start Audacity: %w", err)
	}
	return map[string]any{"launched": true, "path": exe, "source": "audacity"}, nil
}
