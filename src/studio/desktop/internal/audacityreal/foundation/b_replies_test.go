//go:build audacityreal && linux

package foundation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-studio/shell/internal/audacityreal"
)

// A3-T2: every command id the adapter sends, and the rest of the matrix's list, against GetInfo: Type=Commands.
func TestA3T02CommandProbe(t *testing.T) {
	g := newRig(t, "A3-T02", "Version and command probe: the command ids this Audacity has")
	ex := g.must("GetInfo: Type=Commands Format=JSON")
	g.r.Raw("commands", ex.Raw)
	var cmds []struct{ ID, Name, Menu string }
	if err := json.Unmarshal([]byte(ex.Body()), &cmds); err != nil {
		// Menus and commands are JSON, but a name with a backslash would not be: fall back to the ids by regex.
		g.r.Fatal("GetInfo Commands is JSON", err.Error())
	}
	have := map[string]bool{}
	var macros []string
	for _, c := range cmds {
		have[c.ID] = true
		if strings.HasPrefix(c.ID, "Macro_") {
			macros = append(macros, c.ID)
		}
	}
	g.r.Info("GetInfo Commands", fmt.Sprintf("%d ids", len(cmds)))
	menus := g.must("GetInfo: Type=Menus Format=JSON")
	g.r.Raw("getinfo-menus", menus.Raw)
	menuIDs := map[string]bool{}
	for _, m := range regexp.MustCompile(`"id":\s*"([^"]+)"`).FindAllStringSubmatch(menus.Body(), -1) {
		menuIDs[m[1]] = true
		if strings.HasPrefix(m[1], "Macro_") && !have[m[1]] {
			macros = append(macros, m[1])
		}
	}
	g.r.Info("GetInfo Menus", fmt.Sprintf("%d menu items with an id; the Commands list holds %d ids and neither list is a superset of the other", len(menuIDs), len(cmds)))
	// What the adapter and bridge send (grep NewCommand in audacitybridge and dawport/audacity), then the matrix's extra list. An id
	// exists when Help knows it ("Command not found" otherwise), which neither list alone shows (Play and Stop are in neither).
	adapter := []string{"AddLabel", "Amplify", "Export2", "GetInfo", "Import2", "Message", "OpenProject2", "Play",
		"PlayAtSpeedLooped", "PunchAndRoll", "Record1stChoice", "SelectNone", "SelectTime", "SelectTracks", "SetLabel", "SetTrackAudio",
		"SetTrackStatus", "Stop", "Undo"}
	matrix := []string{"AddLabelPlaying", "Record2ndChoice", "SaveProject2", "SetEnvelope", "ClickRemoval", "SplitDelete", "SyncLock",
		"Help", "Save", "SaveCopy", "Close", "New", "SetProject", "GetPreference", "SetPreference", "RemoveTracks", "Duplicate", "Split",
		"Silence", "Trim", "Cut", "Copy", "Paste", "Delete", "NewMonoTrack", "NewStereoTrack", "NewLabelTrack", "Normalize", "Fade",
		"TogglePlayRegion", "Redo", "SelectAll", "ImportLabels", "ExportLabels", "ExportMultiple", "ImportRaw", "TimerRecord"}
	// An id exists when a list names it, or, for the few that are safe to run on an empty project, when sending it is not answered
	// "was not recognized". Neither list holds Play or Stop, and Help knows only the Commands list.
	probeSafe := map[string]string{"Play": "Play", "Stop": "Stop", "PlayAtSpeedLooped": "PlayAtSpeedLooped", "ApplyMacro": `ApplyMacro: MacroName="NoSuchMacroForProbe"`}
	known := func(id string) (bool, string) {
		if have[id] {
			return true, "in GetInfo Commands"
		}
		if menuIDs[id] {
			return true, "in GetInfo Menus"
		}
		if cmd, ok := probeSafe[id]; ok {
			ex := g.send(cmd)
			if id == "PlayAtSpeedLooped" || id == "Play" {
				g.send("Stop")
			}
			g.r.Raw("probe-"+id, ex.Raw)
			return ex.Complete && !strings.Contains(string(ex.Raw), "was not recognized"), "probe reply " + audacityreal.Visible(ex.Raw)
		}
		return false, "in neither list, and not safe to probe"
	}
	var missAdapter, missMatrix, byProbe []string
	for _, id := range adapter {
		ok, ev := known(id)
		if !ok {
			missAdapter = append(missAdapter, id+" ("+ev+")")
		}
		if ok && strings.HasPrefix(ev, "probe") {
			byProbe = append(byProbe, id+": "+ev)
		}
	}
	for _, id := range matrix {
		if ok, _ := known(id); !ok {
			missMatrix = append(missMatrix, id)
		}
	}
	g.r.Info("adapter ids found only by sending them", fmt.Sprint(byProbe))
	g.r.Info("matrix ids neither list names", fmt.Sprintf("%v (checked %d; these may still exist: only the adapter's own ids are probed)", missMatrix, len(matrix)))
	g.r.Check("every command id the adapter sends exists", len(missAdapter) == 0, fmt.Sprintf("not found: %v (checked %d)", missAdapter, len(adapter)))
	g.r.Info("Macro_ entries", fmt.Sprintf("%d: %v", len(macros), macros))
	g.r.Check("macros are Macro_<name without spaces> commands, and ApplyMacro is not a command in this Audacity", len(macros) >= 2 && !have["ApplyMacro"] && !menuIDs["ApplyMacro"],
		fmt.Sprintf("Macro_ ids %v; ApplyMacro listed: %v", macros, have["ApplyMacro"] || menuIDs["ApplyMacro"]))
	apply := g.send(`ApplyMacro: MacroName="Fade Ends"`)
	g.r.Raw("applymacro", apply.Raw)
	g.r.Check("sending ApplyMacro is answered 'was not recognized'", apply.Failed && strings.Contains(string(apply.Raw), "was not recognized"), audacityreal.Visible(apply.Raw))

	sel := g.send("GetInfo: Type=Selection Format=JSON")
	g.r.Check("GetInfo Type=Selection answers (3.6 and later)", sel.OK, audacityreal.Visible(sel.Raw))
	help := g.send("Help: Command=Amplify Format=JSON")
	g.r.Raw("help-amplify", help.Raw)
	g.r.Info("Help: Command=Amplify", audacityreal.Visible(help.Raw))
	helpPlay := g.send("Help: Command=ApplyMacro Format=JSON")
	g.r.Info("Help: Command=ApplyMacro", audacityreal.Visible(helpPlay.Raw))
	bad := g.send("NoSuchCommandAtAll: X=1")
	g.r.Raw("no-such-command", bad.Raw)
	g.r.Info("an unknown command", fmt.Sprintf("complete=%v failed=%v after %v: %s", bad.Complete, bad.Failed, bad.Took.Round(time.Millisecond), audacityreal.Visible(bad.Raw)))
	// The version probe the app can use, since there is no version string: the set of ids is the fingerprint of the build.
	g.r.Info("command-set fingerprint", hashJSON(sortedKeys(have)))
	// The other lists the capability search of A3-T29 reads.
	boxes := g.send("GetInfo: Type=Boxes Format=JSON")
	g.r.Raw("getinfo-boxes", boxes.Raw)
	g.r.Info("GetInfo Boxes", fmt.Sprintf("complete=%v ok=%v, %d bytes", boxes.Complete, boxes.OK, len(boxes.Raw)))
	// Last, because it is the one that did not answer: GetInfo Type=Preferences.
	prefs := g.sendWithin(10*time.Second, "GetInfo: Type=Preferences Format=JSON")
	g.r.Raw("getinfo-preferences", prefs.Raw)
	time.Sleep(1 * time.Second)
	g.r.Check("KNOWN LIMIT: GetInfo Type=Preferences crashes Audacity 3.7.7 (no reply, the process is gone, a crash report window is left)",
		!prefs.Complete && !g.p.Alive(), fmt.Sprintf("complete=%v ok=%v after %v, %d bytes; Audacity still running: %v; windows: %v",
			prefs.Complete, prefs.OK, prefs.Took.Round(100*time.Millisecond), len(prefs.Raw), g.p.Alive(), dialogTitles(g.e)))
}

// A3-T3: the shape of the replies, as bytes. The files it keeps are the golden replies for the fake pipe.
func TestA3T03ReplyShapes(t *testing.T) {
	g := newRig(t, "A3-T03", "Reply shapes: raw bytes of 14 commands, kept as golden files")
	tone := g.e.Tone(t, "t03-tone.wav", 3, 44100, 1, 440)
	saved := filepath.Join(g.e.Work, "t03-project.aup3")
	_ = os.Remove(saved)
	type step struct {
		name, cmd string
		body      bool // the reply carries a body of its own after the blank first line
		textFirst bool // Message and Export2 write their text before the blank line instead
	}
	steps := []step{
		{"message", `Message: Text="hello"`, false, true},
		{"getinfo-tracks-empty", "GetInfo: Type=Tracks Format=JSON", true, false},
		{"getinfo-clips-empty", "GetInfo: Type=Clips Format=JSON", true, false},
		{"getinfo-labels-empty", "GetInfo: Type=Labels Format=JSON", true, false},
		{"getinfo-selection-empty", "GetInfo: Type=Selection Format=JSON", true, false},
		{"import2", fmt.Sprintf(`Import2: Filename="%s"`, tone), false, false},
		{"getinfo-tracks", "GetInfo: Type=Tracks Format=JSON", true, false},
		{"getinfo-clips", "GetInfo: Type=Clips Format=JSON", true, false},
		{"selecttime", "SelectTime: Start=1 End=2 RelativeTo=ProjectStart", false, false},
		{"addlabel", "AddLabel", false, false},
		{"getinfo-labels", "GetInfo: Type=Labels Format=JSON", true, false},
		{"setlabel", `SetLabel: Label=0 Text="hello"`, false, false},
		{"selectnone", "SelectNone", false, false},
		{"undo", "Undo", false, false},
		{"play", "Play", false, false},
		{"stop", "Stop", false, false},
		{"saveproject2", fmt.Sprintf(`SaveProject2: Filename="%s"`, saved), false, false},
	}
	shapes := 0
	for _, s := range steps {
		ex := g.send(s.cmd)
		raw := g.r.Raw(s.name, ex.Raw)
		if ex.Complete {
			g.r.Golden(s.name, ex.Raw)
		}
		okShape := ex.OK
		switch {
		case s.textFirst:
			okShape = okShape && bytes.HasPrefix(ex.Raw, []byte("hello\n")) && bytes.HasSuffix(ex.Raw, []byte("\nBatchCommand finished: OK\n\n"))
		default:
			okShape = okShape && bytes.HasPrefix(ex.Raw, []byte("\n")) && len(ex.Raw) > 1
		}
		if s.body {
			okShape = okShape && len(ex.Body()) > 0
		}
		if g.r.Check(s.name+": reply shape", okShape, fmt.Sprintf("%s in %v", audacityreal.Visible(ex.Raw), ex.Took.Round(time.Millisecond)), raw) {
			shapes++
		}
	}
	g.r.Info("shapes held", fmt.Sprintf("%d of %d", shapes, len(steps)))

	// The repository's client on the same commands: an error only for the lone blank line.
	ctx := context.Background()
	if err := g.client.Ping(ctx); err != nil {
		g.r.Fail("the client's Ping", err.Error())
	}
	if _, err := g.client.Tracks(ctx); err != nil {
		g.r.Fail("the client reads Tracks of a project with audio", err.Error())
	} else {
		g.r.Pass("the client reads Tracks of a project with audio", "no error")
	}
	// A command Audacity fails outright: Failed! after a body line, the client's CommandError.
	failed := g.send("NoSuchCommandForT03: X=1")
	g.r.Raw("unknown-command", failed.Raw)
	g.r.Golden("unknown-command", failed.Raw)
	g.r.Check("an unknown command ends in Failed! after a message line", failed.Failed && strings.HasPrefix(string(failed.Raw), "Your batch command of NoSuchCommandForT03 was not recognized.\n"), audacityreal.Visible(failed.Raw))
	prefMissing := g.send(`GetPreference: Name="/NoSuch/KeyForT03"`)
	g.r.Raw("getpreference-missing", prefMissing.Raw)
	g.r.Golden("getpreference-missing", prefMissing.Raw)
	g.r.Check("GetPreference of a key that has no value is Failed! after a blank line", prefMissing.Failed && string(prefMissing.Raw) == "\nBatchCommand finished: Failed!\n\n", audacityreal.Visible(prefMissing.Raw))
	var ce *audacitybridge.CommandError
	g.r.Info("the client reports that as a CommandError", func() string {
		_, err := g.client.Do(ctx, audacitybridge.NewCommand("GetPreference").String("Name", "/NoSuch/KeyForT03"))
		return fmt.Sprintf("%v (CommandError: %v)", err, errors.As(err, &ce))
	}())
	// Import2 of a file that does not exist: no reply at all, because Audacity opens an "Error Importing" dialog and waits on it.
	bad := g.sendWithin(6*time.Second, `Import2: Filename="/nonexistent/folder/none.wav"`)
	g.r.Raw("import2-missing-file", bad.Raw)
	var dialogs []string
	for _, w := range g.e.Dialogs() {
		dialogs = append(dialogs, fmt.Sprintf("%q", w.Title))
	}
	g.r.Check("Import2 of a missing file is not answered: a dialog holds it", !bad.Complete && len(dialogs) > 0, fmt.Sprintf("complete=%v after %v; windows: %v", bad.Complete, bad.Took.Round(100*time.Millisecond), dialogs), g.e.Shot("t03-import-missing"))
	for _, w := range g.e.Dialogs() {
		m, ok := g.e.Dismiss(w)
		g.r.Info("dismiss "+w.Title, fmt.Sprintf("%s closed=%v", m, ok))
	}
	// ErrNoProject is only for a lone blank line, which a project window's Audacity never writes: A3-T28 records the no-window reply.
	if _, err := g.client.Tracks(ctx); errors.Is(err, audacitybridge.ErrNoProject) {
		g.r.Fail("ErrNoProject with a project open", "the client read a real reply as no project")
	} else {
		g.r.Pass("ErrNoProject only for the lone blank line", "a project-window reply never read as no project")
	}
}

// A3-T28: dialog inventory. The first-run dialogs with the suppressing keys absent and then present.
func TestA3T28DialogInventory(t *testing.T) {
	e := audacityreal.LoadEnv(t)
	r := e.Begin(t, "A3-T28", "Dialog inventory: first-run windows with the config keys absent, then present")
	e.Template(t) // the primed profile, so the module is enabled either way

	run := func(label string, drop bool) {
		audacityreal.KillAll()
		home := e.NewHome(t, "t28-"+label)
		// Start from the primed profile's own files so the module status is 1, then remove or keep the dialog keys.
		if out, err := copyProfile(e.Template(t), home); err != nil {
			r.Fatal(label+": copy the primed profile", fmt.Sprint(err, out))
		}
		e.SetTempDir(t, home)
		e.ApplySeed(t, home, audacityreal.Seed{Module: true})
		if drop {
			e.DropKeys(t, home)
		} else {
			e.ApplySeed(t, home, audacityreal.FullSeed)
		}
		p := e.Start(t, home)
		defer p.Stop()
		took, ok, ex := audacityreal.Echo(40 * time.Second)
		r.Info(label+": Message answered", fmt.Sprintf("echo=%v after %v: %s", ok, took.Round(100*time.Millisecond), audacityreal.Visible(ex.Raw)), r.Raw(label+"-message", ex.Raw))
		time.Sleep(3 * time.Second)
		titles := dialogTitles(e)
		r.Info(label+": windows after the start", strings.Join(titles, "; ")+" ", e.Shot("t28-"+label+"-start"))
		// A project-affecting command with the dialogs in place: does it answer within 5 s?
		pipe, err := audacityreal.DialPipe()
		if err != nil {
			r.Fail(label+": dial", err.Error())
			return
		}
		for _, cmd := range []string{"GetInfo: Type=Tracks Format=JSON", "SelectNone", fmt.Sprintf(`Import2: Filename="%s"`, e.Tone(t, "t28.wav", 2, 44100, 1, 440))} {
			c := pipe.Send(6*time.Second, cmd)
			r.Raw(label+"-"+strings.Fields(cmd)[0], c.Raw)
			r.Info(label+": "+strings.Fields(cmd)[0], fmt.Sprintf("complete=%v blank=%v ok=%v after %v: %s", c.Complete, c.Blank, c.OK, c.Took.Round(100*time.Millisecond), audacityreal.Visible(c.Raw)))
			if !c.Complete {
				break
			}
		}
		pipe.Close()
		r.Info(label+": windows after the commands", strings.Join(dialogTitles(e), "; "), e.Shot("t28-"+label+"-end"))
	}
	run("keys-absent", true)
	run("keys-present", false)

	// With every suppressing key present nothing but the project may be open and every command answers.
	// (The rows above record both states; this is the assertion the harness depends on.)
	audacityreal.KillAll()
	p := e.Launch(t, "t28-final")
	defer p.Stop()
	d := e.Dialogs()
	var names []string
	for _, w := range d {
		names = append(names, w.Title)
	}
	r.Check("with the keys present only the project window is open", len(d) == 0, fmt.Sprintf("other windows: %v", names))
}

func dialogTitles(e audacityreal.Env) []string {
	var out []string
	for _, w := range e.Windows() {
		out = append(out, fmt.Sprintf("%q %dx%d", w.Title, w.Width, w.Height))
	}
	return out
}
