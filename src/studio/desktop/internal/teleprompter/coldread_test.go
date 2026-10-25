package teleprompter

import (
	"os"
	"strings"
	"testing"
)

// A cold read (#2251 item 13) listens and follows the narrator without a take: nothing it hears may become the chapter's
// last reading, it never ends itself, and the state says which kind of session it is.

func coldReadOptions() map[string]string {
	options := validOptions()
	options["coldRead"] = "true"
	return options
}

func coldRead(s *Service) bool {
	value, _ := s.Snapshot()["coldRead"].(bool)
	return value
}

func TestAColdReadWritesNoReadingWhenItStops(t *testing.T) {
	f := newReadingFixture(t, "stream")
	if err := f.service.Start(coldReadOptions()); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the position event", func() bool { return f.recorder.firstEvent("position") != nil })
	f.service.Stop()
	waitFor(t, "the stopped phase", func() bool { return phase(f.service) == "stopped" })
	if entries, _ := os.ReadDir(ReadingDir(f.project)); len(entries) != 0 {
		t.Fatalf("a cold read wrote %v", entries)
	}
}

func TestAColdReadAtTheEndOfTheChapterKeepsListening(t *testing.T) {
	f, clock := newAutoStopFixture(t, "done")
	if err := f.service.Start(coldReadOptions()); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the done position", func() bool {
		f.recorder.mu.Lock()
		defer f.recorder.mu.Unlock()
		for _, event := range f.recorder.events {
			if event["status"] == "done" {
				return true
			}
		}
		return false
	})
	if pending := clock.pending(); len(pending) != 0 {
		t.Fatalf("a cold read armed %d auto-stop timer(s)", len(pending))
	}
	if strings.Contains(message(f.service), "end of the chapter") {
		t.Fatalf("message = %q, want no stopping notice", message(f.service))
	}
	f.service.Stop()
	waitFor(t, "the stopped phase", func() bool { return phase(f.service) == "stopped" })
}

func TestTheStateSaysASessionIsAColdReadUntilTheNextStarts(t *testing.T) {
	f := newFixture(t, "stream")
	if coldRead(f.service) {
		t.Fatal("an idle service says cold read")
	}
	if err := f.service.Start(coldReadOptions()); err != nil {
		t.Fatal(err)
	}
	if !coldRead(f.service) {
		t.Fatal("a running cold read does not say so")
	}
	f.service.Stop()
	waitFor(t, "the stopped phase", func() bool { return phase(f.service) == "stopped" })
	if !coldRead(f.service) {
		t.Fatal("a stopped cold read stops saying so: its flags would read as a take's")
	}
	if err := f.service.Start(validOptions()); err != nil {
		t.Fatal(err)
	}
	if coldRead(f.service) {
		t.Fatal("a session for a take says cold read")
	}
	f.service.Stop()
	waitFor(t, "the stopped phase", func() bool { return phase(f.service) == "stopped" })
}

func TestAColdReadLaunchesTheSameSidecar(t *testing.T) {
	f := newFixture(t, "args")
	if err := f.service.Start(coldReadOptions()); err != nil {
		t.Fatal(err)
	}
	for _, arg := range echoedArgs(t, f) {
		if strings.HasPrefix(arg, "--cold") || arg == "true" {
			t.Fatalf("the sidecar was told about the cold read: %q", arg)
		}
	}
}

func TestAColdReadGivesThePunchPollNoWordToAnchor(t *testing.T) {
	f := newFixture(t, "stream")
	if err := f.service.Start(coldReadOptions()); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the position event", func() bool { return f.recorder.firstEvent("position") != nil })
	if chapter, word, ok := f.service.CurrentWord(); ok {
		t.Fatalf("CurrentWord = %q, %d, true during a cold read: the ghost's word would be anchored to the DAW's play position", chapter, word)
	}
}
