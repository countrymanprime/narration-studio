//go:build windows

package process

import (
	"os/exec"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

// A program that exits before the host reaches the job assignment is not a failed start: Windows refuses to put an ended process in a
// job, and Start used to answer "could not supervise sidecar process: Access is denied" for a program that had simply finished (one
// start in a few hundred of TestStartKeepsAnExitingChildsLastStderrLine on a loaded runner). Here the program has ended for certain.
func TestAssigningAProgramThatHasAlreadyEndedIsNotAnError(t *testing.T) {
	jobs := newJobSet()
	t.Cleanup(func() { _ = jobs.close() })
	command := exec.Command("cmd", "/c", "exit", "0")
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	// Not waited on yet, so the process id still names this program and cannot be given to another.
	t.Cleanup(func() { _ = command.Wait() })
	pid := uint32(command.Process.Pid) //nolint:gosec // G115: a process id is never negative
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = windows.CloseHandle(handle) })
	for deadline := time.Now().Add(20 * time.Second); !ended(handle); time.Sleep(time.Millisecond) {
		if time.Now().After(deadline) {
			t.Fatal("cmd /c exit 0 did not end")
		}
	}
	if err := jobs.assign(command.Process.Pid); err != nil {
		t.Fatalf("assign of an ended program: %v", err)
	}
}

// A program that is still running is put in the job, as before.
func TestAssigningARunningProgramPutsItInTheJob(t *testing.T) {
	jobs := newJobSet()
	command := exec.Command("ping", "-n", "120", "127.0.0.1")
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	if err := jobs.assign(command.Process.Pid); err != nil {
		t.Fatalf("assign of a running program: %v", err)
	}
	// Closing the job ends the program in it (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE): Wait returns only because it was assigned.
	if err := jobs.close(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = command.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(20 * time.Second):
		_ = command.Process.Kill()
		t.Fatal("the program outlived its job: it was not in it")
	}
}
