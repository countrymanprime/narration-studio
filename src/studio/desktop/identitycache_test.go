package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

// A source file is identified through the open project's IdentityCache (Refresh to write the identity down, Identify to compare), so the
// services agree on what a file is and a repeat ask reads nothing. The package-level evidence.Identify bypasses it.
func TestOnlyTheEvidencePackageIdentifiesAFileWithoutTheCache(t *testing.T) {
	direct := regexp.MustCompile(`\bevidence\.Identify\b`)
	err := filepath.WalkDir(".", func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		slash := filepath.ToSlash(path)
		if entry.IsDir() {
			if slash == "internal/evidence" || path != "." && (strings.HasPrefix(entry.Name(), ".") || entry.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(slash, ".go") || strings.HasSuffix(slash, "_test.go") {
			return nil
		}
		text, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if direct.Match(text) {
			t.Errorf("%s uses evidence.Identify: identify the file through the project's evidence.IdentityCache (Refresh when the identity is written down, Identify otherwise)", slash)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// One cache per attached project, and the recording check and the editing scan both read their takes through it.
func TestTheRecordingCheckAndTheEditingScanReadThroughTheHostsIdentityCache(t *testing.T) {
	host := coverageHost(t, editingProject(t, false), true, fakeAlignedCoverageSidecar())
	host.mu.RLock()
	identities := host.identities
	host.mu.RUnlock()
	if identities == nil || host.services().identities != identities {
		t.Fatal("services() does not hand out the host's identity cache")
	}
	// Old enough to be remembered: after the check only a Refresh reads the take again, so the scan's read below is the scan's own.
	old := time.Now().Add(-time.Hour)
	if err := os.Chtimes(filepath.Join(host.config.projectFolder, "media", "take.wav"), old, old); err != nil {
		t.Fatal(err)
	}

	before := identities.Reads()
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()
	afterCheck := identities.Reads()
	if afterCheck == before {
		t.Fatal("a recording check read no take through the host's identity cache")
	}
	if started := decodeAnswer(t)(host.EditingStart("doc-1", "c-0001", "Chapter One")); started["status"] != "started" {
		t.Fatalf("start = %v", started)
	}
	host.services().editing.Wait()
	if identities.Reads() == afterCheck {
		t.Fatal("an editing scan read no take through the host's identity cache")
	}

	next := host.config
	next.projectFolder = editingProject(t, false)
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
	if host.services().identities == identities {
		t.Fatal("another project kept the last project's identity cache")
	}
}
