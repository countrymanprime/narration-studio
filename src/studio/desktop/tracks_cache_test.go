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

func TestAnAnswerIsNotReusedPastItsMaxAge(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	b.advance(liveTracksMaxAge - time.Second)
	b.set(9) // a fresh heartbeat, same counter
	read(t, cached)
	if calls := inner.calls.Load(); calls != 1 {
		t.Fatalf("%d requests inside the max age, want 1", calls)
	}
	b.advance(2 * time.Second)
	b.set(9)
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests past the max age, want 2: a change the counter missed must be seen", calls)
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
			_, _ = host.boothVoiceAddIn(context.Background(), svc, creator, createAvailable(), ids[0], "Crowd", nil)
			lister, _ := trackListerFrom(svc)
			before := inner.calls.Load()
			read(t, lister)
			if inner.calls.Load() != before+1 {
				t.Fatalf("the list was served from the cache after the app added a voice (%d requests before, %d after)", before, inner.calls.Load())
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
