package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"desktop/internal/hostlog"
	"desktop/internal/legacyname"
)

// migrateUserFolders moves the per-user folders an install from before the rename left (settings, logs, downloaded models, the
// update cache, the WebView2 profile) to their new names, once, before anything reads them. A folder that cannot be moved is left
// where it was and the host log says why; the app then starts with that folder empty and the next start tries again.
func migrateUserFolders() {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		if profile := os.Getenv("USERPROFILE"); profile != "" {
			appData = filepath.Join(profile, "AppData", "Roaming")
		}
	}
	userCache, _ := os.UserCacheDir()
	// Wails names the WebView2 profile after the program's file; only Windows has one.
	webview := ""
	if runtime.GOOS == "windows" {
		if executable, err := os.Executable(); err == nil {
			webview = filepath.Base(executable)
		}
	}
	var lines []string
	err := legacyname.MigrateUserFolders(appData, userCache, webview, func(format string, args ...any) {
		lines = append(lines, fmt.Sprintf(format, args...))
	})
	if err != nil {
		lines = append(lines, err.Error())
	}
	if len(lines) == 0 {
		return
	}
	logger := hostlog.New(hostlog.DefaultPath(), 0)
	for _, line := range lines {
		_ = logger.Report("rename", line)
	}
}

// migrateProjectFolder moves an opened project's data folder to its new name. It answers a sentence for the narrator when the
// move failed: the project must then not be opened, or the app would start an empty data folder beside the narrator's own.
func migrateProjectFolder(project string, log *hostlog.Log) string {
	err := legacyname.MigrateProject(project, func(format string, args ...any) {
		if log != nil {
			_ = log.Report("rename", fmt.Sprintf(format, args...))
		}
	})
	if err == nil {
		return ""
	}
	if log != nil {
		_ = log.Report("rename", err.Error())
	}
	return fmt.Sprintf("This project's data folder could not be moved to its new name, so the project was not opened and nothing in it was changed: %v. Close any program that may be using files in the project folder, then open the project again.", err)
}

// syncLegacyLauncher keeps the REAPER scripts current in the launcher folder from before the rename, when it is still there: a
// narrator's REAPER action names the launcher by its path in that folder. It also writes the launcher's old file name as a shim
// that runs the launcher, for an action added under that name.
func syncLegacyLauncher(sync func(dir string) error, userCache string) error {
	dir, ok := legacyname.LauncherDir(userCache)
	if !ok {
		return nil
	}
	if err := sync(dir); err != nil {
		return err
	}
	name, content := legacyname.LauncherShim()
	return writeIfChanged(filepath.Join(dir, name), content)
}
