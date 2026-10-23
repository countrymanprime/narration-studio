//go:build linux

package process

import (
	"context"
	"syscall"
	"testing"
	"time"
)

func TestALowPriorityStartRunsTheProgramNiced(t *testing.T) {
	supervisor := NewSupervisor()
	child, err := supervisor.Start(WithLowPriority(context.Background()), "sleep", "2")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = syscall.Kill(child.Pid(), syscall.SIGKILL) })
	pid := child.Pid()
	// Getpriority returns 20 - nice on Linux.
	got, err := syscall.Getpriority(syscall.PRIO_PROCESS, pid)
	if err != nil {
		t.Fatal(err)
	}
	if nice := 20 - got; nice != backgroundNice {
		t.Fatalf("nice = %d, want %d", nice, backgroundNice)
	}

	plain, err := supervisor.Start(context.Background(), "sleep", "2")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = syscall.Kill(plain.Pid(), syscall.SIGKILL) })
	time.Sleep(10 * time.Millisecond)
	if got, _ := syscall.Getpriority(syscall.PRIO_PROCESS, plain.Pid()); 20-got == backgroundNice {
		t.Fatal("a plain start must keep the host's own priority")
	}
}
