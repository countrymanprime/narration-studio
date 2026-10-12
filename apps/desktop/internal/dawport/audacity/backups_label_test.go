package audacity

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// A row's label and restored time (SN-D82, for the Backups tab's list): added within version 1, so a file without them still reads.

func TestABackupKeepsItsLabelAndARestoreStampsTheRow(t *testing.T) {
	ctx := context.Background()
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	backups, project := backupsOver(t, fake, &now)
	if _, err := backups.BackupAround(ctx, dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 10, End: 11, Label: "Roll at ¶ 3"}); err != nil {
		t.Fatal(err)
	}
	row := readTable(t, project).Backups[0]
	if row.Label != "Roll at ¶ 3" || row.Restored != nil {
		t.Fatalf("row = %+v, want the label and no restored time", row)
	}
	now = now.Add(time.Hour)
	if result, err := backups.RestoreBackup(ctx, row.ID); err != nil || !result.OK {
		t.Fatalf("RestoreBackup = %+v, %v", result, err)
	}
	row = readTable(t, project).Backups[0]
	if row.Restored == nil || !row.Restored.Equal(now) || row.Label != "Roll at ¶ 3" {
		t.Fatalf("row after the restore = %+v, want restored at %v", row, now)
	}
}

func TestABackupLabelThatBreaksTheRowRulesIsRefused(t *testing.T) {
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Now()
	backups, project := backupsOver(t, fake, &now)
	for _, label := range []string{"Roll\u0007", strings.Repeat("x", maxBackupTextBytes+1)} {
		result, err := backups.BackupAround(context.Background(), dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 10, End: 11, Label: label})
		if err != nil || result.Refused != messageBackupBadRequest {
			t.Errorf("BackupAround with label %q = %+v, %v; want the bad request refusal", label, result, err)
		}
	}
	if len(fake.commands()) != 0 {
		t.Errorf("a refused label sent %v", fake.commands())
	}
	if _, err := os.Stat(BackupsFile(project)); err == nil {
		t.Errorf("a refused label wrote the table")
	}
}

func TestAVersionOneFileWithoutLabelsReadsAndOneWithABadLabelIsCorrupt(t *testing.T) {
	project := t.TempDir()
	path := BackupsFile(project)
	write := func(row string) {
		t.Helper()
		if err := os.MkdirAll(project+"/narration-utils", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(`{"schemaVersion":1,"backups":[`+row+`]}`), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	const plain = `{"id":"{0F8E2A5C-1B3D-4E6F-8A9B-0C1D2E3F4A5B}","guid":"Chapter 1","chapterId":"ch-1","start":20,"end":280,"createdAt":"2026-10-12T09:30:00Z"`
	write(plain + `}`)
	rows, err := ReadBackups(project, nil)
	if err != nil || len(rows) != 1 || rows[0].Label != "" || rows[0].Restored != nil {
		t.Fatalf("ReadBackups of a file written before labels = %+v, %v", rows, err)
	}
	write(plain + `,"label":"Trim white space","restored":"2026-10-13T08:00:00Z"}`)
	if rows, err := ReadBackups(project, nil); err != nil || len(rows) != 1 || rows[0].Label != "Trim white space" || rows[0].Restored == nil {
		t.Fatalf("ReadBackups of a labelled row = %+v, %v", rows, err)
	}
	write(plain + `,"label":"Trim\u0007"}`)
	if rows, err := ReadBackups(project, nil); err != nil || len(rows) != 0 {
		t.Fatalf("ReadBackups of a row with a control character in its label = %+v, %v; want it kept aside as corrupt", rows, err)
	}
	if _, err := ReadBackups("", nil); err == nil || err.Error() != messageBackupNoProject {
		t.Errorf("ReadBackups with no project = %v", err)
	}
}
