package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	abt "github.com/countrymanprime/narration-utils/shell/internal/audacitybridge/audacitybridgetest"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/project"
)

// audacityLinkFixture is a host whose project records with Audacity, over a fake Audacity: its pipe, its settings file, whether it
// runs, and the executable the registry would find.
type audacityLinkFixture struct {
	host     *Host
	server   *abt.Server
	config   string
	running  *bool
	exe      *string
	launched *[][]string
}

func newAudacityLinkFixture(t *testing.T) *audacityLinkFixture {
	t.Helper()
	t.Setenv("APPDATA", t.TempDir())
	folder := t.TempDir()
	if err := project.New("Link", time.Now()).Save(folder); err != nil {
		t.Fatal(err)
	}
	host := NewHost()
	host.platform = "windows"
	f := &audacityLinkFixture{host: host, server: abt.NewServer(), config: filepath.Join(t.TempDir(), "audacity.cfg"), running: new(bool), exe: new(string), launched: new([][]string)}
	*f.exe = `C:\Program Files\Audacity\Audacity.exe`
	client := audacitybridge.New(f.server.Transport(), audacitybridge.Options{Timeout: time.Second, PosixPaths: true})
	t.Cleanup(func() { _ = client.Close() })
	host.audacityPipe = func() *audacitybridge.Client { return client }
	next := host.config
	next.projectFolder = folder
	next.daw = "Audacity"
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
	host.mu.Lock()
	host.audacityConfig = func() string { return f.config }
	host.audacityRunning = func() bool { return *f.running }
	host.audacityLocate = func() (string, string, error) {
		if *f.exe == "" {
			return "", "", errors.New("not installed")
		}
		return *f.exe, "test", nil
	}
	host.audacityLaunch = func(program string, args []string) error {
		*f.launched = append(*f.launched, append([]string{program}, args...))
		return nil
	}
	host.mu.Unlock()
	return f
}

func (f *audacityLinkFixture) write(t *testing.T, text string) {
	t.Helper()
	if err := os.WriteFile(f.config, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

func (f *audacityLinkFixture) check(t *testing.T) AudacityLink {
	t.Helper()
	raw, err := f.host.AudacityLinkCheck()
	if err != nil {
		t.Fatal(err)
	}
	var link AudacityLink
	if err := json.Unmarshal([]byte(raw), &link); err != nil {
		t.Fatal(err)
	}
	return link
}

func TestAudacityLinkWalksTheFirstStartProcedure(t *testing.T) {
	f := newAudacityLinkFixture(t)
	f.server.SetDown(true)

	// Installed, never started: no settings file yet.
	link := f.check(t)
	if link.State != "module_off" || link.Action != "launch" || !link.Chosen || !link.HasProject || !strings.Contains(link.Message, "two starts") {
		t.Fatalf("never started = %+v", link)
	}
	// Start one: Audacity makes its settings with the module failed, and the narrator closes it.
	f.write(t, "[Module]\nmod-script-pipe=4\n")
	if link = f.check(t); link.State != "module_off" || link.Action != "enable_module" {
		t.Fatalf("after the first start = %+v", link)
	}
	// Turn scripting on while Audacity is closed.
	if _, err := f.host.AudacityEnableModule(); err != nil {
		t.Fatal(err)
	}
	if link = f.check(t); link.State != "not_running" || link.Action != "launch" {
		t.Fatalf("after turning scripting on = %+v", link)
	}
	// Start two, started elsewhere: running, the pipe is up.
	f.server.SetDown(false)
	*f.running = true
	f.server.With(func(p *abt.Project) { p.AddWaveTrack("Chapter 1", 0, 60) })
	link = f.check(t)
	if link.State != "answering" || link.OpenProject != "unlabelled" || link.HeardSecondsAgo == nil || !link.Running {
		t.Fatalf("answering = %+v", link)
	}
	for _, step := range link.Steps {
		if !step.Done {
			t.Errorf("step %q is not done while answering", step.ID)
		}
	}
}

func TestAudacityEnableModuleRefusesWhileAudacityRuns(t *testing.T) {
	f := newAudacityLinkFixture(t)
	f.write(t, "[Module]\nmod-script-pipe=4\n")
	*f.running = true
	if _, err := f.host.AudacityEnableModule(); err == nil || !strings.Contains(err.Error(), "Close it first") {
		t.Fatalf("while running: %v", err)
	}
	if got, _ := os.ReadFile(f.config); string(got) != "[Module]\nmod-script-pipe=4\n" {
		t.Errorf("the refused call changed the file: %q", got)
	}
}

func TestAudacityLinkNamesEachRecoverableState(t *testing.T) {
	f := newAudacityLinkFixture(t)
	f.write(t, "[Module]\nmod-script-pipe=1\n")

	f.server.SetDown(true)
	*f.exe = ""
	if link := f.check(t); link.State != "not_installed" {
		t.Errorf("not installed = %+v", link)
	}
	*f.exe = `C:\Program Files\Audacity\Audacity.exe`

	*f.running = true
	if link := f.check(t); link.State != "needs_restart" {
		t.Errorf("open before scripting was read = %+v", link)
	}
	*f.exe = `C:\Program Files\Audacity 4\Audacity.exe`
	if link := f.check(t); link.State != "audacity4" {
		t.Errorf("audacity 4 = %+v", link)
	}
	*f.exe = `C:\Program Files\Audacity\Audacity.exe`

	f.server.SetDown(false)
	f.server.Script(abt.FaultHang)
	if link := f.check(t); link.State != "dialog" || !strings.Contains(link.Message, "dialog") {
		t.Errorf("a dialog = %+v", link)
	}
	f.server.With(func(p *abt.Project) { p.NoProject = true })
	if link := f.check(t); link.State != "no_project" {
		t.Errorf("no project = %+v", link)
	}

	f.host.platform = "linux"
	if link := f.check(t); link.State != "unsupported" {
		t.Errorf("another platform = %+v", link)
	}
}

func TestAudacityLinkTellsLinkedOtherAndUnlabelledProjects(t *testing.T) {
	f := newAudacityLinkFixture(t)
	f.write(t, "[Module]\nmod-script-pipe=1\n")
	*f.running = true
	f.server.With(func(p *abt.Project) { p.AddWaveTrack("Chapter 1", 0, 60) })

	if link := f.check(t); link.State != "answering" || link.OpenProject != "unlabelled" || link.Linked {
		t.Fatalf("a fresh project = %+v", link)
	}
	raw, err := f.host.AudacityLinkOpenProject()
	if err != nil {
		t.Fatal(err)
	}
	var link AudacityLink
	if err := json.Unmarshal([]byte(raw), &link); err != nil {
		t.Fatal(err)
	}
	if link.OpenProject != "linked" || !link.Linked {
		t.Fatalf("after linking the open project = %+v", link)
	}
	// Another Audacity project is open now: it carries a different id.
	f.server.With(func(p *abt.Project) {
		p.Tracks = nil
		p.AddWaveTrack("Other", 0, 10)
		p.AddLabelTrack("Narration Studio", abt.Label{Text: "[nu:project zzzzzzzzzz]"})
	})
	if link := f.check(t); link.OpenProject != "other" || !strings.Contains(link.Message, "different project") {
		t.Errorf("another project's link = %+v", link)
	}
	// Unlinking forgets the id and leaves the label in the Audacity project. With no id to compare it with, the label is not
	// "linked to a different project in this app" (the narrator just unlinked it): the card says the open project is not linked.
	raw, err = f.host.AudacityUnlink()
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(raw), &link); err != nil || link.Linked || link.LinkedFile != nil {
		t.Fatalf("after unlinking = %+v, %v", link, err)
	}
	if link.OpenProject != "unlabelled" || strings.Contains(link.Message, "different project") || !strings.Contains(link.Message, "not linked to this one") {
		t.Errorf("after unlinking, the label left in the project = %+v, want the open project reported as not linked", link)
	}
}

func TestLinkAudacityFileRecordsTheFileAndRefusesTheRest(t *testing.T) {
	f := newAudacityLinkFixture(t)
	dir := t.TempDir()
	good := filepath.Join(dir, "Book One.aup3")
	if err := os.WriteFile(good, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	notAudacity := filepath.Join(dir, "notes.txt")
	_ = os.WriteFile(notAudacity, []byte("x"), 0o600)
	for path, says := range map[string]string{notAudacity: "is not an Audacity project", filepath.Join(dir, "gone.aup3"): "could not be found", dir: "is not an Audacity project"} {
		if err := f.host.linkAudacityFile(path); err == nil || !strings.Contains(err.Error(), says) {
			t.Errorf("%s: %v, want %q", path, err, says)
		}
	}
	if err := f.host.linkAudacityFile(good); err != nil {
		t.Fatal(err)
	}
	link := f.check(t)
	if !link.Linked || link.LinkedFile == nil || *link.LinkedFile != "Book One.aup3" || !link.Chosen {
		t.Fatalf("linked = %+v", link)
	}
	// Linking again keeps the id, so an Audacity project already stamped stays this project's.
	rows := f.host.services().settings.Project(recordingSettingsTool)
	before := rows[audacityLinkIDKey]
	if err := f.host.linkAudacityFile(good); err != nil {
		t.Fatal(err)
	}
	if after := f.host.services().settings.Project(recordingSettingsTool)[audacityLinkIDKey]; after != before || before == "" {
		t.Errorf("id %q became %q", before, after)
	}
}

func TestLaunchAudacityStartsOnTheLinkedFileOnlyWhenItIsNotRunning(t *testing.T) {
	f := newAudacityLinkFixture(t)
	file := filepath.Join(t.TempDir(), "Book.aup3")
	if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := f.host.linkAudacityFile(file); err != nil {
		t.Fatal(err)
	}
	if _, err := f.host.DawLaunch(); err != nil {
		t.Fatal(err)
	}
	if got := *f.launched; len(got) != 1 || len(got[0]) != 2 || got[0][1] != file {
		t.Fatalf("launched %v", got)
	}
	*f.running = true
	if _, err := f.host.DawLaunch(); err == nil || !strings.Contains(err.Error(), "already running") {
		t.Errorf("while running: %v", err)
	}
	*f.running = false
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	*f.launched = nil
	if _, err := f.host.DawLaunch(); err != nil {
		t.Fatal(err)
	}
	if got := *f.launched; len(got) != 1 || len(got[0]) != 1 {
		t.Errorf("a missing linked file should start Audacity bare, launched %v", got)
	}
	*f.exe = ""
	if _, err := f.host.DawLaunch(); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Errorf("not installed: %v", err)
	}
}

func TestAudacityLinkAnAudacityFreeProjectNeverTouchesThePipe(t *testing.T) {
	f := newAudacityLinkFixture(t)
	f.host.mu.Lock()
	f.host.config.daw = "" // the launch's --daw would otherwise keep Audacity
	f.host.mu.Unlock()
	if err := f.host.chooseProjectDaw(dawport.KindREAPER); err != nil {
		t.Fatal(err)
	}
	before := len(f.server.Log())
	f.check(t)
	if got := len(f.server.Log()); got != before {
		t.Errorf("%d commands sent for a REAPER project: %v", got-before, f.server.Log()[before:])
	}
}

func TestPollAudacityLinkProbesInTheBackgroundAndEmitsOnlyChanges(t *testing.T) {
	f := newAudacityLinkFixture(t)
	f.write(t, "[Module]\nmod-script-pipe=1\n")
	*f.running = true
	f.server.With(func(p *abt.Project) { p.AddWaveTrack("Chapter 1", 0, 60) })
	f.host.pollAudacityLink()
	deadline := time.Now().Add(5 * time.Second)
	for {
		conn := f.host.services().audacity
		conn.mu.Lock()
		cached, probing := conn.cached, conn.probing
		conn.mu.Unlock()
		if cached != nil && !probing {
			if cached.State != "answering" {
				t.Fatalf("cached = %+v", cached)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the heartbeat never cached a state")
		}
		time.Sleep(10 * time.Millisecond)
	}
	// Within the probe interval a second tick sends nothing.
	sent := len(f.server.Log())
	f.host.pollAudacityLink()
	time.Sleep(50 * time.Millisecond)
	if got := len(f.server.Log()); got != sent {
		t.Errorf("a tick inside the interval sent %d commands", got-sent)
	}
	// AudacityLink answers the cached state without asking Audacity.
	raw, err := f.host.AudacityLink()
	if err != nil || !strings.Contains(raw, `"state":"answering"`) {
		t.Errorf("AudacityLink = %s, %v", raw, err)
	}
	if got := len(f.server.Log()); got != sent {
		t.Errorf("AudacityLink sent %d commands", got-sent)
	}
}

// go-goldens: UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/audacity-link-*.json, one per state the narrator can be in.
func TestAudacityLinkContractGoldensAreCurrent(t *testing.T) {
	asMap := func(link AudacityLink) map[string]any {
		t.Helper()
		raw, err := encodeBinding(link, nil)
		if err != nil {
			t.Fatal(err)
		}
		var value map[string]any
		if err := json.Unmarshal([]byte(raw), &value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	now := func(f *audacityLinkFixture, probe bool) AudacityLink {
		return f.host.audacityLinkNow(t.Context(), f.host.services(), probe)
	}
	t.Run("audacity-link-answering-linked", func(t *testing.T) {
		f := newAudacityLinkFixture(t)
		f.write(t, "[Module]\nmod-script-pipe=1\n")
		*f.running = true
		f.server.With(func(p *abt.Project) { p.AddWaveTrack("Chapter 1", 0, 60) })
		file := filepath.Join(t.TempDir(), "Book One.aup3")
		_ = os.WriteFile(file, []byte("x"), 0o600)
		if err := f.host.linkAudacityFile(file); err != nil {
			t.Fatal(err)
		}
		if _, err := f.host.AudacityLinkOpenProject(); err != nil {
			t.Fatal(err)
		}
		link := now(f, true)
		heard := 3
		link.HeardSecondsAgo = &heard
		contractfile.Check(t, "audacity-link-answering-linked", asMap(link))
	})
	t.Run("audacity-link-not-running", func(t *testing.T) {
		f := newAudacityLinkFixture(t)
		f.write(t, "[Module]\nmod-script-pipe=1\n")
		f.server.SetDown(true)
		contractfile.Check(t, "audacity-link-not-running", asMap(now(f, true)))
	})
	t.Run("audacity-link-first-start", func(t *testing.T) {
		f := newAudacityLinkFixture(t)
		f.server.SetDown(true)
		contractfile.Check(t, "audacity-link-first-start", asMap(now(f, true)))
	})
	t.Run("audacity-link-dialog", func(t *testing.T) {
		f := newAudacityLinkFixture(t)
		f.write(t, "[Module]\nmod-script-pipe=1\n")
		*f.running = true
		f.server.Script(abt.FaultHang)
		contractfile.Check(t, "audacity-link-dialog", asMap(now(f, true)))
	})
	t.Run("audacity-link-not-chosen", func(t *testing.T) {
		f := newAudacityLinkFixture(t)
		f.host.mu.Lock()
		f.host.config.daw = ""
		f.host.mu.Unlock()
		if err := f.host.chooseProjectDaw(dawport.KindREAPER); err != nil {
			t.Fatal(err)
		}
		f.server.SetDown(true)
		contractfile.Check(t, "audacity-link-not-chosen", asMap(now(f, true)))
	})
}

func TestBootstrapFactsForAnAudacityProjectAreTheAudacityLinks(t *testing.T) {
	f := newAudacityLinkFixture(t)
	f.write(t, "[Module]\nmod-script-pipe=1\n")
	*f.running = true
	f.server.With(func(p *abt.Project) { p.AddWaveTrack("Chapter 1", 0, 60) })
	facts := func() [3]bool {
		linked, reachable, matches, ok := f.host.audacityLinkFacts(f.host.services())
		if !ok {
			t.Fatal("an Audacity project has Audacity facts")
		}
		return [3]bool{linked, reachable, matches}
	}
	if got := facts(); got != [3]bool{false, false, false} {
		t.Errorf("before the first read = %v", got)
	}
	f.check(t)
	if got := facts(); got != [3]bool{false, true, false} {
		t.Errorf("answering, not linked = %v", got)
	}
	if _, err := f.host.AudacityLinkOpenProject(); err != nil {
		t.Fatal(err)
	}
	if got := facts(); got != [3]bool{true, true, true} {
		t.Errorf("linked and the same project open = %v", got)
	}
	f.server.SetDown(true)
	*f.running = false
	f.check(t)
	if got := facts(); got != [3]bool{true, false, false} {
		t.Errorf("Audacity closed = %v", got)
	}
	// Bootstrap carries them.
	boot := f.host.Bootstrap()
	if boot["dawFileLinked"] != true || boot["dawReachable"] != false {
		t.Errorf("bootstrap = linked %v reachable %v", boot["dawFileLinked"], boot["dawReachable"])
	}
}
