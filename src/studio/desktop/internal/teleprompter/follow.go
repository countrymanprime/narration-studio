package teleprompter

import (
	"encoding/json"
	"strconv"
	"sync"

	"desktop/internal/compare"
	"desktop/internal/scripttrack"
)

// clockEventType is the line a `--clock` sidecar prints before its first chunk, as each chunk arrives, and (with
// "event": true) just before each engine event: the stream time the script tracker reads at that moment (wall time less
// pauses for a microphone, audio consumed for a file). The host consumes it and never relays it.
const clockEventType = "clock"

// follower follows the read in the host, as the sidecar did before `--clock` (docs/research/sidecar-go-vs-python.md,
// step 2): the Booth's script tracker runs on the engine events the host relays, at the sidecar's own clock, and its
// position and flag events go out right after the engine event that caused them, in the order the sidecar printed them.
type follower struct {
	mu sync.Mutex
	// +checklocks:mu
	tracker *scripttrack.FlaggingTracker
	// +checklocks:mu
	startWord *int
	// +checklocks:mu
	started bool
	// now is the newest clock line's time: an engine event's own, the one the sidecar's tracker read for it.
	// +checklocks:mu
	now float64
	// script is the `script` event, sent once (takeScript) before anything else the session sends.
	// +checklocks:mu
	script json.RawMessage
	// seeks are the words Seek asked for since the last chunk, applied at the next one as the sidecar read its control file.
	// +checklocks:mu
	seeks []int
}

func newFollower(script scripttrack.ChapterScript, startWord *int) *follower {
	return &follower{
		tracker: scripttrack.NewFlagging(script.Tokens, script.Heading), startWord: startWord,
		script: compactLine(scripttrack.ScriptEvent(script)),
	}
}

// takeScript is the `script` event the first time it is asked for, then nil.
func (f *follower) takeScript() json.RawMessage {
	f.mu.Lock()
	defer f.mu.Unlock()
	script := f.script
	f.script = nil
	return script
}

// eventClock is a clock line printed just before an engine event: the time that event is followed at.
func (f *follower) eventClock(t float64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.now = t
}

// seek moves the tracker to a script word at the next chunk.
func (f *follower) seek(word int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seeks = append(f.seeks, word)
}

// clock handles a clock line: the first is the session's start, where a start word places the tracker; each later one is
// a chunk, where the seeks asked for since are applied and the tracker's clock moves on.
func (f *follower) clock(t float64) []json.RawMessage {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.now = t
	lines := []json.RawMessage{}
	if !f.started {
		f.started = true
		if f.startWord != nil {
			lines = appendPositions(lines, f.tracker.ResetTo(*f.startWord, t))
		}
		return lines
	}
	for _, word := range f.seeks {
		lines = appendPositions(lines, f.tracker.ResetTo(word, t))
	}
	f.seeks = nil
	return appendPositions(lines, f.tracker.Tick(t))
}

// event handles an engine event the sidecar printed: the positions it moved the tracker to, then the flags of a segment
// it closed. A line the tracker cannot read is not followed.
func (f *follower) event(raw json.RawMessage) []json.RawMessage {
	event, err := scripttrack.ParseEvent(raw)
	if err != nil {
		return nil
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	positions, flags := f.tracker.Feed(event, f.now)
	lines := appendPositions(nil, positions)
	for _, flag := range flags {
		lines = append(lines, compactLine(compare.PyOrdered{
			{Key: "type", Value: "flag"}, {Key: "id", Value: flag.ID}, {Key: "kind", Value: flag.Kind},
			{Key: "start", Value: flag.Start}, {Key: "end", Value: flag.End}, {Key: "heard", Value: flag.Heard},
		}))
	}
	return lines
}

// appendPositions writes position events as the sidecar printed them.
func appendPositions(lines []json.RawMessage, positions []scripttrack.Position) []json.RawMessage {
	for _, p := range positions {
		var jump, skipped any
		if p.Jump != "" {
			jump = p.Jump
		}
		if p.Skipped != nil {
			skipped = []any{p.Skipped.From, p.Skipped.To}
		}
		lines = append(lines, compactLine(compare.PyOrdered{
			{Key: "type", Value: positionEventType}, {Key: "read", Value: p.Read}, {Key: "committed", Value: p.Committed},
			{Key: "status", Value: p.Status}, {Key: "jump", Value: jump}, {Key: "skipped", Value: skipped},
		}))
	}
	return lines
}

func compactLine(v any) json.RawMessage { return json.RawMessage(compare.DumpPy(v, false)) }

// followed is the script and start word the host follows the planned session with, or false when the sidecar is to
// follow it itself, as before: when the host cannot build the script the sidecar builds (a manuscript or credits file
// it cannot read the same way) or read the start word as the sidecar's int() does. The sidecar then reports any problem
// in its own words. A Script session's file must be written first.
func (plan launch) followed() (scripttrack.ChapterScript, *int, bool) {
	var startWord *int
	if plan.startWord != "" {
		word, err := strconv.Atoi(plan.startWord)
		if err != nil {
			return scripttrack.ChapterScript{}, nil, false
		}
		startWord = &word
	}
	var script scripttrack.ChapterScript
	var err error
	if plan.scriptFile != "" {
		script, err = scripttrack.LoadTextScript(plan.scriptFile, plan.chapter, plan.scriptTitle)
	} else {
		script, err = scripttrack.LoadChapterScript(plan.manuscript, plan.chapter)
	}
	return script, startWord, err == nil
}

// startFollowing makes the host follow the session about to start. Its `script` event, which the sidecar printed as it
// started, goes out once the session runs (sendScript), or before the sidecar's first line if that comes sooner.
func (s *Service) startFollowing(script scripttrack.ChapterScript, startWord *int) {
	follow := newFollower(script, startWord)
	s.mu.Lock()
	s.follow = follow
	s.mu.Unlock()
}

// sendScript sends the followed session's `script` event if it has not gone out yet.
func (s *Service) sendScript(follow *follower) {
	if script := follow.takeScript(); script != nil {
		s.relay("script", script)
	}
}
