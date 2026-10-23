//go:build audacityreal && linux

package foundation

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"desktop/internal/audacityreal"
)

// A3-T24: the LibriVox chapter imported into a 44.1 kHz and a 22.05 kHz project.
func TestA3T24ImportFixture(t *testing.T) {
	g := newRig(t, "A3-T24", "Import and fixture facts: kara_01 into a 44.1 kHz and a 22.05 kHz project")
	if g.e.Fixture == "" {
		g.r.Skip("fixture", "NU_AUDACITY_FIXTURE is not set")
		return
	}
	var al struct {
		DurationS float64 `json:"duration_s"`
	}
	raw, err := os.ReadFile(g.e.Markers)
	if err != nil || json.Unmarshal(raw, &al) != nil || al.DurationS == 0 {
		g.r.Fatal("the alignment", fmt.Sprint(err))
	}
	for _, rate := range []string{"44100", "22050"} {
		if rate != "44100" {
			g.relaunch("a3-t24-"+rate, map[string]string{"SamplingRate/DefaultProjectSampleRate": rate})
		}
		pref := g.send(`GetPreference: Name="/SamplingRate/DefaultProjectSampleRate"`)
		g.r.Info("project rate "+rate+": GetPreference", audacityreal.Visible(pref.Raw), g.r.Raw("getpreference-rate-"+rate, pref.Raw))
		start := time.Now()
		ex := g.sendWithin(60*time.Second, fmt.Sprintf(`Import2: Filename="%s"`, g.e.Fixture))
		took := time.Since(start)
		g.r.Check(rate+" Hz project: the import answers OK", ex.OK, audacityreal.Visible(ex.Raw))
		clips := g.clips()
		if len(clips) != 1 {
			g.r.Fail(rate+" Hz project: one clip", fmt.Sprintf("%d clips", len(clips)))
			continue
		}
		g.r.Check(rate+" Hz project: the clip is as long as the alignment says", within(clips[0].End-clips[0].Start, al.DurationS, 0.01), fmt.Sprintf("%.3f s, alignment %.3f s", clips[0].End-clips[0].Start, al.DurationS))
		g.r.Check(rate+" Hz project: the import takes under 2 s", took < 2*time.Second, took.Round(10*time.Millisecond).String())
		tr := g.must("GetInfo: Type=Tracks Format=JSON")
		g.r.Raw("tracks-"+rate, tr.Raw)
		hasRate := regexp.MustCompile(`(?i)"(rate|samplerate|sample_rate)"`).Match(tr.Raw)
		g.r.Check(rate+" Hz project: GetInfo Tracks does not carry the track's sample rate", !hasRate, audacityreal.Visible(tr.Raw))
		g.noDialogs(rate + " Hz project")
	}
	g.r.Info("sample-rate guard", "the track's rate is not in GetInfo Tracks, Clips or Boxes; the Booth can read only the project's default rate from GetPreference")
}

// A3-T25: a macro run on a re-imported render, then the project is put back.
func TestA3T25MacroRender(t *testing.T) {
	g := newRig(t, "A3-T25", "Macro render: import, macro, export, remove; the project comes back unchanged")
	g.importFile(g.e.Tone(t, "t25-base.wav", 5, 44100, 1, 220))
	g.must("SelectNone")
	f0 := g.fingerprint()
	g.r.Info("F0", f0)
	src := g.e.Tone(t, "t25-render.wav", 6, 44100, 1, 440)
	mean0, peak0, _ := audacityreal.Volume(src, "")
	g.importFile(src)
	n := len(g.tracks()) - 1
	g.must(fmt.Sprintf("SelectTracks: Track=%d TrackCount=1 Mode=Set", n))
	g.must("SelectTime: Start=0 End=6 RelativeTo=ProjectStart")

	// Which spelling runs a saved macro? The adapter sends ApplyMacro: MacroName=...; the menu lists Macro_<name without spaces>.
	spellings := []struct{ name, cmd string }{
		{"ApplyMacro: MacroName", `ApplyMacro: MacroName="Narration-Test"`},
		{"Macro_<name>:", `Macro_Narration-Test:`},
		{"Macro_<name>: with a space name", `Macro_FadeEnds:`},
		{"ApplyMacro with a missing macro", `ApplyMacro: MacroName="No Such Macro"`},
		{"Macro_ with a missing macro", `Macro_NoSuchMacro:`},
	}
	var working string
	for i, sp := range spellings {
		before := g.fingerprint()
		ex := g.sendWithin(15*time.Second, sp.cmd)
		g.r.Raw("spelling-"+fmt.Sprint(i), ex.Raw)
		g.r.Info("macro spelling "+sp.name, fmt.Sprintf("complete=%v ok=%v failed=%v after %v: %s", ex.Complete, ex.OK, ex.Failed, ex.Took.Round(10*time.Millisecond), audacityreal.Visible(ex.Raw)))
		if ex.OK && i == 1 {
			working = sp.cmd
		}
		_ = before
		for _, w := range g.e.Dialogs() {
			g.r.Info("dialog after "+sp.name, fmt.Sprintf("%q %dx%d", w.Title, w.Width, w.Height), g.e.Shot("t25-dialog"))
			g.e.Dismiss(w)
		}
		// A macro leaves its undo steps; take them back so each spelling starts from the same audio.
		for i := 0; i < 6 && g.fingerprint() != before; i++ {
			g.send("Undo")
		}
		g.must(fmt.Sprintf("SelectTracks: Track=%d TrackCount=1 Mode=Set", n))
		g.must("SelectTime: Start=0 End=6 RelativeTo=ProjectStart")
	}
	if working == "" {
		g.r.Fail("a spelling that runs a saved macro", "none of the Macro_<name>: forms answered OK; see the rows above")
		return
	}
	g.r.Pass("the working spelling", working)

	// The real run, with the working spelling.
	g.must(working)
	out := filepath.Join(g.e.Out, "audio", "t25-macro-out.wav")
	g.must(fmt.Sprintf(`Export2: Filename="%s" NumChannels=1`, out))
	g.noDialogs("after the macro and the export")
	w, err := audacityreal.ReadWAV(out)
	if err != nil {
		g.r.Fatal("read the export", err.Error())
	}
	mean1, peak1, _ := audacityreal.Volume(out, "")
	g.r.Check("the export differs from the source by the macro's effect", peak1 > peak0+8 && within(peak1, -6, 0.6), fmt.Sprintf("source mean %.1f peak %.1f dB; export mean %.1f peak %.1f dB (the macro normalises to -6 dBFS); %.3f s", mean0, peak0, mean1, peak1, w.Seconds))
	g.r.Check("the destination is a new path, not the source", out != src, out)
	g.must(fmt.Sprintf("SelectTracks: Track=%d TrackCount=1 Mode=Set", n))
	g.must("RemoveTracks")
	f1 := g.fingerprint()
	g.r.Check("F1 equals F0: the project comes back unchanged", f1 == f0, fmt.Sprintf("F0 %s, F1 %s", f0, f1))
}

// A3-T26: save to the project's own path, to a new path, and Save on a project that has never been saved.
func TestA3T26Save(t *testing.T) {
	g := newRig(t, "A3-T26", "Save: SaveProject2 to its own path twice, to a new path, Save on an unsaved project")
	a := filepath.Join(g.e.Work, "t26-a.aup3")
	b := filepath.Join(g.e.Work, "t26-b.aup3")
	_ = os.Remove(a)
	_ = os.Remove(b)
	g.importFile(g.e.Tone(t, "t26.wav", 3, 44100, 1, 440))
	title := func() string {
		time.Sleep(700 * time.Millisecond)
		var ts []string
		for _, w := range g.e.Windows() {
			if w.Width > 600 {
				ts = append(ts, w.Title)
			}
		}
		return strings.Join(ts, "; ")
	}
	g.r.Info("title before any save", title())
	for i, p := range []string{a, a, b} {
		ex := g.sendWithin(10*time.Second, fmt.Sprintf(`SaveProject2: Filename="%s"`, p))
		g.r.Check(fmt.Sprintf("SaveProject2 #%d to %s", i+1, filepath.Base(p)), ex.OK && ex.Took < 5*time.Second, fmt.Sprintf("%v: %s", ex.Took.Round(10*time.Millisecond), audacityreal.Visible(ex.Raw)), g.r.Raw(fmt.Sprintf("save-%d", i+1), ex.Raw))
		g.noDialogs(fmt.Sprintf("SaveProject2 #%d", i+1), "t26-a", "t26-b")
		g.r.Info(fmt.Sprintf("title after save #%d", i+1), title())
	}
	st, err := os.Stat(b)
	g.r.Check("the new file exists", err == nil && st.Size() > 1000, fmt.Sprint(st, err))

	// Save on a project that has never been saved.
	g.relaunch("a3-t26-unsaved", nil)
	g.importFile(g.e.Tone(t, "t26-2.wav", 3, 44100, 1, 330))
	ex := g.sendWithin(6*time.Second, "Save")
	g.r.Raw("save-unsaved", ex.Raw)
	dialogs := g.e.Dialogs()
	var names []string
	for _, d := range dialogs {
		names = append(names, fmt.Sprintf("%q %dx%d", d.Title, d.Width, d.Height))
	}
	shot := g.e.Shot("t26-save-unsaved")
	g.r.Check("Save on an unsaved project holds the reply", !ex.Complete, fmt.Sprintf("complete=%v after %v", ex.Complete, ex.Took.Round(100*time.Millisecond)), shot)
	g.r.Info("windows while Save waits", fmt.Sprintf("%d separate windows (%s); the screenshot shows an in-window \"How would you like to save?\" panel (Save to Cloud / Save to computer) that the window list does not see", len(dialogs), strings.Join(names, "; ")))
	_, answers, _ := audacityreal.Echo(4 * time.Second)
	g.r.Info("Message while the panel is up", fmt.Sprintf("answered=%v", answers))
	xdoKey := exec.Command("xdotool", "key", "Escape")
	xdoKey.Env = append(os.Environ(), "DISPLAY="+g.e.Display)
	_ = xdoKey.Run()
	_, ok, last := audacityreal.Echo(8 * time.Second)
	g.r.Info("Message after Escape", fmt.Sprintf("answered=%v: %s", ok, audacityreal.Visible(last.Raw)), g.e.Shot("t26-after-escape"))
}

// A3-T27: the playback level. Which preference key exists, whether a running Audacity honours a change, and that an export is not
// changed by it.
func TestA3T27MonitorLevel(t *testing.T) {
	g := newRig(t, "A3-T27", "Monitor level: the playback volume preference, with and without Reload, sink level against export")
	keys := []string{"/AudioIO/PlaybackVolume", "/AudioIO/Volume", "/AudioIO/MonitorVolume"}
	for _, k := range keys {
		ex := g.send(fmt.Sprintf(`GetPreference: Name="%s"`, k))
		g.r.Raw("getpreference-"+k, ex.Raw)
		g.r.Info("GetPreference "+k+" (no value is stored until it is changed)", audacityreal.Visible(ex.Raw))
	}
	if sink := g.e.Sink; sink == "" || audacityreal.SinkInputs() < 0 {
		g.r.Skip("sink level", "no PulseAudio sink to record")
		return
	}
	g.importFile(g.e.Tone(t, "t27.wav", 4, 44100, 1, 440))
	g.must("SelectNone")
	measure := func(label string) float64 {
		out := filepath.Join(g.e.Work, "audio", "t27-"+label+".wav")
		_ = os.Remove(out)
		rec := exec.Command("parec", "-d", g.e.Sink+".monitor", "--file-format=wav", out)
		if err := rec.Start(); err != nil {
			g.r.Fail("parec", err.Error())
			return -999
		}
		time.Sleep(500 * time.Millisecond)
		g.must("Play")
		time.Sleep(2500 * time.Millisecond)
		g.must("Stop")
		_ = rec.Process.Kill()
		_, _ = rec.Process.Wait()
		_, peak, err := audacityreal.Volume(out, "")
		if err != nil {
			g.r.Fail("measure "+label, err.Error())
			return -999
		}
		g.r.Info("sink level "+label, fmt.Sprintf("peak %.1f dB", peak))
		return peak
	}
	base := measure("default")
	g.must("SelectTracks: Track=0 TrackCount=1 Mode=Set")
	g.must("SelectTime: Start=0 End=4 RelativeTo=ProjectStart")
	exp0 := filepath.Join(g.e.Out, "audio", "t27-export-before.wav")
	g.must(fmt.Sprintf(`Export2: Filename="%s" NumChannels=1`, exp0))
	key := ""
	for _, k := range keys {
		for _, mode := range []struct{ name, reload string }{{"without Reload", "0"}, {"with Reload", "1"}} {
			ex := g.send(fmt.Sprintf(`SetPreference: Name="%s" Value="0.25" Reload=%s`, k, mode.reload))
			got := g.send(fmt.Sprintf(`GetPreference: Name="%s"`, k))
			lvl := measure(strings.ReplaceAll(strings.ReplaceAll(k, "/", "_"), " ", "") + "-" + strings.ReplaceAll(mode.name, " ", "-"))
			drop := base - lvl
			g.r.Info(fmt.Sprintf("SetPreference %s 0.25 %s", k, mode.name), fmt.Sprintf("set: %s; get: %s; the sink level moved by %.1f dB", audacityreal.Visible(ex.Raw), audacityreal.Visible(got.Raw), drop))
			if within(drop, 12, 2) && key == "" {
				key = k + " " + mode.name
			}
			g.send(fmt.Sprintf(`SetPreference: Name="%s" Value="1" Reload=%s`, k, mode.reload))
		}
	}
	if key == "" {
		g.r.Pass("a running Audacity does not change its playback level through SetPreference", "none of "+strings.Join(keys, ", ")+" moved the sink level in a running Audacity, with or without Reload: monitor_level stays Not yet available")
	} else {
		g.r.Fail("a running Audacity does not change its playback level through SetPreference", "the level moved by 12 dB through "+key+": monitor_level can be promoted from Not yet available")
	}
	// The same keys written into the profile before the start: a level that is read when the playback slider is made.
	for _, k := range keys {
		section, name, _ := strings.Cut(strings.TrimPrefix(k, "/"), "/")
		g.relaunch("a3-t27-seed-"+name, map[string]string{section + "/" + name: "0.25"})
		g.importFile(g.e.Tone(t, "t27.wav", 4, 44100, 1, 440))
		g.must("SelectNone")
		lvl := measure("seeded-" + name)
		g.r.Info("key seeded in audacity.cfg before the start: "+k, fmt.Sprintf("the sink level moved by %.1f dB", base-lvl))
		if base-lvl > 3 {
			g.r.Info("the playback volume key", k+" 0.25 lowered the sink level by "+fmt.Sprintf("%.0f", base-lvl)+" dB: Audacity reads it when it starts, and a running one does not honour a change (the slider's value is not a linear gain)")
		}
	}
	g.relaunch("a3-t27-export", nil)
	g.importFile(g.e.Tone(t, "t27.wav", 4, 44100, 1, 440))
	g.must("SelectTracks: Track=0 TrackCount=1 Mode=Set")
	g.must("SelectTime: Start=0 End=4 RelativeTo=ProjectStart")
	exp1 := filepath.Join(g.e.Out, "audio", "t27-export-after.wav")
	g.must(fmt.Sprintf(`Export2: Filename="%s" NumChannels=1`, exp1))
	b0, _ := os.ReadFile(exp0)
	b1, _ := os.ReadFile(exp1)
	g.r.Check("the export is byte-identical before and after", len(b0) > 1000 && string(b0) == string(b1), fmt.Sprintf("%d and %d bytes", len(b0), len(b1)))
}

// A3-T29: nothing in the command or menu lists plays or reveals a file without importing it; Import2 adds tracks.
func TestA3T29NoPreviewNoReveal(t *testing.T) {
	g := newRig(t, "A3-T29", "No file preview, no reveal: the command and menu lists, and what Import2 does")
	cmds := g.must("GetInfo: Type=Commands Format=JSON")
	menus := g.must("GetInfo: Type=Menus Format=JSON")
	re := regexp.MustCompile(`(?i)(preview|reveal|show in|open containing|play file|play audio file|file manager|explorer)`)
	var hits []string
	for _, src := range []struct{ name, text string }{{"Commands", cmds.Body()}, {"Menus", menus.Body()}} {
		for _, m := range regexp.MustCompile(`"(?:name|label)"\s*:\s*"([^"]*)"`).FindAllStringSubmatch(src.text, -1) {
			if re.MatchString(m[1]) {
				hits = append(hits, src.name+": "+m[1])
			}
		}
	}
	g.r.Info("entries naming a preview or a reveal", fmt.Sprint(hits))
	// "Effect > Preview" style buttons live in dialogs, not the menus; a menu or command entry that plays a file would show here.
	var fileHits []string
	for _, h := range hits {
		if l := strings.ToLower(h); !strings.Contains(l, "effect") && !strings.Contains(l, "cloud") {
			fileHits = append(fileHits, h)
		}
	}
	g.r.Check("no command or menu plays or reveals a file without importing it", len(fileHits) == 0, fmt.Sprint(fileHits))
	before := len(g.tracks())
	g.importFile(g.e.Tone(t, "t29.wav", 2, 44100, 1, 440))
	after := len(g.tracks())
	g.r.Check("Import2 adds a track to the project", after == before+1, fmt.Sprintf("tracks %d -> %d", before, after))
}
