package main

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"desktop/internal/coverage"
	"desktop/internal/evidence"
	"desktop/internal/retention"
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
	// A project that already holds derived files of every kind the pass measures.
	for _, dir := range []string{evidence.LedgerDir(project), coverage.ResultsDir(project), coverage.SummariesDir(project), evidence.CacheDir(project)} {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "0123456789abcdef.json"), []byte(`{"schemaVersion":1}`), 0o600); err != nil {
			t.Fatal(err)
		}
	}
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
	passes := host.retention.Passes()
	if _, err := host.WorkspaceAlignment("c-0001"); err != nil {
		t.Logf("WorkspaceAlignment: %v", err)
	}
	if got := host.retention.Passes(); got != passes {
		t.Fatalf("a read binding started a retention pass: %d passes, was %d", got, passes)
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

// A project switch cancels the previous pass without holding the host's lock while the pass leaves its folder.
func TestAProjectSwitchDoesNotWaitForARetentionPassUnderTheHostLock(t *testing.T) {
	project := twoTakeCoverageProject(t)
	host := coverageHost(t, project, true, fakeAlignedCoverageSidecarWithSkip())
	waitForRetentionPass(t, host, "open")
	started := make(chan struct{})
	release := make(chan struct{})
	slow := retention.New([]retention.Step{slowStep{started: started, release: release}}, nil, nil)
	host.mu.Lock()
	host.retention = slow
	host.mu.Unlock()
	slow.Kick("open")
	<-started
	switched := make(chan struct{})
	go func() {
		host.mu.Lock()
		host.startRetentionLocked(host.coverage) // cancels the slow runner under the lock
		host.mu.Unlock()
		close(switched)
	}()
	select {
	case <-switched:
	case <-time.After(2 * time.Second):
		t.Fatal("the switch waited for the pass while holding the host lock")
	}
	close(release)
}

// slowStep holds a pass until released.
type slowStep struct{ started, release chan struct{} }

func (slowStep) Name() string { return "slow" }
func (s slowStep) Run(context.Context, func() bool) retention.Report {
	close(s.started)
	<-s.release
	return retention.Report{}
}
