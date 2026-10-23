package daw

import (
	"testing"

	"desktop/internal/bridge"
)

func transportEvent(fields ...string) bridge.Event {
	return bridge.Event{Tag: "TRANSPORT", Fields: append([]string{"TRANSPORT", ""}, fields...)}
}

func TestAPositionFeedReadsThePlayStateTheHeadAndTheCursor(t *testing.T) {
	var got []Position
	feed := NewPositionFeed()
	feed.OnPosition(func(p Position) { got = append(got, p) })
	feed.Record(transportEvent("1", "12.5", "9"))
	feed.Record(transportEvent("0", "12.5", "9"))
	feed.Record(transportEvent("5", "30", "9"))
	want := []Position{
		{Playing: true, PlayPosition: 12.5, EditCursor: 9},
		{PlayPosition: 12.5, EditCursor: 9},
		{Playing: true, Recording: true, PlayPosition: 30, EditCursor: 9},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d positions, want %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("position %d = %+v, want %+v", i, got[i], want[i])
		}
	}
}

func TestAPausedTransportIsNotPlaying(t *testing.T) {
	var got Position
	feed := NewPositionFeed()
	feed.OnPosition(func(p Position) { got = p })
	feed.Record(transportEvent("2", "4", "4"))
	if got.Playing || got.Recording {
		t.Fatalf("paused read as %+v", got)
	}
}

func TestAPositionFeedKeepsTheLatestAndWhenItCame(t *testing.T) {
	feed := NewPositionFeed()
	if _, _, ok := feed.Latest(); ok {
		t.Fatal("Latest before any event must say there is none")
	}
	feed.Record(transportEvent("1", "2", "3"))
	position, age, ok := feed.Latest()
	if !ok || position.PlayPosition != 2 || age < 0 {
		t.Fatalf("Latest = %+v, %v, %v", position, age, ok)
	}
}

func TestAPositionFeedIgnoresAShortOrUnreadableEvent(t *testing.T) {
	calls := 0
	feed := NewPositionFeed()
	feed.OnPosition(func(Position) { calls++ })
	feed.Record(bridge.Event{Tag: "TRANSPORT", Fields: []string{"TRANSPORT", ""}})
	feed.Record(transportEvent("1", "soon", "3"))
	feed.Record(transportEvent("x", "1", "3"))
	if calls != 0 {
		t.Fatalf("handler ran %d times for events that are not positions", calls)
	}
}

func TestAPositionFeedTellsOnlyTheLatestHandler(t *testing.T) {
	feed := NewPositionFeed()
	first, second := 0, 0
	feed.OnPosition(func(Position) { first++ })
	feed.OnPosition(func(Position) { second++ })
	feed.Record(transportEvent("1", "2", "3"))
	feed.OnPosition(nil)
	feed.Record(transportEvent("1", "2", "3"))
	if first != 0 || second != 1 {
		t.Fatalf("first=%d second=%d, want 0 and 1", first, second)
	}
}
