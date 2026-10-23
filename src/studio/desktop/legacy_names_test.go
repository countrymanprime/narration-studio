package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/countrymanprime/narration-studio/shell/internal/legacyname"
)

// A project last opened by a build from before the rename opens with its own data, now under the new folder name.
func TestAProjectFromBeforeTheRenameOpensWithItsData(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	project := filepath.Join(t.TempDir(), "My Book 🦎")
	writeNested(t, filepath.Join(legacyname.OldProjectDataDir(project), "settings.json"), `{"TranscriptCompare": {"color_misread": "112233"}}`)

	host := NewHost()
	host.configureLocked(parseConfigArgs(host.config.repoRoot, []string{"--project-folder", project, "--project-name", "Book", "--daw", "Audacity"}))

	if host.config.projectFolder != project {
		t.Fatalf("projectFolder = %q, want the project", host.config.projectFolder)
	}
	if value, source := host.settings.Effective("TranscriptCompare", "color_misread", ""); value != "112233" || source != "project" {
		t.Fatalf("the project's own setting = (%q, %q), want it read from the moved folder", value, source)
	}
	if _, err := os.Stat(legacyname.OldProjectDataDir(project)); !os.IsNotExist(err) {
		t.Fatalf("the old data folder is still there: %v", err)
	}
}

// A project whose data folder cannot be moved is not opened: opening it would start an empty data folder beside the narrator's.
func TestAProjectWhoseDataFolderCannotMoveIsNotOpened(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	project := t.TempDir()
	old := filepath.Join(legacyname.OldProjectDataDir(project), "settings.json")
	writeNested(t, old, `{"TranscriptCompare": {"color_misread": "112233"}}`)
	writeNested(t, filepath.Join(project, "narration-studio"), "a file where the folder should go")

	host := NewHost()
	host.configureLocked(parseConfigArgs(host.config.repoRoot, []string{"--project-folder", project, "--project-name", "Book", "--daw", "Audacity"}))

	if host.config.projectFolder != "" {
		t.Fatalf("projectFolder = %q, want no project open", host.config.projectFolder)
	}
	if got, err := os.ReadFile(old); err != nil || !strings.Contains(string(got), "112233") {
		t.Fatalf("the old data folder changed: %q, %v", got, err)
	}
	if problem := migrateProjectFolder(project, nil); !strings.Contains(problem, "was not opened") || !strings.Contains(problem, "open the project again") {
		t.Fatalf("the notice does not tell the narrator what happened and what to do: %q", problem)
	}
}

// A REAPER action added before the rename names the launcher in the old cache folder; every start keeps it working there.
func TestTheLauncherFolderFromBeforeTheRenameIsKeptCurrent(t *testing.T) {
	source := fstest.MapFS{
		resourcesRoot + "/reaper/NarrationStudio_Launcher.lua": {Data: []byte("-- launcher v2")},
		resourcesRoot + "/reaper/narration_ui_bridge.lua":      {Data: []byte("-- bridge v2")},
	}
	cache := t.TempDir()
	if err := syncLaunchers(source, cache, "C:/Programs/narration-studio.exe"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(legacyname.OldLauncherDir(cache)); !os.IsNotExist(err) {
		t.Fatalf("a new install got the old launcher folder: %v", err)
	}

	writeNested(t, filepath.Join(legacyname.OldLauncherDir(cache), "narration_ui_bridge.lua"), "-- bridge v1")
	if err := syncLaunchers(source, cache, "C:/Programs/narration-studio.exe"); err != nil {
		t.Fatal(err)
	}
	old := legacyname.OldLauncherDir(cache)
	for name, want := range map[string]string{"narration_ui_bridge.lua": "-- bridge v2", "NarrationStudio_Launcher.lua": "-- launcher v2", "narration-studio-app-path.txt": "C:/Programs/narration-studio.exe\n"} {
		if got, err := os.ReadFile(filepath.Join(old, name)); err != nil || string(got) != want {
			t.Fatalf("%s in the old launcher folder = %q, %v; want %q", name, got, err, want)
		}
	}
	shimName, shim := legacyname.LauncherShim()
	if got, err := os.ReadFile(filepath.Join(old, shimName)); err != nil || string(got) != string(shim) {
		t.Fatalf("the shim under the launcher's old file name = %q, %v", got, err)
	}
	if got, err := os.ReadFile(filepath.Join(stableLauncherDir(cache), "narration_ui_bridge.lua")); err != nil || string(got) != "-- bridge v2" {
		t.Fatalf("the stable launcher folder = %q, %v", got, err)
	}
}
