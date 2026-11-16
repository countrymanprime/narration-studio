//go:build windows

package wakelock

import (
	"errors"
	"runtime"

	"golang.org/x/sys/windows"
)

const (
	esSystemRequired  = 0x00000001
	esDisplayRequired = 0x00000002
	esContinuous      = 0x80000000
)

var procSetThreadExecutionState = windows.NewLazySystemDLL("kernel32.dll").NewProc("SetThreadExecutionState")

// OS is the operating system's request: SetThreadExecutionState with ES_CONTINUOUS, ES_SYSTEM_REQUIRED and ES_DISPLAY_REQUIRED.
// The call belongs to the thread that makes it, so a request lives on one goroutine locked to its OS thread until it is released.
// The thread ending, or the process, drops the request too.
func OS() Inhibitor { return &windowsInhibitor{} }

type windowsInhibitor struct {
	stop chan struct{}
	done chan struct{}
}

func (w *windowsInhibitor) Acquire() error {
	if w.stop != nil {
		return nil // already held: a second request would orphan the first thread's
	}
	stop, done := make(chan struct{}), make(chan struct{})
	started := make(chan error, 1)
	go func() {
		defer close(done)
		runtime.LockOSThread() // no UnlockOSThread: a thread that ends locked is destroyed, which also ends its request
		if ok, _, callErr := procSetThreadExecutionState.Call(uintptr(esContinuous | esSystemRequired | esDisplayRequired)); ok == 0 {
			started <- errors.Join(errors.New("SetThreadExecutionState refused the request"), callErr)
			return
		}
		started <- nil
		<-stop
		_, _, _ = procSetThreadExecutionState.Call(uintptr(esContinuous)) // back to the system's own idle timers; nothing to do if it fails, the thread ends next
	}()
	if err := <-started; err != nil {
		<-done
		return err
	}
	w.stop, w.done = stop, done
	return nil
}

func (w *windowsInhibitor) Release() {
	if w.stop == nil {
		return
	}
	close(w.stop)
	<-w.done
	w.stop, w.done = nil, nil
}
