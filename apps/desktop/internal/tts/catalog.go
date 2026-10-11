// Package tts owns the catalog of approved Piper voices and their install
// lifecycle (install, verify, repair, remove) under one cache root. Downloads
// and verification are delegated to internal/assets; synthesis is not here.
package tts

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/assets"
)

// File is one downloadable file of a voice, as internal/assets describes it.
type File = assets.File

// Voice is one catalog entry: its identity, licence and provenance, and the files that make it up.
type Voice struct {
	ID            string `json:"id"`
	Provider      string `json:"provider"`
	DisplayName   string `json:"displayName"`
	Locale        string `json:"locale"`
	Version       string `json:"version"`
	Publisher     string `json:"publisher"`
	License       string `json:"license"`
	LicenseURL    string `json:"licenseUrl"`
	ModelCardURL  string `json:"modelCardUrl"`
	ProvenanceURL string `json:"provenanceUrl"`
	Attribution   string `json:"attribution"`
	Files         []File `json:"files"`
}

// Catalog is the approved-voice catalog file as stored on disk.
type Catalog struct {
	Version int     `json:"catalogVersion"`
	Voices  []Voice `json:"voices"`
}

// Manager installs and inspects the voices of one catalog under one cache root.
type Manager struct {
	catalog Catalog
	root    string
}

// New reads the catalog at catalogPath; voices install under root.
func New(catalogPath, root string) (*Manager, error) {
	bytes, err := os.ReadFile(catalogPath)
	if err != nil {
		return nil, err
	}
	var c Catalog
	if err = json.Unmarshal(bytes, &c); err != nil {
		return nil, err
	}
	return &Manager{catalog: c, root: root}, nil
}

// Catalog is the catalog as the UI reads it: each voice with its download size and install state.
func (m *Manager) Catalog() map[string]any {
	voices := make([]map[string]any, 0, len(m.catalog.Voices))
	for _, v := range m.catalog.Voices {
		var size int64
		for _, file := range v.Files {
			size += file.Size
		}
		voices = append(voices, map[string]any{"id": v.ID, "provider": v.Provider, "displayName": v.DisplayName, "locale": v.Locale, "version": v.Version, "publisher": v.Publisher, "license": v.License, "licenseUrl": v.LicenseURL, "modelCardUrl": v.ModelCardURL, "provenanceUrl": v.ProvenanceURL, "attribution": v.Attribution, "downloadSize": size, "installState": m.State(v)})
	}
	return map[string]any{"catalogVersion": m.catalog.Version, "voices": voices}
}

// Voices is every approved voice, in catalog order.
func (m *Manager) Voices() []Voice { return append([]Voice(nil), m.catalog.Voices...) }

// InstallDir is where a voice is (or will be) installed, whatever its state.
func (m *Manager) InstallDir(id string) string {
	v, _ := m.Voice(id)
	return assets.Dir(m.root, v.Provider, v.ID, v.Version)
}

// Voice looks a voice up by id.
func (m *Manager) Voice(id string) (Voice, bool) {
	for _, v := range m.catalog.Voices {
		if v.ID == id {
			return v, true
		}
	}
	return Voice{}, false
}

// Paths returns the model and config file paths of an installed voice, or an error when it is unknown, not installed or incomplete.
func (m *Manager) Paths(id string) (string, string, error) {
	v, ok := m.Voice(id)
	if !ok {
		return "", "", fmt.Errorf("the selected voice is not in the approved catalog")
	}
	// The first use of a session reads the voice in full, so a file damaged since the install is found here and not by Piper failing on it.
	if assets.Ready(m.root, v.Provider, v.ID, v.Version, v.Files) != "installed" {
		return "", "", fmt.Errorf("the selected voice is not installed or did not verify")
	}
	root := assets.Dir(m.root, v.Provider, v.ID, v.Version)
	var model, config string
	for _, f := range v.Files {
		if strings.HasSuffix(f.Name, ".onnx.json") {
			config = filepath.Join(root, f.Name)
		} else if strings.HasSuffix(f.Name, ".onnx") {
			model = filepath.Join(root, f.Name)
		}
	}
	if model == "" || config == "" {
		return "", "", fmt.Errorf("the approved voice is incomplete")
	}
	return model, config, nil
}

// State reports a voice's install state, as assets.State names it.
func (m *Manager) State(v Voice) string {
	return assets.State(m.root, v.Provider, v.ID, v.Version, v.Files)
}

// Install downloads only a catalog-owned URL. Files are verified in an
// adjacent staging directory and become visible only after every file passes.
func (m *Manager) Install(ctx context.Context, id string) error {
	return m.InstallWith(ctx, id, assets.Options{})
}

// InstallWith is Install with the options of assets.Options: progress and the check hook of a job that reports them.
func (m *Manager) InstallWith(ctx context.Context, id string, options assets.Options) error {
	v, ok := m.Voice(id)
	if !ok {
		return fmt.Errorf("the selected voice is not in the approved catalog")
	}
	return assets.InstallWith(ctx, m.root, v.Provider, v.ID, v.Version, v.Files, withDefaults(options))
}

// Verify reads every byte of a voice and says whether it is installed, damaged or absent (the narrator's Verify).
func (m *Manager) Verify(id string) (string, error) {
	v, ok := m.Voice(id)
	if !ok {
		return "", fmt.Errorf("the selected voice is not in the approved catalog")
	}
	assets.Forget(m.root, v.Provider, v.ID, v.Version)
	return assets.Verify(m.root, v.Provider, v.ID, v.Version, v.Files), nil
}

// Repair downloads a damaged voice again and swaps it in; a voice that verifies is left alone.
func (m *Manager) Repair(ctx context.Context, id string, options assets.Options) error {
	v, ok := m.Voice(id)
	if !ok {
		return fmt.Errorf("the selected voice is not in the approved catalog")
	}
	return assets.Repair(ctx, m.root, v.Provider, v.ID, v.Version, v.Files, withDefaults(options))
}

// withDefaults asks the disk before a download unless the caller brought its own check.
func withDefaults(options assets.Options) assets.Options {
	if options.Preflight == nil {
		options.Preflight = assets.RequireFreeSpace
	}
	return options
}

// Remove deletes an installed voice.
func (m *Manager) Remove(id string) error {
	v, ok := m.Voice(id)
	if !ok {
		return fmt.Errorf("the selected voice is not in the approved catalog")
	}
	return assets.Remove(m.root, v.Provider, v.ID, v.Version)
}
