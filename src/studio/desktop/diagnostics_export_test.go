package main

import (
	"archive/zip"
	"desktop/internal/trace"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSystemOpenLogFolderOpensTheRunLogsDirectory(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	var opened string
	host.openFolder = func(dir string) error { opened = dir; return nil }

	if _, err := host.SystemOpenLogFolder(); err != nil {
		t.Fatal(err)
	}
	if opened != filepath.Dir(host.runLog.Path()) {
		t.Fatalf("opened %q, want the run log's folder %q", opened, filepath.Dir(host.runLog.Path()))
	}
}

func TestSystemSaveDiagnosticsWritesAZipWithAManifestAndReturnsItsPath(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	host.runLog.Begin("guide").End("ok")
	host.tracer.Emit(trace.AppStart, trace.IDValue("version", "0.0.0-test"))
	destFolder := t.TempDir()
	host.pickDiagnosticsFolder = func() (string, error) { return destFolder, nil }

	raw, err := host.SystemSaveDiagnostics()
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		t.Fatalf("SystemSaveDiagnostics did not return valid JSON: %v (%q)", err, raw)
	}
	if filepath.Dir(result.Path) != destFolder || !strings.HasSuffix(result.Path, ".zip") {
		t.Fatalf("saved to %q, want a .zip inside %q", result.Path, destFolder)
	}
	reader, err := zip.OpenReader(result.Path)
	if err != nil {
		t.Fatalf("the saved bundle is not a zip: %v", err)
	}
	defer func() { _ = reader.Close() }()
	names := map[string]bool{}
	for _, file := range reader.File {
		names[file.Name] = true
	}
	if !names["manifest.json"] || !names["run.jsonl"] {
		t.Errorf("bundle holds %v, want manifest.json and run.jsonl", names)
	}
}

func TestSystemSaveDiagnosticsWithNoFolderChosenSavesNothing(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	host.pickDiagnosticsFolder = func() (string, error) { return "", nil }
	path, err := host.saveDiagnostics()
	if err != nil || path != "" {
		t.Fatalf("saveDiagnostics() = %q, %v, want an empty path and no error when the narrator cancelled", path, err)
	}
}

func TestSystemDiagnosticsPreviewWritesNothingAndSaysWhatIsLeftOut(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	host.pickDiagnosticsFolder = func() (string, error) { t.Fatal("the preview opened the folder picker"); return "", nil }
	raw, err := host.SystemDiagnosticsPreview()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(raw, "sidecar stderr") || !strings.Contains(raw, "bridge.jsonl") {
		t.Errorf("preview = %s, want the excluded sources named", raw)
	}
}

func TestTheLeakTermsNameTheOpenProjectButNotItsGenericFiles(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	folder := filepath.Join(t.TempDir(), "The Obsidian Orchard")
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Orchard Book.docx", "project.json", "notes.log"} {
		if err := os.WriteFile(filepath.Join(folder, name), nil, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	host.mu.Lock()
	host.config.projectFolder = folder
	host.mu.Unlock()
	terms := strings.Join(host.diagnosticsLeakTerms(), "|")
	for _, want := range []string{"The Obsidian Orchard", "Orchard Book"} {
		if !strings.Contains(terms, want) {
			t.Errorf("leak terms %q lack %q", terms, want)
		}
	}
	if strings.Contains(terms, "project|") || strings.Contains(terms, "notes") {
		t.Errorf("leak terms %q include a generic file", terms)
	}
}

func TestAssetsOpenFolderOpensTheAssetFolder(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	base := t.TempDir()
	host.assets = &assetRegistry{base: base}
	var opened string
	host.openFolder = func(dir string) error { opened = dir; return nil }

	if _, err := host.AssetsOpenFolder(); err != nil {
		t.Fatal(err)
	}
	if opened != base {
		t.Fatalf("opened %q, want the asset folder %q", opened, base)
	}
}

func TestAssetsOpenFolderRefusesWithoutACatalog(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	host.assets = nil
	host.openFolder = func(dir string) error { t.Fatalf("opened %q", dir); return nil }

	if _, err := host.AssetsOpenFolder(); err == nil {
		t.Fatal("want a refusal when the asset folder is unknown")
	}
}
