package bridge

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"desktop/internal/persist"
)

// SlowLinkEnv names the environment variable a development run sets to slow its DAW link (ParseSlowLink's grammar).
const SlowLinkEnv = "NARRATION_DAW_LATENCY"

// SlowLink describes a slow DAW link to reproduce on demand (#3752): how long a command sent to the DAW is held before the DAW can read
// it. To the host a held command looks like one REAPER read at once and is slow to answer, so a wait that ends finds nothing to take
// back, as with a real REAPER at work. The zero value holds nothing. The UI mock reads the same grammar
// (src/studio/ui/src/api/dawLatency.ts).
type SlowLink struct {
	// Delay holds every matching command this long; Jitter adds up to this much more, different for each command.
	Delay, Jitter time.Duration
	// StallFor is a stretch in which nothing reaches the DAW and nothing is heard from it (a frozen REAPER writes no heartbeat either),
	// starting when the profile is set and again every StallEvery (once when StallEvery is 0). Commands sent in it are released together,
	// in order, when it ends, and the events of the stretch are delivered then.
	StallFor, StallEvery time.Duration
	// Drop is how many of the first matching commands never reach the DAW, so they are never answered.
	Drop int
	// Only limits Delay, Jitter and Drop to these command names; empty means every command. A stall holds every command.
	Only []string
}

// ParseSlowLink reads a profile: comma-separated `delay=1s`, `jitter=200ms`, `stall=8s` or `stall=8s/30s` (stalled for 8 s, every 30 s),
// `drop=1` and `only=tracks_read+arm_lane`. A bare duration (`300ms`, `10s`) is `delay=`, and `stall-recover` is `stall=8s`. Empty text
// and `0ms` are the zero profile.
func ParseSlowLink(text string) (SlowLink, error) {
	var link SlowLink
	for _, part := range strings.Split(text, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if part == "stall-recover" {
			part = "stall=8s"
		}
		key, value, found := strings.Cut(part, "=")
		if !found {
			key, value = "delay", part
		}
		var err error
		switch key {
		case "delay":
			link.Delay, err = slowDuration(value)
		case "jitter":
			link.Jitter, err = slowDuration(value)
		case "stall":
			stalled, every, periodic := strings.Cut(value, "/")
			if link.StallFor, err = slowDuration(stalled); err == nil && periodic {
				link.StallEvery, err = slowDuration(every)
			}
			if err == nil && periodic && link.StallEvery <= link.StallFor {
				err = fmt.Errorf("a stall must be shorter than its period")
			}
		case "drop":
			link.Drop, err = strconv.Atoi(value)
			if err == nil && link.Drop < 0 {
				err = fmt.Errorf("drop cannot be negative")
			}
		case "only":
			link.Only = strings.Split(value, "+")
			if slices.Contains(link.Only, "") {
				err = fmt.Errorf("a command name is missing")
			}
		default:
			err = fmt.Errorf("unknown key")
		}
		if err != nil {
			return SlowLink{}, fmt.Errorf("slow link profile %q: %q: %w", text, part, err)
		}
	}
	return link, nil
}

func slowDuration(value string) (time.Duration, error) {
	duration, err := time.ParseDuration(value)
	if err == nil && duration < 0 {
		err = fmt.Errorf("a duration cannot be negative")
	}
	return duration, err
}

// Slows reports whether the profile holds or drops anything.
func (l SlowLink) Slows() bool {
	return l.Delay > 0 || l.Jitter > 0 || l.StallFor > 0 || l.Drop > 0
}

func (l SlowLink) matches(action string) bool {
	if len(l.Only) == 0 {
		return true
	}
	return slices.Contains(l.Only, action)
}

// heldCommand is a command file written but not yet moved to where the DAW reads it.
type heldCommand struct {
	temporary, target string
	at                time.Time
}

// slowState is a Client's slow link: the profile and the commands it is holding, oldest first. It is guarded by Client.mu.
type slowState struct {
	link    SlowLink
	started time.Time
	dropped int
	// last is the latest release time handed out: no command is released before one sent ahead of it, so a slow link never reorders.
	last time.Time
	held []heldCommand
	// closed is set by DropHeld: nothing more is held or released.
	closed bool
}

// SetSlowLink makes this client's link slow from now on (a stall starts now); the zero SlowLink holds nothing new. Commands already held
// keep their release times, and a command sent behind them waits for them. It is for tests and development runs (SlowLinkEnv), never set
// in normal use.
func (c *Client) SetSlowLink(link SlowLink) {
	c.mu.Lock()
	defer c.mu.Unlock()
	held := c.slow.held
	c.slow = slowState{link: link, started: time.Now(), last: c.slow.last, held: held, closed: c.slow.closed}
}

// stalled reports whether the link is inside a stall at now.
func (c *Client) stalled(now time.Time) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	link := c.slow.link
	if link.StallFor <= 0 {
		return false
	}
	since := now.Sub(c.slow.started)
	if link.StallEvery > 0 {
		since %= link.StallEvery
	}
	return since < link.StallFor
}

// plan answers when the command numbered counter may reach the DAW, and whether it is one the profile drops.
// +checklocks:c.mu
func (c *Client) plan(action string, counter uint64, now time.Time) (release time.Time, drop bool) {
	slow := &c.slow
	release = now
	if slow.link.matches(action) {
		if slow.dropped < slow.link.Drop {
			slow.dropped++
			return now, true
		}
		release = release.Add(slow.link.Delay)
		if slow.link.Jitter > 0 {
			// Knuth's multiplicative hash of the command's number: spread across the jitter, the same on every run, no random source.
			release = release.Add(slow.link.Jitter * time.Duration(counter*2654435761%1000) / 1000)
		}
	}
	if slow.link.StallFor > 0 {
		since := release.Sub(slow.started)
		if slow.link.StallEvery > 0 {
			since %= slow.link.StallEvery
		}
		if since < slow.link.StallFor {
			release = release.Add(slow.link.StallFor - since)
		}
	}
	if release.Before(slow.last) {
		release = slow.last
	}
	slow.last = release
	return release, false
}

// hold keeps a written command file out of the commands folder until release, then moves it in after every command sent before it. The
// file waits under a name of this client's own, so a later client on the same folder (which numbers its files from 0 again) cannot
// overwrite it.
// +checklocks:c.mu
func (c *Client) hold(temporary, target string, release time.Time) error {
	held := fmt.Sprintf("%s.%p.held", target, c)
	if err := persist.Rename(temporary, held); err != nil {
		return err
	}
	c.slow.held = append(c.slow.held, heldCommand{temporary: held, target: target, at: release})
	time.AfterFunc(time.Until(release), c.releaseDue)
	return nil
}

// releaseDue moves every held command whose time has come into the commands folder, oldest first.
func (c *Client) releaseDue() {
	c.mu.Lock()
	var failed error
	now := time.Now()
	for !c.slow.closed && len(c.slow.held) > 0 && !c.slow.held[0].at.After(now) {
		next := c.slow.held[0]
		c.slow.held = c.slow.held[1:]
		if err := persist.Rename(next.temporary, next.target); err != nil {
			_ = os.Remove(next.temporary)
			// A session folder that is gone (the app closed, a test ended) has nobody to tell and nothing to run.
			if _, statErr := os.Stat(filepath.Dir(next.target)); statErr == nil {
				failed = err
			}
		}
	}
	c.mu.Unlock()
	if failed != nil {
		c.report("bridge.slow_link", "a held command could not be released and was dropped: "+failed.Error())
	}
}

// DropHeld ends this client's slow link: the commands it still holds are removed and never reach the DAW, and nothing more is held. The
// host calls it on a client it replaces, whose held commands would otherwise land among the new client's (both number their files from 0).
func (c *Client) DropHeld() {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, held := range c.slow.held {
		_ = os.Remove(held.temporary)
	}
	c.slow = slowState{closed: true}
}
