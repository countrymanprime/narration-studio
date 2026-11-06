package main

import (
	"context"
	"os"
	"strings"
	"testing"

	"desktop/internal/settings"
	"desktop/internal/update"
)

// Global Settings is reachable from the project picker (issue 3024), so every binding its panels call has to work while no project is open.
// The hosts below have an empty project folder, which a test asserts rather than assumes.

func TestSettingsReadBothScopesAndSaveTheComputersWithNoProject(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("APPDATA", appData)
	t.Setenv("USERPROFILE", appData)
	host := &Host{settings: settings.New(t.TempDir(), "")}
	if host.config.projectFolder != "" {
		t.Fatal("this test needs a host with no project")
	}
	for _, scope := range []string{"global", "project"} {
		fields, err := host.settingsForScope(scope)
		if err != nil || len(fields) == 0 {
			t.Fatalf("settingsForScope(%q) = %d tools, %v; the page reads both scopes whatever is open", scope, len(fields), err)
		}
	}
	// The project scope is empty, never an error: the page draws every field as not set for a project.
	project, _ := host.settingsForScope("project")
	for tool, fields := range project {
		for _, field := range fields.([]map[string]any) {
			if field["isSet"] == true {
				t.Fatalf("%s.%v is set for a project that is not open", tool, field["key"])
			}
		}
	}
	// A change to the computer's settings is kept; one for the project is refused in a sentence, not written anywhere.
	stable := "stable"
	if err := host.saveSettings("Updates", "global", map[string]*string{"channel": &stable}); err != nil {
		t.Fatalf("saving the update channel with no project = %v", err)
	}
	on := "true"
	if err := host.saveSettings("RecordingCoverage", "project", map[string]*string{"background_checks": &on}); err == nil || !strings.Contains(err.Error(), "open a project") {
		t.Fatalf("saving a project setting with no project = %v, want the sentence that asks for a project", err)
	}
}

func TestModelsDownloadVerifyAndRemoveWithNoProject(t *testing.T) {
	f := newInstallFixture(t, false)
	if f.host.config.projectFolder != "" {
		t.Fatal("this test needs a host with no project")
	}
	close(f.release)
	started := answer(t)(f.host.AssetsInstall("whisper", "m1"))
	if started["phase"] != "downloading" && started["phase"] != "success" {
		t.Fatalf("install with no project = %v", started)
	}
	job, _ := started["id"].(string)
	waitForPhase(t, func() map[string]any { s, _ := f.host.whisperInstallState(job); return s }, "success")
	if verified := answer(t)(f.host.AssetsVerify("whisper", "m1")); verified["installState"] != "installed" {
		t.Fatalf("verify with no project = %v", verified)
	}
	if _, err := f.host.AssetsRemove("whisper", "m1"); err != nil {
		t.Fatalf("remove with no project = %v", err)
	}
	if catalog := answer(t)(f.host.AssetsList()); listedAsset(t, catalog, "whisper", "m1")["installState"] != "not_installed" {
		t.Fatalf("the model is still installed after Remove: %v", catalog)
	}
}

func TestUpdateCheckDownloadAndInstallWithNoProject(t *testing.T) {
	host, id := stagedHost(t)
	if host.config.projectFolder != "" {
		t.Fatal("this test needs a host with no project")
	}
	// Check now answered (stagedHost checked, then downloaded): the status says there is a newer release and that it is downloaded.
	status := host.updateStatus()
	if status.Available == nil || status.Available.Version != "0.2.7" || status.Downloaded == nil || status.Downloaded.JobID != id {
		t.Fatalf("status = %+v", status)
	}
	// Install replaces the program and restarts it with the arguments it was started with: with none, it comes back to the picker; with a
	// project's, to that project. Nothing about a project is needed or changed.
	var got update.InstallOptions
	host.installUpdate = func(_ context.Context, options update.InstallOptions) error { got = options; return nil }
	host.quitApp = func() {}
	if _, err := host.UpdateInstall(id); err != nil {
		t.Fatalf("install with no project = %v", err)
	}
	if len(got.Args) != len(os.Args[1:]) {
		t.Fatalf("install restarts with %v, want the arguments the app was started with", got.Args)
	}
}
