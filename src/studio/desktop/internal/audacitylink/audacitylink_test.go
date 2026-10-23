package audacitylink

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-studio/shell/internal/audacitybridge"
)

type pinger struct{ err error }

func (p pinger) Ping(context.Context) error { return p.err }

func TestProbeNamesWhatCameBack(t *testing.T) {
	cases := []struct {
		err  error
		want Pipe
	}{
		{nil, PipeAnswering},
		{audacitybridge.ErrNoProject, PipeNoProject},
		{fmt.Errorf("dial: %w", audacitybridge.ErrNotReachable), PipeAbsent},
		{audacitybridge.ErrUnsupportedPlatform, PipeAbsent},
		{audacitybridge.ErrTimeout, PipeSilent},
		{&audacitybridge.ProtocolError{}, PipeSilent},
		{errors.New("something else"), PipeSilent},
	}
	for _, c := range cases {
		if got := Probe(context.Background(), pinger{c.err}); got != c.want {
			t.Errorf("Probe(%v) = %v, want %v", c.err, got, c.want)
		}
	}
}

func TestClassify(t *testing.T) {
	ok := Facts{Supported: true, Installed: true, Module: ModuleOn}
	with := func(edit func(*Facts)) Facts { f := ok; edit(&f); return f }
	cases := []struct {
		name   string
		facts  Facts
		state  State
		action Action
		says   string
	}{
		{"not windows", with(func(f *Facts) { f.Supported = false }), StateUnsupported, ActionNone, "Windows only"},
		{"not installed", with(func(f *Facts) { f.Installed = false }), StateNotInstalled, ActionNone, "Install Audacity 3"},
		{"closed, scripting on", ok, StateNotRunning, ActionLaunch, "Start it here"},
		{"never started", with(func(f *Facts) { f.Module = ModuleUnknown }), StateModuleOff, ActionLaunch, "two starts"},
		{"first start failed to load it", with(func(f *Facts) { f.Module = ModuleOff }), StateModuleOff, ActionEnableModule, "Turn on scripting"},
		{"open before scripting was on", with(func(f *Facts) { f.Running, f.Module = true, ModuleOff }), StateModuleOff, ActionNone, "Close Audacity first"},
		{"open, on, no pipe", with(func(f *Facts) { f.Running = true }), StateNeedsRestart, ActionNone, "close Audacity, then start it"},
		{"open, on, no pipe, looks like 4", with(func(f *Facts) { f.Running, f.Looks4 = true, true }), StateAudacity4, ActionNone, "Audacity 4"},
		{"closed, looks like 4", with(func(f *Facts) { f.Looks4 = true }), StateAudacity4, ActionNone, "Audacity 4"},
		{"a dialog", with(func(f *Facts) { f.Running, f.Pipe = true, PipeSilent }), StateDialog, ActionNone, "waiting on a dialog"},
		{"no project", with(func(f *Facts) { f.Running, f.Pipe = true, PipeNoProject }), StateNoProject, ActionNone, "no project"},
		{"answering", with(func(f *Facts) { f.Running, f.Pipe, f.Project = true, PipeAnswering, ProjectLinked }), StateAnswering, ActionNone, "answering"},
	}
	for _, c := range cases {
		got := Classify(c.facts)
		if got.State != c.state || got.Action != c.action || !strings.Contains(got.Message, c.says) {
			t.Errorf("%s: got %s/%s %q, want %s/%s containing %q", c.name, got.State, got.Action, got.Message, c.state, c.action, c.says)
		}
		if len(got.Steps) != 4 {
			t.Errorf("%s: %d steps, want 4", c.name, len(got.Steps))
		}
	}
}

func TestAnsweringNamesTheProject(t *testing.T) {
	base := Facts{Supported: true, Installed: true, Running: true, Module: ModuleOn, Pipe: PipeAnswering}
	for project, says := range map[OpenProject]string{
		ProjectLinked:     "this project's Audacity project",
		ProjectOther:      "different project",
		ProjectUnlabelled: "not linked to this one yet",
		ProjectUnknown:    "open and answering.",
	} {
		f := base
		f.Project = project
		got := Classify(f)
		if got.Project != project || !strings.Contains(got.Message, says) {
			t.Errorf("project %s: got %s %q", project, got.Project, got.Message)
		}
	}
}

func TestStepsFollowTheFacts(t *testing.T) {
	done := func(f Facts) string {
		var out []string
		for _, s := range steps(f) {
			if s.Done {
				out = append(out, s.ID)
			}
		}
		return strings.Join(out, ",")
	}
	if got := done(Facts{}); got != "" {
		t.Errorf("nothing: %q", got)
	}
	if got := done(Facts{Installed: true}); got != "installed" {
		t.Errorf("installed: %q", got)
	}
	if got := done(Facts{Installed: true, Module: ModuleOff}); got != "installed,started_once" {
		t.Errorf("settings made: %q", got)
	}
	if got := done(Facts{Installed: true, Running: true, Module: ModuleOn, Pipe: PipeAnswering}); got != "installed,started_once,scripting_on,answering" {
		t.Errorf("answering: %q", got)
	}
	// "Audacity 3 is installed" is not done by an install that looks like Audacity 4, which the card says in the same breath it cannot link.
	if got := done(Facts{Installed: true, Looks4: true, Module: ModuleOn}); got != "started_once,scripting_on" {
		t.Errorf("looks like 4: %q", got)
	}
}

func TestLooksLikeAudacity4(t *testing.T) {
	for path, want := range map[string]bool{
		`C:\Program Files\Audacity 4\Audacity.exe`:   true,
		`C:\Program Files\Audacity-4.0\audacity.exe`: true,
		`C:\Program Files\Audacity\Audacity.exe`:     false,
		`C:\Program Files\Audacity\audacity4x.exe`:   false,
		`C:\Tools\Audacity 3.7.7\audacity.exe`:       false,
		``:                                           false,
	} {
		if got := LooksLikeAudacity4(path); got != want {
			t.Errorf("%q = %v, want %v", path, got, want)
		}
	}
}

func write(t *testing.T, text string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "audacity", "audacity.cfg")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestReadModule(t *testing.T) {
	for text, want := range map[string]ModuleStatus{
		"":                                          ModuleUnknown,
		"[GUI]\nShowSplashScreen=0\n":               ModuleUnknown,
		"[Module]\nmod-script-pipe=1\n":             ModuleOn,
		"[Module]\r\nmod-script-pipe = 1\r\n":       ModuleOn,
		"[Module]\nmod-script-pipe=4\n":             ModuleOff,
		"[Module]\nmod-script-pipe=0\n":             ModuleOff,
		"[Other]\nmod-script-pipe=1\n":              ModuleUnknown,
		"[Module]\nmod-nyq-bench=1\n[X]\na=b\n":     ModuleUnknown,
		"[GUI]\nx=1\n[Module]\nmod-script-pipe=1\n": ModuleOn,
	} {
		got, err := ReadModule(write(t, text))
		if err != nil || got != want {
			t.Errorf("%q = %v, %v; want %v", text, got, err, want)
		}
	}
	if got, err := ReadModule(filepath.Join(t.TempDir(), "none.cfg")); err != nil || got != ModuleUnknown {
		t.Errorf("a missing file = %v, %v; want unknown", got, err)
	}
	if got, err := ReadModule(""); err != nil || got != ModuleUnknown {
		t.Errorf("no path = %v, %v; want unknown", got, err)
	}
}

func TestEnableModule(t *testing.T) {
	for _, c := range []struct{ name, in, want string }{
		{"flips a failed status", "[GUI]\nx=1\n[Module]\nmod-script-pipe=4\n[Z]\ny=2\n", "[GUI]\nx=1\n[Module]\nmod-script-pipe=1\n[Z]\ny=2\n"},
		{"adds the entry to the section", "[Module]\nmod-nyq-bench=1\n", "[Module]\nmod-script-pipe=1\nmod-nyq-bench=1\n"},
		{"adds the section", "[GUI]\nx=1\n", "[GUI]\nx=1\n[Module]\nmod-script-pipe=1\n"},
		{"keeps CRLF", "[Module]\r\nmod-script-pipe=4\r\n", "[Module]\r\nmod-script-pipe=1\r\n"},
		{"ignores a same-named key elsewhere", "[Other]\nmod-script-pipe=4\n", "[Other]\nmod-script-pipe=4\n[Module]\nmod-script-pipe=1\n"},
		{"already on is unchanged", "[Module]\nmod-script-pipe=1\n", "[Module]\nmod-script-pipe=1\n"},
	} {
		path := write(t, c.in)
		if err := EnableModule(path, false); err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		got, _ := os.ReadFile(path)
		if string(got) != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
		if status, _ := ReadModule(path); status != ModuleOn {
			t.Errorf("%s: status %v after enabling", c.name, status)
		}
	}
}

func TestEnableModuleRefusals(t *testing.T) {
	path := write(t, "[Module]\nmod-script-pipe=4\n")
	if err := EnableModule(path, true); !errors.Is(err, ErrAudacityRunning) {
		t.Errorf("while running = %v", err)
	}
	if got, _ := os.ReadFile(path); string(got) != "[Module]\nmod-script-pipe=4\n" {
		t.Errorf("a refused call changed the file: %q", got)
	}
	if err := EnableModule(filepath.Join(t.TempDir(), "none.cfg"), false); err == nil || !strings.Contains(err.Error(), "start Audacity once") {
		t.Errorf("a missing file = %v", err)
	}
	if err := EnableModule("", false); err == nil {
		t.Error("no path accepted")
	}
}

func TestSettingsPath(t *testing.T) {
	if got := SettingsPath(""); got != "" {
		t.Errorf("no app data = %q", got)
	}
	if got := SettingsPath("X"); got != filepath.Join("X", "audacity", "audacity.cfg") {
		t.Errorf("got %q", got)
	}
}
