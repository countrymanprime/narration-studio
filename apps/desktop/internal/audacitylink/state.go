package audacitylink

import (
	"context"
	"errors"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
)

// Pipe is what one probe of Audacity's scripting pipe found.
type Pipe int

const (
	// PipeAbsent: nothing to connect to (Audacity closed, scripting off, or no scripting at all).
	PipeAbsent Pipe = iota
	// PipeSilent: Audacity took the command and did not answer in time, which is what a modal dialog does.
	PipeSilent
	// PipeNoProject: Audacity answered with a bare empty line, which it does with no project window open.
	PipeNoProject
	// PipeAnswering: Audacity echoed the probe.
	PipeAnswering
)

// Pinger is the part of the Audacity client a probe needs.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Probe asks Audacity to echo a text and says what came back. It changes nothing in the project. A reply the app could not read is
// reported as PipeSilent: Audacity is there but not in step, and the client reconnects on the next probe.
func Probe(ctx context.Context, p Pinger) Pipe {
	err := p.Ping(ctx)
	switch {
	case err == nil:
		return PipeAnswering
	case errors.Is(err, audacitybridge.ErrNoProject):
		return PipeNoProject
	case errors.Is(err, audacitybridge.ErrNotReachable), errors.Is(err, audacitybridge.ErrUnsupportedPlatform):
		return PipeAbsent
	default:
		return PipeSilent
	}
}

// State is where the app is on the way to Audacity, in the order a narrator meets them.
type State string

const (
	// StateUnsupported: this computer cannot run the scripting pipe the app uses (the app links Audacity on Windows).
	StateUnsupported State = "unsupported"
	// StateNotInstalled: no Audacity was found.
	StateNotInstalled State = "not_installed"
	// StateNotRunning: Audacity is closed.
	StateNotRunning State = "not_running"
	// StateModuleOff: Audacity's scripting module is not turned on (or Audacity has never started, so it has no settings yet).
	StateModuleOff State = "module_off"
	// StateNeedsRestart: the module is on and Audacity is open, but no pipe answers: Audacity was started before scripting was
	// turned on.
	StateNeedsRestart State = "needs_restart"
	// StateAudacity4: Audacity is open and no pipe answers, and the program looks like Audacity 4, which has no scripting pipe.
	StateAudacity4 State = "audacity4"
	// StateDialog: Audacity may be waiting on a dialog.
	StateDialog State = "dialog"
	// StateNoProject: Audacity answers and has no project open.
	StateNoProject State = "no_project"
	// StateAnswering: Audacity answers with a project open.
	StateAnswering State = "answering"
)

// Action is the one thing the narrator can ask the app to do about the state.
type Action string

const (
	ActionNone         Action = "none"
	ActionLaunch       Action = "launch"
	ActionEnableModule Action = "enable_module"
)

// OpenProject says how the project open in Audacity relates to this app project. It is only meaningful when the state is
// StateAnswering.
type OpenProject string

const (
	// ProjectUnknown: not read (Audacity is not answering).
	ProjectUnknown OpenProject = "unknown"
	// ProjectLinked: the open project carries this app project's link label.
	ProjectLinked OpenProject = "linked"
	// ProjectOther: the open project carries another app project's link label.
	ProjectOther OpenProject = "other"
	// ProjectUnlabelled: the open project carries no link label, so the app cannot tell whose it is.
	ProjectUnlabelled OpenProject = "unlabelled"
)

// Facts are the inputs to Classify.
type Facts struct {
	// Supported: the app has a scripting pipe on this computer.
	Supported bool
	Installed bool
	Running   bool
	Module    ModuleStatus
	Pipe      Pipe
	// Looks4: the installed or running program looks like Audacity 4 (by where it is installed). It is only a hint: Audacity
	// itself gives no version over a pipe that does not exist.
	Looks4 bool
	// Project is read only while the pipe answers.
	Project OpenProject
}

// Step is one line of the first-start walk-through.
type Step struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Done  bool   `json:"done"`
}

// Status is the verdict.
type Status struct {
	State   State
	Message string
	Action  Action
	Steps   []Step
	Project OpenProject
}

// Classify turns the facts into the state, the sentence the narrator reads and the one action offered. Every state but
// StateAnswering is recoverable and says how.
func Classify(f Facts) Status {
	status := Status{Action: ActionNone, Project: ProjectUnknown, Steps: steps(f)}
	switch {
	case !f.Supported:
		status.State = StateUnsupported
		status.Message = "Linking Audacity works on Windows only. Record with the built-in recorder or REAPER on this computer."
	case f.Pipe == PipeAnswering:
		status.State, status.Project = StateAnswering, f.Project
		status.Message = answeringMessage(f.Project)
	case f.Pipe == PipeNoProject:
		status.State = StateNoProject
		status.Message = "Audacity is open but has no project. Open the project in Audacity (File > Open), or start it from here with the linked project. The app connects by itself once a project is open."
	case f.Pipe == PipeSilent:
		status.State = StateDialog
		status.Message = "Audacity is open but did not answer. It may be waiting on a dialog: look for a message box in Audacity, close it, and the app reconnects by itself. Nothing is sent to Audacity meanwhile."
	case !f.Installed && !f.Running:
		status.State = StateNotInstalled
		status.Message = "Audacity was not found on this computer. Install Audacity 3 (Audacity 4 has no scripting and cannot be linked), or choose another recorder."
	case f.Running && f.Module == ModuleOn && f.Looks4:
		status.State = StateAudacity4
		status.Message = "This looks like Audacity 4, which has no scripting pipe, so the app cannot connect to it. Install Audacity 3.7 to use Audacity with the app, or choose another recorder."
	case f.Running && f.Module == ModuleOn:
		status.State = StateNeedsRestart
		status.Action = ActionNone
		status.Message = "Audacity is open but the app cannot reach it. Audacity reads its scripting setting when it starts: close Audacity, then start it from here."
	case f.Running:
		status.State = StateModuleOff
		status.Message = "Audacity's scripting is not turned on. Close Audacity first (it saves its settings when it closes), then press Turn on scripting here and start Audacity again."
	case f.Module == ModuleOn && f.Looks4:
		status.State = StateAudacity4
		status.Action = ActionNone
		status.Message = "The Audacity on this computer looks like Audacity 4, which has no scripting pipe, so the app cannot connect to it. Install Audacity 3.7, or choose another recorder."
	case f.Module == ModuleOn:
		status.State = StateNotRunning
		status.Action = ActionLaunch
		status.Message = "Audacity is not running. Start it here and the app connects."
	case f.Module == ModuleOff:
		status.State = StateModuleOff
		status.Action = ActionEnableModule
		status.Message = "Audacity's scripting is not turned on. Press Turn on scripting, then start Audacity. Audacity may need to start twice before the connection works: the first start can fail to load scripting."
	default: // never started: no settings file or no entry yet
		status.State = StateModuleOff
		status.Action = ActionLaunch
		status.Message = "Audacity has not set itself up yet. Start it once, close it, then press Turn on scripting here and start it again. The first start cannot load scripting, so this takes two starts."
	}
	return status
}

func answeringMessage(project OpenProject) string {
	switch project {
	case ProjectLinked:
		return "Audacity is open and answering, with this project's Audacity project."
	case ProjectOther:
		return "Audacity is open and answering, but its project is linked to a different project in this app. Open this project's Audacity project, or link the open one."
	case ProjectUnlabelled:
		return "Audacity is open and answering. Its project is not linked to this one yet: link it to let the app mark lines in it."
	default:
		return "Audacity is open and answering."
	}
}

// steps is the first-start walk-through, each line done from what the facts show.
func steps(f Facts) []Step {
	answering := f.Pipe == PipeAnswering || f.Pipe == PipeNoProject
	setUp := f.Module != ModuleUnknown || answering
	return []Step{
		{ID: "installed", Label: "Audacity 3 is installed", Done: f.Installed || f.Running},
		{ID: "started_once", Label: "Audacity has started once, so it has made its settings", Done: setUp},
		{ID: "scripting_on", Label: "Scripting is turned on in Audacity", Done: f.Module == ModuleOn || answering},
		{ID: "answering", Label: "Audacity answers the app", Done: answering},
	}
}
