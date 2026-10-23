package reaperinstall

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

// bridgeFiles is a small stand-in for the embedded integrations/reaper folder.
func bridgeFiles(startup string) fstest.MapFS {
	return fstest.MapFS{
		StartupScript:          {Data: []byte(startup)},
		LauncherScript:         {Data: []byte("-- launcher\n")},
		"narration_bridge.lua": {Data: []byte("-- bridge\n")},
		"README.md":            {Data: []byte("not installed")},
	}
}

// fakeReaper is a REAPER resource folder as REAPER leaves it after its first start.
func fakeReaper(t *testing.T) string {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "REAPER")
	if err := os.MkdirAll(filepath.Join(dir, "Scripts"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "reaper.ini"), []byte("[REAPER]\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir
}

func fixedNow() time.Time { return time.Date(2026, 10, 23, 9, 30, 0, 0, time.UTC) }

func install(t *testing.T, resource string, files fstest.MapFS) Result {
	t.Helper()
	result, err := Install(Options{ResourceDir: resource, Files: files, Executable: "/opt/Narration Studio/narration-utils", Version: "1.2.3", Now: fixedNow})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	return result
}

func read(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(content)
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestInstallWritesTheBridgeTheAppPathAndTheStartupBlock(t *testing.T) {
	resource := fakeReaper(t)
	result := install(t, resource, bridgeFiles("-- startup v1\n"))
	dir := filepath.Join(resource, "Scripts", "NarrationStudio")
	if result.Dir != dir || result.Launcher != filepath.Join(dir, LauncherScript) || result.Startup != filepath.Join(dir, StartupScript) {
		t.Fatalf("paths: %+v", result)
	}
	if got := read(t, filepath.Join(dir, StartupScript)); got != "-- startup v1\n" {
		t.Fatalf("startup script: %q", got)
	}
	if _, err := os.Stat(filepath.Join(dir, "README.md")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("only Lua files are installed")
	}
	if got := read(t, filepath.Join(dir, AppPathFile)); got != "/opt/Narration Studio/narration-utils\n" {
		t.Fatalf("app path: %q", got)
	}
	var recorded manifest
	if err := json.Unmarshal([]byte(read(t, filepath.Join(dir, ManifestFile))), &recorded); err != nil {
		t.Fatal(err)
	}
	if recorded.Version != "1.2.3" || len(recorded.Files) != 3 || recorded.Files[StartupScript] != digest([]byte("-- startup v1\n")) {
		t.Fatalf("manifest: %+v", recorded)
	}
	startup := read(t, filepath.Join(resource, "Scripts", "__startup.lua"))
	if startup != startupBlock {
		t.Fatalf("a new __startup.lua holds only the block:\n%s", startup)
	}
	if !strings.Contains(startup, "pcall(dofile, reaper.GetResourcePath() .. '/Scripts/NarrationStudio/NarrationStudio_Startup.lua')") {
		t.Fatalf("the block runs the startup script by REAPER's own resource path:\n%s", startup)
	}
	if !result.StartupHooked || len(result.BackedUp) != 0 {
		t.Fatalf("result: %+v", result)
	}
	if !Installed(resource) {
		t.Fatal("Installed after Install")
	}
}

func TestInstallTwiceWritesNothingTheSecondTime(t *testing.T) {
	resource := fakeReaper(t)
	install(t, resource, bridgeFiles("-- startup v1\n"))
	before := read(t, filepath.Join(resource, "Scripts", "__startup.lua"))
	again := install(t, resource, bridgeFiles("-- startup v1\n"))
	if len(again.Written) != 0 || len(again.BackedUp) != 0 {
		t.Fatalf("second run: %+v", again)
	}
	if read(t, filepath.Join(resource, "Scripts", "__startup.lua")) != before {
		t.Fatal("__startup.lua changed on a second run")
	}
}

func TestAnUpdateReplacesItsOwnFilesWithoutBackups(t *testing.T) {
	resource := fakeReaper(t)
	install(t, resource, bridgeFiles("-- startup v1\n"))
	updated := install(t, resource, bridgeFiles("-- startup v2\n"))
	if len(updated.BackedUp) != 0 {
		t.Fatalf("a file this package wrote is replaced without a backup: %+v", updated.BackedUp)
	}
	if strings.Join(updated.Written, ",") != StartupScript+","+ManifestFile {
		t.Fatalf("written: %v", updated.Written)
	}
	if got := read(t, filepath.Join(resource, "Scripts", "NarrationStudio", StartupScript)); got != "-- startup v2\n" {
		t.Fatalf("startup script: %q", got)
	}
}

func TestAFileTheNarratorEditedIsBackedUpBeforeItIsReplaced(t *testing.T) {
	resource := fakeReaper(t)
	install(t, resource, bridgeFiles("-- startup v1\n"))
	launcher := filepath.Join(resource, "Scripts", "NarrationStudio", LauncherScript)
	write(t, launcher, "-- my own change\n")
	result := install(t, resource, bridgeFiles("-- startup v1\n"))
	backup := filepath.Join(resource, "Scripts", "NarrationStudio", "backup", "20261023-093000", LauncherScript)
	if len(result.BackedUp) != 1 || result.BackedUp[0] != backup {
		t.Fatalf("backed up: %v", result.BackedUp)
	}
	if read(t, backup) != "-- my own change\n" || read(t, launcher) != "-- launcher\n" {
		t.Fatal("the edit is kept in the backup and the shipped file is back")
	}
}

func TestFilesInTheFolderBeforeAnyInstallAreBackedUp(t *testing.T) {
	resource := fakeReaper(t)
	// A narrator who loaded an older copy into this folder by hand: there is no install.json to say the file is the app's.
	write(t, filepath.Join(resource, "Scripts", "NarrationStudio", LauncherScript), "-- hand copy\n")
	result := install(t, resource, bridgeFiles("-- startup v1\n"))
	if len(result.BackedUp) != 1 || !strings.HasSuffix(result.BackedUp[0], LauncherScript) {
		t.Fatalf("backed up: %v", result.BackedUp)
	}
}

func TestOtherScriptsAreNeverTouched(t *testing.T) {
	resource := fakeReaper(t)
	mine := filepath.Join(resource, "Scripts", "NarrationStudio", "my_tweak.lua")
	elsewhere := filepath.Join(resource, "Scripts", "Cockos", "lyrics.lua")
	write(t, mine, "-- mine\n")
	write(t, elsewhere, "-- cockos\n")
	install(t, resource, bridgeFiles("-- startup v1\n"))
	if read(t, mine) != "-- mine\n" || read(t, elsewhere) != "-- cockos\n" {
		t.Fatal("a script the app did not ship was changed")
	}
}

func TestAFileAVersionNoLongerShipsIsRemovedOnlyWhenUnchanged(t *testing.T) {
	resource := fakeReaper(t)
	first := bridgeFiles("-- startup v1\n")
	first["narration_old.lua"] = &fstest.MapFile{Data: []byte("-- old\n")}
	first["narration_old_edited.lua"] = &fstest.MapFile{Data: []byte("-- old\n")}
	install(t, resource, first)
	dir := filepath.Join(resource, "Scripts", "NarrationStudio")
	write(t, filepath.Join(dir, "narration_old_edited.lua"), "-- edited\n")
	install(t, resource, bridgeFiles("-- startup v1\n"))
	if _, err := os.Stat(filepath.Join(dir, "narration_old.lua")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("an unchanged file the new version dropped is removed")
	}
	if read(t, filepath.Join(dir, "narration_old_edited.lua")) != "-- edited\n" {
		t.Fatal("an edited file is left alone")
	}
}

func TestTheNarratorsStartupLinesAreKeptAndBackedUpOnce(t *testing.T) {
	resource := fakeReaper(t)
	path := filepath.Join(resource, "Scripts", "__startup.lua")
	own := "-- my startup\nreaper.Main_OnCommand(40001, 0)" // no final newline
	write(t, path, own)
	result := install(t, resource, bridgeFiles("-- startup v1\n"))
	backup := path + ".narration-studio-20261023-093000.bak"
	if len(result.BackedUp) != 1 || result.BackedUp[0] != backup || read(t, backup) != own {
		t.Fatalf("backup: %v", result.BackedUp)
	}
	if got := read(t, path); got != own+"\n"+startupBlock {
		t.Fatalf("__startup.lua:\n%s", got)
	}
	again := install(t, resource, bridgeFiles("-- startup v1\n"))
	if len(again.BackedUp) != 0 || len(again.Written) != 0 {
		t.Fatalf("second run: %+v", again)
	}
}

func TestAnOutdatedBlockIsRewrittenInPlace(t *testing.T) {
	resource := fakeReaper(t)
	path := filepath.Join(resource, "Scripts", "__startup.lua")
	write(t, path, "-- above\r\n"+blockBegin+"\r\nold line\r\n"+blockEnd+"\r\n-- below\r\n")
	result := install(t, resource, bridgeFiles("-- startup v1\n"))
	if got := read(t, path); got != "-- above\r\n"+startupBlock+"-- below\r\n" {
		t.Fatalf("__startup.lua:\n%q", got)
	}
	if len(result.BackedUp) != 0 {
		t.Fatalf("rewriting the app's own block needs no backup: %v", result.BackedUp)
	}
}

func TestABeginMarkerWithNoEndIsNotABlock(t *testing.T) {
	resource := fakeReaper(t)
	path := filepath.Join(resource, "Scripts", "__startup.lua")
	broken := blockBegin + "\n-- the narrator's lines after a cut-off block\n"
	write(t, path, broken)
	install(t, resource, bridgeFiles("-- startup v1\n"))
	if got := read(t, path); got != broken+startupBlock {
		t.Fatalf("nothing of the narrator's file is cut:\n%s", got)
	}
}

func TestInstallRefusesAResourceFolderREAPERHasNotMade(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "REAPER")
	_, err := Install(Options{ResourceDir: missing, Files: bridgeFiles("x"), Now: fixedNow})
	if !errors.Is(err, ErrNoResourceDir) {
		t.Fatalf("err = %v", err)
	}
	if _, statErr := os.Stat(missing); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatal("REAPER's folder is not created for it")
	}
	if _, err := Install(Options{Files: bridgeFiles("x")}); !errors.Is(err, ErrNoResourceDir) {
		t.Fatalf("empty resource dir: %v", err)
	}
}

func TestInstallRefusesFilesWithoutTheStartupScript(t *testing.T) {
	resource := fakeReaper(t)
	_, err := Install(Options{ResourceDir: resource, Files: fstest.MapFS{LauncherScript: {Data: []byte("x")}}, Now: fixedNow})
	if err == nil || !strings.Contains(err.Error(), StartupScript) {
		t.Fatalf("err = %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(resource, "Scripts", "__startup.lua")); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatal("no block that would run a missing file")
	}
}

func TestInstalledNeedsBothTheBlockAndTheScript(t *testing.T) {
	resource := fakeReaper(t)
	if Installed(resource) || Installed("") {
		t.Fatal("nothing installed yet")
	}
	install(t, resource, bridgeFiles("-- startup v1\n"))
	if err := os.Remove(filepath.Join(resource, "Scripts", "NarrationStudio", StartupScript)); err != nil {
		t.Fatal(err)
	}
	if Installed(resource) {
		t.Fatal("the block alone does not start a bridge")
	}
}

func TestPathsWithSpacesAndUnicodeInstall(t *testing.T) {
	resource := filepath.Join(t.TempDir(), "Zoë's Ünïcode folder", "REAPER (x64)")
	if err := os.MkdirAll(resource, 0o755); err != nil {
		t.Fatal(err)
	}
	install(t, resource, bridgeFiles("-- startup v1\n"))
	if !Installed(resource) {
		t.Fatal("installed")
	}
}

func TestResourceDir(t *testing.T) {
	env := func(goos, appData, home string) Environment {
		return Environment{GOOS: goos, Home: home, Getenv: func(name string) string {
			if name == "APPDATA" {
				return appData
			}
			return ""
		}}
	}
	cases := []struct {
		name string
		env  Environment
		want string
	}{
		{"windows", env("windows", `C:\Users\N\AppData\Roaming`, ""), filepath.Join(`C:\Users\N\AppData\Roaming`, "REAPER")},
		{"windows without APPDATA", env("windows", "", "/home/n"), ""},
		{"macOS", env("darwin", "", "/Users/n"), filepath.Join("/Users/n", "Library", "Application Support", "REAPER")},
		{"linux", env("linux", "", "/home/n"), filepath.Join("/home/n", ".config", "REAPER")},
		{"linux without home", env("linux", "", ""), ""},
	}
	for _, c := range cases {
		if got := ResourceDir(c.env, ""); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
}

func TestAPortableREAPERKeepsItsResourcesBesideItsProgram(t *testing.T) {
	portable := t.TempDir()
	write(t, filepath.Join(portable, "reaper.ini"), "[REAPER]\n")
	exe := filepath.Join(portable, "reaper.exe")
	if got := ResourceDir(Environment{GOOS: "windows", Getenv: func(string) string { return `C:\Roaming` }}, exe); got != portable {
		t.Fatalf("portable: %q", got)
	}
	installed := t.TempDir()
	if got := ResourceDir(Environment{GOOS: "linux", Home: "/home/n"}, filepath.Join(installed, "reaper")); got != filepath.Join("/home/n", ".config", "REAPER") {
		t.Fatalf("no reaper.ini beside the program: %q", got)
	}
}

func TestSessionsDir(t *testing.T) {
	if SessionsDir("") != "" || SessionsDir("/r") != filepath.Join("/r", "NarrationStudio", "sessions") {
		t.Fatal(SessionsDir("/r"))
	}
}
