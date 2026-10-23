package reaperinstall

import (
	"os"
	"path/filepath"
)

// Environment is what ResourceDir reads, so a test can give it a fake computer.
type Environment struct {
	// GOOS is runtime.GOOS.
	GOOS string
	// Getenv reads an environment variable (APPDATA on Windows).
	Getenv func(string) string
	// Home is the user's home folder (os.UserHomeDir).
	Home string
}

// ResourceDir is REAPER's resource path: the folder REAPER's GetResourcePath() answers, which holds reaper.ini and Scripts.
//   - A portable REAPER keeps reaper.ini beside its program, and that folder is the resource path. executable is the REAPER program
//     the app resolved ("" when it found none).
//   - Otherwise REAPER's per-user default: %APPDATA%\REAPER on Windows, ~/Library/Application Support/REAPER on macOS and
//     ~/.config/REAPER on Linux.
//
// The answer is "" when the environment does not say where that is. It does not check that the folder exists; Install does.
func ResourceDir(env Environment, executable string) string {
	if executable != "" {
		portable := filepath.Dir(executable)
		if info, err := os.Stat(filepath.Join(portable, "reaper.ini")); err == nil && !info.IsDir() {
			return portable
		}
	}
	switch env.GOOS {
	case "windows":
		if env.Getenv == nil {
			return ""
		}
		if appData := env.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, "REAPER")
		}
		return ""
	case "darwin":
		if env.Home == "" {
			return ""
		}
		return filepath.Join(env.Home, "Library", "Application Support", "REAPER")
	default:
		if env.Home == "" {
			return ""
		}
		return filepath.Join(env.Home, ".config", "REAPER")
	}
}

// SessionsDir is where the bridge makes its session folders under a resource path (narration_ui_bridge.lua's new_session_dir).
func SessionsDir(resourceDir string) string {
	if resourceDir == "" {
		return ""
	}
	return filepath.Join(resourceDir, Folder, "sessions")
}
