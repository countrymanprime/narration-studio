package main

import (
	"desktop/internal/brand"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"desktop/internal/contractfile"
	"desktop/internal/reaperinstall"
)

// startHost is a linked REAPER project whose REAPER is found, is not running, and has a resource folder of its own; every start is
// recorded instead of run.
type startHost struct {
	host     *Host
	resource string
	mu       sync.Mutex
	starts   [][]string
	running  bool
}

func newStartHost(t *testing.T) *startHost {
	t.Helper()
	appData := t.TempDir() // never touch the real machine's global-settings.json
	t.Setenv("APPDATA", appData)
	t.Setenv("USERPROFILE", appData)
	s := &startHost{host: choiceHost(t, true)}
	rppFolder(t, s.host)
	decodeDawChoice(t)(s.host.DawLinkFound())
	s.host.chapterSyncEmits.Wait()
	s.resource = filepath.Join(t.TempDir(), "REAPER")
	if err := os.MkdirAll(filepath.Join(s.resource, "Scripts"), 0o755); err != nil {
		t.Fatal(err)
	}
	s.host.dawAutoEnabled.Store(true)
	s.host.reaperResourceSeam = func() string { return s.resource }
	s.host.reaperFilesSeam = fstest.MapFS{
		reaperinstall.StartupScript:  {Data: []byte("-- startup\n")},
		reaperinstall.LauncherScript: {Data: []byte("-- launcher\n")},
	}
	s.host.reaperRunning = func() bool {
		s.mu.Lock()
		defer s.mu.Unlock()
		return s.running
	}
	s.host.reaperLaunch = func(_ string, args []string) error {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.starts = append(s.starts, args)
		return nil
	}
	return s
}

func (s *startHost) startArgs() [][]string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([][]string(nil), s.starts...)
}

func TestOpeningALinkedProjectInstallsTheBridgeAndStartsREAPEROnTheProjectAlone(t *testing.T) {
	s := newStartHost(t)
	s.host.autoConnectOnce(time.Time{})
	if !reaperinstall.Installed(s.resource) {
		t.Fatal("the bridge is in REAPER's Scripts folder and hooked into its startup")
	}
	starts := s.startArgs()
	if len(starts) != 1 || len(starts[0]) != 1 || filepath.Base(starts[0][0]) != "Book.rpp" {
		t.Fatalf("REAPER is started once on the linked project, with no launcher argument since __startup.lua runs the bridge: %v", starts)
	}
	choice := decodeDawChoice(t)(s.host.DawChoice())
	if choice.State != "starting" || choice.Starting == nil || choice.Bridge == nil || !choice.Bridge.Installed || !choice.Bridge.StartsWithReaper || choice.Bridge.Problem != nil {
		t.Fatalf("while REAPER comes up: %+v bridge %+v", choice, choice.Bridge)
	}
	if _, err := time.Parse(time.RFC3339, choice.Starting.Since); err != nil {
		t.Fatalf("since: %v", err)
	}
	if got := s.host.services().config.reaperLauncher; got != filepath.Join(s.resource, "Scripts", brand.ReaperResourceFolder, reaperinstall.LauncherScript) {
		t.Fatalf("the launch uses the installed launcher: %s", got)
	}
}

func TestREAPERIsStartedOncePerProjectAndNotReopenedAfterTheNarratorClosesIt(t *testing.T) {
	s := newStartHost(t)
	s.host.autoConnectOnce(time.Time{})
	s.host.autoConnectOnce(time.Time{})
	if got := len(s.startArgs()); got != 1 {
		t.Fatalf("starts = %d", got)
	}
}

func TestARunningREAPERWithNoBridgeGetsTheInstalledLauncher(t *testing.T) {
	s := newStartHost(t)
	s.running = true
	s.host.autoConnectOnce(time.Time{})
	starts := s.startArgs()
	want := filepath.Join(s.resource, "Scripts", brand.ReaperResourceFolder, reaperinstall.LauncherScript)
	if len(starts) != 1 || len(starts[0]) != 1 || starts[0][0] != want {
		t.Fatalf("the open REAPER runs the installed launcher: %v", starts)
	}
}

func TestAStartThatNeverAnswersSaysSoAndStopsSayingStarting(t *testing.T) {
	s := newStartHost(t)
	s.host.autoConnectOnce(time.Time{})
	state := s.host.bridgeState()
	state.mu.Lock()
	state.startedAt = state.startedAt.Add(-reaperStartWait - time.Second)
	state.mu.Unlock()
	choice := decodeDawChoice(t)(s.host.DawChoice())
	if choice.State == "starting" || choice.Starting != nil {
		t.Fatalf("a start older than the wait is not starting any more: %+v", choice)
	}
	if choice.Bridge == nil || choice.Bridge.Problem == nil || !strings.Contains(*choice.Bridge.Problem, "has not answered") {
		t.Fatalf("problem: %+v", choice.Bridge)
	}
}

func TestAStartThatFailsSaysWhy(t *testing.T) {
	s := newStartHost(t)
	s.host.reaperLaunch = func(string, []string) error { return os.ErrPermission }
	s.host.autoConnectOnce(time.Time{})
	choice := decodeDawChoice(t)(s.host.DawChoice())
	if choice.State == "starting" || choice.Bridge == nil || choice.Bridge.Problem == nil || !strings.Contains(*choice.Bridge.Problem, "could not open REAPER") {
		t.Fatalf("failed start: %+v %+v", choice, choice.Bridge)
	}
	s.host.reaperLaunch = func(string, []string) error { t.Fatal("a failed start is not repeated on its own"); return nil }
	s.host.autoConnectOnce(time.Time{})
}

func TestAREAPERThatWasNeverOpenedIsStartedWithTheLauncherAndTheBridgeWaits(t *testing.T) {
	s := newStartHost(t)
	if err := os.RemoveAll(s.resource); err != nil {
		t.Fatal(err)
	}
	s.host.autoConnectOnce(time.Time{})
	if _, err := os.Stat(s.resource); !os.IsNotExist(err) {
		t.Fatal("REAPER's folder is not made for it")
	}
	starts := s.startArgs()
	if len(starts) != 1 || len(starts[0]) != 2 || filepath.Base(starts[0][1]) != brand.ReaperLauncher {
		t.Fatalf("with nothing installed the launcher rides along, as before: %v", starts)
	}
	choice := decodeDawChoice(t)(s.host.DawChoice())
	if choice.Bridge == nil || choice.Bridge.Installed || choice.Bridge.Problem == nil || !strings.Contains(*choice.Bridge.Problem, "has not been opened") {
		t.Fatalf("bridge: %+v", choice.Bridge)
	}
}

func TestTheLauncherSettingOffInstallsNothing(t *testing.T) {
	s := newStartHost(t)
	if err := s.host.services().settings.Save("DAW", "global", map[string]*string{"auto_start_launcher": ptr("false")}); err != nil {
		t.Fatal(err)
	}
	s.host.autoConnectOnce(time.Time{})
	if reaperinstall.Installed(s.resource) {
		t.Fatal("nothing is written into REAPER")
	}
	choice := decodeDawChoice(t)(s.host.DawChoice())
	if choice.Bridge == nil || choice.Bridge.Installed || choice.Bridge.Problem == nil {
		t.Fatalf("bridge: %+v", choice.Bridge)
	}
}

func TestWithoutTheEnabledFlagNothingIsInstalledOrStarted(t *testing.T) {
	s := newStartHost(t)
	s.host.dawAutoEnabled.Store(false)
	s.host.ensureReaperBridge(s.host.services())
	if reaperinstall.Installed(s.resource) {
		t.Fatal("a host the app's start did not enable writes nothing into REAPER")
	}
	if choice := decodeDawChoice(t)(s.host.DawChoice()); choice.Bridge != nil {
		t.Fatalf("bridge: %+v", choice.Bridge)
	}
}

func TestALiveStartupBridgeIsAttachedInsteadOfStartingREAPER(t *testing.T) {
	s := newStartHost(t)
	hub := filepath.Join(reaperinstall.SessionsDir(s.resource), "hub_42")
	if err := os.MkdirAll(filepath.Join(hub, "commands"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(hub, "events.log"), "PROJECT_STATUS||x|0\n")
	s.host.autoConnectOnce(time.Time{})
	if got := len(s.startArgs()); got != 0 {
		t.Fatalf("REAPER is already up with its bridge: starts = %d", got)
	}
	if got := s.host.services().config.sessionDir; got != hub {
		t.Fatalf("attached to %q, want %q", got, hub)
	}
	s.host.chapterSyncEmits.Wait()
}

func TestDawLaunchInstallsFirstAndPassesTheProjectAlone(t *testing.T) {
	s := newStartHost(t)
	if _, err := s.host.DawLaunch(); err != nil {
		t.Fatal(err)
	}
	starts := s.startArgs()
	if len(starts) != 1 || len(starts[0]) != 1 {
		t.Fatalf("starts: %v", starts)
	}
	if choice := decodeDawChoice(t)(s.host.DawChoice()); choice.State != "starting" {
		t.Fatalf("state = %q", choice.State)
	}
}

// daw-choice-starting: the payload while a REAPER the app opened has not answered. UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/daw-choice-starting.json.
func TestDawChoiceStartingGoldenIsCurrent(t *testing.T) {
	s := newStartHost(t)
	s.host.autoConnectOnce(time.Time{})
	raw, err := s.host.DawChoice()
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatal(err)
	}
	decoded["starting"] = map[string]any{"since": "2026-10-23T09:30:00Z"}
	contractfile.Check(t, "daw-choice-starting", decoded)
}
