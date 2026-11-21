//go:build windows

package process

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

type jobSet struct{ handle windows.Handle }

func newJobSet() jobSet {
	handle, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return jobSet{}
	}
	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(handle, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil { //nolint:gosec // G103: the Win32 job-object call takes a raw pointer to a struct that outlives it
		_ = windows.CloseHandle(handle)
		return jobSet{}
	}
	return jobSet{handle: handle}
}

func (j *jobSet) assign(pid int) error {
	if j.handle == 0 {
		return fmt.Errorf("could not create the Windows child-process job")
	}
	process, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid)) //nolint:gosec // G115: a process id is never negative
	if err != nil {
		return fmt.Errorf("could not access sidecar process: %w", err)
	}
	defer func() { _ = windows.CloseHandle(process) }()
	if err := windows.AssignProcessToJobObject(j.handle, process); err != nil {
		// Windows refuses a process that has already ended (Access is denied). It has nothing left to supervise, and failing the start
		// would hide what the program printed before it exited.
		if ended(process) {
			return nil
		}
		return fmt.Errorf("could not supervise sidecar process: %w", err)
	}
	return nil
}

// stillActive is the exit code Windows reports for a process that has not ended (STILL_ACTIVE).
const stillActive = 259

// ended reports whether the process behind the handle has exited.
func ended(process windows.Handle) bool {
	var code uint32
	return windows.GetExitCodeProcess(process, &code) == nil && code != stillActive
}
func (j *jobSet) close() error {
	if j.handle == 0 {
		return nil
	}
	err := windows.CloseHandle(j.handle)
	j.handle = 0
	return err
}
