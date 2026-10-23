package main

import (
	"desktop/internal/brand"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/settings"
)

func TestDecideAutoConnect(t *testing.T) {
	now := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	ready := autoConnectFacts{HasProject: true, ReaperProject: true, Linked: true, ReaperRunning: true, Now: now}
	cases := []struct {
		name string
		edit func(*autoConnectFacts)
		want autoConnectAction
		hub  string
	}{
		{"a connected app does nothing", func(f *autoConnectFacts) { f.Reachable = true }, autoConnectNone, ""},
		{"no project does nothing", func(f *autoConnectFacts) { f.HasProject = false }, autoConnectNone, ""},
		{"a project that records elsewhere does nothing", func(f *autoConnectFacts) { f.ReaperProject = false }, autoConnectNone, ""},
		{"an unlinked project does nothing", func(f *autoConnectFacts) { f.Linked = false }, autoConnectNone, ""},
		{"a REAPER that is not running is started", func(f *autoConnectFacts) { f.ReaperRunning = false }, autoConnectStart, ""},
		{"a REAPER the app already started for this project is not started again", func(f *autoConnectFacts) {
			f.ReaperRunning = false
			f.Started = true
			f.StartedAt = now.Add(-time.Hour)
		}, autoConnectNone, ""},
		{"a REAPER the app just started gets no launcher while its bridge comes up", func(f *autoConnectFacts) { f.Started = true; f.StartedAt = now.Add(-10 * time.Second) }, autoConnectNone, ""},
		{"a REAPER the app started long ago with no bridge gets the launcher", func(f *autoConnectFacts) { f.Started = true; f.StartedAt = now.Add(-2 * reaperStartWait) }, autoConnectLaunch, ""},
		{"a running REAPER with no bridge gets the launcher", func(f *autoConnectFacts) {}, autoConnectLaunch, ""},
		{"a live bridge session is attached, not started again", func(f *autoConnectFacts) { f.LiveHub = "hub_1" }, autoConnectAttach, "hub_1"},
		{"a live bridge session is attached even if REAPER's process is not seen", func(f *autoConnectFacts) { f.LiveHub = "hub_1"; f.ReaperRunning = false }, autoConnectAttach, "hub_1"},
		{"the session this app already has is not attached again", func(f *autoConnectFacts) { f.LiveHub = "hub_1"; f.CurrentHub = "hub_1" }, autoConnectLaunch, ""},
		{"a recent launch attempt waits", func(f *autoConnectFacts) { f.LastLaunch = now.Add(-10 * time.Second) }, autoConnectNone, ""},
		{"an old launch attempt may be repeated", func(f *autoConnectFacts) { f.LastLaunch = now.Add(-2 * time.Minute) }, autoConnectLaunch, ""},
	}
	for _, c := range cases {
		facts := ready
		c.edit(&facts)
		got, hub := decideAutoConnect(facts)
		if got != c.want || hub != c.hub {
			t.Errorf("%s: got (%v, %q), want (%v, %q)", c.name, got, hub, c.want, c.hub)
		}
	}
}

// REAPER's bridge writes its session folders under <resource path>/<launcher folder>/sessions (narration_ui_bridge.lua); the
// folder it used before the rename is never where a live bridge is.
func TestLiveBridgeSessionReadsTheLauncherFolder(t *testing.T) {
	appData := t.TempDir()
	now := time.Now()
	writeHub := func(folder, hub string, at time.Time) {
		dir := filepath.Join(appData, "REAPER", folder, "sessions", hub)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		log := filepath.Join(dir, "events.log")
		if err := os.WriteFile(log, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(log, at, at); err != nil {
			t.Fatal(err)
		}
	}
	writeHub(brand.ReaperResourceFolder, "hub_live", now.Add(-time.Second))
	writeHub(brand.ReaperResourceFolder, "hub_old", now.Add(-time.Hour))

	if got := liveBridgeSession(filepath.Join(appData, "REAPER", brand.ReaperResourceFolder, "sessions"), now); got != "hub_live" {
		t.Fatalf("liveBridgeSession = %q, want hub_live", got)
	}
}

// The autoconnect launch event says what REAPER was handed without writing a path into the log (runlog keeps the user's name and the
// book's title out of it): which kinds of argument, and whether the launcher script is on disk.
func TestAutoConnectLaunchSummaryNamesTheArgsAndNoPaths(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	folder, rpp := linkedProject(t)
	launcher := filepath.Join(t.TempDir(), brand.ReaperLauncher)
	if err := os.WriteFile(launcher, []byte("-- launcher"), 0o644); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name         string
		launcherPath string
		running      bool
		wantArgs     string
		wantFound    bool
	}{
		{"launcher alone in the open REAPER", launcher, true, "launcher", true},
		{"a launcher script that is missing", filepath.Join(t.TempDir(), "gone.lua"), true, "launcher", false},
		{"project and launcher when REAPER is closed", launcher, false, "project,launcher", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := hostServices{config: config{projectFolder: folder, reaperLauncher: tc.launcherPath}, settings: settings.New("", folder)}
			locate := func() (string, string, error) { return "C:/REAPER/reaper.exe", "uninstall_registry", nil }
			launch := func(string, []string) error { return nil }
			got, err := launchReaperForAutoConnect(svc, nil, locate, launch, func() bool { return tc.running })
			if err != nil {
				t.Fatal(err)
			}
			if got.Args != tc.wantArgs || got.LauncherFound != tc.wantFound || got.Source != "uninstall_registry" {
				t.Fatalf("summary = %+v, want args %q, launcher found %v", got, tc.wantArgs, tc.wantFound)
			}
			if strings.Contains(got.Args, rpp) || strings.ContainsAny(got.Args, `\/`) {
				t.Fatalf("summary %q holds a path", got.Args)
			}
		})
	}
}
