package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// saveProjectTimeout bounds one save_project request: REAPER writing the project file, with no track read before it.
const saveProjectTimeout = 15 * time.Second

const (
	saveProjectUnwritableSentence = "The project file is read-only or missing, so %s was not asked to save it: it would stop on an error dialog. Make the file writable, then try again."
	saveProjectNoLinkSentence     = "This project is not linked to a REAPER project file, or the linked file is gone, so there is nothing to save."
	saveProjectNoAnswerSentence   = "%s did not answer the save within %d seconds. Check %s before trying again."
	saveProjectNotDoneSentence    = "%s could not save the project: %s."
	saveProjectNoAdapterSentence  = "%s is not connected to this app, so the project was not saved."
	saveProjectNotAnsweringFormat = "%s is not answering. Check that %s is open, then try again; the app reconnects by itself."
)

// DawSaveProject has the DAW save the project this app is linked to, on the narrator's click (#3262): Editing reads the saved file, so a
// take recorded since the last save is not there until the DAW saves. It answers a DawResult whose message says what was saved. The
// save_project capability's own sentence comes first when it refuses (an engine that cannot save from the app); no linked project
// file, no live adapter, the DAW not answering, a project that was never saved, another project open, a recording in progress and
// a file the DAW could not write are each refused in a sentence, with nothing written. The host sends the file it is linked to, never
// one the page names, and nothing else in the host calls it.
func (h *Host) DawSaveProject() (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), saveProjectTimeout)
	defer cancel()
	run := h.runLog.Begin("save_project")
	result, err := dawSaveProjectIn(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapSaveProject), svc.projectSaver,
		linkedProjectFile(h.persist, svc.config.projectFolder), projectFileWritable)
	endStackRun(run, result, err)
	return encodeBinding(result, err)
}

// dawSaveProjectIn is DawSaveProject with the launch's save_project support, the engine's role (nil with no live adapter), the
// linked project file ("" with none) and the check that it can be written (nil: none) given. name is the engine's name for the sentences.
func dawSaveProjectIn(ctx context.Context, name string, support dawport.Support, saver dawport.ProjectSaver, projectFile string, writable func(string) error) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if projectFile == "" {
		return dawport.Refused(saveProjectNoLinkSentence), nil
	}
	if saver == nil {
		return dawport.Refused(fmt.Sprintf(saveProjectNoAdapterSentence, name)), nil
	}
	// REAPER 7.82 stops answering the bridge on a save to a file it cannot write (a modal error dialog; real REAPER, #3262), so the host
	// checks the file first and never asks it to.
	if writable != nil && writable(projectFile) != nil {
		return dawport.Refused(fmt.Sprintf(saveProjectUnwritableSentence, name)), nil
	}
	result, err := saver.SaveProject(ctx, projectFile)
	if err != nil {
		return saveProjectRefusal(name, err), nil
	}
	return result, nil
}

// saveProjectRefusal words an error the role returned rather than answered: a capability refusal, the bridge not answering, or no answer
// in time.
func saveProjectRefusal(name string, err error) dawport.Result {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused
	}
	switch {
	case errors.Is(err, bridge.ErrNoAnswer):
		return dawport.Refused(fmt.Sprintf(saveProjectNotAnsweringFormat, name, name))
	case errors.Is(err, bridge.ErrUnavailable):
		return dawport.Refused(fmt.Sprintf(saveProjectNoAdapterSentence, name))
	case errors.Is(err, context.DeadlineExceeded):
		return dawport.Refused(fmt.Sprintf(saveProjectNoAnswerSentence, name, int(saveProjectTimeout.Seconds()), name))
	}
	return dawport.Refused(fmt.Sprintf(saveProjectNotDoneSentence, name, err.Error()))
}

// projectFileWritable is nil when path is a file the host can open for writing, the check the DAW's own save needs to succeed. It opens
// without truncating and writes nothing.
func projectFileWritable(path string) error {
	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return err
	}
	return f.Close()
}
