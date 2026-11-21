package main

import (
	"errors"
	"sync"
	"testing"
	"time"

	"desktop/internal/evidence"
	"desktop/internal/persist"
)

// newReadHost is a host with a project attached and no live event reaching a window.
func newReadHost(t *testing.T) *Host {
	t.Helper()
	emitEventSink = func(string, any) {}
	t.Cleanup(func() { emitEventSink = nil })
	host := newTestHost(t)
	attachReadProject(t, host)
	return host
}

func attachReadProject(t *testing.T, host *Host) {
	t.Helper()
	next := host.config
	next.projectFolder, next.projectName, next.daw = t.TempDir(), "Book", "Standalone"
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
}

// holdRead starts a computation for name that answers "held" and does not finish until the returned release is called
// (the test's end releases it too). It returns once the computation is in flight.
func holdRead(t *testing.T, host *Host, name string, args ...any) (release func()) {
	t.Helper()
	started, gate := make(chan struct{}), make(chan struct{})
	var once sync.Once
	release = func() { once.Do(func() { close(gate) }) }
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		_, _ = host.sharedRead(name, func() (string, error) {
			close(started)
			<-gate
			return "held", nil
		}, args...)
	}()
	t.Cleanup(func() { release(); <-finished })
	<-started
	return release
}

// waitForJoins fails the test unless the host's count of joined calls reaches want.
func waitForJoins(t *testing.T, host *Host, want uint64) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for host.reads.joins.Load() < want {
		if time.Now().After(deadline) {
			t.Fatalf("joined calls = %d, want %d", host.reads.joins.Load(), want)
		}
		time.Sleep(time.Millisecond)
	}
}

// answerOf is one read's payload, or its error's text, and fails the test when it has not answered in time: a call
// that wrongly joined a held computation would wait for ever.
func answerOf(t *testing.T, read func() (string, error)) string {
	t.Helper()
	type answer struct {
		payload string
		err     error
	}
	done := make(chan answer, 1)
	go func() {
		payload, err := read()
		done <- answer{payload, err}
	}()
	select {
	case got := <-done:
		if got.err != nil {
			return got.err.Error() // an empty project's own refusal is an answer too
		}
		return got.payload
	case <-time.After(30 * time.Second):
		t.Fatal("the read waited for a computation it must not join")
		return ""
	}
}

// Three ManuscriptChapters calls in flight together are one computation, and each gets its answer.
func TestThreeIdenticalReadsInFlightAreOneComputation(t *testing.T) {
	host := newReadHost(t)
	computed, gate, started := 0, make(chan struct{}), make(chan struct{})
	compute := func() (string, error) {
		computed++ // unsynchronised on purpose: a second computation is a race the detector reports
		close(started)
		<-gate
		return `["one"]`, nil
	}
	answers := make(chan string, 3)
	call := func() {
		payload, err := host.sharedRead("ManuscriptChapters", compute)
		if err != nil {
			t.Error(err)
		}
		answers <- payload
	}
	go call()
	<-started
	go call()
	go call()
	waitForJoins(t, host, 2)
	close(gate)
	for range 3 {
		if got := <-answers; got != `["one"]` {
			t.Fatalf("answer = %q, want the one computation's", got)
		}
	}
	if computed != 1 {
		t.Fatalf("computations = %d, want 1", computed)
	}
}

// Each coalesced binding joins a computation in flight under its own name: the wiring, per binding.
func TestCoalescedBindingsJoinAnIdenticalReadInFlight(t *testing.T) {
	host := newReadHost(t)
	bindings := map[string]func() (string, error){
		"ManuscriptChapters": host.ManuscriptChapters,
		"ChapterSyncState":   host.ChapterSyncState,
		"PickupsList":        host.PickupsList,
		"ProductionOverview": host.ProductionOverview,
	}
	for name, binding := range bindings {
		t.Run(name, func(t *testing.T) {
			release := holdRead(t, host, name)
			joined := host.reads.joins.Load()
			answers := make(chan string, 2)
			for range 2 {
				go func() {
					payload, _ := binding()
					answers <- payload
				}()
			}
			waitForJoins(t, host, joined+2)
			release()
			for range 2 {
				if got := <-answers; got != "held" {
					t.Fatalf("answer = %q, want the answer of the computation in flight", got)
				}
			}
		})
	}
}

// A read sent after a write, a live event or a project switch computes its own answer: the computation in flight
// started before the change and may not hold it.
func TestAReadAfterAChangeDoesNotJoinAnOlderComputation(t *testing.T) {
	changes := map[string]func(t *testing.T, host *Host){
		"ledger write": func(t *testing.T, host *Host) {
			if _, err := evidence.NewLedgerStore(host.services().config.projectFolder).Write(evidence.LedgerRecord{AnalyzerID: "coverage"}); err != nil {
				t.Fatal(err)
			}
		},
		"ledger prune": func(t *testing.T, host *Host) {
			if _, err := evidence.NewLedgerStore(host.services().config.projectFolder).Retain(nil, nil, nil); err != nil {
				t.Fatal(err)
			}
		},
		"mapping write": func(t *testing.T, host *Host) {
			if _, err := evidence.NewMappingStore(host.services().config.projectFolder).Confirm("doc", "{TRACK}", "chapter-1", "Chapter 1"); err != nil {
				t.Fatal(err)
			}
		},
		"manuscript write": func(t *testing.T, host *Host) {
			if err := host.services().manuscript.Clear(); err != nil {
				t.Fatal(err)
			}
		},
		"removal the host reports": func(*testing.T, *Host) { persist.Advance() },
		"live event":               func(*testing.T, *Host) { emitEvent("coverage:state", nil) },
		"project switch":           attachReadProject,
	}
	for name, change := range changes {
		t.Run(name, func(t *testing.T) {
			host := newReadHost(t)
			holdRead(t, host, "ManuscriptChapters")
			change(t, host)
			if got := answerOf(t, host.ManuscriptChapters); got == "held" {
				t.Fatal("the read got the answer computed before the change")
			}
			if joins := host.reads.joins.Load(); joins != 0 {
				t.Fatalf("joined calls = %d, want 0", joins)
			}
		})
	}
}

// The same binding with other arguments is another read.
func TestAReadWithOtherArgumentsDoesNotJoin(t *testing.T) {
	host := newReadHost(t)
	holdRead(t, host, "Search", "a", "b")
	for _, args := range [][]any{{"a", "c"}, {"ab"}, {"a b"}, {"a"}} {
		got := answerOf(t, func() (string, error) {
			return host.sharedRead("Search", func() (string, error) { return "own", nil }, args...)
		})
		if got != "own" {
			t.Fatalf("arguments %#v: answer = %q, want its own computation's", args, got)
		}
	}
}

// An error is shared like an answer, and the next call computes again: nothing is kept once the computation ends.
func TestAFailedReadIsSharedAndNotKept(t *testing.T) {
	host := newReadHost(t)
	failure := errors.New("unreadable")
	gate, started := make(chan struct{}), make(chan struct{})
	errs := make(chan error, 2)
	go func() {
		_, err := host.sharedRead("Read", func() (string, error) {
			close(started)
			<-gate
			return "", failure
		})
		errs <- err
	}()
	<-started
	go func() {
		_, err := host.sharedRead("Read", func() (string, error) { return "second", nil })
		errs <- err
	}()
	waitForJoins(t, host, 1)
	close(gate)
	for range 2 {
		if err := <-errs; !errors.Is(err, failure) {
			t.Fatalf("error = %v, want the computation's", err)
		}
	}
	if got, err := host.sharedRead("Read", func() (string, error) { return "fresh", nil }); got != "fresh" || err != nil {
		t.Fatalf("after the failure = %q, %v; want a new computation", got, err)
	}
}

// A computation that panics fails the calls waiting for it instead of leaving them waiting, and is not kept.
func TestAPanickingReadReleasesItsWaiters(t *testing.T) {
	host := newReadHost(t)
	gate, started := make(chan struct{}), make(chan struct{})
	go func() {
		defer func() { _ = recover() }()
		_, _ = host.sharedRead("Read", func() (string, error) {
			close(started)
			<-gate
			panic("boom")
		})
	}()
	<-started
	waiting := make(chan error, 1)
	go func() {
		_, err := host.sharedRead("Read", func() (string, error) { return "second", nil })
		waiting <- err
	}()
	waitForJoins(t, host, 1)
	close(gate)
	if err := <-waiting; err == nil {
		t.Fatal("the waiting call got no error from a computation that panicked")
	}
	if got, err := host.sharedRead("Read", func() (string, error) { return "fresh", nil }); got != "fresh" || err != nil {
		t.Fatalf("after the panic = %q, %v; want a new computation", got, err)
	}
}

// A read issued after ledger.Write answers with the record just written, while a read of the same name that started
// before the write is still computing.
func TestAReadIssuedAfterALedgerWriteAnswersWithTheWrite(t *testing.T) {
	host := newReadHost(t)
	ledger := evidence.NewLedgerStore(host.services().config.projectFolder)
	records := func() (string, error) {
		all, err := ledger.All()
		return encodeBinding(len(all), err)
	}
	gate, started, before := make(chan struct{}), make(chan struct{}), make(chan string, 1)
	go func() {
		payload, _ := host.sharedRead("LedgerRecords", func() (string, error) {
			payload, err := records() // read before the write, answered after it
			close(started)
			<-gate
			return payload, err
		})
		before <- payload
	}()
	<-started
	if _, err := ledger.Write(evidence.LedgerRecord{AnalyzerID: "coverage"}); err != nil {
		t.Fatal(err)
	}
	if got := answerOf(t, func() (string, error) { return host.sharedRead("LedgerRecords", records) }); got != "1" {
		t.Fatalf("records after the write = %s, want 1", got)
	}
	close(gate)
	if got := <-before; got != "0" {
		t.Fatalf("records of the read that started before the write = %s, want 0", got)
	}
}

// A project switch alone changes a read's key: the services of the new project, whatever the generations say.
func TestAProjectSwitchChangesAReadsKey(t *testing.T) {
	host := newReadHost(t)
	before := host.keyOf("ManuscriptChapters", nil)
	attachReadProject(t, host)
	after := host.keyOf("ManuscriptChapters", nil)
	before.writes, before.events = after.writes, after.events
	if before == after {
		t.Fatal("a read after a project switch has the key of a read before it")
	}
	previous := after
	previous.project = before.project
	if previous == before {
		t.Fatal("the key tells two projects apart by the folder only, so the same folder attached again would share a read")
	}
}
