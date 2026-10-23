package main

import (
	"desktop/internal/brand"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// `--daw Audacity` reaches the host the way the REAPER launcher's `--daw REAPER` does,
// the layered settings store serves an Audacity project with no code of its own, and the review workflow refuses clearly while
// the Audacity adapter reports itself not available (audacity.ErrNotAvailable).

// audacityProject is a project folder shaped like an Audacity one: an .aup3 and no .rpp, with a manuscript imported.
func audacityProject(t *testing.T) string {
	t.Helper()
	project := t.TempDir()
	writeNested(t, filepath.Join(project, "Book.aup3"), "not a real Audacity project")
	writeNested(t, filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json"), `{}`)
	return project
}

func writeNested(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestParseConfigArgsAcceptsDawAudacity(t *testing.T) {
	config := parseConfigArgs(`C:\repo`, []string{"--project-folder", `C:\books\novel`, "--project-name", "Novel", "--daw", "Audacity"})
	if config.daw != "Audacity" || config.projectFolder != `C:\books\novel` || config.projectName != "Novel" {
		t.Fatalf("config = %#v", config)
	}
}

// A smoke test: all three tiers resolve for an Audacity project, and a project override
// saves into the project's own sidecar, with nothing that assumes a REAPER project.
func TestAnAudacityLaunchResolvesEveryTierOfTheLayeredSettings(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("APPDATA", appData)
	project := audacityProject(t)
	writeNested(t, filepath.Join(appData, brand.DataFolder, "global-settings.json"), `{"TranscriptCompare": {"model_size": "medium"}}`)
	writeNested(t, filepath.Join(project, brand.ProjectFolder, "settings.json"), `{"TranscriptCompare": {"color_misread": "112233"}}`)

	host := NewHost()
	host.configureLocked(parseConfigArgs(host.config.repoRoot, []string{"--project-folder", project, "--project-name", "Book", "--daw", "Audacity"}))

	for key, want := range map[string][2]string{
		"color_misread": {"112233", "project"},
		"model_size":    {"medium", "global"},
		"chunk_seconds": {"60", "repo_default"},
	} {
		value, source := host.settings.Effective("TranscriptCompare", key, "")
		if value != want[0] || source != want[1] {
			t.Errorf("Effective(TranscriptCompare, %s) = (%q, %q), want (%q, %q)", key, value, source, want[0], want[1])
		}
	}
	colour := "445566"
	if err := host.settings.Save("TranscriptCompare", "project", map[string]*string{"color_skipped": &colour}); err != nil {
		t.Fatalf("saving a project override for an Audacity project: %v", err)
	}
	if value, source := host.settings.Effective("TranscriptCompare", "color_skipped", ""); value != colour || source != "project" {
		t.Fatalf("after save = (%q, %q), want (%q, project)", value, source, colour)
	}
	if boot := host.Bootstrap(); boot["daw"] != "Audacity" || boot["projectFolder"] != project {
		t.Fatalf("Bootstrap daw/projectFolder = %v/%v", boot["daw"], boot["projectFolder"])
	}
}

// A session directory on an Audacity launch is not REAPER's to open: nothing may write bridge commands for it, and the review
// workflow fails the run with the resolver's sentence (the Experimental switch, then Audacity not answering) instead of hanging on a
// DAW that will never answer.
func TestAnAudacityLaunchOpensNoReaperBridgeAndItsReviewFailsClearly(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	project, session := audacityProject(t), t.TempDir()
	host := NewHost()
	host.configureLocked(parseConfigArgs(host.config.repoRoot, []string{"--project-folder", project, "--session-dir", session, "--daw", "Audacity"}))

	if host.bridge != nil {
		t.Fatal("an Audacity launch must not open the REAPER bridge")
	}
	err := host.transcript.Start(map[string]string{})
	if err == nil || !strings.HasPrefix(err.Error(), "Experimental: switched off in Settings.") {
		t.Fatalf("Start() = %v, want the Experimental refusal", err)
	}
	if state := host.transcript.Snapshot(); state["phase"] != "error" || !strings.HasPrefix(state["message"].(string), "Experimental: switched off in Settings.") {
		t.Fatalf("state = %v / %v", state["phase"], state["message"])
	}
	// With the switch on, a closed Audacity is said to be closed, in the pipe's words.
	on := "true"
	if err := host.saveSettings("DAW", "global", map[string]*string{"experimental_reaper_actions": &on}); err != nil {
		t.Fatal(err)
	}
	if err := host.transcript.Reset(); err != nil {
		t.Fatal(err)
	}
	if err := host.transcript.Start(map[string]string{"model": "small"}); err != nil {
		t.Fatalf("Start() with the switch on = %v", err)
	}
	// The pipe's answer arrives as an event: the run fails with Audacity's own sentence, and nothing waits on a REAPER.
	deadline := time.Now().Add(5 * time.Second)
	for host.transcript.Snapshot()["phase"] != "error" && time.Now().Before(deadline) {
		_ = host.transcript.Drain()
		time.Sleep(10 * time.Millisecond)
	}
	if state := host.transcript.Snapshot(); state["phase"] != "error" || !strings.Contains(state["message"].(string), "Audacity") {
		t.Fatalf("state = %v / %v", state["phase"], state["message"])
	}
	if entries, _ := os.ReadDir(filepath.Join(session, "commands")); len(entries) != 0 {
		t.Fatalf("an Audacity launch wrote %d REAPER bridge command(s)", len(entries))
	}
}

// Only a REAPER launch with no project folder gets the "this REAPER project..." reason; an Audacity one lands on the picker
// like a standalone launch rather than being told about a REAPER project it does not have.
func TestOnlyAReaperLaunchExplainsAMissingProjectFolder(t *testing.T) {
	if reason, ok := unresolvedLaunchReason(config{daw: "REAPER"}); !ok || !strings.Contains(reason, "REAPER project") {
		t.Fatalf("REAPER = (%q, %v)", reason, ok)
	}
	for _, daw := range []string{"Audacity", "", "Standalone"} {
		if reason, ok := unresolvedLaunchReason(config{daw: daw}); ok {
			t.Errorf("daw %q: reason %q, want none", daw, reason)
		}
	}
	if _, ok := unresolvedLaunchReason(config{daw: "REAPER", projectFolder: `C:\books\novel`}); ok {
		t.Fatal("a resolved REAPER launch has nothing to explain")
	}
}

// The installer's Audacity shortcut starts the app with `--daw Audacity` and no project folder, so the narrator picks the project in the app. The picker's switch keeps the launch an Audacity one; any other launch,
// a REAPER one included, becomes "Standalone" as before, because the project the narrator picked is not the one REAPER has open.
func TestAPickerSwitchKeepsAnAudacityLaunchAnAudacityOne(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	for _, tc := range []struct{ launch, want string }{
		{"Audacity", "Audacity"},
		{"audacity", "audacity"},
		{"REAPER", "Standalone"},
		{"", "Standalone"},
		{"Standalone", "Standalone"},
	} {
		host := NewHost()
		host.configureLocked(parseConfigArgs(host.config.repoRoot, []string{"--daw", tc.launch}))
		project := audacityProject(t)
		raw, err := host.ProjectSwitch(project, "Book")
		if err != nil || !strings.Contains(raw, `"switched":true`) {
			t.Fatalf("launch %q: ProjectSwitch = %s, %v", tc.launch, raw, err)
		}
		if boot := host.Bootstrap(); boot["daw"] != tc.want || boot["projectFolder"] != project {
			t.Errorf("launch %q: Bootstrap daw/projectFolder = %v/%v, want %q/%q", tc.launch, boot["daw"], boot["projectFolder"], tc.want, project)
		}
	}
}

// After the switch the review workflow still answers as the Audacity adapter, never through REAPER's bridge.
func TestAnAudacityLaunchPickedInTheAppStillGatesReviewClearly(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := NewHost()
	host.configureLocked(parseConfigArgs(host.config.repoRoot, []string{"--daw", "Audacity"}))
	if _, err := host.ProjectSwitch(audacityProject(t), "Book"); err != nil {
		t.Fatal(err)
	}
	if host.bridge != nil {
		t.Fatal("an Audacity launch must not open the REAPER bridge after a picker switch")
	}
	if err := host.transcript.Start(map[string]string{}); err == nil || !strings.HasPrefix(err.Error(), "Experimental: switched off in Settings.") {
		t.Fatalf("Start() = %v, want the Experimental refusal", err)
	}
}
