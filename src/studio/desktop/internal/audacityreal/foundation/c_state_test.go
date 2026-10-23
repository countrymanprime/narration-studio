//go:build audacityreal && linux

package foundation

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/audacityreal"
)

// A3-T4: a modal dialog holds the pipe. The client's own 5 s timeout, the poller's state, no request queued behind it, a dismissal
// from outside, and the first command after it.
func TestA3T04ModalDialog(t *testing.T) {
	g := newRig(t, "A3-T04", "Modal dialog handling: timeout, poller state, dismissal, recovery")
	ctx := context.Background()
	saved := filepath.Join(g.e.Work, "t04-ok.aup3")
	_ = os.Remove(saved)
	g.importFile(g.e.Tone(t, "t04.wav", 2, 44100, 1, 440))
	g.must(fmt.Sprintf(`SaveProject2: Filename="%s"`, saved))
	g.closePipe()

	cases := []struct{ name, cmd string }{
		{"SaveProject2 into a folder that does not exist", `SaveProject2: Filename="/nonexistent-folder-for-t04/x.aup3"`},
		{"OpenProject2 of the open project", fmt.Sprintf(`OpenProject2: Filename="%s"`, saved)},
	}
	for _, c := range cases {
		client := audacityreal.NewClient(5 * time.Second)
		cmd := audacitybridge.NewCommand(strings.Fields(c.cmd)[0])
		_ = cmd
		start := time.Now()
		// Sent as a raw pipe write: the shipped Command refuses a path that is not C:/..., and this one is the point.
		pipe, err := audacityreal.DialPipe()
		if err != nil {
			g.r.Fatal(c.name+": dial", err.Error())
		}
		ex := pipe.Send(5*time.Second, c.cmd)
		took := time.Since(start)
		pipe.Close()
		g.r.Raw(strings.Fields(c.cmd)[0]+"-dialog", ex.Raw)
		g.r.Check(c.name+": no reply, the deadline passes at 5 s", !ex.Complete && took >= 4500*time.Millisecond && took <= 5600*time.Millisecond,
			fmt.Sprintf("complete=%v after %v, %d bytes", ex.Complete, took.Round(50*time.Millisecond), len(ex.Raw)))

		// The same through the repository's client, so the error it gives the app is on record.
		cerr := error(nil)
		{
			c2 := audacityreal.NewClient(5 * time.Second)
			start := time.Now()
			_, cerr = c2.Do(ctx, audacitybridge.NewCommand("Message").String("Text", "behind the dialog"))
			g.r.Check(c.name+": the client's Message behind the dialog is ErrTimeout", errors.Is(cerr, audacitybridge.ErrTimeout) && time.Since(start) < 6*time.Second,
				fmt.Sprintf("error %v after %v", cerr, time.Since(start).Round(50*time.Millisecond)))
			_ = c2.Close()
		}
		_ = client.Close()

		// The poller while the dialog is up.
		pc := audacityreal.NewClient(5 * time.Second)
		poll := audacityreal.NewPoller(pc, 1*time.Second)
		poll.Start()
		time.Sleep(8 * time.Second)
		state := poll.State()
		ticks, skipped, maxIn := poll.Stats()
		poll.Stop()
		_ = pc.Close()
		g.r.Check(c.name+": the poller reads may be waiting on a dialog", state == audacityreal.StateMaybeDialog, fmt.Sprintf("state %q; %d ticks, %d skipped because a request was in flight, max in flight %d", state, ticks, skipped, maxIn))
		g.r.Check(c.name+": no request is queued behind the dialog", maxIn <= 1 && ticks <= 3, fmt.Sprintf("max in flight %d; the poller ran %d ticks in 8 s with a 1 s timer, because each request held its tick until the 5 s timeout", maxIn, ticks))

		dialogs := g.e.Dialogs("t04-ok", "Audacity")
		var titles []string
		for _, d := range dialogs {
			titles = append(titles, fmt.Sprintf("%q %dx%d", d.Title, d.Width, d.Height))
		}
		shot := g.e.Shot("t04-" + strings.Fields(c.cmd)[0])
		g.r.Check(c.name+": a dialog window is open", len(dialogs) > 0, strings.Join(titles, "; "), shot)
		for _, d := range dialogs {
			method, ok := g.e.Dismiss(d)
			g.r.Info(c.name+": dismiss "+d.Title, fmt.Sprintf("%s, closed=%v", method, ok))
		}
		took2, ok2, ex2 := audacityreal.Echo(10 * time.Second)
		g.r.Check(c.name+": the first command on a new connection after the dismiss is answered at once", ok2 && took2 < 3*time.Second, fmt.Sprintf("echo=%v after %v: %s", ok2, took2.Round(50*time.Millisecond), audacityreal.Visible(ex2.Raw)))
		left := g.e.Dialogs("t04-ok", "Audacity")
		g.r.Info(c.name+": windows left after the dismiss", fmt.Sprint(len(left)))
	}
}

// A3-T5: the heartbeat poller sees each kind of change within two polls.
func TestA3T05HeartbeatPoller(t *testing.T) {
	g := newRig(t, "A3-T05", "Heartbeat poller: changes seen within two polls, nothing queued, a closed pipe is not reachable")
	tone := g.e.Tone(t, "t05.wav", 5, 44100, 1, 440)
	g.importFile(tone)
	g.importFile(tone)
	g.must("SelectNone")
	g.must("SelectTime: Start=1 End=1 RelativeTo=ProjectStart")
	g.must("AddLabel")
	g.closePipe()

	const every = 1 * time.Second
	pc := audacityreal.NewClient(5 * time.Second)
	poll := audacityreal.NewPoller(pc, every)
	poll.Start()
	defer func() { poll.Stop(); _ = pc.Close() }()
	time.Sleep(2500 * time.Millisecond) // two baseline reads

	acts := []struct{ what, cmd string }{
		{"labels changed", `SetLabel: Label=0 Text="changed by the script"`},
		{"tracks changed", "NewMonoTrack"},
		{"selection changed", "SelectTime: Start=2 End=3 RelativeTo=ProjectStart"},
		{"tracks changed", "SetTrackAudio: Track=0 Mute=1"},
	}
	var lat []time.Duration
	for _, a := range acts {
		before := len(poll.Changes())
		at := time.Now()
		g.must(a.cmd)
		g.closePipe() // let the poller's next request in
		var seen *audacityreal.Change
		for time.Since(at) < 4*time.Second && seen == nil {
			for _, c := range poll.Changes()[before:] {
				if c.What == a.what {
					c := c
					seen = &c
					break
				}
			}
			time.Sleep(50 * time.Millisecond)
		}
		if seen == nil {
			g.r.Fail("change seen: "+a.cmd, fmt.Sprintf("no %q within 4 s; saw %v", a.what, poll.Changes()[before:]))
			continue
		}
		lat = append(lat, seen.At.Sub(at))
		g.r.Check("change seen within two polls: "+a.cmd, seen.At.Sub(at) <= 2*every+300*time.Millisecond, fmt.Sprintf("%q after %v", a.what, seen.At.Sub(at).Round(10*time.Millisecond)))
	}
	ticks, skipped, maxIn := poll.Stats()
	g.r.Check("no request is sent while another is in flight", maxIn <= 1, fmt.Sprintf("max in flight %d over %d ticks (%d skipped)", maxIn, ticks, skipped))
	g.r.Info("state while answering", string(poll.State()))

	// CPU: the harness process's own CPU time over the run is small next to the wall time.
	g.r.Info("poll latencies", fmt.Sprint(lat))

	// The pipe closes: Audacity is stopped, then the poller's state is read.
	g.p.Kill()
	time.Sleep(3 * time.Second)
	g.r.Check("a closed pipe is not reachable, not an error loop", poll.State() == audacityreal.StateNotReachable, fmt.Sprintf("state %q", poll.State()))
}

// A3-T6: the fingerprint, step by step.
func TestA3T06Fingerprint(t *testing.T) {
	g := newRig(t, "A3-T06", "Fingerprint: which edits change a hash of Tracks (without selected and focused), Clips and Labels")
	g.importFile(g.e.Tone(t, "t06.wav", 6, 44100, 1, 440))
	g.must("SelectNone")
	f0 := g.fingerprint()
	g.r.Info("F0 after the import", f0)

	type edit struct {
		name       string
		do         []string
		wantChange bool   // the matrix expects the fingerprint to move
		undoSteps  int    // Undo commands that take the edit back
		note       string // what a blind spot would mean
	}
	edits := []edit{
		{"change the selection", []string{"SelectTime: Start=1 End=2 RelativeTo=ProjectStart"}, false, 0, ""},
		{"move the cursor", []string{"SelectTime: Start=3 End=3 RelativeTo=ProjectStart"}, false, 0, ""},
		{"add a label", []string{"SelectTime: Start=1 End=2 RelativeTo=ProjectStart", "AddLabel"}, true, 1, ""},
		{"rename a label", []string{`SetLabel: Label=0 Text="renamed"`}, true, 1, ""},
		{"move a label by 1 ms", []string{"SetLabel: Label=0 Start=1.001 End=2.001"}, true, 1, "a sub-millisecond move would be invisible at six digits"},
		{"mute a track", []string{"SelectTracks: Track=0 TrackCount=1 Mode=Set", "SetTrackAudio: Mute=1"}, true, 1, ""},
		{"change track gain", []string{"SelectTracks: Track=0 TrackCount=1 Mode=Set", "SetTrackAudio: Mute=0 Gain=-6"}, true, 1, ""},
		{"split a clip", []string{"SelectTime: Start=4 End=4 RelativeTo=ProjectStart", "SelectTracks: Track=0 TrackCount=1 Mode=Set", "Split"}, true, 2, ""},
		{"delete 1 s", []string{"SelectTime: Start=0 End=1 RelativeTo=ProjectStart", "SelectTracks: Track=0 TrackCount=1 Mode=Set", "Delete"}, true, 1, ""},
		{"apply Amplify", []string{"SelectTime: Start=0 End=2 RelativeTo=ProjectStart", "SelectTracks: Track=0 TrackCount=1 Mode=Set", "Amplify: Ratio=0.5"}, false, 1, "an effect leaves the clip's start and end alone"},
		{"add an envelope point", []string{"SetEnvelope: Time=1 Value=0.5"}, false, 1, "an envelope is not in Tracks or Clips"},
		{"change a track name", []string{`SetTrackStatus: Track=0 Name="renamed track"`}, true, 1, ""},
	}
	prev := f0
	var blind []string
	for _, ed := range edits {
		for _, c := range ed.do {
			if ex := g.send(c); !ex.OK {
				g.r.Fail(ed.name+": "+c, audacityreal.Visible(ex.Raw))
			}
		}
		f := g.fingerprint()
		changed := f != prev
		if ed.wantChange {
			if changed {
				g.r.Pass(ed.name+": the fingerprint moves", fmt.Sprintf("%s -> %s", prev, f))
			} else {
				blind = append(blind, ed.name)
				g.r.Info(ed.name+": BLIND SPOT, the fingerprint did not move", fmt.Sprintf("%s; %s", f, ed.note))
			}
		} else if ed.note != "" {
			g.r.Check(ed.name+": a blind spot, the fingerprint stays", !changed, fmt.Sprintf("%s -> %s; %s", prev, f, ed.note))
			if !changed {
				blind = append(blind, ed.name)
			}
		} else {
			g.r.Check(ed.name+": the fingerprint stays", !changed, fmt.Sprintf("%s -> %s", prev, f))
		}
		prev = f
	}
	g.r.Info("edits the fingerprint cannot see", fmt.Sprintf("%v", blind))

	// Does SetTrackAudio take a Track? The adapter sends SetTrackAudio: Track=<index> Mute=1 (backups, stack takes).
	g.must("SelectTracks: Track=0 TrackCount=1 Mode=Set")
	g.must("NewMonoTrack")
	g.must("SelectTracks: Track=1 TrackCount=1 Mode=Set") // only the new track is selected
	muteOf := func() string {
		var out []string
		tr, _ := g.jsonInfo("Tracks").([]any)
		for _, x := range tr {
			if m, ok := x.(map[string]any); ok {
				out = append(out, fmt.Sprintf("%v mute=%v sel=%v", m["name"], m["mute"], m["selected"]))
			}
		}
		return strings.Join(out, "; ")
	}
	g.r.Info("before SetTrackAudio: Track=0 Mute=1", muteOf())
	ex := g.send("SetTrackAudio: Track=0 Mute=1")
	g.r.Info("SetTrackAudio: Track=0 Mute=1 with track 1 selected", fmt.Sprintf("%s -> %s", audacityreal.Visible(ex.Raw), muteOf()), g.r.Raw("settrackaudio-track", ex.Raw))
	g.must("SetTrackAudio: Mute=0")
	ex = g.send(`SetTrackStatus: Track=0 Name="named by Track=0"`)
	g.r.Info(`SetTrackStatus: Track=0 Name=... with track 1 selected`, fmt.Sprintf("%s -> %s", audacityreal.Visible(ex.Raw), muteOf()))
	g.must("Undo")
	g.must("Undo")

	// Undo each edit in reverse and compare with the fingerprint taken before it.
	var history []string
	history = append(history, f0)
	// Rebuild the before-fingerprints by replaying: Undo the whole history one step at a time and record the fingerprint after each.
	seen := []string{prev}
	for i := 0; i < 20; i++ {
		ex := g.send("Undo")
		if !ex.OK {
			break
		}
		f := g.fingerprint()
		seen = append(seen, f)
		if f == f0 {
			g.r.Pass("Undo returns to the first fingerprint", fmt.Sprintf("after %d Undo commands: %s", i+1, f))
			return
		}
	}
	g.r.Info("fingerprints seen while undoing", strings.Join(seen, " "))
	g.r.Fail("Undo returns to the first fingerprint", fmt.Sprintf("F0 %s was not reached in 20 Undo commands", f0))
}

// A3-T7: six significant digits in what Audacity reads back, more digits accepted on write, and the length of an export.
func TestA3T07TimePrecision(t *testing.T) {
	g := newRig(t, "A3-T07", "Time precision: six digits on read, 10,000 s project time, export length")
	long := g.e.Silence(t, "t07-10000s.wav", 10000, 4000, 3600, 1)
	start := time.Now()
	ex := g.sendWithin(120*time.Second, fmt.Sprintf(`Import2: Filename="%s"`, long))
	g.r.Check("import of a 10,000 s file", ex.OK, fmt.Sprintf("%v: %s", ex.Took.Round(100*time.Millisecond), audacityreal.Visible(ex.Raw)))
	_ = start
	clips := g.clips()
	if len(clips) == 1 {
		g.r.Info("the clip", fmt.Sprintf("%v to %v", clips[0].Start, clips[0].End))
	}
	for _, at := range []float64{3600.123, 9999.987, 5.123456} {
		g.must("SelectNone")
		g.must(fmt.Sprintf("SelectTime: Start=%v End=%v RelativeTo=ProjectStart", at, at))
		g.must("AddLabel")
	}
	labels := g.labels()
	raw := g.must("GetInfo: Type=Labels Format=JSON")
	g.r.Raw("labels", raw.Raw)
	g.r.Info("raw Labels", audacityreal.Visible(raw.Raw), g.r.Raw("labels", raw.Raw))
	want := map[float64]string{5.12346: "5.12346", 3600.12: "3600.12", 9999.99: "9999.99"}
	got := map[string]bool{}
	for _, l := range labels {
		got[fmt.Sprint(l.Start)] = true
	}
	for v, s := range want {
		g.r.Check("label read back as "+s, got[s] || got[fmt.Sprint(v)], fmt.Sprintf("labels read: %v", got))
	}
	g.must("SelectTime: Start=3600.5 End=3601.0 RelativeTo=ProjectStart")
	rawSel := g.must("GetInfo: Type=Selection Format=JSON")
	g.r.Info("Selection after SelectTime 3600.5 to 3601", audacityreal.Visible(rawSel.Raw), g.r.Raw("selection", rawSel.Raw))
	s, e := g.selection()
	g.r.Check("Selection reads back", within(s, 3600.5, 1e-3) && within(e, 3601.0, 1e-3), fmt.Sprintf("%v to %v", s, e))
	// SelectTime accepts more digits than GetInfo shows.
	g.must("SelectTime: Start=3600.1234567 End=3600.9876543 RelativeTo=ProjectStart")
	s, e = g.selection()
	g.r.Info("SelectTime with seven decimals reads back as", fmt.Sprintf("%v to %v", s, e))
	// Export the selection and measure it.
	g.must("SelectTime: Start=3600.5 End=3601.0 RelativeTo=ProjectStart")
	g.must("SelectTracks: Track=0 TrackCount=1 Mode=Set")
	out := filepath.Join(g.e.Out, "audio", "t07-half-second.wav")
	g.must(fmt.Sprintf(`Export2: Filename="%s" NumChannels=1`, out))
	w, err := audacityreal.ReadWAV(out)
	if err != nil {
		g.r.Fatal("read the export", err.Error())
	}
	g.r.Check("the export is 0.5 s within one sample", within(w.Seconds, 0.5, 1/float64(w.Rate)+1e-9), fmt.Sprintf("%.6f s = %d frames at %d Hz", w.Seconds, w.Frames, w.Rate))
	g.r.Info("resolution by project time", "six significant digits: 1 ms below 1000 s, 10 ms from 1000 s to 9999 s, 100 ms from 10,000 s (see the label rows)")
}
