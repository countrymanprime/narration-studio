package main

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// A run of finished checks asks for the chapter sync state once each. While one read is being sent and one waits, the
// rest are answered by the one that waits, which reads after them: twenty requests cost two reads, not twenty (issue 3804).
func TestRequestsForTheSyncStateWhileOneWaitsShareItsRead(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	entered, release := make(chan struct{}), make(chan struct{})
	var sent atomic.Int32
	host.mu.Lock()
	host.chapterSyncEvents = func(chapterSyncState) {
		if sent.Add(1) == 1 {
			close(entered)
			<-release
		}
	}
	host.mu.Unlock()

	var all sync.WaitGroup
	all.Go(host.emitChapterSyncState)
	<-entered // the first read is being sent and holds the turn

	const later = 20
	var returned atomic.Int32
	for range later {
		all.Go(func() {
			host.emitChapterSyncState()
			returned.Add(1)
		})
	}
	// All but the one that waits its turn come back at once.
	deadline := time.Now().Add(10 * time.Second)
	for returned.Load() < later-1 {
		if time.Now().After(deadline) {
			t.Fatalf("%d of %d later requests came back while one waited, want %d", returned.Load(), later, later-1)
		}
		time.Sleep(time.Millisecond)
	}
	if returned.Load() != later-1 {
		t.Fatalf("%d later requests came back before the waiting read, want %d", returned.Load(), later-1)
	}
	close(release)
	all.Wait()
	if got := sent.Load(); got != 2 {
		t.Fatalf("the state was read and sent %d times for %d requests, want 2", got, later+1)
	}
	// A request after everything settled reads again: nothing is left marked as waiting.
	host.emitChapterSyncState()
	if got := sent.Load(); got != 3 {
		t.Fatalf("a later request was not answered: sent %d, want 3", got)
	}
}
