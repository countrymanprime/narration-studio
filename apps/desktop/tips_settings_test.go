package main

import (
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/layout"
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
)

// The first-use tips the narrator has dismissed are one global setting: saved and read back for the narrator, and refused for a project,
// because a tip shown once is shown once for the narrator, not once per project.
func TestTipsSeenIsGlobalOnly(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := NewHost()
	host.settings = settings.New(layout.FindRoot("."), t.TempDir())
	seen := "script.select-text"
	if err := host.saveSettings("Tips", "global", map[string]*string{"seen": &seen}); err != nil {
		t.Fatal(err)
	}
	if got, _ := host.settings.Effective("Tips", "seen", ""); got != seen {
		t.Fatalf("seen = %q, want %q", got, seen)
	}
	if err := host.saveSettings("Tips", "project", map[string]*string{"seen": &seen}); err == nil {
		t.Fatal("a project must not hold the tips a narrator has seen")
	}
}
