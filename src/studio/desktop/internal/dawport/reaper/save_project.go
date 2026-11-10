package reaper

import (
	"context"
	"errors"
	"fmt"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// projectSaver is the save_project role over bridge's save_project (narration_save_project.lua). It answers a dawport.Result: a
// refusal carries the sentence the narrator reads where they clicked, and nothing here saves except the call the narrator's click
// makes.
type projectSaver struct {
	actions *bridge.Actions
	allowed func(dawport.Capability) error
}

var _ dawport.ProjectSaver = projectSaver{}

const (
	messageSaveOutdated = "The app's script in REAPER is older than this app and cannot save the project, so nothing was saved. Import the script again from this app's REAPER folder."
	messageSaveNoFile   = "This app is not linked to a REAPER project file, so there is nothing to save."
)

// SaveProject has REAPER save the project at projectFile. A refusal (the capability's own sentence, a project never saved, another
// project open, REAPER recording, a file REAPER could not write) is Refused with nothing saved. The OK result says how much the saved
// project holds. Saving adds no undo point and changes no part of the project, so Changed is false.
func (s projectSaver) SaveProject(ctx context.Context, projectFile string) (dawport.Result, error) {
	if s.allowed != nil {
		if refused, ok := dawport.RefusedFrom(s.allowed(dawport.CapSaveProject)); ok {
			return refused, nil
		}
	}
	if projectFile == "" {
		return dawport.Refused(messageSaveNoFile), nil
	}
	got, err := s.actions.SaveProject(ctx, projectFile)
	var refusal *bridge.RefusalError
	switch {
	case errors.Is(err, bridge.ErrRecording):
		return dawport.Refused("REAPER is recording. Stop recording first."), nil
	case errors.Is(err, bridge.ErrScriptOutdated):
		return dawport.Refused(messageSaveOutdated), nil
	case errors.As(err, &refusal):
		return dawport.Refused(refusal.Sentence), nil
	case err != nil:
		return dawport.Result{}, err
	}
	return dawport.OK(savedMessage(got), false), nil
}

// savedMessage words what the saved project holds.
func savedMessage(got bridge.ProjectSaved) string {
	return fmt.Sprintf("Saved the project in REAPER: %s and %s.", plural(got.Tracks, "track", "tracks"), plural(got.Items, "item", "items"))
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}
