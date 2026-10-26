package main

import (
	"encoding/json"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/dawport"
	"desktop/internal/recording/recordingtest"
)

// newTestHostForDawCapabilities builds a Host with no bridge and no session directory (a launch with no REAPER file
// bridge open), whose --daw label is daw: "" (standalone), "REAPER" (declared but not connected) or "Audacity"
// (declared, and never has a transport of its own). The real repo defaults (config/defaults.json) back its settings
// store, so every DAW.capability.<name> row reads its real default, "auto".
func newTestHostForDawCapabilities(t *testing.T, daw string) *Host {
	t.Helper()
	appData := t.TempDir()
	t.Setenv("APPDATA", appData)
	t.Setenv("USERPROFILE", appData)
	host := newTestHost(t)
	host.config.daw = daw
	return host
}

// TestDawCapabilitiesGoldenIsCurrent pins DawCapabilities' payload for the three launch kinds a unit test can build
// without a real REAPER session: no DAW at all (every capability unsupported, standalone), REAPER declared but not
// connected (its Supported/Experimental declaration, refused standalone, except the offline
// project_read capability, which needs no bridge, and the edit rows cut_range, fx_range, stack_takes and backups, not_yet_available
// until their commands land), and Audacity (navigate, markers, macro_render and backups declared, docs/architecture/daw-integration.md#the-daw-port,
// docs/reference/daw/capabilities.md#macro_render, docs/reference/daw/audacity-3.md; takes, punch, stack_takes, cut_range and fx_range too, each requiring backups,
// punch destructive while backups are unavailable and the three edits in steps, SN-D83; every other capability
// not_yet_available, docs/architecture/daw-integration.md#audacity-boundary's sentence). UPDATE_CONTRACTS=1
// rewrites tests/fixtures/contracts/daw-capabilities-*.json.
func TestDawCapabilitiesGoldenIsCurrent(t *testing.T) {
	cases := []struct{ name, daw string }{
		{"daw-capabilities-standalone", ""},
		{"daw-capabilities-reaper", "REAPER"},
		{"daw-capabilities-audacity", "Audacity"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			host := newTestHostForDawCapabilities(t, c.daw)
			raw, err := host.DawCapabilities()
			if err != nil {
				t.Fatalf("DawCapabilities() error = %v", err)
			}
			var decoded map[string]any
			if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
				t.Fatalf("DawCapabilities() = %q, not JSON: %v", raw, err)
			}
			contractfile.Check(t, c.name, decoded)
		})
	}
}

// builtinCapabilitiesHost is a launch with no DAW whose project records with the built-in recorder (acting as Windows, where its
// capture row runs).
func builtinCapabilitiesHost(t *testing.T) *Host {
	t.Helper()
	host := recorderHost(t, &recordingtest.Fake{})
	recorderOf(t)(host.RecorderChooseEngine(engineBuiltin))
	return host
}

// capabilities-golden-for-built-in: the built-in recorder's row of DawCapabilities, written from a launch whose project chose it
// (record and takes available with no setting, project_read "keeps no saved project", the rest worded for the
// built-in recorder). UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-capabilities-builtin.json.
func TestDawCapabilitiesBuiltInGoldenIsCurrent(t *testing.T) {
	raw, err := builtinCapabilitiesHost(t).DawCapabilities()
	if err != nil {
		t.Fatalf("DawCapabilities() error = %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatalf("DawCapabilities() = %q, not JSON: %v", raw, err)
	}
	if decoded["daw"] != "Built-in" || decoded["reachable"] != true {
		t.Fatalf("daw = %v, reachable = %v; want Built-in, reachable: the recorder is the app's own", decoded["daw"], decoded["reachable"])
	}
	contractfile.Check(t, "daw-capabilities-builtin", decoded)
}

// built-in-is-a-kind: the project's engine choice makes the launch's kind the built-in recorder only while no DAW launched the
// app; choosing the DAW again makes it REAPER without any --daw, and a DAW launch keeps its DAW.
func TestDawLaunchKindFollowsTheEngineChoiceOnlyWithoutADAW(t *testing.T) {
	host := builtinCapabilitiesHost(t)
	if kind := host.dawLaunchKind(host.services()); kind != dawport.KindBuiltIn {
		t.Errorf("no DAW, built-in chosen: kind = %v, want KindBuiltIn", kind)
	}
	host.mu.Lock()
	host.config.daw = "REAPER"
	host.mu.Unlock()
	if kind := host.dawLaunchKind(host.services()); kind != dawport.KindREAPER {
		t.Errorf("REAPER launch, built-in chosen: kind = %v, want KindREAPER", kind)
	}
	host.mu.Lock()
	host.config.daw = ""
	host.mu.Unlock()
	recorderOf(t)(host.RecorderChooseEngine(engineDAW))
	if kind := host.dawLaunchKind(host.services()); kind != dawport.KindREAPER {
		t.Errorf("no DAW, REAPER chosen: kind = %v, want KindREAPER", kind)
	}
	host.platform = "windows"
	recorderOf(t)(host.RecorderChooseEngine(engineBuiltin))
	host.platform = "linux"
	if kind := host.dawLaunchKind(host.services()); kind != dawport.KindNone {
		t.Errorf("built-in chosen where its capture row does not run, empty folder: kind = %v, want KindNone", kind)
	}
}

func TestDawCapabilitiesReportsTheLaunchKind(t *testing.T) {
	cases := []struct {
		daw, want string
		reachable bool
	}{{"", "none", false}, {"REAPER", "REAPER", false}, {"Audacity", "Audacity", false}, {"reaper", "REAPER", false}, {"Built-in", "Built-in", true}}
	for _, c := range cases {
		host := newTestHostForDawCapabilities(t, c.daw)
		raw, err := host.DawCapabilities()
		if err != nil {
			t.Fatalf("DawCapabilities() error = %v", err)
		}
		var decoded struct {
			Daw       string `json:"daw"`
			Reachable bool   `json:"reachable"`
		}
		if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
			t.Fatal(err)
		}
		if decoded.Daw != c.want {
			t.Errorf("daw = %q, want %q", decoded.Daw, c.want)
		}
		if decoded.Reachable != c.reachable {
			t.Errorf("%q: reachable = %v, want %v", c.daw, decoded.Reachable, c.reachable)
		}
	}
}

// TestDawCapabilitiesOfflineReadingNeedsAKnownDAW: project_read needs no running engine, but it still needs a DAW at
// all (dawport's Needs enum): reading a saved project means knowing its format, and a standalone launch has none.
func TestDawCapabilitiesOfflineReadingNeedsAKnownDAW(t *testing.T) {
	host := newTestHostForDawCapabilities(t, "")
	raw, _ := host.DawCapabilities()
	var decoded struct {
		Capabilities map[string]struct {
			Available bool   `json:"available"`
			Reason    string `json:"reason"`
		} `json:"capabilities"`
	}
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatal(err)
	}
	projectRead := decoded.Capabilities[string(dawport.CapProjectRead)]
	if projectRead.Available || projectRead.Reason != "standalone" {
		t.Fatalf("project_read = %+v, want unavailable/standalone with no DAW at all", projectRead)
	}
}

// TestDawCapabilitiesOfflineReadingWorksWithNoBridge: the same capability is available on a REAPER launch even
// though nothing is connected, since it only needs to know REAPER's project format, not a live bridge.
func TestDawCapabilitiesOfflineReadingWorksWithNoBridge(t *testing.T) {
	host := newTestHostForDawCapabilities(t, "REAPER")
	raw, _ := host.DawCapabilities()
	var decoded struct {
		Capabilities map[string]struct {
			Available bool `json:"available"`
		} `json:"capabilities"`
	}
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatal(err)
	}
	if !decoded.Capabilities[string(dawport.CapProjectRead)].Available {
		t.Fatalf("project_read should be available offline on a REAPER launch")
	}
}

// The owner's rule (2026-10-26, #2251): once a project is linked to a DAW, what the DAW reports is live, and no setting turns it
// on or off. A settings file written by an older version still holds the removed gates, DAW.experimental_reaper_actions = false
// and DAW.capability.<name> = off, at both scopes; with REAPER connected they are never read, so record, punch and the rest stay
// available.
func TestAnOldSettingsFilesGatesNeverTurnADawCapabilityOff(t *testing.T) {
	host := deleteRangeHost(t, "REAPER", liveReachability(), nil)
	old := map[string]*string{}
	for _, row := range []struct{ key, value string }{
		{"experimental_reaper_actions", "false"},
		{"capability.record", "off"},
		{"capability.punch", "off"},
		{"capability.cut_range", "off"},
	} {
		value := row.value
		old[row.key] = &value
	}
	for _, scope := range []string{"global", "project"} {
		// The store itself, not saveSettings: the host no longer accepts these rows, but an old file still has them.
		if err := host.settings.Save("DAW", scope, old); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := host.DawCapabilities()
	if err != nil {
		t.Fatal(err)
	}
	var decoded struct {
		Capabilities map[string]struct {
			Level     string `json:"level"`
			Available bool   `json:"available"`
			Reason    string `json:"reason"`
		} `json:"capabilities"`
	}
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatal(err)
	}
	for _, c := range []dawport.Capability{dawport.CapRecord, dawport.CapPunch, dawport.CapCutRange} {
		if got := decoded.Capabilities[string(c)]; !got.Available || got.Reason != "" {
			t.Errorf("%s = %+v with an old file's gates, want available", c, got)
		}
	}
	for _, key := range []string{"experimental_reaper_actions", "capability.record"} {
		value := "true"
		if err := host.saveSettings("DAW", "global", map[string]*string{key: &value}); err == nil {
			t.Errorf("saveSettings(DAW.%s) accepted a removed gate", key)
		}
	}
}

// depthAdapter declares punch and record Supported, punch destructive and made in steps, record with no depth.
type depthAdapter struct{}

func (depthAdapter) Kind() dawport.Kind { return dawport.KindAudacity }
func (depthAdapter) Declares() map[dawport.Capability]dawport.Level {
	return map[dawport.Capability]dawport.Level{dawport.CapPunch: dawport.Supported, dawport.CapRecord: dawport.Supported}
}
func (depthAdapter) Role(dawport.Capability) any { return nil }
func (depthAdapter) Depth(c dawport.Capability) dawport.Depth {
	if c == dawport.CapPunch {
		return dawport.Depth{Destructive: true, Mode: dawport.ModeSteps}
	}
	return dawport.Depth{}
}

// TestDawCapabilitiesPayloadEmitsDepthOnlyWhenSet: destructive appears only when true and mode only when set, so a
// declaration with no depth (every one today) leaves the payload, and the three capabilities goldens, unchanged.
func TestDawCapabilitiesPayloadEmitsDepthOnlyWhenSet(t *testing.T) {
	runtime := dawport.Runtime{Bridge: true, Reachable: true}
	resolver := dawport.NewResolver(dawport.ResolverConfig{Adapter: depthAdapter{}, Runtime: func() dawport.Runtime { return runtime }})
	capabilities := dawCapabilitiesPayload(resolver, runtime)["capabilities"].(map[string]any)

	punch := capabilities[string(dawport.CapPunch)].(map[string]any)
	if punch["destructive"] != true || punch["mode"] != "steps" {
		t.Fatalf("punch = %v, want destructive true and mode steps", punch)
	}
	for _, c := range []dawport.Capability{dawport.CapRecord, dawport.CapMarkers} {
		entry := capabilities[string(c)].(map[string]any)
		if _, ok := entry["destructive"]; ok {
			t.Errorf("%s = %v, want no destructive key", c, entry)
		}
		if _, ok := entry["mode"]; ok {
			t.Errorf("%s = %v, want no mode key", c, entry)
		}
	}
}
