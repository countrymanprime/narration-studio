package main

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/daw"
	"desktop/internal/dawport"
	"desktop/internal/dawport/dawporttest"
)

// #3647: one user action read REAPER's track list up to four times; the list is read again only when REAPER's edit counter moved.

// countedLister answers ReadTracks with answer and the change count it carries, counting the requests it was sent. gate, when set, holds each
// request until it is closed.
type countedLister struct {
	calls  atomic.Int32
	mu     sync.Mutex
	answer dawport.LiveTracks
	err    error
	gate   chan struct{}
}

func (l *countedLister) ReadTracks(ctx context.Context) (dawport.LiveTracks, error) {
	l.calls.Add(1)
	if l.gate != nil {
		select {
		case <-l.gate:
		case <-ctx.Done():
			return dawport.LiveTracks{}, ctx.Err()
		}
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.answer, l.err
}

func (l *countedLister) set(answer dawport.LiveTracks, err error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.answer, l.err = answer, err
}

// beat is a heartbeat whose last event carried change count count (-1: no counter), arriving at the returned clock's current time.
type beat struct {
	reach *daw.Reachability
	clock *time.Time
}

func newBeat(count int) *beat {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	b := &beat{clock: &now}
	b.reach = daw.NewReachabilityWithClock(nil, func() time.Time { return *b.clock })
	b.set(count)
	return b
}

func (b *beat) set(count int) {
	fields := []string{"PROJECT_STATUS", "", "C:/Projects/Alice/Alice.rpp", "0"}
	if count >= 0 {
		fields = append(fields, itoa(count))
	}
	b.reach.Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: fields})
}

// project makes the heartbeat say another project is open, with the counter kept.
func (b *beat) project(rpp string, count int) {
	b.reach.Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: []string{"PROJECT_STATUS", "", rpp, "0", itoa(count)}})
}

func (b *beat) advance(d time.Duration) { *b.clock = b.clock.Add(d) }

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := ""
	for ; n > 0; n /= 10 {
		digits = string(rune('0'+n%10)) + digits
	}
	return digits
}

func cachedFor(inner dawport.TrackLister, b *beat) (cachedTrackLister, *liveTracksCache) {
	cache := newLiveTracksCache()
	cache.now = func() time.Time { return *b.clock }
	return cachedTrackLister{inner: inner, cache: cache, heartbeat: b.reach}, cache
}

func twoTracks(count int) dawport.LiveTracks {
	return dawport.LiveTracks{ProjectPath: "C:/Projects/Alice/Alice.rpp", ChangeCount: count, Total: 2, Tracks: []dawport.LiveTrack{
		{Index: 0, GUID: liveChapterI, Name: "Chapter I"}, {Index: 1, GUID: liveChapterII, Name: "Chapter II"},
	}}
}

func read(t *testing.T, l dawport.TrackLister) dawport.LiveTracks {
	t.Helper()
	got, err := l.ReadTracks(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestTheTrackListIsReadOnceWhileREAPERsEditCounterHasNotMoved(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	for i := 0; i < 4; i++ {
		if got := read(t, cached); len(got.Tracks) != 2 || got.ChangeCount != 9 {
			t.Fatalf("read %d: got %+v", i, got)
		}
	}
	if calls := inner.calls.Load(); calls != 1 {
		t.Fatalf("REAPER was asked %d times for one unchanged list, want 1", calls)
	}
}

func TestTheTrackListIsReadAgainWhenTheCounterMoves(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	inner.set(twoTracks(10), nil)
	b.set(10)
	if got := read(t, cached); got.ChangeCount != 10 {
		t.Fatalf("got count %d, want the new list", got.ChangeCount)
	}
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want 2", calls)
	}
}

func TestAHeartbeatWithNoCounterOrNoHeartbeatReadsEveryTime(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(-1)
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests with no counter, want 2: nothing may be reused without one", calls)
	}
	b.set(9)
	b.advance(time.Minute) // the heartbeat is old: REAPER may be gone
	read(t, cached)
	read(t, cached)
	if calls := inner.calls.Load(); calls != 4 {
		t.Fatalf("%d requests after the heartbeat went stale, want 4", calls)
	}
}

// tickBeat moves the clock on with heartbeats that keep coming, as REAPER's do every 1.5 s.
func tickBeat(b *beat, count int, d time.Duration) {
	for ; d > 0; d -= time.Second {
		b.advance(time.Second)
		b.set(count)
	}
}

// waitForCalls waits until inner has been sent want requests: a refresh behind a stale answer is sent from a goroutine of its own.
func waitForCalls(t *testing.T, inner *countedLister, want int32) {
	t.Helper()
	for deadline := time.Now().Add(30 * time.Second); inner.calls.Load() != want; time.Sleep(time.Millisecond) {
		if time.Now().After(deadline) {
			t.Fatalf("%d requests, want %d", inner.calls.Load(), want)
		}
	}
}

// #3752: past its max age an answer the heartbeat still vouches for is handed out at once, while REAPER is asked again behind it, so a caller
// on a slow DAW (a lane arm, the Booth's poll) no longer waits a round trip for the list. A change the counter missed is still seen: by the
// next caller once that read answers. (Before, the first caller past the max age waited for the read itself.)
func TestAnAnswerPastItsMaxAgeIsServedAtOnceAndReadAgainBehindIt(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	strict, cache := cachedFor(inner, b)
	cached := servingStale(strict)
	read(t, cached)
	tickBeat(b, 9, liveTracksMaxAge-time.Second)
	read(t, cached)
	if calls := inner.calls.Load(); calls != 1 {
		t.Fatalf("%d requests inside the max age, want 1", calls)
	}
	tickBeat(b, 9, 2*time.Second)
	// REAPER is slow: the refresh is held, and a change the counter missed (a third track) waits in it.
	changed := twoTracks(9)
	changed.Total, changed.Tracks = 3, append(changed.Tracks, dawport.LiveTrack{Index: 2, GUID: "{33333333-3333-3333-3333-333333333333}", Name: "Chapter III"})
	inner.gate = make(chan struct{})
	inner.set(changed, nil)
	if got := read(t, cached); len(got.Tracks) != 2 {
		t.Fatalf("the caller past the max age got %d tracks; want the 2 it had, at once", len(got.Tracks))
	}
	waitForCalls(t, inner, 2)
	if got := read(t, cached); len(got.Tracks) != 2 || inner.calls.Load() != 2 {
		t.Fatalf("a second caller during the refresh got %d tracks after %d requests; want the same 2 and no third request", len(got.Tracks), inner.calls.Load())
	}
	close(inner.gate)
	for deadline := time.Now().Add(30 * time.Second); ; time.Sleep(time.Millisecond) {
		cache.mu.Lock()
		stored := len(cache.answer.Tracks)
		cache.mu.Unlock()
		if stored == 3 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the refresh's answer was never stored")
		}
	}
	if got := read(t, cached); len(got.Tracks) != 3 || inner.calls.Load() != 2 {
		t.Fatalf("after the refresh: %d tracks, %d requests; want 3 and 2", len(got.Tracks), inner.calls.Load())
	}
}

// A list a page shows, or the narrator asked to refresh (TracksLive, the chapter links), is never the stale one: past the max age that read
// waits for REAPER's own answer, as it always did, so Refresh and Check again read REAPER and a change the counter missed is on screen
// within the max age. Only the host's own reads (servingStale) take the stale answer.
func TestAPagesReadPastTheMaxAgeWaitsForREAPER(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	page, _ := cachedFor(inner, b)
	host := servingStale(page)
	read(t, page)
	tickBeat(b, 9, liveTracksMaxAge+time.Second)
	changed := twoTracks(9)
	changed.Total, changed.Tracks = 1, changed.Tracks[:1]
	inner.set(changed, nil)
	if got := read(t, page); len(got.Tracks) != 1 || inner.calls.Load() != 2 {
		t.Fatalf("the page's read past the max age: %d tracks after %d requests; want REAPER's 1 from a second request", len(got.Tracks), inner.calls.Load())
	}
	if got := read(t, host); len(got.Tracks) != 1 || inner.calls.Load() != 2 {
		t.Fatalf("the host's read after it: %d tracks after %d requests; want the same fresh list and no request", len(got.Tracks), inner.calls.Load())
	}
}

// The age forgiven is bounded: past liveTracksStaleAge nothing old is shown as current, and the caller waits for REAPER's own answer.
func TestAnAnswerPastItsStaleAgeIsNotServed(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	strict, _ := cachedFor(inner, b)
	cached := servingStale(strict)
	read(t, cached)
	tickBeat(b, 9, liveTracksStaleAge+time.Second)
	changed := twoTracks(9)
	changed.Total, changed.Tracks = 1, changed.Tracks[:1]
	inner.set(changed, nil)
	if got := read(t, cached); len(got.Tracks) != 1 || inner.calls.Load() != 2 {
		t.Fatalf("past the stale age: %d tracks after %d requests; want REAPER's 1 track from a second request", len(got.Tracks), inner.calls.Load())
	}
}

// A stale answer is only handed out while the heartbeat vouches for it: a counter that moved means the list changed, and the caller waits.
func TestAStaleAnswerIsNotServedOnceTheCounterMoved(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	strict, _ := cachedFor(inner, b)
	cached := servingStale(strict)
	read(t, cached)
	tickBeat(b, 10, liveTracksMaxAge+time.Second)
	changed := twoTracks(10)
	changed.Total, changed.Tracks = 1, changed.Tracks[:1]
	inner.set(changed, nil)
	if got := read(t, cached); len(got.Tracks) != 1 {
		t.Fatalf("got %d tracks after the counter moved; want REAPER's 1", len(got.Tracks))
	}
}

// A refresh REAPER never answers costs no caller anything: the stale answer is served until its bound, and then the caller reads for itself.
func TestARefreshThatFailsLeavesTheStaleAnswerUntilItsBound(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	strict, _ := cachedFor(inner, b)
	cached := servingStale(strict)
	read(t, cached)
	tickBeat(b, 9, liveTracksMaxAge+time.Second)
	inner.set(dawport.LiveTracks{}, bridge.ErrNoAnswer)
	if got := read(t, cached); len(got.Tracks) != 2 {
		t.Fatalf("got %d tracks; want the stale 2", len(got.Tracks))
	}
	waitForCalls(t, inner, 2)
	tickBeat(b, 9, 2*time.Second)
	if got := read(t, cached); len(got.Tracks) != 2 {
		t.Fatalf("after a failed refresh got %d tracks; want the stale 2 still", len(got.Tracks))
	}
	tickBeat(b, 9, liveTracksStaleAge)
	if _, err := cached.ReadTracks(context.Background()); !errors.Is(err, bridge.ErrNoAnswer) {
		t.Fatalf("past the stale age: err %v; want REAPER's own failure", err)
	}
}

func TestAnInvalidatedListIsReadAgain(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	cached, cache := cachedFor(inner, b)
	read(t, cached)
	cache.Invalidate()
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want 2: a track this app just made must show at once", calls)
	}
}

func TestAReadThatWasInFlightWhenTheListWasInvalidatedIsNotKept(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9), gate: make(chan struct{})}, newBeat(9)
	cached, cache := cachedFor(inner, b)
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = cached.ReadTracks(context.Background())
	}()
	for inner.calls.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	cache.Invalidate() // the app made a track while the read was out: the answer may predate it
	close(inner.gate)
	<-done
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want 2: the answer that began before the change was kept", calls)
	}
}

func TestCallersAtTheSameTimeShareOneRequest(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9), gate: make(chan struct{})}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	var wg sync.WaitGroup
	answers := make([]dawport.LiveTracks, 5)
	for i := range answers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			answers[i], _ = cached.ReadTracks(context.Background())
		}()
	}
	for inner.calls.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	time.Sleep(20 * time.Millisecond) // the others have reached the cache and wait on the one request
	close(inner.gate)
	wg.Wait()
	if calls := inner.calls.Load(); calls != 1 {
		t.Fatalf("%d requests for five callers at once, want 1", calls)
	}
	for i, got := range answers {
		if len(got.Tracks) != 2 {
			t.Fatalf("caller %d got %+v", i, got)
		}
	}
}

// failFirst fails its first request once released and answers every later one.
type failFirst struct {
	calls atomic.Int32
	gate  chan struct{}
}

func (l *failFirst) ReadTracks(context.Context) (dawport.LiveTracks, error) {
	if l.calls.Add(1) == 1 {
		<-l.gate
		return dawport.LiveTracks{}, bridge.ErrNoAnswer
	}
	return twoTracks(9), nil
}

func TestAFailedReadIsNotKeptAndItsWaiterReadsForItself(t *testing.T) {
	inner, b := &failFirst{gate: make(chan struct{})}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	first := make(chan error, 1)
	go func() {
		_, err := cached.ReadTracks(context.Background())
		first <- err
	}()
	for inner.calls.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	second := make(chan error, 1)
	go func() {
		_, err := cached.ReadTracks(context.Background())
		second <- err
	}()
	time.Sleep(20 * time.Millisecond) // the second caller is waiting on the first request
	close(inner.gate)
	if err := <-first; !errors.Is(err, bridge.ErrNoAnswer) {
		t.Fatalf("the caller whose request failed got %v, want the failure", err)
	}
	if err := <-second; err != nil {
		t.Fatalf("the waiter got %v: a failure must not be served to a caller that arrived meanwhile", err)
	}
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want 2 (the failed one and the waiter's own)", calls)
	}
}

func TestACallerGivesUpWhenItsOwnDeadlinePassesWhileWaiting(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9), gate: make(chan struct{})}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	go func() { _, _ = cached.ReadTracks(context.Background()) }()
	for inner.calls.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := cached.ReadTracks(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("got %v, want the caller's own deadline", err)
	}
	close(inner.gate)
}

// The Booth's idle tick (#3647): the page's own live read, the voices' read and the record-target read all go through one host, and REAPER is
// asked once.
func TestAnIdleBoothTickAsksREAPERForTheTrackListOnce(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	b := newBeat(9)
	inner := &countedLister{answer: twoTracks(9)}
	svc := servicesWithLister(host, inner)
	svc.reachability = b.reach
	svc.tracksCache = newLiveTracksCache()
	_ = ids
	for i := 0; i < 4; i++ {
		lister, _ := trackListerFrom(svc)
		if _, err := lister.ReadTracks(context.Background()); err != nil {
			t.Fatal(err)
		}
		if _, err := liveSelectedProject(svc); err != nil {
			t.Fatal(err)
		}
	}
	if calls := inner.calls.Load(); calls != 1 {
		t.Fatalf("REAPER was asked %d times in one unchanged tick, want 1 (before #3647 it was one per caller)", calls)
	}
}

// cacheListerAdapter is a fake DAW whose track list is lister's.
type cacheListerAdapter struct {
	*dawporttest.Fake
	lister dawport.TrackLister
}

func (a cacheListerAdapter) Role(capability dawport.Capability) any {
	if capability == dawport.CapTracksRead {
		return a.lister
	}
	return a.Fake.Role(capability)
}

func servicesWithLister(host *Host, lister dawport.TrackLister) hostServices {
	svc := host.services()
	svc.dawPortResolver = dawport.NewResolver(dawport.ResolverConfig{
		Adapter: cacheListerAdapter{Fake: dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Supported)), lister: lister},
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
	})
	return svc
}

// A track this app makes must show in the next read, not after the next heartbeat: the host's own creates drop the cached list, also when the
// create timed out (REAPER may still have made the track).
func warmedServices(t *testing.T, host *Host) (hostServices, *countedLister) {
	t.Helper()
	inner := &countedLister{answer: twoTracks(9)}
	svc := servicesWithLister(host, inner)
	svc.reachability = newBeat(9).reach
	svc.tracksCache = newLiveTracksCache()
	lister, _ := trackListerFrom(svc)
	read(t, lister)
	read(t, lister)
	if calls := inner.calls.Load(); calls != 1 {
		t.Fatalf("warming took %d requests, want 1", calls)
	}
	return svc, inner
}

func TestAddingAVoiceDropsTheCachedTrackList(t *testing.T) {
	for name, creator := range map[string]dawport.TrackCreator{
		"answered":     &fakeChildCreator{},
		"timed out":    &fakeChildCreator{childErr: bridge.ErrNoAnswer},
		"other refuse": &fakeChildCreator{childErr: context.DeadlineExceeded},
	} {
		t.Run(name, func(t *testing.T) {
			host, ids := newVoiceFolderHost(t, "folders")
			svc, inner := warmedServices(t, host)
			warm := inner.calls.Load()
			_, _ = host.boothVoiceAddIn(context.Background(), svc, creator, createAvailable(), ids[0], "Crowd", nil)
			lister, _ := trackListerFrom(svc)
			read(t, lister)
			// The list warmed before the add may not be served after it. An add that got no answer reads the folder back at once (#3645), and that
			// fresh read is then the cached one, so the check is that REAPER was asked again since the add, not that the next read asks again.
			if inner.calls.Load() <= warm {
				t.Fatalf("the list was served from the cache after the app added a voice (%d requests before the add, %d after)", warm, inner.calls.Load())
			}
		})
	}
}

func TestCreatingAChapterTrackDropsTheCachedTrackList(t *testing.T) {
	for name, creator := range map[string]dawport.TrackCreator{
		"answered":  &fakeCreator{},
		"timed out": &fakeCreator{err: bridge.ErrNoAnswer},
	} {
		t.Run(name, func(t *testing.T) {
			host, ids := newTestHostForChapterMatch(t)
			svc, inner := warmedServices(t, host)
			_, _ = chapterTrackCreateIn(context.Background(), svc, creator, createAvailable(), ids[0])
			lister, _ := trackListerFrom(svc)
			before := inner.calls.Load()
			read(t, lister)
			if inner.calls.Load() != before+1 {
				t.Fatalf("the list was served from the cache after the app created a track (%d requests before, %d after)", before, inner.calls.Load())
			}
		})
	}
}

// A read that began before the host made a track may not have it: a caller arriving after the create must not be handed that read.
func TestACallerAfterAnInvalidationDoesNotJoinAReadThatStartedBefore(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9), gate: make(chan struct{})}, newBeat(9)
	cached, cache := cachedFor(inner, b)
	first := make(chan struct{})
	go func() {
		defer close(first)
		_, _ = cached.ReadTracks(context.Background())
	}()
	for inner.calls.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	cache.Invalidate() // the app made a track while the first read was out
	second := make(chan struct{})
	go func() {
		defer close(second)
		_, _ = cached.ReadTracks(context.Background())
	}()
	deadline := time.After(2 * time.Second)
	for inner.calls.Load() < 2 {
		select {
		case <-second:
			t.Fatalf("the caller after the invalidation was answered by the read that began before it (%d requests)", inner.calls.Load())
		case <-deadline:
			close(inner.gate)
			t.Fatalf("the caller after the invalidation sent no request of its own (%d requests): it is waiting on the read that began before it", inner.calls.Load())
		case <-time.After(time.Millisecond):
		}
	}
	close(inner.gate)
	<-first
	<-second
}

// panicFirst panics on its first request, once released, and answers the rest.
type panicFirst struct {
	calls atomic.Int32
	gate  chan struct{}
}

func (l *panicFirst) ReadTracks(context.Context) (dawport.LiveTracks, error) {
	if l.calls.Add(1) == 1 {
		<-l.gate
		panic("the bridge broke")
	}
	return twoTracks(9), nil
}

// A read that panics must still wake the callers waiting on it, and leave the cache usable.
func TestALeaderThatPanicsDoesNotWedgeTheCallersWaitingOnIt(t *testing.T) {
	inner, b := &panicFirst{gate: make(chan struct{})}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	go func() {
		defer func() { _ = recover() }()
		_, _ = cached.ReadTracks(context.Background())
	}()
	for inner.calls.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	waiter := make(chan error, 1)
	go func() {
		_, err := cached.ReadTracks(context.Background())
		waiter <- err
	}()
	time.Sleep(20 * time.Millisecond) // the waiter is on the leader's read
	close(inner.gate)                 // the leader panics
	select {
	case err := <-waiter:
		if err != nil {
			t.Fatalf("the waiter's own read failed: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("a caller waiting on a read that panicked never returned")
	}
	if got := read(t, cached); len(got.Tracks) != 2 {
		t.Fatalf("got %+v after the panic", got)
	}
}

func TestAListOfAnotherOpenProjectIsNotReusedWhenTheCountersMatch(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	b.project("C:/Projects/Bob/Bob.rpp", 9) // the narrator opened another project in REAPER: its counter happens to match
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want 2: another project's list was served", calls)
	}
}

func TestAMutatedAnswerDoesNotChangeTheNextRead(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	for round := 0; round < 3; round++ { // the read that asked REAPER, then two served from the cache
		got := read(t, cached)
		if got.Tracks[0].Name != "Chapter I" || got.Tracks[1].Name != "Chapter II" {
			t.Fatalf("round %d: the read was %+v: callers share one list", round, got.Tracks)
		}
		got.Tracks[0].Name = "changed by a caller"
		got.Tracks[0], got.Tracks[1] = got.Tracks[1], got.Tracks[0]
	}
}

// A waiter's own deadline ends its wait while the one request is still out (the request is not released until the end).
func TestAWaiterReturnsItsOwnDeadlineWhileTheReadIsStillOut(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9), gate: make(chan struct{})}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	go func() { _, _ = cached.ReadTracks(context.Background()) }()
	for inner.calls.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	started := time.Now()
	_, err := cached.ReadTracks(ctx)
	if !errors.Is(err, context.DeadlineExceeded) || time.Since(started) > time.Second {
		t.Fatalf("got %v after %s, want the caller's own deadline while the read is still out", err, time.Since(started))
	}
	close(inner.gate)
}

// failOnce fails its first request at once and answers the rest.
type failOnce struct{ calls atomic.Int32 }

func (l *failOnce) ReadTracks(context.Context) (dawport.LiveTracks, error) {
	if l.calls.Add(1) == 1 {
		return dawport.LiveTracks{}, bridge.ErrNoAnswer
	}
	return twoTracks(0), nil
}

// An error answer is the zero list with a zero counter, which a heartbeat at 0 equals: it must not be kept.
func TestAFailedReadIsNotServedToTheNextCaller(t *testing.T) {
	inner, b := &failOnce{}, newBeat(0)
	cached, _ := cachedFor(inner, b)
	if _, err := cached.ReadTracks(context.Background()); !errors.Is(err, bridge.ErrNoAnswer) {
		t.Fatalf("got %v, want the failure", err)
	}
	got, err := cached.ReadTracks(context.Background())
	if err != nil || len(got.Tracks) != 2 {
		t.Fatalf("got %+v, %v: the failure was kept and served", got, err)
	}
}

// REAPER closed and opened again (a gap in the heartbeats) with the same project and, by chance, the same counter: the list read before is not reused.
func TestAListReadBeforeTheBridgeStartedOverIsNotReused(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	b.advance(6 * time.Second) // longer than the heartbeat timeout: the next heartbeat starts a new epoch
	b.set(9)
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want 2: a list read before REAPER went quiet was served", calls)
	}
	b.advance(time.Second)
	b.set(9)
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want 2: ordinary heartbeats must not drop the list", calls)
	}
}

// A caller that arrives after the bridge started over must not be handed a read that began before: its answer predates the restart.
func TestACallerAfterTheEpochMovedDoesNotJoinAReadThatStartedBefore(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9), gate: make(chan struct{})}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	first := make(chan struct{})
	go func() {
		defer close(first)
		_, _ = cached.ReadTracks(context.Background())
	}()
	for inner.calls.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	b.advance(6 * time.Second) // REAPER went quiet for longer than the heartbeat timeout and came back: a new epoch
	b.set(9)
	second := make(chan struct{})
	go func() {
		defer close(second)
		_, _ = cached.ReadTracks(context.Background())
	}()
	deadline := time.After(2 * time.Second)
	for inner.calls.Load() < 2 {
		select {
		case <-second:
			t.Fatalf("the caller after the restart was answered by the read that began before it (%d requests)", inner.calls.Load())
		case <-deadline:
			close(inner.gate)
			t.Fatalf("the caller after the restart sent no request of its own (%d requests)", inner.calls.Load())
		case <-time.After(time.Millisecond):
		}
	}
	close(inner.gate)
	<-first
	<-second
}

// An epoch read after the answer instead of before it would store a list that began before a restart under the epoch after it: the gap and the
// heartbeat land while the request is out, and the list must not be reused afterwards.
type gapDuringRead struct {
	countedLister
	b *beat
}

func (l *gapDuringRead) ReadTracks(ctx context.Context) (dawport.LiveTracks, error) {
	if l.calls.Load() == 0 {
		l.b.advance(6 * time.Second) // REAPER restarts while this request is out
		l.b.set(9)
	}
	return l.countedLister.ReadTracks(ctx)
}

func TestAListReadAcrossAGapIsNotReusedAfterwards(t *testing.T) {
	b := newBeat(9)
	inner := &gapDuringRead{countedLister: countedLister{answer: twoTracks(9)}, b: b}
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want 2: a list read while the bridge restarted was kept for the new epoch", calls)
	}
}

// panicOnSecond answers its first request and panics on its second.
type panicOnSecond struct{ calls atomic.Int32 }

func (l *panicOnSecond) ReadTracks(context.Context) (dawport.LiveTracks, error) {
	if l.calls.Add(1) == 2 {
		panic("the bridge broke")
	}
	return twoTracks(9), nil
}

// The read behind a stale answer runs on a goroutine of its own: a read that panics there must not end the app, and the cache stays usable.
func TestARefreshThatPanicsEndsNothing(t *testing.T) {
	inner, b := &panicOnSecond{}, newBeat(9)
	strict, cache := cachedFor(inner, b)
	cached := servingStale(strict)
	read(t, cached)
	tickBeat(b, 9, liveTracksMaxAge+time.Second)
	read(t, cached) // served stale; the refresh panics behind it
	for deadline := time.Now().Add(30 * time.Second); ; time.Sleep(time.Millisecond) {
		cache.mu.Lock()
		over := inner.calls.Load() == 2 && cache.flight == nil
		cache.mu.Unlock()
		if over {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the refresh that panicked never let go of the cache")
		}
	}
	tickBeat(b, 9, liveTracksStaleAge)
	if got := read(t, cached); len(got.Tracks) != 2 || inner.calls.Load() != 3 {
		t.Fatalf("after the panic: %d tracks, %d requests; want a third request answered", len(got.Tracks), inner.calls.Load())
	}
}

// A track this app made while a refresh was out: the refresh's answer may predate it, so it is neither kept nor handed to the next caller,
// who reads REAPER for itself (the rule Invalidate already holds for a caller's own read).
func TestARefreshInFlightWhenTheListWasInvalidatedIsNotKept(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	strict, _ := cachedFor(inner, b)
	cached := servingStale(strict)
	read(t, cached)
	tickBeat(b, 9, liveTracksMaxAge+time.Second)
	gate := make(chan struct{})
	inner.gate = gate
	read(t, cached) // served stale; the refresh is held
	waitForCalls(t, inner, 2)
	strict.cache.Invalidate()
	withNew := twoTracks(9)
	withNew.Total, withNew.Tracks = 3, append(withNew.Tracks, dawport.LiveTrack{Index: 2, GUID: "{33333333-3333-3333-3333-333333333333}", Name: "Chapter III"})
	inner.set(withNew, nil)
	got := make(chan dawport.LiveTracks, 1)
	go func() {
		answer, _ := cached.ReadTracks(context.Background())
		got <- answer
	}()
	waitForCalls(t, inner, 3) // the caller after the invalidation sent its own request and did not join the refresh
	close(gate)
	if answer := <-got; len(answer.Tracks) != 3 {
		t.Fatalf("the read after the invalidation got %d tracks; want REAPER's 3", len(answer.Tracks))
	}
}

// Many of the host's reads past the max age at once start one read behind the stale answer, not one each.
func TestStaleCallersAtTheSameTimeStartOneRefresh(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	strict, _ := cachedFor(inner, b)
	cached := servingStale(strict)
	read(t, cached)
	tickBeat(b, 9, liveTracksMaxAge+time.Second)
	inner.gate = make(chan struct{})
	var group sync.WaitGroup
	for range 20 {
		group.Add(1)
		go func() {
			defer group.Done()
			if got, err := cached.ReadTracks(context.Background()); err != nil || len(got.Tracks) != 2 {
				t.Errorf("a stale caller got %d tracks, err %v", len(got.Tracks), err)
			}
		}()
	}
	group.Wait()
	waitForCalls(t, inner, 2)
	time.Sleep(20 * time.Millisecond)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests; want the first read and one refresh", calls)
	}
	close(inner.gate)
}
