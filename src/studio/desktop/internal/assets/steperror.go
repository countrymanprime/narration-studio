package assets

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// The two steps after a download whose failure a StepError names.
const (
	StepUnpack  = "unpack"
	StepPrepare = "prepare"
)

// StepError is an install that failed after every file matched its catalog entry: unpacking an archive, or preparing (Derive) what it
// held. Err is the cause; errors.Is still finds ErrBadArchive and ErrBadContent through it.
type StepError struct {
	Step    string
	File    string
	Err     error
	staging string
}

func (e *StepError) Error() string { return e.verb() + " " + e.File + ": " + e.Err.Error() }
func (e *StepError) Unwrap() error { return e.Err }

func (e *StepError) verb() string {
	if e.Step == StepPrepare {
		return "preparing"
	}
	return "unpacking"
}

// Detail is the step, the archive and the cause, for the narrator's details: a file system error is given as its operation and reason
// without its path, and any other mention of the staging folder is cut to the part inside it, so no folder of this computer is shown.
func (e *StepError) Detail() string {
	cause := e.Err.Error()
	var pathErr *fs.PathError
	var linkErr *os.LinkError
	switch {
	case errors.As(e.Err, &pathErr):
		cause = strings.Replace(cause, pathErr.Error(), pathErr.Op+": "+pathErr.Err.Error(), 1)
	case errors.As(e.Err, &linkErr):
		cause = strings.Replace(cause, linkErr.Error(), linkErr.Op+": "+linkErr.Err.Error(), 1)
	}
	if e.staging != "" {
		cause = strings.ReplaceAll(cause, e.staging+string(filepath.Separator), "")
		cause = strings.ReplaceAll(cause, e.staging, "")
	}
	verb := e.verb()
	return strings.ToUpper(verb[:1]) + verb[1:] + " " + e.File + ": " + cause
}
