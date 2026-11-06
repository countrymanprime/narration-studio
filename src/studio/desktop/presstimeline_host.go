package main

import (
	"os"
	"path/filepath"
	"time"

	"desktop/internal/dawport"
	"desktop/internal/presstimeline"
)

// recordTimelineFile is where the record-press timeline is appended, in the bridge session folder beside the bridge's own
// bridge-timing.log (docs/research/record-press-timeline.md), so the narrator sends one folder.
const recordTimelineFile = "record-timeline.log"

// newPressTimeline is the Host's record-press timeline: on while REAPER's heartbeat says the bridge timing diagnostic is
// switched on, writing to the open project's bridge session folder. It reads both when a step is stamped, never at
// construction (hostguard_test.go).
func newPressTimeline(h *Host) *presstimeline.Timeline {
	return presstimeline.New(
		func() bool { return timingSwitchedOn(h.services().reachability) },
		time.Now,
		func(line string) error { return appendTimelineLine(h.services().config.sessionDir, line) },
	)
}

// timingSwitchedOn is whether heartbeat, when it can tell, says the timing diagnostic is on. Only REAPER's heartbeat can.
func timingSwitchedOn(heartbeat dawport.Heartbeat) bool {
	switched, ok := heartbeat.(interface{ TimingOn() bool })
	return ok && switched.TimingOn()
}

// appendTimelineLine appends line to dir's record-timeline.log, readable by this user only; no folder, no file.
func appendTimelineLine(dir, line string) error {
	if dir == "" {
		return nil
	}
	file, err := os.OpenFile(filepath.Join(dir, recordTimelineFile), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, err = file.WriteString(line)
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	return err
}
