package main

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"desktop/internal/contractfile"
	"desktop/internal/dawport"
)

// Following REAPER while the resume prompt shows: REAPER playing or
// recording dismisses the prompt, and the edit cursor settling on the chapter's recorded audio re-runs the locate. The poll is bounded: it runs only while followed, never during a session, and stops by itself.

func followState(cursor float64) dawport.TrackState {
	return dawport.TrackState{
		ProjectPath: "C:/p/Book.rpp",
		EditCursor:  cursor,
		Items:       []dawport.TrackItem{liveItem("A", 0, 10, 0, 1, "C:/a.wav"), liveItem("B", 20, 10, 0, 1, "C:/b.wav")},
	}
}

func TestResumeFollowerReportsPlayAndRecordAndStops(t *testing.T) {
	for _, c := range []struct {
		name   string
		change func(*dawport.TrackState)
		reason string
	}{
		{"playing", func(s *dawport.TrackState) { s.Playing = true }, followPlaying},
		{"recording, any track", func(s *dawport.TrackState) { s.Recording, s.Playing = true, true }, followRecording},
	} {
		t.Run(c.name, func(t *testing.T) {
			follower := newResumeFollower("ch1", nil, nil, "")
			if event, stop := follower.step(followState(0)); event != nil || stop {
				t.Fatalf("first read = %+v, %v; want a baseline only", event, stop)
			}
			state := followState(0)
			c.change(&state)
			event, stop := follower.step(state)
			if event == nil || event.Reason != c.reason || event.ChapterID != "ch1" || !stop {
				t.Fatalf("event = %+v, stop %v; want %s and the poll to stop", event, stop, c.reason)
			}
		})
	}
}

func TestResumeFollowerReportsPlayingAlreadyOnItsFirstRead(t *testing.T) {
	// The dialog opened while REAPER already played: the prompt still goes away, as the narrator is listening in REAPER.
	follower := newResumeFollower("ch1", nil, nil, "")
	state := followState(0)
	state.Playing = true
	if event, stop := follower.step(state); event == nil || event.Reason != followPlaying || !stop {
		t.Fatalf("event = %+v, stop %v; want playing", event, stop)
	}
}

func TestResumeFollowerReportsTheCursorOnlyOnceItSettlesOnTheRecording(t *testing.T) {
	cases := []struct {
		name    string
		cursors []float64
		want    []float64 // the cursor reported after each read, or -1 for none
	}{
		{"moves onto the audio and stays one read", []float64{0, 5, 5, 5}, []float64{-1, -1, 5, -1}},
		{"keeps moving, then settles", []float64{0, 5, 6, 6}, []float64{-1, -1, -1, 6}},
		{"moves back before it settles", []float64{3, 5, 3, 3}, []float64{-1, -1, -1, -1}},
		{"settles between items: not the recording", []float64{3, 15, 15, 15}, []float64{-1, -1, -1, -1}},
		{"settles after the last item", []float64{3, 45, 45}, []float64{-1, -1, -1}},
		{"moves again after a report", []float64{0, 5, 5, 25, 25}, []float64{-1, -1, 5, -1, 25}},
		{"a jitter under the tolerance is no move", []float64{5, 5.0001, 5.0001}, []float64{-1, -1, -1}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			follower := newResumeFollower("ch1", nil, nil, "")
			for i, cursor := range c.cursors {
				event, stop := follower.step(followState(cursor))
				if stop {
					t.Fatalf("read %d stopped the poll", i)
				}
				got := -1.0
				if event != nil {
					if event.Reason != followCursorMoved || event.EditCursor == nil {
						t.Fatalf("read %d: event = %+v", i, event)
					}
					got = *event.EditCursor
				}
				if got != c.want[i] {
					t.Fatalf("read %d (cursor %v): reported %v, want %v", i, cursor, got, c.want[i])
				}
			}
		})
	}
}

// recordingEmitter collects what the poll emits.
type recordingEmitter struct {
	mu     sync.Mutex
	events []resumeFollowEvent
}

func (r *recordingEmitter) emit(event resumeFollowEvent) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, event)
}

func (r *recordingEmitter) all() []resumeFollowEvent {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]resumeFollowEvent(nil), r.events...)
}

// scriptedTrackState answers each read with the next state of a script, then repeats the last one.
type scriptedTrackState struct {
	mu     sync.Mutex
	states []dawport.TrackState
	reads  int
}

func (s *scriptedTrackState) ChapterTrackState(_ context.Context, guid string) (dawport.TrackState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	state := s.states[min(s.reads, len(s.states)-1)]
	s.reads++
	state.TrackGUID = guid
	return state, nil
}

func (s *scriptedTrackState) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.reads
}

func followLoop(reader trackStateReader, busy func() bool, emitter *recordingEmitter) resumeFollowLoop {
	return resumeFollowLoop{
		reader: reader, projectPath: "C:/p/Book.rpp", trackGUID: chapterOneTrack,
		follower: newResumeFollower("ch1", nil, nil, ""), sessionBusy: busy, emit: emitter.emit,
		interval: time.Millisecond, lifetime: time.Minute,
	}
}

func TestResumeFollowLoopEmitsPlayingAndEndsItself(t *testing.T) {
	playing := followState(0)
	playing.Playing = true
	reader := &scriptedTrackState{states: []dawport.TrackState{followState(0), followState(0), playing}}
	emitter := &recordingEmitter{}
	done := make(chan struct{})
	go func() {
		followLoop(reader, func() bool { return false }, emitter).run(context.Background())
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the poll did not end after REAPER played")
	}
	if events := emitter.all(); len(events) != 1 || events[0].Reason != followPlaying {
		t.Fatalf("events = %+v, want one playing", events)
	}
}

func TestResumeFollowLoopNeverAsksREAPERDuringASession(t *testing.T) {
	reader := &scriptedTrackState{states: []dawport.TrackState{followState(0)}}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	followLoop(reader, func() bool { return true }, &recordingEmitter{}).run(ctx)
	if reader.count() != 0 {
		t.Fatalf("asked REAPER %d times while a session ran", reader.count())
	}
}

func TestResumeFollowLoopEndsAtItsLifetimeAndOnCancel(t *testing.T) {
	reader := &scriptedTrackState{states: []dawport.TrackState{followState(0)}}
	loop := followLoop(reader, func() bool { return false }, &recordingEmitter{})
	loop.lifetime = 20 * time.Millisecond
	done := make(chan struct{})
	go func() { loop.run(context.Background()); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the poll outlived its lifetime")
	}

	ctx, cancel := context.WithCancel(context.Background())
	loop.lifetime = time.Hour
	done = make(chan struct{})
	go func() { loop.run(ctx); close(done) }()
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the poll did not stop when cancelled")
	}
}

func TestResumeFollowLoopIgnoresAnAnswerForAnotherProject(t *testing.T) {
	other := followState(0)
	other.Playing, other.ProjectPath = true, "C:/p/Other.rpp"
	reader := &scriptedTrackState{states: []dawport.TrackState{other}}
	emitter := &recordingEmitter{}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	followLoop(reader, func() bool { return false }, emitter).run(ctx)
	if events := emitter.all(); len(events) != 0 {
		t.Fatalf("events = %+v, want nothing from another project", events)
	}
}

func TestTeleprompterResumeFollowSaysWhyItCannotFollow(t *testing.T) {
	f := newTestHostForLocate(t, true)
	svc := f.host.services()
	for _, c := range []struct {
		name, chapter string
		reader        trackStateReader
		want          string
	}{
		{"no track state role", f.chapters[0], nil, followUnavailable},
		{"no track for the chapter", f.chapters[2], &fakeTrackState{}, followNoTrack},
	} {
		answer, err := f.host.teleprompterResumeFollowWith(svc, c.reader, c.chapter, "", (&recordingEmitter{}).emit)
		if err != nil {
			t.Fatal(err)
		}
		if answer.Following || answer.Reason != c.want {
			t.Fatalf("%s: answer = %+v, want not following, %s", c.name, answer, c.want)
		}
	}
	if _, err := f.host.teleprompterResumeFollowWith(svc, &fakeTrackState{}, "no-such-chapter", "", (&recordingEmitter{}).emit); err == nil {
		t.Fatal("followed a chapter the manuscript does not have")
	}
	if _, err := f.host.teleprompterResumeFollowWith(svc, &fakeTrackState{}, f.chapters[0], "{99999999-9999-4999-8999-999999999999}", (&recordingEmitter{}).emit); err == nil {
		t.Fatal("followed a track outside the selected project")
	}
}

func TestTeleprompterResumeFollowPollsTheChaptersTrackUntilUnfollowed(t *testing.T) {
	f := newTestHostForLocate(t, true)
	restore := resumeFollowInterval
	resumeFollowInterval = time.Millisecond
	t.Cleanup(func() { resumeFollowInterval = restore })
	state := f.liveChapterOne(t, 0)
	reader := &fakeTrackState{state: state}
	emitter := &recordingEmitter{}

	answer, err := f.host.teleprompterResumeFollowWith(f.host.services(), reader, f.chapters[0], "", emitter.emit)
	if err != nil || !answer.Following {
		t.Fatalf("answer = %+v, %v; want following", answer, err)
	}
	waitFor(t, func() bool { return reader.askedCount() >= 2 })
	if _, err := f.host.TeleprompterResumeUnfollow(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(20 * time.Millisecond)
	asked := reader.askedCount()
	time.Sleep(20 * time.Millisecond)
	if reader.askedCount() != asked {
		t.Fatalf("the poll kept asking after Unfollow (%d then %d)", asked, reader.askedCount())
	}
	if guid := reader.askedAt(0); guid != chapterOneTrack {
		t.Fatalf("asked about %s, want chapter I's track", guid)
	}
}

func TestTeleprompterResumeFollowReplacesTheFollowBeforeIt(t *testing.T) {
	f := newTestHostForLocate(t, true)
	restore := resumeFollowInterval
	resumeFollowInterval = time.Millisecond
	t.Cleanup(func() { resumeFollowInterval = restore })
	first, second := &fakeTrackState{state: f.liveChapterOne(t, 0)}, &fakeTrackState{state: f.liveChapterOne(t, 0)}
	emitter := &recordingEmitter{}
	if _, err := f.host.teleprompterResumeFollowWith(f.host.services(), first, f.chapters[0], "", emitter.emit); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return first.askedCount() >= 1 })
	if _, err := f.host.teleprompterResumeFollowWith(f.host.services(), second, f.chapters[0], "", emitter.emit); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return second.askedCount() >= 1 })
	time.Sleep(20 * time.Millisecond)
	asked := first.askedCount()
	time.Sleep(20 * time.Millisecond)
	if first.askedCount() != asked {
		t.Fatal("the replaced follow kept polling")
	}
	_, _ = f.host.TeleprompterResumeUnfollow()
}

func waitFor(t *testing.T, done func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !done() {
		if time.Now().After(deadline) {
			t.Fatal("timed out")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestContractTeleprompterResumeFollow(t *testing.T) {
	cursor := 5.0
	for name, value := range map[string]any{
		"teleprompter-resume-follow-started":     resumeFollowAnswer{Following: true},
		"teleprompter-resume-follow-unavailable": resumeFollowAnswer{Reason: followUnavailable},
		"teleprompter-resume-follow-playing":     resumeFollowEvent{ChapterID: "chapter-1", Reason: followPlaying},
		"teleprompter-resume-follow-cursor":      resumeFollowEvent{ChapterID: "chapter-1", Reason: followCursorMoved, EditCursor: &cursor},
	} {
		raw, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		var payload any
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, payload)
	}
}

// lightTrackState answers the poll's itemless read with the state's transport and cursor and no items, and the full read with the items, and counts each
// (#3664: a chapter's folder is hundreds of rows a second, and the poll needs the items only once the cursor has settled).
type lightTrackState struct {
	mu          sync.Mutex
	cursors     []float64 // the cursor of each tick, the last repeated
	light, full int
	failFull    bool
}

func (s *lightTrackState) state(guid string, withItems bool) dawport.TrackState {
	state := followState(s.cursors[min(s.light, len(s.cursors)-1)])
	if !withItems {
		state.Items = nil
	}
	state.TrackGUID = guid
	return state
}

func (s *lightTrackState) ChapterTrackStateNoItems(_ context.Context, guid string) (dawport.TrackState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	state := s.state(guid, false)
	s.light++
	return state, nil
}

func (s *lightTrackState) ChapterTrackState(_ context.Context, guid string) (dawport.TrackState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.full++
	if s.failFull {
		return dawport.TrackState{}, context.DeadlineExceeded
	}
	// The cursor of the tick that asked: light has counted it already.
	return func() dawport.TrackState {
		state := followState(s.cursors[max(min(s.light-1, len(s.cursors)-1), 0)])
		state.TrackGUID = guid
		return state
	}(), nil
}

func (s *lightTrackState) counts() (light, full int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.light, s.full
}

func runFollow(t *testing.T, reader trackStateReader, ticks func() bool, emitter *recordingEmitter) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan struct{})
	go func() {
		followLoop(reader, func() bool { return false }, emitter).run(ctx)
		close(done)
	}()
	waitFor(t, ticks)
	cancel()
	<-done
}

func TestResumeFollowLoopReadsNoItemsWhileTheCursorStaysPut(t *testing.T) {
	reader := &lightTrackState{cursors: []float64{5}}
	runFollow(t, reader, func() bool { light, _ := reader.counts(); return light >= 20 }, &recordingEmitter{})
	if light, full := reader.counts(); light < 20 || full != 0 {
		t.Fatalf("%d itemless reads and %d full reads, want no full read while the cursor does not move", light, full)
	}
}

func TestResumeFollowLoopReadsTheItemsOnceWhenTheCursorSettlesOnTheRecording(t *testing.T) {
	reader := &lightTrackState{cursors: []float64{0, 5, 5}} // moves onto the audio, then stays
	emitter := &recordingEmitter{}
	runFollow(t, reader, func() bool { return len(emitter.all()) == 1 }, emitter)
	events := emitter.all()
	if len(events) != 1 || events[0].Reason != followCursorMoved || events[0].EditCursor == nil || *events[0].EditCursor != 5 {
		t.Fatalf("events = %+v, want one cursor_moved at 5", events)
	}
	if _, full := reader.counts(); full != 1 {
		t.Fatalf("%d full reads, want exactly one, at the settle", full)
	}
}

func TestResumeFollowLoopTriesTheItemsAgainWhenTheirReadFailed(t *testing.T) {
	reader := &lightTrackState{cursors: []float64{0, 5, 5}, failFull: true}
	emitter := &recordingEmitter{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan struct{})
	go func() {
		followLoop(reader, func() bool { return false }, emitter).run(ctx)
		close(done)
	}()
	waitFor(t, func() bool { _, full := reader.counts(); return full >= 3 })
	if events := emitter.all(); len(events) != 0 {
		t.Fatalf("events = %+v, want none while the items cannot be read", events)
	}
	reader.mu.Lock()
	reader.failFull = false // REAPER answers again: the settle that was waiting is reported
	reader.mu.Unlock()
	waitFor(t, func() bool { return len(emitter.all()) == 1 })
	cancel()
	<-done
	if events := emitter.all(); len(events) != 1 || events[0].Reason != followCursorMoved {
		t.Fatalf("events = %+v, want the settled cursor reported once the items read", events)
	}
}
