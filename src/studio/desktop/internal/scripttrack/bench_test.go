package scripttrack

import (
	"encoding/json"
	"testing"
)

// BenchmarkFeedOverTheRecordedSessions is the cost of one engine event on the live path: every feed of every
// session in tracker-sessions.jsonl, divided by their number.
func BenchmarkFeedOverTheRecordedSessions(b *testing.B) {
	type op struct {
		event Event
		now   float64
	}
	var sessions [][]op
	var tokens [][]string
	for _, line := range fixture(b, "tracker-sessions.jsonl") {
		var s sessionInput
		if err := json.Unmarshal([]byte(line), &s); err != nil {
			b.Fatal(err)
		}
		ops := []op{}
		for _, o := range s.Ops {
			if o.Op != "feed" {
				continue
			}
			event, _ := ParseEvent(o.Event)
			now, _ := ParseNum(o.Now)
			ops = append(ops, op{event, now.Value()})
		}
		sessions, tokens = append(sessions, ops), append(tokens, s.Tokens)
	}
	feeds := 0
	b.ResetTimer()
	for range b.N {
		for k, ops := range sessions {
			tracker := New(tokens[k])
			for _, o := range ops {
				tracker.Feed(o.event, o.now)
				feeds++
			}
		}
	}
	b.ReportMetric(float64(b.Elapsed().Microseconds())/float64(feeds), "µs/feed")
}
