package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"desktop/internal/guide"
	"desktop/internal/manuscript"
)

// newTestHost is NewHost for a test whose Host writes under a temp dir: it waits for the host's background goroutines (goBackground) in
// a cleanup, so none is still writing when the directory is removed. Windows refuses to remove a directory that is still being written
// into ("The directory is not empty", issue 2304). Create the test's temp dirs before the Host: cleanups run last-in, first-out, so
// the wait must be registered after them to run before their removal.
func newTestHost(t *testing.T) *Host {
	t.Helper()
	host := NewHost()
	t.Cleanup(host.waitForBackground)
	return host
}

// A goroutine started through goBackground is joined by waitForBackground, so a write it makes lands before the wait returns.
func TestWaitForBackgroundJoinsGoroutinesStartedThroughGoBackground(t *testing.T) {
	host := &Host{}
	path := filepath.Join(t.TempDir(), "late.json")
	started := make(chan struct{})
	host.goBackground(func() {
		close(started)
		time.Sleep(50 * time.Millisecond)
		_ = os.WriteFile(path, []byte("{}"), 0o600)
	})
	<-started
	host.waitForBackground()
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("the background write had not landed when waitForBackground returned: %v", err)
	}
}

// The cue refresh an import starts is still writing into the project when the import's callback returns. Without the wait, the write lands
// after the test body (and so after t.TempDir's removal on Windows); with it, the write has landed. This is the writer behind issue 2304.
func TestAnImportEndsWithItsCueRefreshStillWritingUntilTheHostIsWaitedOn(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	folder := t.TempDir()
	host := newTestHost(t)
	path := filepath.Join(folder, "manuscript_guide.json")
	host.refreshCues = func(context.Context, ...string) (guide.CueCounts, error) {
		time.Sleep(100 * time.Millisecond)
		return guide.CueCounts{}, os.WriteFile(path, []byte("{}"), 0o600)
	}
	host.importJobEnded(manuscript.ImportJob{ID: "import-1", Phase: "success"})
	if _, err := os.Stat(path); err == nil {
		t.Fatal("the cue refresh had finished before the import callback returned; the test no longer races it")
	}
	host.waitForBackground()
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("the cue refresh was not part of the host's background wait: %v", err)
	}
}
