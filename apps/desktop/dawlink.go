package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
	"github.com/countrymanprime/narration-utils/shell/internal/project"
)

// ProjectLinkDawFile is the one shared binding behind the audio engine panel
// and Settings' DAW category: it opens a native "*.rpp" file dialog and
// links the chosen file to the current project through the manifest storage
// (project.BuildDawLink, Manifest.Save). Cancelling
// the dialog is not an error: the result says so instead.
func (h *Host) ProjectLinkDawFile() (string, error) {
	h.mu.RLock()
	ctx := h.ctx
	h.mu.RUnlock()
	if ctx == nil {
		return "", fmt.Errorf("the desktop host is not ready")
	}
	svc := h.services()
	projectFolder := svc.config.projectFolder
	if projectFolder == "" {
		return "", fmt.Errorf("open a project before linking a REAPER project file")
	}
	path, err := pickFile("Select REAPER project file", []fileFilter{{"REAPER projects", "*.rpp"}})
	if err != nil {
		return "", err
	}
	if path == "" {
		return encodeBinding(map[string]any{"selected": false, "linked": false}, nil)
	}
	result, err := h.linkPickedDawFile(path)
	if err != nil {
		return "", err
	}
	return encodeBinding(result, nil)
}

// linkPickedDawFile links path, the narrator's pick, to the open project (linkDawFile) and, once linked, chooses REAPER for the
// project and starts chapter sync, as DawLinkFound does.
func (h *Host) linkPickedDawFile(path string) (map[string]any, error) {
	result, err := linkDawFile(h.persist, h.services().config.projectFolder, path)
	if err != nil {
		return nil, err
	}
	h.dawFolder.forget()
	if linked, _ := result["linked"].(bool); linked {
		// Linking a REAPER project file chooses REAPER for the project (projectdaw.go), as DawLinkFound does.
		if err := h.chooseProjectDaw(dawport.KindREAPER); err != nil {
			_ = h.log.Report("daw", "linked the REAPER project file but could not choose REAPER: "+err.Error())
		}
		go h.chapterSyncTrigger(syncTriggerDawLink) // the DAW is hooked up: ask, or sync (chaptersync.go)
	}
	return result, nil
}

// linkDawFile is ProjectLinkDawFile's pure logic, kept apart from the dialog
// and the host so it can be unit tested directly.
//
// It links any REAPER project file the narrator picks. A file inside
// projectFolder at any depth (project.RelativeTo: symlinks, junctions, letter
// case and short names included) is stored with its project-relative path as
// well, so moving the whole project keeps the link; a file elsewhere (a
// separate DAW folder, another drive) is stored by its absolute path and the
// result carries a neutral note saying where the file and the project are. It
// refuses only a file that is not an .rpp or does not exist, with a message.
// The only error is the manifest's own I/O failure.
func linkDawFile(reporter *persist.Reporter, projectFolder, rppPath string) (map[string]any, error) {
	if projectFolder == "" {
		return nil, fmt.Errorf("open a project before linking a REAPER project file")
	}
	if info, err := os.Stat(projectFolder); err != nil || !info.IsDir() {
		return nil, fmt.Errorf("the project folder could not be found, so the REAPER project file was not linked")
	}
	absFolder, err := filepath.Abs(projectFolder)
	if err != nil {
		return nil, fmt.Errorf("could not resolve the project folder: %w", err)
	}
	absRpp, err := filepath.Abs(rppPath)
	if err != nil {
		return nil, fmt.Errorf("could not resolve the REAPER project file: %w", err)
	}
	name := filepath.Base(absRpp)
	refuse := func(message string) map[string]any {
		return map[string]any{"selected": true, "linked": false, "path": absRpp, "message": message}
	}
	if !strings.EqualFold(filepath.Ext(absRpp), ".rpp") {
		return refuse(name + " is not a REAPER project file. Choose a file ending in .rpp."), nil
	}
	if info, err := os.Stat(absRpp); err != nil || info.IsDir() {
		return refuse(name + " could not be found. Choose the REAPER project file again."), nil
	}

	link, err := project.BuildDawLink(absFolder, absRpp)
	if err != nil {
		return nil, fmt.Errorf("could not record the DAW project link: %w", err)
	}
	manifest, ok, err := project.Load(reporter, absFolder)
	if err != nil {
		return nil, fmt.Errorf("could not read the project manifest: %w", err)
	}
	if !ok || manifest == nil {
		manifest = project.New(filepath.Base(absFolder), time.Now())
	}
	manifest.DawProjectFile = &link
	if err := manifest.Save(absFolder); err != nil {
		return nil, fmt.Errorf("could not save the DAW project link: %w", err)
	}
	result := map[string]any{"selected": true, "linked": true, "path": absRpp, "insideProject": link.Inside()}
	if !link.Inside() {
		result["note"] = fmt.Sprintf(
			"%s is in %s; this project's folder is %s. The link keeps working while the REAPER file stays where it is.",
			name, filepath.Dir(absRpp), absFolder,
		)
	}
	return result, nil
}
