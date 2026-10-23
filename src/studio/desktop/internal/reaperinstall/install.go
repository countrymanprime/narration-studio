// Package reaperinstall puts the app's REAPER bridge into REAPER's own resource folder and makes REAPER start it at every launch,
// so the narrator never loads or runs an action for the app to see REAPER.
//
// What it writes, all under REAPER's resource path:
//   - Scripts/NarrationStudio/: the bridge's Lua files, the app's path for the launcher, and install.json, the record of what this
//     package wrote (version and one SHA-256 per file). A file whose content is not the one install.json records (the narrator
//     edited it, or the record is missing) is copied to Scripts/NarrationStudio/backup/<time>/ before it is replaced.
//   - Scripts/__startup.lua, which REAPER runs at startup: one marked block that runs NarrationStudio_Startup.lua. Every line outside
//     the markers is the narrator's and is kept byte for byte; the file is copied to __startup.lua.narration-studio-<time>.bak the
//     first time the block is added to a file that already existed.
//
// It never touches reaper.ini or reaper-kb.ini: the startup script adds the launcher to the action list from inside REAPER
// (AddRemoveReaScript), so nothing is written to a file REAPER rewrites when it closes. Seen in REAPER 7.82 on Linux:
// docs/research/reaper-startup-bridge-2026-10-23.md.
package reaperinstall

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	// Folder is the app's folder under <resource>/Scripts.
	Folder = "NarrationStudio"
	// StartupScript is the file the __startup.lua block runs.
	StartupScript = "NarrationStudio_Startup.lua"
	// LauncherScript is the action that opens the app from REAPER.
	LauncherScript = "NarrationStudio_Launcher.lua"
	// AppPathFile holds the app's executable path; the launcher reads it.
	AppPathFile = "narration-studio-app-path.txt"
	// ManifestFile records what Install wrote.
	ManifestFile = "install.json"
	// startupFile is the script REAPER runs at startup from its Scripts folder.
	startupFile  = "__startup.lua"
	backupFolder = "backup"

	blockBegin = "-- >>> Narration Studio: the app adds and updates the lines down to the end marker; every other line is yours >>>"
	blockEnd   = "-- <<< Narration Studio <<<"
)

// startupBlock runs the startup script in a protected call, so a missing or broken bridge never stops the narrator's own startup
// lines below it from running. The path is built from REAPER's resource path at run time, so a moved resource folder still works.
var startupBlock = blockBegin + `
do
  local ok, failure = pcall(dofile, reaper.GetResourcePath() .. '/Scripts/` + Folder + `/` + StartupScript + `')
  if not ok then
    reaper.ShowConsoleMsg('Narration Studio could not start its REAPER bridge: ' .. tostring(failure) .. '\n')
  end
end
` + blockEnd + "\n"

// ErrNoResourceDir is Install's refusal when REAPER's resource folder does not exist: REAPER has not been started on this computer
// with that folder yet, and the app does not create REAPER's configuration for it.
var ErrNoResourceDir = errors.New("REAPER's resource folder does not exist yet")

// Options says what to install and where.
type Options struct {
	// ResourceDir is REAPER's resource path (ResourceDir).
	ResourceDir string
	// Files holds the bridge's Lua files at its root; every *.lua file in it is installed.
	Files fs.FS
	// Executable is the app's program path, written for the launcher; "" leaves the file as it is.
	Executable string
	// Version is the app's version, recorded in install.json.
	Version string
	// Now stamps backup names; nil means time.Now.
	Now func() time.Time
}

// Result says what Install did.
type Result struct {
	// Dir is Scripts/NarrationStudio.
	Dir string `json:"dir"`
	// Launcher and Startup are the installed launcher and startup script.
	Launcher string `json:"launcher"`
	Startup  string `json:"startup"`
	Version  string `json:"version"`
	// Written names the files this run wrote or removed; empty when everything was already current.
	Written []string `json:"written"`
	// BackedUp names the copies made of files that were not as this package last wrote them.
	BackedUp []string `json:"backedUp"`
	// StartupHooked is true once __startup.lua holds the block.
	StartupHooked bool `json:"startupHooked"`
}

type manifest struct {
	Version string            `json:"version"`
	Files   map[string]string `json:"files"`
}

// Install writes the bridge and the startup block. It is idempotent: a second run with the same files writes nothing. It refuses
// when the resource folder does not exist (ErrNoResourceDir).
func Install(options Options) (Result, error) {
	if options.ResourceDir == "" {
		return Result{}, ErrNoResourceDir
	}
	if info, err := os.Stat(options.ResourceDir); err != nil || !info.IsDir() {
		return Result{}, ErrNoResourceDir
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	stamp := now().UTC().Format("20060102-150405")
	scripts := filepath.Join(options.ResourceDir, "Scripts")
	dir := filepath.Join(scripts, Folder)
	result := Result{
		Dir: dir, Launcher: filepath.Join(dir, LauncherScript), Startup: filepath.Join(dir, StartupScript), Version: options.Version,
		Written: []string{}, BackedUp: []string{},
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return result, err
	}
	previous := readManifest(filepath.Join(dir, ManifestFile))
	sources, err := luaFiles(options.Files)
	if err != nil {
		return result, err
	}
	if _, ok := sources[StartupScript]; !ok {
		return result, fmt.Errorf("the bridge files hold no %s", StartupScript)
	}
	next := manifest{Version: options.Version, Files: map[string]string{}}
	backup := func(name string) error {
		target := filepath.Join(dir, backupFolder, stamp, name)
		if err := copyFile(filepath.Join(dir, name), target); err != nil {
			return err
		}
		result.BackedUp = append(result.BackedUp, target)
		return nil
	}
	for _, name := range sortedKeys(sources) {
		content := sources[name]
		next.Files[name] = digest(content)
		target := filepath.Join(dir, name)
		existing, readErr := os.ReadFile(target)
		if readErr == nil && bytes.Equal(existing, content) {
			continue
		}
		if readErr == nil && digest(existing) != previous.Files[name] {
			if err := backup(name); err != nil {
				return result, err
			}
		}
		if err := writeAtomic(target, content); err != nil {
			return result, err
		}
		result.Written = append(result.Written, name)
	}
	// A file an earlier version installed and this one no longer ships is removed, unless it changed since.
	for _, name := range sortedKeys(previous.Files) {
		if _, still := sources[name]; still {
			continue
		}
		target := filepath.Join(dir, name)
		existing, readErr := os.ReadFile(target)
		if readErr != nil {
			continue
		}
		if digest(existing) == previous.Files[name] {
			if err := os.Remove(target); err != nil {
				return result, err
			}
			result.Written = append(result.Written, name)
		}
	}
	if options.Executable != "" {
		if changed, err := writeIfChanged(filepath.Join(dir, AppPathFile), []byte(options.Executable+"\n")); err != nil {
			return result, err
		} else if changed {
			result.Written = append(result.Written, AppPathFile)
		}
	}
	encoded, err := json.MarshalIndent(next, "", "  ")
	if err != nil {
		return result, err
	}
	if changed, err := writeIfChanged(filepath.Join(dir, ManifestFile), append(encoded, '\n')); err != nil {
		return result, err
	} else if changed {
		result.Written = append(result.Written, ManifestFile)
	}
	changed, backedUp, err := hookStartup(filepath.Join(scripts, startupFile), stamp)
	if err != nil {
		return result, err
	}
	result.StartupHooked = true
	if backedUp != "" {
		result.BackedUp = append(result.BackedUp, backedUp)
	}
	if changed {
		result.Written = append(result.Written, filepath.Join("..", startupFile))
	}
	return result, nil
}

// Installed reports whether resourceDir holds the startup block and the startup script, the two things REAPER needs to start the
// bridge when it opens. It writes nothing.
func Installed(resourceDir string) bool {
	if resourceDir == "" {
		return false
	}
	scripts := filepath.Join(resourceDir, "Scripts")
	if _, err := os.Stat(filepath.Join(scripts, Folder, StartupScript)); err != nil {
		return false
	}
	content, err := os.ReadFile(filepath.Join(scripts, startupFile))
	if err != nil {
		return false
	}
	_, _, found := splitBlock(string(content))
	return found
}

// hookStartup puts the block in __startup.lua: a new file holds only the block; an existing one keeps every line outside the
// markers and gets the block at its end, after a backup the first time; a block already there is rewritten only when it differs.
func hookStartup(path, stamp string) (changed bool, backedUp string, err error) {
	existing, readErr := os.ReadFile(path)
	if errors.Is(readErr, fs.ErrNotExist) {
		changed, err = writeIfChanged(path, []byte(startupBlock))
		return changed, "", err
	}
	if readErr != nil {
		return false, "", readErr
	}
	text := string(existing)
	before, after, found := splitBlock(text)
	var next string
	if found {
		next = before + startupBlock + after
	} else {
		backedUp = path + ".narration-studio-" + stamp + ".bak"
		if err := copyFile(path, backedUp); err != nil {
			return false, "", err
		}
		separator := ""
		if text != "" && !strings.HasSuffix(text, "\n") {
			separator = "\n"
		}
		next = text + separator + startupBlock
	}
	changed, err = writeIfChanged(path, []byte(next))
	return changed, backedUp, err
}

// splitBlock returns the text before the block and after it (the end marker's line included in neither) when both markers are
// present in order; a begin marker with no end marker is not a block, so the narrator's file is never cut short.
func splitBlock(text string) (before, after string, found bool) {
	start := strings.Index(text, blockBegin)
	if start < 0 {
		return text, "", false
	}
	end := strings.Index(text[start:], blockEnd)
	if end < 0 {
		return text, "", false
	}
	end += start + len(blockEnd)
	if end < len(text) && text[end] == '\r' {
		end++
	}
	if end < len(text) && text[end] == '\n' {
		end++
	}
	return text[:start], text[end:], true
}

func luaFiles(source fs.FS) (map[string][]byte, error) {
	if source == nil {
		return nil, errors.New("no bridge files to install")
	}
	entries, err := fs.ReadDir(source, ".")
	if err != nil {
		return nil, err
	}
	files := map[string][]byte{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".lua") {
			continue
		}
		content, err := fs.ReadFile(source, entry.Name())
		if err != nil {
			return nil, err
		}
		files[entry.Name()] = content
	}
	return files, nil
}

func readManifest(path string) manifest {
	recorded := manifest{Files: map[string]string{}}
	content, err := os.ReadFile(path)
	if err != nil {
		return recorded
	}
	if json.Unmarshal(content, &recorded) != nil || recorded.Files == nil {
		return manifest{Files: map[string]string{}}
	}
	return recorded
}

func digest(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}

func sortedKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func writeIfChanged(path string, content []byte) (bool, error) {
	if existing, err := os.ReadFile(path); err == nil && bytes.Equal(existing, content) {
		return false, nil
	}
	return true, writeAtomic(path, content)
}

// writeAtomic writes through a temporary file beside path, so REAPER never reads a half-written script.
func writeAtomic(path string, content []byte) error {
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, content, 0o644); err != nil { //nolint:gosec // G306: REAPER, the narrator's own program, reads these scripts
		return err
	}
	if err := os.Rename(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	return nil
}

func copyFile(source, target string) error {
	content, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return os.WriteFile(target, content, 0o600)
}
