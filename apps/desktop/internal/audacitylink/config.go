// Package audacitylink decides how far the app is from talking to Audacity 3 and what the narrator does next. It reads three
// facts (is Audacity installed and running, is its scripting module turned on in its settings file, does its pipe answer),
// classifies them into one state with a recoverable sentence, and turns the module on in Audacity's settings file when asked.
// It opens no pipe of its own: the probe takes the host's one Audacity client (docs/reference/daw/audacity-3.md, "Linking").
package audacitylink

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ModuleStatus is mod-script-pipe's entry in Audacity's settings file ([Module] mod-script-pipe=<n>). Audacity writes 1 for a
// module the narrator enabled, 0 for one turned off, 2 for "ask" and, on a first start that did not load it, 4 (failed); the
// real-Audacity run saw 4 on every first start whatever the file said (docs/research/real-audacity3-ci-integration.md, finding 4).
type ModuleStatus int

const (
	// ModuleUnknown: no settings file, or no entry for the module. Audacity has never started on this profile.
	ModuleUnknown ModuleStatus = iota
	// ModuleOn: the module is enabled (status 1).
	ModuleOn
	// ModuleOff: the module is present and not enabled (any other status).
	ModuleOff
)

const (
	moduleSection = "Module"
	moduleKey     = "mod-script-pipe"
	moduleEnabled = "1"
)

// SettingsPath is Audacity's settings file under appData (the roaming application-data folder): <appData>\audacity\audacity.cfg.
func SettingsPath(appData string) string {
	if appData == "" {
		return ""
	}
	return filepath.Join(appData, "audacity", "audacity.cfg")
}

// ReadModule reads the module's status from the settings file at path. A missing file is ModuleUnknown, not an error.
func ReadModule(path string) (ModuleStatus, error) {
	if path == "" {
		return ModuleUnknown, nil
	}
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return ModuleUnknown, nil
	}
	if err != nil {
		return ModuleUnknown, err
	}
	defer func() { _ = file.Close() }()
	section := ""
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if name, ok := sectionName(line); ok {
			section = name
			continue
		}
		if section != moduleSection {
			continue
		}
		if key, value, ok := strings.Cut(line, "="); ok && strings.TrimSpace(key) == moduleKey {
			if strings.TrimSpace(value) == moduleEnabled {
				return ModuleOn, nil
			}
			return ModuleOff, nil
		}
	}
	return ModuleUnknown, scanner.Err()
}

func sectionName(line string) (string, bool) {
	if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
		return strings.TrimSpace(line[1 : len(line)-1]), true
	}
	return "", false
}

// ErrAudacityRunning: Audacity writes its settings file when it closes, so a change made while it runs is lost.
var ErrAudacityRunning = errors.New("close Audacity first: it saves its settings when it closes, so a change made now would be lost")

// EnableModule sets [Module] mod-script-pipe=1 in the settings file at path and leaves every other line as it is. The file must
// already exist: Audacity makes it on its first start, and a profile it has never seen is what the first-start steps are for. The
// write goes through a temporary file in the same folder and a rename, so a failure leaves the narrator's file as it was.
func EnableModule(path string, audacityRunning bool) error {
	if audacityRunning {
		return ErrAudacityRunning
	}
	if path == "" {
		return errors.New("this computer has no Audacity settings folder")
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return errors.New("Audacity has not made its settings file yet: start Audacity once, close it, then turn scripting on")
	}
	if err != nil {
		return err
	}
	return os.WriteFile(path, withModuleEnabled(raw), 0o600) //nolint:gosec // G306: the narrator's own settings file; 0600 only applies when the file is created
}

// withModuleEnabled returns raw with the module's entry set to enabled, adding the entry (and its section) when absent. Line
// endings are kept as the file has them.
func withModuleEnabled(raw []byte) []byte {
	text := string(raw)
	eol := "\n"
	if strings.Contains(text, "\r\n") {
		eol = "\r\n"
	}
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	section, sectionAt := "", -1
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if name, ok := sectionName(trimmed); ok {
			section = name
			if name == moduleSection {
				sectionAt = i
			}
			continue
		}
		if section == moduleSection {
			if key, _, ok := strings.Cut(trimmed, "="); ok && strings.TrimSpace(key) == moduleKey {
				lines[i] = fmt.Sprintf("%s=%s", moduleKey, moduleEnabled)
				return []byte(strings.Join(lines, eol))
			}
		}
	}
	entry := fmt.Sprintf("%s=%s", moduleKey, moduleEnabled)
	if sectionAt >= 0 {
		lines = append(lines[:sectionAt+1], append([]string{entry}, lines[sectionAt+1:]...)...)
		return []byte(strings.Join(lines, eol))
	}
	trimmed := strings.TrimRight(strings.Join(lines, "\n"), "\n")
	if trimmed != "" {
		trimmed += "\n"
	}
	return []byte(strings.ReplaceAll(trimmed+"["+moduleSection+"]\n"+entry+"\n", "\n", eol))
}
