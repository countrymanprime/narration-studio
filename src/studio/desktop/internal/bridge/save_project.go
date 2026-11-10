package bridge

import (
	"context"
	"fmt"
	"strconv"
)

// ProjectSaved is what save_project answered: how many tracks and media items the project it wrote holds.
type ProjectSaved struct {
	Tracks, Items int
}

// SaveProject has REAPER save the open project to its own file (narration_save_project.lua). projectFile is the file the app is
// linked to: REAPER saves only when that is the project it has open, so a narrator who opened another project is refused rather than
// having the wrong file written. REAPER also refuses while it records, for a project that was never saved (a save would open a file
// dialog and stop the bridge) and when the file cannot be written; each is a *RefusalError or ErrRecording in the script's words.
func (a *Actions) SaveProject(ctx context.Context, projectFile string) (ProjectSaved, error) {
	if projectFile == "" {
		return ProjectSaved{}, fmt.Errorf("save_project needs the project file the app is linked to")
	}
	events, err := a.request(ctx, "save_project", []string{"SAVED"}, projectFile)
	if err != nil {
		return ProjectSaved{}, err
	}
	event := events[len(events)-1]
	tracks, err := strconv.Atoi(event.Fields[2])
	if err != nil {
		return ProjectSaved{}, err
	}
	items, err := strconv.Atoi(event.Fields[3])
	if err != nil {
		return ProjectSaved{}, err
	}
	return ProjectSaved{Tracks: tracks, Items: items}, nil
}
