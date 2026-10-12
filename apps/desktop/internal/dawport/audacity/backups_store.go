package audacity

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// The backups table (ADR 0863): one row per window of audio the adapter cloned to its own track in the Audacity project, kept in
// the app's project folder as narration-utils/backups.json. The backup's audio lives in the Audacity project; the row is how the
// app finds it again. The file is narrator data, read through persist: a corrupt one is kept aside and an empty table starts, one
// written by a newer app is refused and never overwritten, and a write goes through a temporary file and a rename.

// BackupsSchemaVersion is the only backups.json version this package reads or writes.
const BackupsSchemaVersion = 1

// MaxBackups is the most rows the table holds; a file with more is corrupt, and a backup past it is refused.
const MaxBackups = 500

// maxBackupTextBytes bounds a row's track name, chapter id and label.
const maxBackupTextBytes = 256

// backupsWhat names the file for the narrator in a persist notice.
const backupsWhat = "Audacity backups"

// BackupsFile is where a project's backups table is kept. Its only input is the app's project folder, never a path from the page.
func BackupsFile(project string) string {
	return filepath.Join(project, "narration-utils", "backups.json")
}

// Backup is one row of the table. GUID is the source track as the request named it (Audacity reports no track ids, so it is the
// track's name, ADR 0863); Start and End are the cloned window in project seconds, which is also where the backup track holds it.
// Label (what the backup was made for) and Restored (when it was last put back) were added within version 1 and are absent from a
// row that has neither, so a file written before them reads as it is.
type Backup struct {
	ID        string     `json:"id"`
	GUID      string     `json:"guid"`
	ChapterID string     `json:"chapterId"`
	Start     float64    `json:"start"`
	End       float64    `json:"end"`
	CreatedAt time.Time  `json:"createdAt"`
	Label     string     `json:"label,omitempty"`
	Restored  *time.Time `json:"restored,omitempty"`
}

// backupsTable is backups.json.
type backupsTable struct {
	SchemaVersion int      `json:"schemaVersion"`
	Backups       []Backup `json:"backups"`
}

// backupID is the shape of a backup's id: a GUID in braces, upper case, as REAPER writes them.
var backupID = regexp.MustCompile(`^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$`)

// newBackupID is a random version 4 GUID in backupID's shape.
func newBackupID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("{%X-%X-%X-%X-%X}", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// BackupTrackName is the name of the Audacity track that holds a backup. The adapter finds the track again only by this exact name.
func BackupTrackName(id string) string { return "Narration Utils backup " + id }

// backupText reports whether s is a row's text: non-empty, valid UTF-8, bounded and free of control characters.
func backupText(s string) bool {
	if s == "" || len(s) > maxBackupTextBytes || !utf8.ValidString(s) {
		return false
	}
	return strings.IndexFunc(s, unicode.IsControl) < 0
}

func finite(f float64) bool { return !math.IsNaN(f) && !math.IsInf(f, 0) }

// validBackup reports whether a stored row keeps the rules BackupAround writes it by; a file with one that does not is corrupt.
func validBackup(b Backup) bool {
	return backupID.MatchString(b.ID) && backupText(b.GUID) && backupText(b.ChapterID) &&
		finite(b.Start) && finite(b.End) && b.Start >= 0 && b.Start < b.End && !b.CreatedAt.IsZero() &&
		(b.Label == "" || backupText(b.Label)) && (b.Restored == nil || !b.Restored.IsZero())
}

// ReadBackups is the project's table as stored, for the host's list: the rows in the order they were made. A missing, corrupt or
// emptied file is no rows (a corrupt one is kept aside and reported, as every read does); a newer or unreadable file is an error whose
// text is the sentence to show. project is the app's project folder, never a path from the page.
func ReadBackups(project string, reporter *persist.Reporter) ([]Backup, error) {
	if project == "" || !filepath.IsAbs(project) {
		return nil, errBackupsUnusable(messageBackupNoProject)
	}
	path := BackupsFile(project)
	unlock := lockBackups(path)
	defer unlock()
	table, err := readBackups(path, reporter)
	if err != nil {
		return nil, err
	}
	return table.Backups, nil
}

var backupsLocks sync.Map

// lockBackups serialises every read-modify-write of one project's table.
// +checklocksignore
func lockBackups(path string) func() {
	lock, _ := backupsLocks.LoadOrStore(filepath.Clean(path), &sync.Mutex{})
	mutex, _ := lock.(*sync.Mutex)
	mutex.Lock()
	return mutex.Unlock
}

// The sentences a table that cannot be used answers with.
const (
	messageBackupsNewer      = "The Audacity backups file was written by a newer version of Narration Studio, so it was left as it is. Update the app to use it."
	messageBackupsUnreadable = "The Audacity backups file could not be read, so nothing was changed."
)

// errBackupsUnusable is a table that is there but must not be read or replaced; its text is the sentence to show.
type errBackupsUnusable string

func (e errBackupsUnusable) Error() string { return string(e) }

// readBackups reads the table; the caller holds its lock. A missing file is an empty table, as is a corrupt one or one with a row
// that breaks a rule, which is kept aside first (the reporter tells the narrator). A newer or unreadable file is errBackupsUnusable.
func readBackups(path string, reporter *persist.Reporter) (backupsTable, error) {
	table := backupsTable{SchemaVersion: BackupsSchemaVersion, Backups: []Backup{}}
	newer := 0
	var decoded backupsTable
	outcome := reporter.ReadJSON(path, backupsWhat, persist.NarratorData, func(raw []byte) error {
		var version struct {
			SchemaVersion int `json:"schemaVersion"`
		}
		if err := json.Unmarshal(raw, &version); err != nil {
			return err
		}
		if version.SchemaVersion > BackupsSchemaVersion {
			newer = version.SchemaVersion
			return nil
		}
		var candidate backupsTable
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&candidate); err != nil {
			return err
		}
		if candidate.SchemaVersion < 1 || len(candidate.Backups) > MaxBackups {
			return errors.New("the backups table breaks the file's rules")
		}
		seen := make(map[string]bool, len(candidate.Backups))
		for _, b := range candidate.Backups {
			if !validBackup(b) || seen[b.ID] {
				return errors.New("a backup breaks the file's rules")
			}
			seen[b.ID] = true
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing, persist.Quarantined, persist.Healed:
		return table, nil
	case persist.Unreadable:
		return backupsTable{}, errBackupsUnusable(messageBackupsUnreadable)
	}
	if persist.CheckVersion(newer, BackupsSchemaVersion, backupsWhat) != nil {
		return backupsTable{}, errBackupsUnusable(messageBackupsNewer)
	}
	if decoded.Backups != nil {
		table.Backups = decoded.Backups
	}
	return table, nil
}

// writeBackups replaces the table through a temporary file and a rename; the caller holds its lock.
func writeBackups(path string, table backupsTable) error {
	table.SchemaVersion = BackupsSchemaVersion
	if table.Backups == nil {
		table.Backups = []Backup{}
	}
	if err := persist.CanOverwrite(path, backupsWhat); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the project's narration-utils folder: %w", err)
	}
	raw, err := json.MarshalIndent(table, "", "  ")
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, raw, 0o600); err != nil {
		return fmt.Errorf("could not write the %s file: %w", backupsWhat, err)
	}
	if err := os.Rename(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return fmt.Errorf("could not activate the %s file: %w", backupsWhat, err)
	}
	return nil
}
