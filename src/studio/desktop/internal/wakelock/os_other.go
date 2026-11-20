//go:build !windows

package wakelock

// OS holds nothing off Windows, the only supported platform (README): the computer's own idle timers apply there. shortcut: no macOS
// IOPMAssertion or Linux inhibitor yet, add one behind this same Inhibitor when either platform is supported.
func OS() Inhibitor { return noop{} }

type noop struct{}

func (noop) Acquire() error { return nil }
func (noop) Release()       {}
