//go:build audacityreal && linux

package foundation

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/audacityreal"
	"desktop/internal/dawport"
	"desktop/internal/dawport/audacity"
)

func target(at float64) dawport.Target { return dawport.Target{SourceStart: &at} }

// A3-T8: project identity by label, by save and reopen, by window title, and with two projects.
func TestA3T08ProjectIdentity(t *testing.T) {
	g := newRig(t, "A3-T08", "Project identity: a stamp label across save and reopen, the window title, two projects")
	a := filepath.Join(g.e.Work, "t08-a.aup3")
	b := filepath.Join(g.e.Work, "t08-b.aup3")
	_ = os.Remove(a)
	_ = os.Remove(b)
	g.importFile(g.e.Tone(t, "t08.wav", 4, 44100, 1, 440))
	g.must("SelectNone")
	g.must("SelectTime: Start=0 End=0 RelativeTo=ProjectStart")
	g.must("AddLabel")
	g.must(`SetTrackStatus: Name="Narration Studio"`) // acts on the selected track, which AddLabel made
	g.must(`SetLabel: Label=0 Text="[nu:project abc]"`)
	g.must(fmt.Sprintf(`SaveProject2: Filename="%s"`, a))
	time.Sleep(800 * time.Millisecond)
	titles := dialogTitles(g.e)
	g.r.Info("windows after SaveProject2 to t08-a.aup3", strings.Join(titles, "; "), g.e.Shot("t08-after-save"))
	titleA := false
	for _, w := range g.e.Windows() {
		if strings.Contains(w.Title, "t08-a") {
			titleA = true
		}
	}
	g.r.Check("the window title carries the project name after the save", titleA, strings.Join(titles, "; "))

	// A second file with a different stamp, from the same project.
	g.must(`SetLabel: Label=0 Text="[nu:project bbb]"`)
	g.must(fmt.Sprintf(`SaveProject2: Filename="%s"`, b))
	g.closePipe()
	ex := g.send("Close")
	g.r.Info("Close", fmt.Sprintf("complete=%v ok=%v: %s", ex.Complete, ex.OK, audacityreal.Visible(ex.Raw)))
	time.Sleep(3 * time.Second)
	g.r.Info("Audacity after Close of the last project", fmt.Sprintf("alive=%v; windows: %s (a crash report window means Close crashed it)", g.p.Alive(), strings.Join(dialogTitles(g.e), "; ")), g.e.Shot("t08-after-close"))
	_, up, ex2 := audacityreal.Echo(5 * time.Second)
	g.closePipe()
	g.r.Info("a Message after Close", fmt.Sprintf("echo=%v: %s", up, audacityreal.Visible(ex2.Raw)), g.r.Raw("message-after-close", ex2.Raw))
	g.closePipe()
	g.p.Kill()

	// Start Audacity on a.aup3 with the command line, on a fresh copy of the primed profile (the Close above ended in a crash, and
	// the same profile would ask about crash recovery first).
	p := g.e.Launch(t, "a3-t08-reopen", a)
	g.closePipe()
	var lab string
	for _, l := range g.labels() {
		lab += l.Text + " "
	}
	g.r.Check("the stamp label survived the save and the reopen", strings.Contains(lab, "[nu:project abc]"), "labels: "+lab)
	tr := g.tracks()
	var names []string
	for _, x := range tr {
		names = append(names, x.Name+"/"+x.Kind)
	}
	g.r.Info("tracks after reopen", strings.Join(names, ", "))
	g.r.Info("windows after the command-line open", strings.Join(dialogTitles(g.e), "; "), g.e.Shot("t08-reopen"))

	// A second Audacity process on b.aup3 while the first has a.aup3.
	cmd := exec.Command(filepath.Join(g.e.App, "AppRun"), b)
	cmd.Env = append(os.Environ(), "HOME="+p.Home, "DISPLAY="+g.e.Display, "XDG_CONFIG_HOME="+filepath.Join(p.Home, ".config"),
		"XDG_DATA_HOME="+filepath.Join(p.Home, ".local", "share"), "XDG_STATE_HOME="+filepath.Join(p.Home, ".local", "state"))
	_ = cmd.Start()
	t.Cleanup(func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
	})
	time.Sleep(12 * time.Second)
	g.r.Info("windows after a second Audacity process was started on b.aup3", strings.Join(dialogTitles(g.e), "; "), g.e.Shot("t08-second"))
	var second string
	for _, l := range g.labels() {
		second += l.Text + " "
	}
	g.r.Info("which project answers GetInfo Labels with two started", "labels: "+second)
	g.r.Info("the first process is still alive", fmt.Sprint(p.Alive()))
	out, _ := exec.Command("pgrep", "-c", "-x", "audacity").Output()
	g.r.Info("audacity processes running", strings.TrimSpace(string(out)))
}

// A3-T9: 300 markers through the adapter's AddMarker, then the read, the idempotent re-run and the hardest accepted text.
func TestA3T09LabelsAtScale(t *testing.T) {
	g := newRig(t, "A3-T09", "Labels at scale: 300 markers, read size and time, idempotent re-run, hard text round trip")
	ctx := context.Background()
	s := audacity.NewSession(g.client)
	const n = 300
	start := time.Now()
	added := 0
	for i := 0; i < n; i++ {
		res, err := s.AddMarker(ctx, target(float64(i)*3+1), dawport.Marker{Name: fmt.Sprintf("marker %03d", i)})
		if err != nil {
			g.r.Fatal(fmt.Sprintf("AddMarker %d", i), err.Error())
		}
		if res.Added {
			added++
		}
	}
	took := time.Since(start)
	g.r.Check("300 markers added", added == n, fmt.Sprintf("added %d in %v (%v each)", added, took.Round(time.Second), (took/n).Round(time.Millisecond)))
	rs := time.Now()
	ex := g.must("GetInfo: Type=Labels Format=JSON")
	g.r.Info("GetInfo Labels with 300 labels", fmt.Sprintf("%d bytes in %v (the client reads at most %d)", len(ex.Raw), time.Since(rs).Round(time.Millisecond), 4<<20))
	labels := g.labels()
	g.r.Check("all 300 are read back", len(labels) == n, fmt.Sprintf("%d labels", len(labels)))
	// The cost per label at the start and the end of the run, from timing one more add and one idempotent skip.
	t0 := time.Now()
	res, _ := s.AddMarker(ctx, target(1), dawport.Marker{Name: "marker 000"})
	g.r.Check("the idempotent run adds none", !res.Added, fmt.Sprintf("Added=%v; a skip costs %v with 300 labels", res.Added, time.Since(t0).Round(time.Millisecond)))
	rerun := 0
	for i := 0; i < n; i += 10 {
		res, err := s.AddMarker(ctx, target(float64(i)*3+1), dawport.Marker{Name: fmt.Sprintf("marker %03d", i)})
		if err != nil {
			g.r.Fatal("re-run", err.Error())
		}
		if res.Added {
			rerun++
		}
	}
	g.r.Check("re-running 30 of them adds none", rerun == 0, fmt.Sprintf("%d added", rerun))
	t1 := time.Now()
	_, _ = s.AddMarker(ctx, target(2000), dawport.Marker{Name: "after 300"})
	g.r.Info("one more add with 300 labels present", time.Since(t1).Round(time.Millisecond).String())

	// The hardest accepted text (verification pass A5).
	hard := "’ ‘ — “ ” ∖ é % & < > { } ' ="
	res, err := s.AddMarker(ctx, target(2100), dawport.Marker{Name: hard})
	if err != nil {
		g.r.Fail("AddMarker with the hard text", err.Error())
		return
	}
	var got string
	for _, l := range g.labels() {
		if strings.Contains(l.Text, "é") {
			got = l.Text
		}
	}
	g.r.Check("the hard text round trips unchanged", got == hard && res.Name == hard, fmt.Sprintf("sent %q, adapter %q, read back %q", hard, res.Name, got))
	// What the encoder refuses (a double quote and a backslash never reach Audacity): the label's own text cannot carry them.
	g.r.Info("text rules", "a double quote, a backslash and control characters are replaced by audacitybridge.SanitizeText before sending")
}

// A3-T10: the adapter's findings as pickup-like labels: open and reviewed states, counts, hand edits left alone.
func TestA3T10PickupsAsLabels(t *testing.T) {
	g := newRig(t, "A3-T10", "Pickups as labels: import, resolve, reopen, count, go to, a hand-edited label is read as it stands")
	ctx := context.Background()
	s := audacity.NewSession(g.client)
	g.importFile(g.e.Tone(t, "t10.wav", 40, 44100, 1, 440))
	var fs []audacity.Finding
	for i := 0; i < 5; i++ {
		fs = append(fs, audacity.Finding{ID: fmt.Sprintf("p%d", i+1), Start: float64(i)*6 + 2, End: float64(i)*6 + 3.5, Words: fmt.Sprintf("pickup %d", i+1)})
	}
	res, err := s.ImportFindings(ctx, fs)
	g.r.Check("5 open pickups imported", err == nil && len(res.Added) == 5, fmt.Sprintf("added %v, error %v", res.Added, err))
	open := func() (int, int) {
		ls, err := s.FindingLabels(ctx)
		if err != nil {
			g.r.Fatal("FindingLabels", err.Error())
		}
		o, d := 0, 0
		for _, l := range ls {
			if l.Reviewed {
				d++
			} else {
				o++
			}
		}
		return o, d
	}
	o, d := open()
	g.r.Check("5 open, none resolved", o == 5 && d == 0, fmt.Sprintf("open %d, resolved %d", o, d))
	for _, id := range []string{"p2", "p4"} {
		if _, err := s.MarkReviewed(ctx, id); err != nil {
			g.r.Fatal("resolve "+id, err.Error())
		}
	}
	o, d = open()
	g.r.Check("two resolved: 3 open", o == 3 && d == 2, fmt.Sprintf("open %d, resolved %d", o, d))
	// Reopen one: the adapter has no reopen, so this is the SetLabel prefix change the matrix describes.
	ls, _ := s.FindingLabels(ctx)
	for _, l := range ls {
		if l.ID == "p2" {
			text, _ := audacity.FindingLabelText("p2", false, l.Words)
			if err := g.client.SetLabel(ctx, l.Label.Index, labelText(text)); err != nil {
				g.r.Fatal("reopen", err.Error())
			}
		}
	}
	o, d = open()
	g.r.Check("one reopened: 4 open", o == 4 && d == 1, fmt.Sprintf("open %d, resolved %d", o, d))
	// Next: the smallest open label's time, then go to it.
	ls, _ = s.FindingLabels(ctx)
	next := ""
	best := 1e18
	for _, l := range ls {
		if !l.Reviewed && l.Start < best {
			best, next = l.Start, l.ID
		}
	}
	lab, err := s.GoToFinding(ctx, next)
	selS, selE := g.selection()
	g.r.Check("next open pickup is the earliest and go-to selects it", err == nil && next == "p1" && within(selS, lab.Start, 1e-3) && within(selE, lab.End, 1e-3), fmt.Sprintf("next %s, selection %v-%v, error %v", next, selS, selE, err))
	// A hand edit.
	hand := "my own note about the chapter"
	for _, l := range g.labels() {
		if strings.HasPrefix(l.Text, "[nu:p5") {
			if err := g.client.SetLabel(ctx, l.Index, labelText(hand)); err != nil {
				g.r.Fatal("hand edit", err.Error())
			}
		}
	}
	ls, _ = s.FindingLabels(ctx)
	g.r.Check("the hand-edited label is not a pickup any more and nothing overwrote it", len(ls) == 4, fmt.Sprintf("%d finding labels", len(ls)))
	found := false
	for _, l := range g.labels() {
		if l.Text == hand {
			found = true
		}
	}
	g.r.Check("the hand edit is read as it stands", found, "label text kept")
	for _, f := range fs[:4] {
		var at float64 = -1
		for _, l := range ls {
			if l.ID == f.ID {
				at = l.Start
			}
		}
		g.r.Check("position of "+f.ID+" within 1 ms", within(at, f.Start, 1e-3), fmt.Sprintf("read %v, wrote %v", at, f.Start))
	}
}

// A3-T11: regions as range labels; the same list twice; a moved end; an export of each range.
func TestA3T11RegionsAsRangeLabels(t *testing.T) {
	g := newRig(t, "A3-T11", "Regions as range labels: created once, idempotent, moved end keeps its text, exported length")
	ctx := context.Background()
	s := audacity.NewSession(g.client)
	g.importFile(g.e.Tone(t, "t11.wav", 30, 44100, 1, 330))
	regions := []audacity.Finding{
		{ID: "c1", Start: 1, End: 4, Words: "Chapter 1"},
		{ID: "c2", Start: 6, End: 12, Words: "Chapter 2"},
		{ID: "c3", Start: 14, End: 20, Words: "Chapter 3"},
	}
	res, err := s.ImportFindings(ctx, regions)
	g.r.Check("3 regions created", err == nil && len(res.Added) == 3, fmt.Sprintf("added %v, error %v", res.Added, err))
	res, err = s.ImportFindings(ctx, regions)
	g.r.Check("the same list again creates none", err == nil && len(res.Added) == 0 && len(res.Skipped) == 3, fmt.Sprintf("added %v skipped %v, error %v", res.Added, res.Skipped, err))
	ls, _ := s.FindingLabels(ctx)
	var c2 audacity.FindingLabel
	for _, l := range ls {
		if l.ID == "c2" {
			c2 = l
		}
	}
	newEnd := 13.0
	if err := g.client.SetLabel(ctx, c2.Label.Index, labelEdit(nil, nil, &newEnd)); err != nil {
		g.r.Fatal("move an end", err.Error())
	}
	ls, _ = s.FindingLabels(ctx)
	for _, l := range ls {
		if l.ID == "c2" {
			g.r.Check("the moved end updates the label and keeps its text", within(l.End, 13, 1e-3) && within(l.Start, 6, 1e-3) && l.Words == "Chapter 2", fmt.Sprintf("%v-%v %q", l.Start, l.End, l.Words))
			regions[1].End = 13
		}
	}
	g.must("SelectTracks: Track=0 TrackCount=1 Mode=Set")
	for _, rg := range regions {
		g.must(fmt.Sprintf("SelectTime: Start=%v End=%v RelativeTo=ProjectStart", rg.Start, rg.End))
		out := filepath.Join(g.e.Out, "audio", "t11-"+rg.ID+".wav")
		g.must(fmt.Sprintf(`Export2: Filename="%s" NumChannels=1`, out))
		w, err := audacityreal.ReadWAV(out)
		if err != nil {
			g.r.Fail("export "+rg.ID, err.Error())
			continue
		}
		g.r.Check("export of "+rg.ID+" has the range's length", within(w.Seconds, rg.End-rg.Start, 1.5/float64(w.Rate)+1e-6) && w.RMS > 0.05, fmt.Sprintf("%.4f s (want %.1f), RMS %.3f", w.Seconds, rg.End-rg.Start, w.RMS))
	}
}

// A3-T12: select by track name, go to a time, read the place back, and whether the view follows.
func TestA3T12SelectGoToReadPlace(t *testing.T) {
	g := newRig(t, "A3-T12", "Select a track, go to a time, read the place; whether the view follows the cursor")
	long := g.e.Silence(t, "t12-800s.wav", 800, 4000, 700, 1)
	g.importFile(long)
	g.importFile(g.e.Tone(t, "t12-second.wav", 20, 44100, 1, 440))
	g.must(`SelectTracks: Track=0 TrackCount=1 Mode=Set`)
	g.must(`SetTrackStatus: Name="Chapter A"`)
	g.must(`SelectTracks: Track=1 TrackCount=1 Mode=Set`)
	g.must(`SetTrackStatus: Name="Chapter B"`)
	g.must("SelectNone")
	tr := g.tracks()
	idx := -1
	for _, x := range tr {
		if x.Name == "Chapter B" {
			idx = x.Index
		}
	}
	g.r.Check("the track is found by name", idx == 1, fmt.Sprintf("Chapter B is track %d of %d", idx, len(tr)))
	g.must(fmt.Sprintf("SelectTracks: Track=%d TrackCount=1 Mode=Set", idx))
	var sel []string
	for _, x := range g.tracks() {
		if x.Selected {
			sel = append(sel, x.Name)
		}
	}
	g.r.Check("only the named track is selected", len(sel) == 1 && sel[0] == "Chapter B", fmt.Sprint(sel))
	// The view at the start, then the cursor at 700 s.
	g.must("SelectTime: Start=0 End=0 RelativeTo=ProjectStart")
	// Importing zooms the view to fit the whole project; zoom in until the view is a few seconds wide, so 700 s is off screen.
	for i := 0; i < 9; i++ {
		g.send("ZoomIn")
	}
	g.must("SelectTime: Start=0 End=0 RelativeTo=ProjectStart")
	time.Sleep(800 * time.Millisecond)
	base := g.e.Shot("t12-cursor-0")
	g.must("SelectTime: Start=700 End=700 RelativeTo=ProjectStart")
	time.Sleep(800 * time.Millisecond)
	moved := g.e.Shot("t12-cursor-700")
	s, e := g.selection()
	g.r.Check("Selection reads {t,t}", within(s, 700, 1e-3) && within(e, 700, 1e-3), fmt.Sprintf("%v, %v", s, e))
	// Compare the ruler and track area only (the selection toolbar at the bottom changes with the cursor).
	crop := func(rel, out string) string {
		o := filepath.Join(g.e.Out, "shots", out)
		_ = exec.Command("convert", filepath.Join(g.e.Out, rel), "-crop", "1170x470+55+200", "+repage", o).Run()
		return o
	}
	a, b := crop(base, "t12-0-crop.png"), crop(moved, "t12-700-crop.png")
	cmp, _ := exec.Command("compare", "-metric", "AE", a, b, "null:").CombinedOutput()
	g.r.Info("view after the cursor moved to 700 s of an 800 s clip, zoomed in at the start", fmt.Sprintf("differing pixels in the ruler and tracks area: %s (a few hundred is the cursor line alone; thousands is a scrolled view)", strings.TrimSpace(string(cmp))), base, moved)
}

// lifetime samples the sink's playback streams every 250 ms for the whole limit (a loop may close and reopen its stream between
// passes, so a gap does not end the watch) and returns the last time one was seen and in how many samples.
func lifetime(limit time.Duration) (last time.Duration, samples int, total int) {
	start := time.Now()
	for time.Since(start) < limit {
		total++
		if audacityreal.SinkInputs() >= 1 {
			samples++
			last = time.Since(start)
		}
		time.Sleep(250 * time.Millisecond)
	}
	return last, samples, total
}

// A3-T13: PlayAtSpeedLooped against the looping the Transport menu has, which outlives the range; Stop ends it; the selection stays.
func TestA3T13LoopAndStop(t *testing.T) {
	g := newRig(t, "A3-T13", "Loop and stop: which loop command outlives the range, Stop ends it, the selection stays")
	if audacityreal.SinkInputs() < 0 {
		g.r.Skip("pactl", "PulseAudio cannot be asked: no sink-input check")
		return
	}
	g.importFile(g.e.Tone(t, "t13.wav", 12, 44100, 1, 440))
	g.must("SelectTime: Start=3 End=7.5 RelativeTo=ProjectStart")
	g.r.Info("sink inputs before", fmt.Sprint(audacityreal.SinkInputs()))

	// The adapter's loop: PlayAtSpeedLooped on the selection.
	g.must("PlayAtSpeedLooped")
	d, n, total := lifetime(14 * time.Second)
	// Observed on 3.7.7 (Linux, null sink): the stream ends with the range, so PlayAtSpeedLooped did not loop. The row pins that; it turns
	// red if a later Audacity loops, and the matrix row N9b stays an Experimental limitation until a real loop is shown.
	g.r.Check("KNOWN LIMIT: PlayAtSpeedLooped plays the 4.5 s range once and does not loop", d < 9*time.Second && n > 0, fmt.Sprintf("a playback stream was last seen at %v of a 14 s watch (%d of %d samples)", d.Round(250*time.Millisecond), n, total))
	ex := g.send("Message: Text=\"during\"")
	g.r.Check("Message answers during playback", ex.OK && ex.Took < 2*time.Second, fmt.Sprintf("%v: %s", ex.Took.Round(time.Millisecond), audacityreal.Visible(ex.Raw)))
	g.must("Stop")
	time.Sleep(1 * time.Second)
	g.r.Check("Stop leaves no stream", audacityreal.SinkInputs() == 0, fmt.Sprintf("sink inputs %d", audacityreal.SinkInputs()))

	// The menu's looping: the play region set to the selection, looping on, Play/Stop.
	g.must("SelectTime: Start=3 End=7.5 RelativeTo=ProjectStart")
	for _, c := range []string{"SetPlayRegionToSelection", "TogglePlayRegion", "DefaultPlayStop"} {
		ex := g.send(c)
		g.r.Info(c, audacityreal.Visible(ex.Raw), g.r.Raw("loop-"+c, ex.Raw))
	}
	d2, n2, total2 := lifetime(14 * time.Second)
	g.r.Check("KNOWN LIMIT: the menu's looped play (play region plus Play/Stop) also ends with the range", d2 < 9*time.Second && n2 > 0, fmt.Sprintf("last seen at %v of a 14 s watch (%d of %d samples)", d2.Round(250*time.Millisecond), n2, total2))
	g.must("Stop")
	time.Sleep(1 * time.Second)
	g.r.Check("Stop ends the region loop", audacityreal.SinkInputs() == 0, fmt.Sprintf("sink inputs %d", audacityreal.SinkInputs()))
	s, e := g.selection()
	g.r.Check("the selection is unchanged by Stop", within(s, 3, 1e-3) && within(e, 7.5, 1e-3), fmt.Sprintf("%v to %v", s, e))
	g.send("ClearPlayRegion")
}
