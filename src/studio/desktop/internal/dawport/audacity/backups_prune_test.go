package audacity

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// prune-honours-retention (SN-D82): the host prunes when the project opens (bindings_daw_backups.go), with the narrator's
// DAW.backups.retention_days. These pin what that prune may touch.

// backupAt makes one backup of Chapter 1 stamped at the given day of October 2026 and returns its id.
func backupAt(t *testing.T, backups *Backups, project string, now *time.Time, day int) string {
	t.Helper()
	*now = time.Date(2026, 10, day, 9, 0, 0, 0, time.UTC)
	result, err := backups.BackupAround(context.Background(), dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 10, End: 11})
	if err != nil || !result.OK {
		t.Fatalf("BackupAround = %+v, %v", result, err)
	}
	rows := readTable(t, project).Backups
	return rows[len(rows)-1].ID
}

func TestPruneOnOpenRemovesOnlyRowsOlderThanTheRetentionAndTheirTracks(t *testing.T) {
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	fake.addAudio("Chapter 2", 0, 60, "b")
	now := time.Time{}
	backups, project := backupsOver(t, fake, &now)
	old := backupAt(t, backups, project, &now, 1)
	edge := backupAt(t, backups, project, &now, 5)
	fresh := backupAt(t, backups, project, &now, 11)
	// A track the narrator named like a backup the table does not hold is not the app's to remove.
	fake.addAudio(BackupTrackName("{AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}"), 0, 5, "x")

	now = time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	removed, err := backups.Prune(context.Background(), 7*24*time.Hour)
	if err != nil || fmt.Sprint(removed) != fmt.Sprint([]string{old}) {
		t.Fatalf("Prune = %v, %v; want only the row from 11 days ago", removed, err)
	}
	var kept []string
	for _, row := range readTable(t, project).Backups {
		kept = append(kept, row.ID)
	}
	if !slices.Equal(kept, []string{edge, fresh}) {
		t.Errorf("rows after the prune = %v, want %v (the row exactly seven days old stays)", kept, []string{edge, fresh})
	}
	for _, name := range []string{"Chapter 1", "Chapter 2", BackupTrackName(edge), BackupTrackName(fresh), BackupTrackName("{AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}")} {
		if fake.track(name) == nil {
			t.Errorf("the prune removed %q", name)
		}
	}
	if fake.track(BackupTrackName(old)) != nil {
		t.Errorf("the pruned row's track is still in the project")
	}
}

func TestAPruneThatCannotRemoveATrackKeepsTheRowAndSaysSo(t *testing.T) {
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Time{}
	backups, project := backupsOver(t, fake, &now)
	old := backupAt(t, backups, project, &now, 1)
	now = time.Date(2026, 10, 30, 9, 0, 0, 0, time.UTC)
	fake.mu.Lock()
	fake.failOn = "RemoveTracks"
	fake.mu.Unlock()

	removed, err := backups.Prune(context.Background(), 7*24*time.Hour)
	if !errors.Is(err, audacitybridge.ErrCommandFailed) || len(removed) != 0 {
		t.Fatalf("Prune = %v, %v; want nothing removed and Audacity's failure", removed, err)
	}
	if rows := readTable(t, project).Backups; len(rows) != 1 || rows[0].ID != old || fake.track(BackupTrackName(old)) == nil {
		t.Errorf("after a failed removal the table is %+v", rows)
	}
}

// gatedConn holds the first Paste command until release is closed, so a restore can be caught in flight.
type gatedConn struct {
	audacitybridge.Conn
	entered chan struct{}
	release chan struct{}
	held    bool
}

func (c *gatedConn) Write(b []byte) (int, error) {
	if !c.held && bytes.Contains(b, []byte("Paste")) {
		c.held = true
		close(c.entered)
		<-c.release
	}
	return c.Conn.Write(b)
}

func TestNothingIsPrunedWhileARestoreIsInFlight(t *testing.T) {
	ctx := context.Background()
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Time{}
	backups, project := backupsOver(t, fake, &now)
	old := backupAt(t, backups, project, &now, 1)

	gate := &gatedConn{entered: make(chan struct{}), release: make(chan struct{})}
	inner := fake.transport()
	client := audacitybridge.New(audacitybridge.TransportFunc(func(ctx context.Context) (audacitybridge.Conn, error) {
		conn, err := inner.Dial(ctx)
		gate.Conn = conn
		return gate, err
	}), audacitybridge.Options{Timeout: 5 * time.Second})
	t.Cleanup(func() { _ = client.Close() })
	gated := NewBackups(client, backups.config)

	now = time.Date(2026, 10, 30, 9, 0, 0, 0, time.UTC)
	restored := make(chan dawport.Result, 1)
	go func() {
		result, _ := gated.RestoreBackup(ctx, old)
		restored <- result
	}()
	<-gate.entered
	pruned := make(chan []string, 1)
	go func() {
		removed, _ := gated.Prune(ctx, 7*24*time.Hour)
		pruned <- removed
	}()
	select {
	case removed := <-pruned:
		t.Fatalf("Prune returned %v while the restore was pasting", removed)
	case <-time.After(200 * time.Millisecond):
	}
	if slices.ContainsFunc(fake.commands(), func(line string) bool { return bytes.HasPrefix([]byte(line), []byte("RemoveTracks")) }) {
		t.Fatalf("a track was removed while the restore was in flight")
	}
	close(gate.release)
	if result := <-restored; !result.OK || !result.Changed {
		t.Fatalf("the restore = %+v, want it to finish", result)
	}
	if removed := <-pruned; fmt.Sprint(removed) != fmt.Sprint([]string{old}) {
		t.Errorf("the prune after the restore removed %v, want %v", removed, old)
	}
}
