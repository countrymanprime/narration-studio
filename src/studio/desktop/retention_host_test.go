package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// hostLogHas reports whether the host log holds a retention_pass line for reason.
func hostLogHas(host *Host, reason string) bool {
	raw, err := os.ReadFile(host.log.Path())
	return err == nil && strings.Contains(string(raw), "retention_pass") && strings.Contains(string(raw), reason+" |")
}

func waitForRetentionPass(t *testing.T, host *Host, reason string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !hostLogHas(host, reason) {
		if time.Now().After(deadline) {
			t.Fatalf("no retention pass for %q in the host log", reason)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// Opening a project starts a pass, and it only reports: no file in the project is removed.
func TestOpeningAProjectStartsARetentionPassThatRemovesNothing(t *testing.T) {
	project := twoTakeCoverageProject(t)
	before := listFiles(t, project)
	host := coverageHost(t, project, true, fakeAlignedCoverageSidecarWithSkip())
	waitForRetentionPass(t, host, "open")
	host.closeRetention()
	if after := listFiles(t, project); !sameStrings(before, after) {
		t.Fatalf("a retention pass changed the project's files:\nbefore %v\nafter  %v", before, after)
	}
}

// A recording check that ends starts a pass; reading a chapter's check does not.
func TestAFinishedCheckStartsARetentionPassAndAReadDoesNot(t *testing.T) {
	project := twoTakeCoverageProject(t)
	host := coverageHost(t, project, true, fakeAlignedCoverageSidecarWithSkip())
	waitForRetentionPass(t, host, "open")
	if hostLogHas(host, "check-ended") {
		t.Fatal("a pass for a check ended before any check")
	}
	if _, err := host.CoverageResult("c-0001"); err != nil {
		t.Logf("CoverageResult: %v", err) // reading must not start a pass, whatever it answers
	}
	time.Sleep(100 * time.Millisecond)
	if hostLogHas(host, "check-ended") {
		t.Fatal("reading a chapter's check started a retention pass")
	}
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()
	waitForRetentionPass(t, host, "check-ended")
}

// listFiles is every regular file below dir, as relative slash names with their sizes, sorted.
func listFiles(t *testing.T, dir string) []string {
	t.Helper()
	var files []string
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, path)
		files = append(files, fmt.Sprintf("%s %d", filepath.ToSlash(rel), info.Size()))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	slices.Sort(files)
	return files
}

func sameStrings(a, b []string) bool { return slices.Equal(a, b) }
