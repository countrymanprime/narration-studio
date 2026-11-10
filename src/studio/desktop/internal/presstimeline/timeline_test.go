package presstimeline

import (
	"context"
	"strings"
	"testing"
	"time"
)

// clock is a test clock that moves only when told.
type clock struct{ at time.Time }

func (c *clock) now() time.Time       { return c.at }
func (c *clock) step(d time.Duration) { c.at = c.at.Add(d) }
func newClock() *clock                { return &clock{at: time.Date(2026, 11, 1, 18, 52, 0, 0, time.UTC)} }
func lines(written *[]string) func(string) error {
	return func(line string) error { *written = append(*written, line); return nil }
}

func TestOffItWritesNothingAndKeepsNoMarks(t *testing.T) {
	c, written := newClock(), []string{}
	timeline := New(func() bool { return false }, c.now, lines(&written))
	timeline.Begin("assets_list")
	timeline.Mark("listen_call")
	timeline.Finish("recording", "started")
	if len(written) != 0 {
		t.Fatalf("wrote %q with the switch off", written)
	}
	if n := timeline.pending(); n != 0 {
		t.Fatalf("kept %d marks with the switch off", n)
	}
}

func TestOnItWritesOneLineWithEveryStepInOrderInMillisecondsFromTheFirst(t *testing.T) {
	c, written := newClock(), []string{}
	timeline := New(func() bool { return true }, c.now, lines(&written))
	timeline.Begin("assets_list")
	c.step(3 * time.Millisecond)
	timeline.Mark("listen_call")
	c.step(2400 * time.Millisecond)
	timeline.Mark("listening")
	c.step(250 * time.Millisecond)
	timeline.Finish("recording", "started")
	if len(written) != 1 {
		t.Fatalf("wrote %d lines, want 1", len(written))
	}
	want := "2026-11-01T18:52:02Z record_press outcome=started total_ms=2653 assets_list=0 listen_call=3 listening=2403 recording=2653\n"
	if written[0] != want {
		t.Fatalf("line = %q\nwant   %q", written[0], want)
	}
	if n := timeline.pending(); n != 0 {
		t.Fatalf("kept %d marks after the line was written", n)
	}
}

func TestBeginDropsAnEarlierPressThatNeverFinished(t *testing.T) {
	c, written := newClock(), []string{}
	timeline := New(func() bool { return true }, c.now, lines(&written))
	timeline.Begin("assets_list")
	timeline.Mark("listen_call")
	c.step(time.Second)
	timeline.Begin("assets_list")
	c.step(10 * time.Millisecond)
	timeline.Finish("recording", "refused")
	if len(written) != 1 || strings.Contains(written[0], "listen_call") || !strings.Contains(written[0], "total_ms=10 ") {
		t.Fatalf("line = %q, want only the second press", written)
	}
}

// An asset listing another page asked for a while before is not the start of this press: the line starts at the first step
// that follows the one before it within leadGap.
func TestALeadingStepLongBeforeTheRestIsNotPartOfThePress(t *testing.T) {
	c, written := newClock(), []string{}
	timeline := New(func() bool { return true }, c.now, lines(&written))
	timeline.Begin("assets_list")
	c.step(20 * time.Second)
	timeline.Mark("record_call")
	c.step(200 * time.Millisecond)
	timeline.Finish("recording", "started")
	if len(written) != 1 || strings.Contains(written[0], "assets_list") || !strings.Contains(written[0], "total_ms=200 ") {
		t.Fatalf("line = %q, want the press from record_call", written)
	}
}

func TestAStepTakenTwiceIsNumbered(t *testing.T) {
	c, written := newClock(), []string{}
	timeline := New(func() bool { return true }, c.now, lines(&written))
	timeline.Begin("assets_list")
	c.step(time.Millisecond)
	timeline.Mark("assets_list")
	timeline.Finish("recording", "started")
	if !strings.Contains(written[0], "assets_list=0 assets_list#2=1 ") {
		t.Fatalf("line = %q", written[0])
	}
}

func TestANilTimelineDoesNothing(t *testing.T) {
	var timeline *Timeline
	timeline.Begin("a")
	timeline.Mark("b")
	timeline.Finish("c", "started")
}

func TestFinishWithNoMarksStillWritesTheStep(t *testing.T) {
	c, written := newClock(), []string{}
	timeline := New(func() bool { return true }, c.now, lines(&written))
	timeline.Finish("recording", "refused")
	if len(written) != 1 || !strings.Contains(written[0], "total_ms=0 recording=0") {
		t.Fatalf("line = %q", written)
	}
}

func TestAContextCarriesTheTimeline(t *testing.T) {
	timeline := New(func() bool { return true }, time.Now, func(string) error { return nil })
	if From(With(context.Background(), timeline)) != timeline {
		t.Fatal("From(With(ctx, timeline)) is not timeline")
	}
	if From(context.Background()) != nil {
		t.Fatal("a plain context carries a timeline")
	}
}

// Listening and the recording start together: a record start that answers first does not end the press before listening has answered.
func TestAPressWaitsForAnAwaitedStepBeforeItsLineIsWritten(t *testing.T) {
	c, written := newClock(), []string{}
	timeline := New(func() bool { return true }, c.now, lines(&written))
	timeline.Begin("assets_list")
	timeline.Mark("listen_call")
	timeline.Await("listen_answered")
	c.step(150 * time.Millisecond)
	timeline.Finish("answered", "started")
	if len(written) != 0 {
		t.Fatalf("wrote %q before listening answered", written)
	}
	c.step(time.Second)
	timeline.Mark("listening")
	timeline.Mark("listen_answered")
	if len(written) != 1 {
		t.Fatalf("lines = %q, want one once listening answered", written)
	}
	want := "outcome=started total_ms=1150 assets_list=0 listen_call=0 answered=150 listening=1150 listen_answered=1150\n"
	if !strings.HasSuffix(written[0], want) {
		t.Fatalf("line = %q, want it to end %q", written[0], want)
	}
	timeline.Mark("listen_answered")
	if len(written) != 1 {
		t.Fatalf("a step after the press ended wrote %q", written)
	}
}

// A press that starts with the Start from here lookup keeps it on its line: the model check continues it when it follows the lookup's answer,
// and the project check between the model check and the start tone is stamped.
func TestAPressContinuesItsLookupAndStampsTheProjectCheckBeforeTheTone(t *testing.T) {
	c, written := newClock(), []string{}
	timeline := New(func() bool { return true }, c.now, lines(&written))
	timeline.Begin("punch_lookup")
	c.step(300 * time.Millisecond)
	timeline.Mark("punch_looked_up")
	c.step(time.Millisecond)
	timeline.Join("assets_list", "punch_looked_up")
	c.step(20 * time.Millisecond)
	timeline.Note("bootstrap_call")
	c.step(4 * time.Second)
	timeline.Note("bootstrapped")
	timeline.Finish("recording", "started")
	want := "punch_lookup=0 punch_looked_up=300 assets_list=301 bootstrap_call=321 bootstrapped=4321 recording=4321"
	if len(written) != 1 || !strings.Contains(written[0], want) {
		t.Fatalf("line = %q, want it to hold %q", written, want)
	}
}

// The page asks for the model check and the project check all the time, and a press that never finishes leaves its steps behind. None of that
// may chain to the next press: a real press 90 ms long was logged as 10 s when idle calls every few seconds kept the last one alive (#3221).
func TestIdleCallsEverySecondsNeverChainIntoTheNextPress(t *testing.T) {
	c, written := newClock(), []string{}
	timeline := New(func() bool { return true }, c.now, lines(&written))
	timeline.Join("assets_list", "punch_looked_up") // the Booth opens
	timeline.Mark("assets_listed")
	for i := 0; i < 10; i++ { // the page's project check every 3 s for 30 s
		c.step(3 * time.Second)
		timeline.Note("bootstrap_call")
		timeline.Note("bootstrapped")
	}
	c.step(3 * time.Second)
	timeline.Join("assets_list", "punch_looked_up") // the narrator presses Record
	c.step(5 * time.Millisecond)
	timeline.Mark("assets_listed")
	c.step(40 * time.Millisecond)
	timeline.Mark("record_call")
	c.step(60 * time.Millisecond)
	timeline.Finish("recording", "started")
	if len(written) != 1 || !strings.Contains(written[0], "total_ms=105 ") || strings.Count(written[0], "bootstrap_call") != 0 {
		t.Fatalf("line = %q, want a press of 105 ms from its own model check, with none of the idle calls", written)
	}
}

// A model check that comes long after a lookup is not that lookup's press, and a project check long after a press's last step is nobody's.
func TestAStaleLookupIsNotJoinedAndAStaleNoteStampsNothing(t *testing.T) {
	c, written := newClock(), []string{}
	timeline := New(func() bool { return true }, c.now, lines(&written))
	timeline.Note("bootstrapped")
	if timeline.pending() != 0 {
		t.Fatalf("a Note with no press under way kept %d marks", timeline.pending())
	}
	timeline.Begin("punch_lookup")
	timeline.Mark("punch_looked_up")
	c.step(joinGap + time.Second)
	timeline.Join("assets_list", "punch_looked_up")
	if timeline.pending() != 1 {
		t.Fatalf("a model check %v after the lookup joined it: %d marks", joinGap+time.Second, timeline.pending())
	}
	c.step(leadGap + time.Second)
	timeline.Note("bootstrapped")
	if timeline.pending() != 1 {
		t.Fatalf("a Note long after the press's last step was stamped: %d marks", timeline.pending())
	}
}
