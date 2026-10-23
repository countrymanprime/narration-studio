package legacyname

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func read(t *testing.T, path string) string {
	t.Helper()
	bytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	return string(bytes)
}

func collect(lines *[]string) Logf {
	return func(format string, args ...any) { *lines = append(*lines, format) }
}

// A narrator's machine as an old build left it: settings and logs, downloaded models and the REAPER launcher, the WebView2 profile.
func fakeOldInstall(t *testing.T) (appData, cache string) {
	t.Helper()
	root := t.TempDir()
	appData, cache = filepath.Join(root, "Roaming"), filepath.Join(root, "Local")
	write(t, filepath.Join(appData, oldDirName, "global-settings.json"), `{"General":{"narrator_name":"Ada 🦎"}}`)
	write(t, filepath.Join(appData, oldDirName, "logs", "host.log"), "line\n")
	write(t, filepath.Join(appData, oldExecutable, "EBWebView", "Local Storage", "leveldb", "000003.log"), "prefs")
	write(t, filepath.Join(cache, oldDirName, "assets", "whisper", "model.bin"), strings.Repeat("w", 4096))
	write(t, filepath.Join(cache, oldDirName, "reaper", oldLauncherFile), "-- old launcher")
	return appData, cache
}

func TestUserFoldersMoveToTheNewNames(t *testing.T) {
	appData, cache := fakeOldInstall(t)
	var lines []string
	if err := MigrateUserFolders(appData, cache, "narration-studio.exe", collect(&lines)); err != nil {
		t.Fatal(err)
	}
	if got := read(t, filepath.Join(appData, newDirName, "global-settings.json")); !strings.Contains(got, "Ada 🦎") {
		t.Fatalf("settings were not carried over: %q", got)
	}
	if got := read(t, filepath.Join(appData, "narration-studio.exe", "EBWebView", "Local Storage", "leveldb", "000003.log")); got != "prefs" {
		t.Fatalf("the WebView2 profile was not carried over: %q", got)
	}
	if got := read(t, filepath.Join(cache, newDirName, "assets", "whisper", "model.bin")); len(got) != 4096 {
		t.Fatalf("the downloaded model was not carried over: %d bytes", len(got))
	}
	if exists(filepath.Join(appData, oldDirName)) || exists(filepath.Join(appData, oldExecutable)) {
		t.Fatal("an old settings folder is still there after a complete move")
	}
	// REAPER names the launcher by its old absolute path, so that folder is kept for the app to refresh.
	if dir, ok := LauncherDir(cache); !ok || dir != filepath.Join(cache, oldDirName, "reaper") {
		t.Fatalf("LauncherDir = %q, %v; want the old launcher folder kept", dir, ok)
	}
	if len(lines) == 0 {
		t.Fatal("a move that happened was not logged")
	}
}

func TestAnAlreadyMigratedMachineIsLeftAlone(t *testing.T) {
	appData, cache := fakeOldInstall(t)
	if err := MigrateUserFolders(appData, cache, "narration-studio.exe", func(string, ...any) {}); err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(appData, newDirName, "global-settings.json"), `{"changed":"after the move"}`)
	var lines []string
	if err := MigrateUserFolders(appData, cache, "narration-studio.exe", collect(&lines)); err != nil {
		t.Fatal(err)
	}
	if got := read(t, filepath.Join(appData, newDirName, "global-settings.json")); got != `{"changed":"after the move"}` {
		t.Fatalf("a second run changed the settings: %q", got)
	}
	if len(lines) != 0 {
		t.Fatalf("a second run did something: %v", lines)
	}
}

func TestANewInstallHasNothingToMove(t *testing.T) {
	root := t.TempDir()
	if err := MigrateUserFolders(filepath.Join(root, "a"), filepath.Join(root, "b"), "narration-studio.exe", func(string, ...any) {}); err != nil {
		t.Fatal(err)
	}
	if exists(filepath.Join(root, "a")) || exists(filepath.Join(root, "b")) {
		t.Fatal("a machine with no old folders got new ones")
	}
	if _, ok := LauncherDir(filepath.Join(root, "b")); ok {
		t.Fatal("LauncherDir found a folder that was never there")
	}
	if _, ok := LauncherDir(""); ok {
		t.Fatal("LauncherDir found a folder with no cache folder")
	}
}

func TestAnInterruptedCopyIsFinished(t *testing.T) {
	appData, _ := fakeOldInstall(t)
	old, current := filepath.Join(appData, oldDirName), filepath.Join(appData, newDirName)
	// A run that copied one file, then stopped before it could remove the old folder; and a half-written temporary copy.
	write(t, filepath.Join(current, "global-settings.json"), read(t, filepath.Join(old, "global-settings.json")))
	write(t, current+partialSuffix+string(filepath.Separator)+"junk", "x")
	if err := MigrateUserFolders(appData, "", "", func(string, ...any) {}); err != nil {
		t.Fatal(err)
	}
	if got := read(t, filepath.Join(current, "logs", "host.log")); got != "line\n" {
		t.Fatalf("the file the interrupted run had not copied is missing: %q", got)
	}
	if exists(old) {
		t.Fatal("the old folder was kept although everything in it was copied")
	}
}

func TestADifferingFileKeepsTheOldFolder(t *testing.T) {
	appData, _ := fakeOldInstall(t)
	old, current := filepath.Join(appData, oldDirName), filepath.Join(appData, newDirName)
	write(t, filepath.Join(current, "global-settings.json"), `{"written":"by the new build first"}`)
	var lines []string
	if err := MigrateUserFolders(appData, "", "", collect(&lines)); err != nil {
		t.Fatal(err)
	}
	if got := read(t, filepath.Join(current, "global-settings.json")); got != `{"written":"by the new build first"}` {
		t.Fatalf("the new folder's own file was overwritten: %q", got)
	}
	if got := read(t, filepath.Join(current, "logs", "host.log")); got != "line\n" {
		t.Fatalf("the file only the old folder had was not copied: %q", got)
	}
	if got := read(t, filepath.Join(old, "global-settings.json")); !strings.Contains(got, "Ada") {
		t.Fatalf("the old folder's differing file was lost: %q", got)
	}
	if len(lines) == 0 || !strings.HasPrefix(lines[len(lines)-1], "kept") {
		t.Fatalf("keeping the old folder was not logged: %v", lines)
	}
}

func TestAFailedMoveLeavesTheOldFolderUntouched(t *testing.T) {
	project := t.TempDir()
	old := filepath.Join(project, oldDirName)
	write(t, filepath.Join(old, "manuscript", "manuscript.json"), `{"source":{"storedPath":"`+oldDirName+`/manuscript/sources/a/b.md"}}`)
	// Something that is not a folder holds the new name, so nothing can be moved or copied into it.
	write(t, filepath.Join(project, newDirName), "not a folder")
	if err := MigrateProject(project, func(string, ...any) {}); err == nil {
		t.Fatal("a move that could not happen reported success")
	}
	entries, err := os.ReadDir(old)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "manuscript" {
		t.Fatalf("the old folder was changed: %v", entries)
	}
	if got := read(t, filepath.Join(old, "manuscript", "manuscript.json")); !strings.Contains(got, oldDirName+"/manuscript") {
		t.Fatalf("the old folder's file was changed: %q", got)
	}
}

func TestAProjectMoveRewritesTheSavedPaths(t *testing.T) {
	project := filepath.Join(t.TempDir(), "My Book — كتاب")
	old := filepath.Join(project, oldDirName)
	write(t, filepath.Join(old, "manuscript", "manuscript.json"), `{"source":{"storedPath":"`+oldDirName+`/manuscript/sources/a/b.md"},"text":"the `+oldDirName+` story"}`)
	write(t, filepath.Join(old, "proofing", "renders.json"), `{"path":"C:\\Book\\`+oldDirName+`\\proofing\\1.wav","other":"D:/`+oldDirName+`/`+oldDirName+`/x"}`)
	write(t, filepath.Join(old, "mastering", "run", "master.wav"), "RIFF")
	if err := MigrateProject(project, func(string, ...any) {}); err != nil {
		t.Fatal(err)
	}
	current := filepath.Join(project, newDirName)
	if got := read(t, filepath.Join(current, "manuscript", "manuscript.json")); got != `{"source":{"storedPath":"`+newDirName+`/manuscript/sources/a/b.md"},"text":"the `+oldDirName+` story"}` {
		t.Fatalf("manuscript.json = %s", got)
	}
	if got := read(t, filepath.Join(current, "proofing", "renders.json")); got != `{"path":"C:\\Book\\`+newDirName+`\\proofing\\1.wav","other":"D:/`+newDirName+`/`+newDirName+`/x"}` {
		t.Fatalf("renders.json = %s", got)
	}
	if got := read(t, filepath.Join(current, "mastering", "run", "master.wav")); got != "RIFF" {
		t.Fatalf("an audio file was changed: %q", got)
	}
	if exists(old) || exists(filepath.Join(current, rewritePendingTag)) {
		t.Fatal("the old folder or the pending tag is still there")
	}
}

func TestARewriteCutShortIsFinishedNextTime(t *testing.T) {
	project := t.TempDir()
	current := filepath.Join(project, newDirName)
	write(t, filepath.Join(current, "a.json"), `{"p":"`+oldDirName+`/x"}`)
	write(t, filepath.Join(current, rewritePendingTag), "")
	if err := MigrateProject(project, func(string, ...any) {}); err != nil {
		t.Fatal(err)
	}
	if got := read(t, filepath.Join(current, "a.json")); got != `{"p":"`+newDirName+`/x"}` {
		t.Fatalf("a.json = %s", got)
	}
	if exists(filepath.Join(current, rewritePendingTag)) {
		t.Fatal("the pending tag is still there")
	}
	// Without the tag nothing is rewritten again: a file the narrator wrote later is left as it is.
	write(t, filepath.Join(current, "b.json"), `{"p":"`+oldDirName+`/y"}`)
	if err := MigrateProject(project, func(string, ...any) {}); err != nil {
		t.Fatal(err)
	}
	if got := read(t, filepath.Join(current, "b.json")); got != `{"p":"`+oldDirName+`/y"}` {
		t.Fatalf("b.json was rewritten without a pending move: %s", got)
	}
}

func TestProjectDataDirReadsAnUnopenedProject(t *testing.T) {
	project := t.TempDir()
	if got := ProjectDataDir(project); got != filepath.Join(project, newDirName) {
		t.Fatalf("a project with no data folder: %s", got)
	}
	write(t, filepath.Join(project, oldDirName, "project.json"), "{}")
	if got := ProjectDataDir(project); got != filepath.Join(project, oldDirName) {
		t.Fatalf("a project not opened since the rename: %s", got)
	}
	write(t, filepath.Join(project, newDirName, "project.json"), "{}")
	if got := ProjectDataDir(project); got != filepath.Join(project, newDirName) {
		t.Fatalf("a migrated project: %s", got)
	}
	if err := MigrateProject("", func(string, ...any) {}); err != nil {
		t.Fatal(err)
	}
}

func TestOldNamesInsideFiles(t *testing.T) {
	ext := map[string]string{oldExtKeyPrefix + "line_id": "old", oldExtKeyPrefix + "cuts": "1", newExtKeyPrefix + "cuts": "new", "other": "x"}
	RenameExtKeys(ext)
	want := map[string]string{newExtKeyPrefix + "line_id": "old", newExtKeyPrefix + "cuts": "new", "other": "x"}
	if len(ext) != len(want) {
		t.Fatalf("RenameExtKeys = %v", ext)
	}
	for key, value := range want {
		if ext[key] != value {
			t.Fatalf("RenameExtKeys = %v, want %v", ext, want)
		}
	}
	RenameExtKeys(nil)

	for name, want := range map[string]string{
		oldTrackPrefix:                          newTrackPrefix,
		oldTrackPrefix + " backup {A}":          newTrackPrefix + " backup {A}",
		oldTrackPrefix + "ish":                  oldTrackPrefix + "ish",
		"Narrator's track":                      "Narrator's track",
		"":                                      "",
		newTrackPrefix + " take t from 1.000 s": newTrackPrefix + " take t from 1.000 s",
	} {
		if got := TrackName(name); got != want {
			t.Fatalf("TrackName(%q) = %q, want %q", name, got, want)
		}
	}

	if got := ProjectRelative(oldDirName + "/manuscript/sources/a.md"); got != newDirName+"/manuscript/sources/a.md" {
		t.Fatalf("ProjectRelative = %s", got)
	}
	if got := ProjectRelative("Recordings/a.wav"); got != "Recordings/a.wav" {
		t.Fatalf("ProjectRelative changed another path: %s", got)
	}
	if !IsProjectMarker(oldProjectMarker) || IsProjectMarker("") {
		t.Fatal("IsProjectMarker")
	}
	name, content := LauncherShim()
	if name != oldLauncherFile || !strings.Contains(string(content), newLauncherFile) {
		t.Fatalf("LauncherShim = %s, %s", name, content)
	}
}
