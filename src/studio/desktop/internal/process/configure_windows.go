//go:build windows

package process

import (
	"os/exec"
	"syscall"
)

const (
	createNoWindow           = 0x08000000
	belowNormalPriorityClass = 0x00004000
)

func configure(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWindow}
}

// configureLowPriority creates the process in the below-normal priority class: every thread it starts inherits it.
func configureLowPriority(command *exec.Cmd) {
	command.SysProcAttr.CreationFlags |= belowNormalPriorityClass
}

// lowerStarted has nothing left to do on Windows: the class was set at creation.
func lowerStarted(int) {}
