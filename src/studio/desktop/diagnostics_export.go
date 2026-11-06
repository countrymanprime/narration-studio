package main

import (
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"strings"
	"time"

	"desktop/internal/diagexport"
	"desktop/internal/update"
)

// maxLeakFileNames bounds how many names from the project folder the leak check learns.
const maxLeakFileNames = 500

// SystemOpenLogFolder shows the run log's folder (logs/run.jsonl, trace.jsonl, host.log and logs/runs/) in the file manager, the
// way TeleprompterStop's sibling bindings already do for the update cache (update_install.go's showDownloadedUpdate).
func (h *Host) SystemOpenLogFolder() (string, error) {
	dir := filepath.Dir(h.runLog.Path())
	if h.openFolder != nil {
		return encodeBinding(nil, h.openFolder(dir))
	}
	return encodeBinding(nil, update.OpenFolder(dir))
}

// SystemDiagnosticsPreview answers what a saved diagnostics bundle would hold: each file with its size, what is left out and why,
// and what the leak check dropped. Nothing is written. The narrator reads it before saving (docs/prds/activity-trace.prd.md).
func (h *Host) SystemDiagnosticsPreview() (string, error) {
	bundle, err := h.buildDiagnostics()
	if err != nil {
		return encodeBinding(nil, err)
	}
	return encodeBinding(bundle.Preview(), nil)
}

// SystemSaveDiagnostics saves the diagnostics bundle (a zip with a manifest) in a folder the narrator chooses and answers its path,
// which the UI copies to the clipboard. The answer's path is empty when the narrator cancelled the folder picker. Nothing is sent
// anywhere: the narrator attaches the file to an issue by hand.
func (h *Host) SystemSaveDiagnostics() (string, error) {
	path, err := h.saveDiagnostics()
	return encodeBinding(map[string]any{"path": path}, err)
}

func (h *Host) saveDiagnostics() (string, error) {
	bundle, err := h.buildDiagnostics()
	if err != nil {
		return "", err
	}
	pick := h.pickDiagnosticsFolder
	if pick == nil {
		pick = func() (string, error) { return pickFolder("Save diagnostics to") }
	}
	folder, err := pick()
	if err != nil {
		return "", err
	}
	if folder == "" {
		return "", nil
	}
	dest := filepath.Join(folder, fmt.Sprintf("diagnostics-%s.zip", h.diagnosticsClock()().UTC().Format("20060102T150405")))
	if err := bundle.WriteZip(dest); err != nil {
		return "", err
	}
	return dest, nil
}

func (h *Host) diagnosticsClock() func() time.Time {
	if h.diagnosticsNow != nil {
		return h.diagnosticsNow
	}
	return time.Now
}

func (h *Host) buildDiagnostics() (*diagexport.Bundle, error) {
	return diagexport.Build(diagexport.Options{
		Tracer: h.tracer, TracePath: h.tracer.Path(), RunLogPath: h.runLog.Path(), AppVersion: h.version,
		LeakTerms: h.diagnosticsLeakTerms(), Now: h.diagnosticsClock(),
	})
}

// diagnosticsLeakTerms are the strings no line of an export may contain: the account's user name, the home folder's name, the open
// project's folder name and the names of the files in it (without their extensions, and leaving out folders and JSON or log files).
func (h *Host) diagnosticsLeakTerms() []string {
	var terms []string
	if account, err := user.Current(); err == nil {
		name := account.Username
		if slash := strings.LastIndexAny(name, `\/`); slash >= 0 {
			name = name[slash+1:]
		}
		terms = append(terms, name, account.Name)
	}
	if home, err := os.UserHomeDir(); err == nil {
		terms = append(terms, filepath.Base(home))
	}
	terms = append(terms, os.Getenv("USERNAME"), os.Getenv("USER"))
	folder := h.services().config.projectFolder
	if folder == "" {
		return terms
	}
	terms = append(terms, filepath.Base(folder))
	if entries, err := os.ReadDir(folder); err == nil {
		for i, entry := range entries {
			if i >= maxLeakFileNames {
				break
			}
			name := entry.Name()
			// Generic file names (manifest.json, a log) say nothing about the project and would drop ordinary lines.
			if entry.IsDir() || strings.HasSuffix(name, ".json") || strings.HasSuffix(name, ".jsonl") || strings.HasSuffix(name, ".log") {
				continue
			}
			terms = append(terms, strings.TrimSuffix(name, filepath.Ext(name)))
		}
	}
	return terms
}
