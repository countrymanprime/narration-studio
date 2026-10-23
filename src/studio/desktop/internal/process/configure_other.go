//go:build !windows

package process

import (
	"os/exec"
	"syscall"
)

// backgroundNice is the niceness a low-priority program runs at: below normal, still scheduled when the computer is idle.
const backgroundNice = 10

func configure(*exec.Cmd) {}

func configureLowPriority(*exec.Cmd) {}

// lowerStarted renices the started program. A failure leaves it at normal priority, which is no worse than before.
func lowerStarted(pid int) {
	_ = syscall.Setpriority(syscall.PRIO_PROCESS, pid, backgroundNice)
}
