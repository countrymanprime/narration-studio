//go:build audacityreal && linux

// Package foundation holds the real-Audacity 3 tests A3-T1 to A3-T13, T24 to T29 and T34 of docs/research/audacity-3-capability-matrix.md:
// the first start, the reply shapes, the heartbeat, the fingerprint, time precision, identity, labels, navigation, import, export,
// save, macro render, monitor level, what Audacity cannot do, and a crash. Each test records its rows through audacityreal.Rec.
//
//	src/studio/tests/audacity3/real/foundation/run.sh
package foundation

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"syscall"
	"testing"
	"time"

	"desktop/internal/audacitybridge"
	"desktop/internal/audacityreal"
)

// A3-T1: the first start on a profile Audacity has never seen. Five whole cycles; the one-start outcome is recorded and never relied on.
func TestA3T01FirstStart(t *testing.T) {
	e := audacityreal.LoadEnv(t)
	r := e.Begin(t, "A3-T01", "First start and the module: one start against the two-start procedure, five cycles")
	oneStart, twoStart := 0, 0
	const cycles = 5
	for i := 1; i <= cycles; i++ {
		res, p := e.Prime(t, fmt.Sprintf("t01-cycle-%d", i), 30*time.Second)
		step := fmt.Sprintf("cycle %d", i)
		if res.OneStartEcho {
			oneStart++
		}
		r.Info(step+": one start", fmt.Sprintf("echo=%v after %v; module status when it ended: %q", res.OneStartEcho, res.OneStartAfter.Round(100*time.Millisecond), res.OneStartStatus))
		if res.TwoStartEcho {
			twoStart++
		}
		r.Check(step+": second start answers", res.TwoStartEcho && res.TwoStartAfter <= 20*time.Second,
			fmt.Sprintf("echo=%v after %v; module status %q; %s", res.TwoStartEcho, res.TwoStartAfter.Round(100*time.Millisecond), res.TwoStartStatus, res.Diag))
		r.Check(step+": module recorded as enabled", res.TwoStartStatus == "mod-script-pipe=1", fmt.Sprintf("recorded %q after the second start", res.TwoStartStatus))
		p.Stop()
	}
	r.Info("summary", fmt.Sprintf("one start answered in %d of %d cycles; the two-start procedure in %d of %d", oneStart, cycles, twoStart, cycles))
	if oneStart == cycles {
		r.Info("decision", "a single start answered every time on this runner; the two-start procedure is kept anyway")
	}
}

// A3-T34: crash and stale FIFOs. kill -9 mid-command, dial with a deadline, restart, a second client while the first holds the pipe.
func TestA3T34CrashAndStalePipes(t *testing.T) {
	e := audacityreal.LoadEnv(t)
	r := e.Begin(t, "A3-T34", "Crash and stale pipes: kill -9, dial with a deadline, restart, a second client")
	p := e.Launch(t, "t34")
	home := p.Home
	toPath, _ := audacityreal.PipePaths()

	// A command in flight when Audacity dies: write it and kill before the reply is read.
	pipe, err := audacityreal.DialPipe()
	if err != nil {
		r.Fatal("dial before the crash", err.Error())
	}
	killed := make(chan struct{})
	go func() {
		defer close(killed)
		time.Sleep(20 * time.Millisecond)
		p.Kill()
	}()
	ex := pipe.Send(5*time.Second, "GetInfo: Type=Clips Format=JSON")
	pipe.Close()
	// Send can return before the kill has landed (the CI run read Alive and dialled the FIFO while Audacity still ran),
	// so every check below waits for the kill to finish.
	<-killed
	r.Info("command in flight when Audacity was killed", fmt.Sprintf("complete=%v after %v, %s", ex.Complete, ex.Took.Round(time.Millisecond), audacityreal.Visible(ex.Raw)))
	r.Check("Audacity is gone", !p.Alive(), "kill -9 of the process group")

	st, statErr := os.Stat(toPath)
	r.Info("FIFO after the crash", fmt.Sprintf("to-Audacity FIFO present=%v (stat error %v), mode %v", statErr == nil, statErr, func() any {
		if st != nil {
			return st.Mode()
		}
		return nil
	}()))

	// The stale FIFO with a naive blocking write-open, as the earlier prototype's transport did: record that it blocks.
	if statErr == nil {
		blocked := make(chan error, 1)
		go func() {
			f, err := os.OpenFile(toPath, os.O_WRONLY, 0)
			if err == nil {
				_ = f.Close()
			}
			blocked <- err
		}()
		select {
		case err := <-blocked:
			r.Info("blocking write-open of the stale FIFO", fmt.Sprintf("returned at once: %v", err))
		case <-time.After(3 * time.Second):
			r.Info("blocking write-open of the stale FIFO", "still blocked after 3 s: the hang the deadline dial avoids")
			// Release the goroutine: a reader makes the open return, and closing both ends leaves the FIFO as it was.
			if fd, err := syscall.Open(toPath, syscall.O_RDONLY|syscall.O_NONBLOCK, 0); err == nil {
				<-blocked
				_ = syscall.Close(fd)
			}
		}
	}

	// The deadline dial: ErrNotReachable at once, not a hang.
	start := time.Now()
	_, dialErr := audacityreal.DialPipe()
	took := time.Since(start)
	r.Check("raw dial of the stale FIFO is ErrNotReachable within the deadline", errors.Is(dialErr, audacitybridge.ErrNotReachable) && took < 2*time.Second,
		fmt.Sprintf("error %v after %v", dialErr, took.Round(time.Millisecond)))
	client := audacityreal.NewClient(5 * time.Second)
	defer func() { _ = client.Close() }()
	start = time.Now()
	err = client.Ping(context.Background())
	took = time.Since(start)
	r.Check("the client's Ping is ErrNotReachable, not ErrTimeout", errors.Is(err, audacitybridge.ErrNotReachable) && took < 2*time.Second,
		fmt.Sprintf("error %v after %v; Reachable=%v", err, took.Round(time.Millisecond), client.Reachable()))

	// Restart on the same profile with the stale FIFOs left in place: the crash left a project behind, so Audacity may ask about it.
	p2 := e.Start(t, home)
	took2, ok, last := audacityreal.Echo(45 * time.Second)
	r.Check("restart: the next request connects", ok, fmt.Sprintf("echo=%v after %v; last reply %s", ok, took2.Round(100*time.Millisecond), audacityreal.Visible(last.Raw)))
	var dialogs []string
	for _, w := range e.Dialogs() {
		dialogs = append(dialogs, fmt.Sprintf("%q %dx%d", w.Title, w.Width, w.Height))
	}
	r.Info("windows other than the project after the restart", strings.Join(dialogs, "; ")+" (a crash-recovery dialog is expected)")
	r.Info("screenshot after the restart", e.Shot("t34-restart"))
	_, projectUp := audacityreal.WaitProject(30 * time.Second)
	r.Info("restart: the project window answers GetInfo", fmt.Sprint(projectUp))
	if !ok {
		p2.Kill()
		return
	}

	// A second client while the first holds the pipe.
	first, err := audacityreal.DialPipe()
	if err != nil {
		r.Fatal("first client dial", err.Error())
	}
	defer first.Close()
	one := first.Send(5*time.Second, `Message: Text="one"`)
	r.Check("first client is answered", one.OK, audacityreal.Visible(one.Raw))
	second, err := audacityreal.DialPipe()
	if err != nil {
		r.Info("second client while the first holds the pipe", "refused at dial: "+err.Error())
	} else {
		two := second.Send(4*time.Second, `Message: Text="two"`)
		r.Info("second client while the first holds the pipe", fmt.Sprintf("complete=%v ok=%v after %v: %s", two.Complete, two.OK, two.Took.Round(time.Millisecond), audacityreal.Visible(two.Raw)))
		second.Close()
	}
	again := first.Send(5*time.Second, `Message: Text="one again"`)
	r.Info("first client after the second came and went", fmt.Sprintf("complete=%v ok=%v: %s", again.Complete, again.OK, audacityreal.Visible(again.Raw)))
	// The first client's connection may have been reset by the second one's dial (the server recreates the FIFOs after each client); a
	// fresh dial must work either way.
	first.Close()
	_, ok2, ex2 := audacityreal.Echo(15 * time.Second)
	r.Check("a fresh connection works afterwards", ok2, audacityreal.Visible(ex2.Raw))
}
