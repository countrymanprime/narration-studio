//go:build audacityreal && linux

package audacityreal

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

// Seed says which keys the profile's audacity.cfg carries before Audacity starts. Audacity drops [Update] keys it finds on a profile
// that has no PrefsVersion, so a Seed applied before the first start only holds for the module key.
type Seed struct {
	Module       bool // [Module] mod-script-pipe=1
	UpdateNotice bool // [Update] UpdateNoticeShown=1 and DefaultUpdatesChecking=0: no "App updates" dialog
	Splash       bool // [GUI] ShowSplashScreen=0: no "Welcome to Audacity!" dialog
}

// FullSeed is every first-run dialog switched off and the module on.
var FullSeed = Seed{Module: true, UpdateNotice: true, Splash: true}

var statusLine = regexp.MustCompile(`(?m)^mod-script-pipe=[0-9]$`)

// ModuleStatus is the profile's recorded state of mod-script-pipe ("mod-script-pipe=4"), or "" when none is recorded.
func ModuleStatus(home string) string {
	b, err := os.ReadFile(filepath.Join(home, ".config", "audacity", "audacity.cfg"))
	if err != nil {
		return ""
	}
	if m := statusLine.Find(b); m != nil {
		return string(m)
	}
	return ""
}

// NewHome makes an empty profile folder: the ALSA default routed to PulseAudio (Audacity's PortAudio reaches Pulse only through
// ALSA's pulse plugin), a temp directory of its own, and no audacity.cfg.
func (e Env) NewHome(t testing.TB, name string) string {
	t.Helper()
	home := filepath.Join(e.Work, "homes", unsafeName.ReplaceAllString(name, "_"))
	_ = os.RemoveAll(home)
	for _, d := range []string{filepath.Join(home, ".config", "audacity"), filepath.Join(home, "temp"), filepath.Join(home, ".local", "share", "applications")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	rc := "pcm.!default { type pulse }\nctl.!default { type pulse }\n"
	if err := os.WriteFile(filepath.Join(home, ".asoundrc"), []byte(rc), 0o644); err != nil {
		t.Fatal(err)
	}
	return home
}

// ApplySeed adds the seed's keys to the profile's audacity.cfg, leaving anything Audacity wrote, and turns a recorded module status
// into 1 when the seed enables it.
func (e Env) ApplySeed(t testing.TB, home string, s Seed) {
	t.Helper()
	cfg := filepath.Join(home, ".config", "audacity", "audacity.cfg")
	b, _ := os.ReadFile(cfg)
	text := string(b)
	has := func(key string) bool {
		return regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(key) + `=`).MatchString(text)
	}
	var add strings.Builder
	if !has("TempDir") {
		fmt.Fprintf(&add, "[Directories]\nTempDir=%s\n", filepath.Join(home, "temp"))
	}
	if s.Module && !has("mod-script-pipe") {
		add.WriteString("[Module]\nmod-script-pipe=1\n")
	}
	if add.Len() > 0 {
		f, err := os.OpenFile(cfg, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = f.WriteString(add.String())
		_ = f.Close()
	}
	// Forced, not only added: a first start on a networked machine writes UpdateNoticeShown=0 itself (the hosted runner did), and the
	// "App updates & usage info" dialog it then opens is modal before the scripting module has made its pipes.
	if s.UpdateNotice {
		SetPref(t, home, "Update", "UpdateNoticeShown", "1")
		SetPref(t, home, "Update", "DefaultUpdatesChecking", "0")
	}
	if s.Splash {
		SetPref(t, home, "GUI", "ShowSplashScreen", "0")
	}
	if s.Module {
		b, _ = os.ReadFile(cfg)
		_ = os.WriteFile(cfg, statusLine.ReplaceAll(b, []byte("mod-script-pipe=1")), 0o644)
	}
}

// SetTempDir points the profile's TempDir at its own temp folder: a copied profile would otherwise share the template's, and an
// Audacity killed in one test would make the next one open a crash-recovery dialog.
func (e Env) SetTempDir(t testing.TB, home string) {
	t.Helper()
	cfg := filepath.Join(home, ".config", "audacity", "audacity.cfg")
	b, err := os.ReadFile(cfg)
	if err != nil {
		t.Fatal(err)
	}
	line := "TempDir=" + filepath.Join(home, "temp")
	re := regexp.MustCompile(`(?m)^TempDir=.*$`)
	if re.Match(b) {
		b = re.ReplaceAll(b, []byte(line))
	} else {
		b = append(b, []byte("\n[Directories]\n"+line+"\n")...)
	}
	// [ActiveProjects] lists the unsaved projects of earlier runs, which Audacity offers to recover at the next start. A copied
	// profile carries the template's, so they are dropped.
	b = regexp.MustCompile(`(?ms)^\[ActiveProjects\]\n.*?(?:^\[|\z)`).ReplaceAllFunc(b, func(m []byte) []byte {
		if len(m) > 0 && m[len(m)-1] == '[' {
			return []byte("[")
		}
		return nil
	})
	_ = os.WriteFile(cfg, b, 0o644)
	_ = os.RemoveAll(filepath.Join(home, "temp"))
	_ = os.MkdirAll(filepath.Join(home, "temp"), 0o755)
}

// DropKeys removes the [Update] notice keys and the splash key from the profile, so a test sees the first-run dialogs they suppress.
func (e Env) DropKeys(t testing.TB, home string) {
	t.Helper()
	cfg := filepath.Join(home, ".config", "audacity", "audacity.cfg")
	b, err := os.ReadFile(cfg)
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, l := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(l, "UpdateNoticeShown=") || strings.HasPrefix(l, "DefaultUpdatesChecking=") || strings.HasPrefix(l, "ShowSplashScreen=") {
			continue
		}
		out = append(out, l)
	}
	_ = os.WriteFile(cfg, []byte(strings.Join(out, "\n")), 0o644)
}

// Proc is a running Audacity.
type Proc struct {
	Home string
	Log  string
	cmd  *exec.Cmd
	done chan struct{}
	once sync.Once
}

// Start launches Audacity on the profile in its own process group, with the Xvfb display and the PulseAudio server of the run. It
// removes no FIFO: a test that wants stale ones leaves them, and the others call RemoveStalePipes first.
func (e Env) Start(t testing.TB, home string, args ...string) *Proc {
	t.Helper()
	logPath := filepath.Join(e.Out, "logs", fmt.Sprintf("audacity-%s-%d.log", filepath.Base(home), time.Now().UnixNano()%1e9))
	_ = os.MkdirAll(filepath.Dir(logPath), 0o755)
	lf, err := os.Create(logPath)
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(filepath.Join(e.App, "AppRun"), args...)
	// Audacity keeps its configuration under XDG_CONFIG_HOME when it is set, and a hosted runner sets it: HOME alone would send it to the
	// runner's own profile, where none of this seed exists, so every XDG base directory is pinned inside the profile.
	cmd.Env = append(os.Environ(), "HOME="+home, "DISPLAY="+e.Display,
		"XDG_CONFIG_HOME="+filepath.Join(home, ".config"), "XDG_DATA_HOME="+filepath.Join(home, ".local", "share"),
		"XDG_STATE_HOME="+filepath.Join(home, ".local", "state"), "XDG_CACHE_HOME="+filepath.Join(home, ".cache"))
	cmd.Stdout, cmd.Stderr = lf, lf
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		t.Fatalf("start Audacity: %v", err)
	}
	p := &Proc{Home: home, Log: logPath, cmd: cmd, done: make(chan struct{})}
	go func() { _ = cmd.Wait(); _ = lf.Close(); close(p.done) }()
	t.Cleanup(p.Kill)
	return p
}

// Alive is whether the process group still has the main process running.
func (p *Proc) Alive() bool {
	select {
	case <-p.done:
		return false
	default:
		return true
	}
}

func (p *Proc) signal(sig syscall.Signal, wait time.Duration) {
	p.once.Do(func() {})
	if p.cmd.Process != nil {
		_ = syscall.Kill(-p.cmd.Process.Pid, sig)
	}
	select {
	case <-p.done:
	case <-time.After(wait):
	}
}

// Kill ends the whole process group with SIGKILL: a crash, as far as the FIFOs and the profile can tell.
func (p *Proc) Kill() { p.signal(syscall.SIGKILL, 10*time.Second) }

// Stop asks the group to end with SIGTERM, then kills what is left.
func (p *Proc) Stop() {
	p.signal(syscall.SIGTERM, 8*time.Second)
	if p.Alive() {
		p.Kill()
	}
	// The AppRun wrapper may exit before the audacity binary it started has finished; wait for the binary.
	waitNoProcess("audacity", 8*time.Second)
}

func waitNoProcess(name string, limit time.Duration) {
	deadline := time.Now().Add(limit)
	for time.Now().Before(deadline) {
		if exec.Command("pgrep", "-x", name).Run() != nil {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
	_ = exec.Command("pkill", "-9", "-x", name).Run()
}

// KillAll ends any Audacity left by an earlier test and removes the FIFOs it leaves.
func KillAll() {
	// An Audacity that crashed leaves its crashreporter process and its windows behind; they would count as dialogs in every later test.
	_ = exec.Command("pkill", "-9", "-x", "crashreporter").Run()
	_ = exec.Command("pkill", "-9", "-x", "audacity").Run()
	waitNoProcess("audacity", 5*time.Second)
	RemoveStalePipes()
}

// Echo sends one Message until it is answered or the limit passes. It returns how long that took and whether any echo arrived. A
// reply to a project-less Audacity (a lone blank line) is not an echo.
func Echo(limit time.Duration) (time.Duration, bool, Exchange) {
	start := time.Now()
	var last Exchange
	for time.Since(start) < limit {
		if p, err := DialPipe(); err == nil {
			last = p.Send(2*time.Second, `Message: Text="echo"`)
			p.Close()
			if last.OK && strings.HasPrefix(string(last.Raw), "echo\n") {
				return time.Since(start), true, last
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return time.Since(start), false, last
}

// WaitProject polls GetInfo Tracks until Audacity answers with a body (its window exists), or the limit passes.
func WaitProject(limit time.Duration) (time.Duration, bool) {
	start := time.Now()
	for time.Since(start) < limit {
		if p, err := DialPipe(); err == nil {
			ex := p.Send(3*time.Second, "GetInfo: Type=Tracks Format=JSON")
			p.Close()
			if ex.OK {
				return time.Since(start), true
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return time.Since(start), false
}

// Window is one visible X window.
type Window struct {
	ID            string
	Title         string
	Width, Height int
}

// Windows lists the visible, titled windows on the display.
func (e Env) Windows() []Window {
	cmd := exec.Command("xdotool", "search", "--onlyvisible", "--name", ".")
	cmd.Env = append(os.Environ(), "DISPLAY="+e.Display)
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	var ws []Window
	for _, id := range strings.Fields(string(out)) {
		name := xdo(e, "getwindowname", id)
		geo := xdo(e, "getwindowgeometry", "--shell", id)
		w := Window{ID: id, Title: strings.TrimSpace(name)}
		fmt.Sscanf(extract(geo, "WIDTH"), "%d", &w.Width)
		fmt.Sscanf(extract(geo, "HEIGHT"), "%d", &w.Height)
		ws = append(ws, w)
	}
	return ws
}

func xdo(e Env, args ...string) string {
	cmd := exec.Command("xdotool", args...)
	cmd.Env = append(os.Environ(), "DISPLAY="+e.Display)
	out, _ := cmd.Output()
	return string(out)
}

func extract(shell, key string) string {
	for _, l := range strings.Split(shell, "\n") {
		if v, ok := strings.CutPrefix(l, key+"="); ok {
			return v
		}
	}
	return ""
}

// bareTitles are the titles of the X helper windows and of an unnamed project window.
var bareTitles = map[string]bool{"Audacity": true, "audacity": true}

// Dialogs are the visible windows that are neither Audacity's own project window nor an X helper: a title other than "Audacity" or
// the project's name, on a window big enough to hold something. The result names each by title and size.
func (e Env) Dialogs(projectNames ...string) []Window {
	var out []Window
	for _, w := range e.Windows() {
		if w.Width < 60 || w.Height < 40 {
			continue
		}
		if w.Width >= 1100 && w.Height >= 600 {
			continue // the project window itself; its title is the project's name, or the first track's name while unsaved
		}
		if bareTitles[w.Title] {
			continue
		}
		skip := false
		for _, n := range projectNames {
			if w.Title == n {
				skip = true
			}
		}
		if !skip {
			out = append(out, w)
		}
	}
	return out
}

// Shot saves a screenshot of the display under shots/.
func (e Env) Shot(name string) string {
	rel := filepath.Join("shots", unsafeName.ReplaceAllString(name, "_")+".png")
	cmd := exec.Command("import", "-window", "root", filepath.Join(e.Out, rel))
	cmd.Env = append(os.Environ(), "DISPLAY="+e.Display)
	_ = cmd.Run()
	return rel
}

// Click moves the pointer to an absolute screen position and clicks.
func (e Env) Click(x, y int) {
	xdo(e, "mousemove", fmt.Sprint(x), fmt.Sprint(y))
	time.Sleep(100 * time.Millisecond)
	xdo(e, "click", "1")
}

// SinkInputs is the number of playback streams PulseAudio has open (the lines of `pactl list short sink-inputs`), or -1 when pactl
// cannot be asked.
func SinkInputs() int {
	out, err := exec.Command("pactl", "list", "short", "sink-inputs").Output()
	if err != nil {
		return -1
	}
	return len(strings.Fields(strings.Join(strings.Split(strings.TrimSpace(string(out)), "\n"), " "))) / max(1, fieldsOnFirstLine(out))
}

func fieldsOnFirstLine(out []byte) int {
	line, _, _ := bytes.Cut(bytes.TrimSpace(out), []byte("\n"))
	return len(bytes.Fields(line))
}

// position is a window's top-left corner on the screen.
func (e Env) position(w Window) (x, y int) {
	geo := xdo(e, "getwindowgeometry", "--shell", w.ID)
	fmt.Sscanf(extract(geo, "X"), "%d", &x)
	fmt.Sscanf(extract(geo, "Y"), "%d", &y)
	return
}

// Dismiss closes a dialog from outside, never with Return (which pressed whichever button had focus, in the first run). It tries
// Escape on the focused dialog, then a click on the window's close-side button area, and reports which closed it.
func (e Env) Dismiss(w Window) (method string, ok bool) {
	gone := func() bool {
		time.Sleep(700 * time.Millisecond)
		for _, o := range e.Windows() {
			if o.ID == w.ID {
				return false
			}
		}
		return true
	}
	xdo(e, "windowfocus", "--sync", w.ID)
	xdo(e, "key", "--clearmodifiers", "Escape")
	if gone() {
		return "Escape", true
	}
	x, y := e.position(w)
	// A wxWidgets message box puts its buttons along the bottom edge, the affirmative one at the right.
	e.Click(x+w.Width-50, y+w.Height-28)
	if gone() {
		return "click bottom-right", true
	}
	e.Click(x+w.Width/2, y+w.Height-28)
	if gone() {
		return "click bottom-centre", true
	}
	return "none", false
}
