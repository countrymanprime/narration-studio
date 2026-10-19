//go:build audacityreal && linux

package audacityreal

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// PrimeResult is what the first-start procedure did on one fresh profile.
type PrimeResult struct {
	OneStartEcho   bool          // Audacity answered a Message within the first-start wait
	OneStartAfter  time.Duration // how long that took, or the wait that passed with no answer
	OneStartStatus string        // the module status Audacity had written to the profile when the first start ended
	TwoStartEcho   bool          // it answered after the stop, the status fix and the second start
	TwoStartAfter  time.Duration
	TwoStartStatus string
	Home           string
	Diag           string // set when the second start did not answer: process state, FIFOs, windows and the tail of Audacity's output
}

// Diagnose says what an Audacity that does not answer looks like from outside: alive or not, the FIFOs, the windows, the log tail.
func (e Env) Diagnose(p *Proc) string {
	var b strings.Builder
	fmt.Fprintf(&b, "alive=%v", p.Alive())
	to, from := PipePaths()
	for _, f := range []string{to, from} {
		st, err := os.Stat(f)
		fmt.Fprintf(&b, "; %s: %v", filepath.Base(f), func() any {
			if err != nil {
				return err
			}
			return st.Mode()
		}())
	}
	var ws []string
	for _, w := range e.Windows() {
		ws = append(ws, fmt.Sprintf("%q %dx%d", w.Title, w.Width, w.Height))
	}
	fmt.Fprintf(&b, "; windows: %s", strings.Join(ws, ", "))
	if out, err := exec.Command("pgrep", "-a", "audacity").Output(); err == nil {
		fmt.Fprintf(&b, "; processes: %s", strings.ReplaceAll(strings.TrimSpace(string(out)), "\n", " | "))
	}
	if lb, err := os.ReadFile(p.Log); err == nil {
		lines := strings.Split(strings.TrimSpace(string(lb)), "\n")
		var keep []string
		for _, l := range lines {
			if !strings.HasPrefix(l, "/") { // the AppImage prints every library it loads
				keep = append(keep, l)
			}
		}
		if len(keep) > 12 {
			keep = keep[len(keep)-12:]
		}
		fmt.Fprintf(&b, "; log: %s", strings.Join(keep, " / "))
	}
	return b.String()
}

// Prime is the first-start procedure on a profile Audacity has never seen (docs/research/real-audacity3-ci-integration.md,
// finding 4): seed the module on, start, and give a single start firstWait to answer. Then stop it, set the recorded module status
// back to 1 and re-add the keys Audacity dropped, remove the stale FIFOs, and start again. The second start is left running: the
// caller stops it. The one-start answer is recorded, never relied on.
func (e Env) Prime(t testing.TB, name string, firstWait time.Duration) (PrimeResult, *Proc) {
	t.Helper()
	KillAll()
	home := e.NewHome(t, name)
	res := PrimeResult{Home: home}
	e.ApplySeed(t, home, FullSeed)
	first := e.Start(t, home)
	res.OneStartAfter, res.OneStartEcho, _ = Echo(firstWait)
	if !res.OneStartEcho {
		// The status is written early; give Audacity the time to have recorded it before the stop.
		for i := 0; i < 20 && ModuleStatus(home) == "" && first.Alive(); i++ {
			time.Sleep(500 * time.Millisecond)
		}
	}
	first.Stop()
	res.OneStartStatus = ModuleStatus(home)
	e.ApplySeed(t, home, FullSeed)
	RemoveStalePipes()
	second := e.Start(t, home)
	res.TwoStartAfter, res.TwoStartEcho, _ = Echo(30 * time.Second)
	res.TwoStartStatus = ModuleStatus(home)
	if !res.TwoStartEcho {
		res.Diag = e.Diagnose(second)
	}
	return res, second
}

var (
	tmplOnce sync.Once
	tmplDir  string
	tmplErr  string
)

// Template is a profile that has been through the two-start procedure, with every first-run dialog switched off. It is made once per
// test process and copied for each test, so only A3-T1 pays for the first-start procedure more than once.
func (e Env) Template(t testing.TB) string {
	t.Helper()
	tmplOnce.Do(func() {
		res, p := e.Prime(t, "template", 6*time.Second)
		if !res.TwoStartEcho {
			tmplErr = "the second start did not answer within 30 s (module status " + res.TwoStartStatus + "): " + res.Diag
			p.Kill()
			return
		}
		p.Stop()
		e.SetTempDir(t, res.Home)
		e.ApplySeed(t, res.Home, FullSeed)
		tmplDir = res.Home
	})
	if tmplErr != "" {
		t.Fatalf("no primed profile: %s", tmplErr)
	}
	return tmplDir
}

// Launch starts Audacity on a copy of the primed profile and returns once its project window answers. Any Audacity from an earlier
// test is killed first and the FIFOs are removed.
func (e Env) Launch(t testing.TB, name string, args ...string) *Proc {
	t.Helper()
	return e.LaunchPrefs(t, name, nil, args...)
}

// LaunchPrefs is Launch with preferences set in the profile first, each as "Section/Key" -> value (for example
// "SamplingRate/DefaultProjectSampleRate": "22050").
func (e Env) LaunchPrefs(t testing.TB, name string, prefs map[string]string, args ...string) *Proc {
	t.Helper()
	tmpl := e.Template(t)
	KillAll()
	home := filepath.Join(e.Work, "homes", unsafeName.ReplaceAllString(name, "_"))
	_ = os.RemoveAll(home)
	if out, err := exec.Command("cp", "-a", tmpl, home).CombinedOutput(); err != nil {
		t.Fatalf("copy the primed profile: %v: %s", err, out)
	}
	macros := filepath.Join(home, ".local", "share", "audacity", "Macros")
	_ = os.MkdirAll(macros, 0o755)
	// A saved macro of the harness's own: one Normalize step to -6 dBFS peak, so what a macro run did to audio is measurable.
	_ = os.WriteFile(filepath.Join(macros, "Narration-Test.txt"), []byte("Normalize:ApplyVolume=\"1\" PeakLevel=\"-6\" RemoveDcOffset=\"0\" StereoIndependent=\"0\"\n"), 0o644)
	e.SetTempDir(t, home) // the primed profile's temp directory and any crash-recovery leftovers are not carried over
	e.ApplySeed(t, home, FullSeed)
	for k, v := range prefs {
		section, key, _ := strings.Cut(k, "/")
		SetPref(t, home, section, key, v)
	}
	p := e.Start(t, home, args...)
	if _, ok, ex := Echo(40 * time.Second); !ok {
		t.Fatalf("Audacity did not answer after launch: last reply %s", Visible(ex.Raw))
	}
	if _, ok := WaitProject(30 * time.Second); !ok {
		t.Fatalf("Audacity answered but has no project window")
	}
	return p
}

// SetPref writes one key into the profile's audacity.cfg, replacing the key if the section has it and adding it otherwise.
func SetPref(t testing.TB, home, section, key, value string) {
	t.Helper()
	cfg := filepath.Join(home, ".config", "audacity", "audacity.cfg")
	b, err := os.ReadFile(cfg)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(b), "\n")
	inSection, done := false, false
	var out []string
	for _, l := range lines {
		if strings.HasPrefix(l, "[") {
			if inSection && !done {
				out = append(out, key+"="+value)
				done = true
			}
			inSection = l == "["+section+"]"
		} else if inSection && strings.HasPrefix(l, key+"=") {
			l = key + "=" + value
			done = true
		}
		out = append(out, l)
	}
	if !done {
		out = append(out, "["+section+"]", key+"="+value)
	}
	if err := os.WriteFile(cfg, []byte(strings.Join(out, "\n")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
}
