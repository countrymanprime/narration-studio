package main

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestBootstrapAndSystemAttachedOrderAcrossAProjectSwitch records the order the UI's chapter store has to expect (#3998).
//
// ProjectSwitch changes h.config under h.mu, unlocks, then touches the recents file and starts background work, and only then emits system:attached
// (bindings.go; onSecondInstance in app.go and attachBridgeSession in dawautoconnect.go have the same shape in the code, but only ProjectSwitch is driven here). Bootstrap reads the config under the same lock
// (services.go), and the window also asks for one on focus and on DAW reachability changes. That gives two orders, and the UI must handle both:
//
//   - bootstrap first: a Bootstrap answered between the config change and the emit already names the new folder, so the folder prop can change
//     before the store hears the reset;
//   - event first: the window hears system:attached and asks for a bootstrap; by then the config is changed, so that answer names the new folder.
//
// What can never happen, and what this test asserts under load: a Bootstrap that starts after system:attached was emitted names the old folder.
// The first order is counted and logged (it depends on timing, so it is not asserted). emitEventSink is a package global, so the test must not run in
// parallel. Wails delivers the event and a binding's answer on separate channels, so their arrival order in the window is not fixed by this host;
// the store therefore confirms the project from the bootstrap and ignores a bootstrap that was asked before the latest one (App.tsx).
func TestBootstrapAndSystemAttachedOrderAcrossAProjectSwitch(t *testing.T) {
	host := newStressHost(t)
	host.ctx = context.Background()
	projects := make([]string, 5) // five in turn: the old folder is none of the folders a reader paused for a switch or two can see
	for i := range projects {
		projects[i] = t.TempDir()
	}

	var emitted atomic.Int64 // system:attached (attached) events sent so far
	emitEventSink = func(name string, _ any) {
		if name == "system:attached" {
			emitted.Add(1)
		}
	}
	t.Cleanup(func() { host.waitForBackground(); emitEventSink = nil }) // the attach starts chapter sync, which emits events of its own

	var mu sync.Mutex
	var violations []string
	var beforeEvent, total int
	stop := make(chan struct{})
	var readers sync.WaitGroup
	readers.Add(1)
	go func() {
		defer readers.Done()
		for {
			select {
			case <-stop:
				return
			default:
			}
			eventsBefore := emitted.Load()
			folder, _ := host.Bootstrap()["projectFolder"].(string)
			mu.Lock()
			total++
			// After e events the config is on switch e's project, or already on switch e+1's while its event is not out yet. Five projects in turn
			// make the one before (the old folder) a name no nearby switch uses, so naming it is a violation.
			if eventsBefore > 0 {
				e := int(eventsBefore)
				// A reader paused through more than one switch did not ask after the event: only answers with at most one switch since count.
				if folder == projects[(e-2+5)%5] && emitted.Load() <= eventsBefore+1 {
					violations = append(violations, folder)
				}
				if folder == projects[e%5] && emitted.Load() == eventsBefore {
					beforeEvent++ // named switch e+1's folder before that switch's event was emitted
				}
			}
			mu.Unlock()
		}
	}()

	const switches = 40
	for i := range switches {
		if _, err := host.ProjectSwitch(projects[i%5], ""); err != nil {
			t.Fatal(err)
		}
		if got := emitted.Load(); got != int64(i+1) {
			t.Fatalf("switch %d: system:attached must be emitted once, before the binding answers, got %d", i, got)
		}
		// The event is out: a bootstrap that starts now names the folder just switched to.
		if folder := host.Bootstrap()["projectFolder"]; folder != projects[i%5] {
			t.Fatalf("switch %d: a Bootstrap after system:attached names %v, want %q", i, folder, projects[i%5])
		}
	}
	close(stop)
	done := make(chan struct{})
	go func() { readers.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the bootstrap reader did not stop")
	}
	if len(violations) > 0 {
		t.Fatalf("a Bootstrap that started after system:attached named the old folder: %v", violations)
	}
	t.Logf("%d concurrent Bootstrap answers over %d switches; %d named the new folder before its system:attached was emitted", total, switches, beforeEvent)
}
