package audacity

import (
	"context"
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// DefaultBackupWindow is how much audio a backup takes either side of the edit, in seconds, when no setting gives one (ADR 0863; the
// narrator's setting is DAW.backups.window_seconds).
const DefaultBackupWindow = 120.0

// BackupsConfig is what the backups role needs from the host.
type BackupsConfig struct {
	// Project is the app's project folder, read on each call; empty (no project open) refuses every call. The table is kept
	// under it, and no path ever comes from the page.
	Project func() string
	// Reporter tells the narrator about a table that cannot be read (ADR 0069); nil only keeps a corrupt file aside.
	Reporter *persist.Reporter
	// Window is the seconds cloned either side of the edit; 0 is DefaultBackupWindow.
	Window float64
	// WindowSetting, when set, is read on each backup and wins over Window: the narrator's window setting. A value that is not a
	// positive finite number falls back to Window.
	WindowSetting func() float64
	// Now is the clock rows are stamped and pruned by; nil is time.Now.
	Now func() time.Time
}

// Backups is Audacity's BackupKeeper (ADR 0863). Audacity keeps no takes, so before an edit the adapter copies a window of the
// edited track to a new, muted track of its own, named for the backup, and records the window in the table; a restore copies it
// back over the same window of the source track. A restore never removes the backup track: only Prune does, for rows older than
// the retention. It drives the pipe client directly, with the commands spike 1g runs (docs/operations/daw-spike-run-sheet.md).
type Backups struct {
	client *audacitybridge.Client
	config BackupsConfig
	// mu keeps one backup's commands from interleaving with another's on the shared pipe: each sequence selects, copies and pastes,
	// and another sequence's selection in between would paste the wrong audio.
	mu sync.Mutex
}

var _ dawport.BackupKeeper = (*Backups)(nil)

// NewBackups is the backups role over client.
func NewBackups(client *audacitybridge.Client, config BackupsConfig) *Backups {
	return &Backups{client: client, config: config}
}

// The sentences the role answers with. None names another DAW: the role is Audacity's.
const (
	messageBackupNoProject  = "Open a project in this app before making or restoring an Audacity backup."
	messageBackupBadRequest = "That backup request has no track, chapter or time range Audacity can use."
	messageBackupNoTrack    = "The track this backup is for is no longer in the Audacity project."
	messageBackupTwoTracks  = "More than one Audacity track has that name, so the app will not guess which to back up. Rename one, then try again."
	messageBackupNoAudio    = "There is no audio there to back up in Audacity."
	messageBackupTableFull  = "The Audacity backups table is full. Remove old backups, then try again."
	messageNoBackup         = "Audacity has no backup with that id."
	messageBackupTrackGone  = "The backup's track is no longer in the Audacity project, so nothing was restored."
	messageBackupSourceGone = "The track this backup came from is no longer in the Audacity project, so nothing was restored."
	messageBackupTwoBackups = "More than one Audacity track has the backup's name, so nothing was restored."
	// messageRestoreNotRecorded follows a restore whose audio went back but whose row could not be stamped.
	messageRestoreNotRecorded = "The backups list could not record when it was put back."
)

// ErrBackupLost is the answer when Audacity took the backup's commands but its track could not be found holding the window
// afterwards. The track may be in the project; no row was written for it.
const ErrBackupLost = audacitybridge.Sentence("Audacity did not keep the backup: its track could not be found holding the audio afterwards")

func (b *Backups) now() time.Time {
	if b.config.Now != nil {
		return b.config.Now()
	}
	return time.Now()
}

// table is the table's path, or "" when no project is open.
func (b *Backups) table() string {
	if b.config.Project == nil {
		return ""
	}
	project := b.config.Project()
	if project == "" || !filepath.IsAbs(project) {
		return ""
	}
	return BackupsFile(project)
}

func (b *Backups) window() float64 {
	if b.config.WindowSetting != nil {
		if window := b.config.WindowSetting(); window > 0 && finite(window) {
			return window
		}
	}
	if b.config.Window > 0 && finite(b.config.Window) {
		return b.config.Window
	}
	return DefaultBackupWindow
}

// seconds words a length for a message: whole seconds, or tenths below ten.
func seconds(s float64) string {
	if s < 10 {
		return strconv.FormatFloat(math.Round(s*10)/10, 'f', -1, 64)
	}
	return strconv.FormatFloat(math.Round(s), 'f', -1, 64)
}

// tracksNamed is every wave track called name.
func tracksNamed(tracks []audacitybridge.TrackInfo, name string) []audacitybridge.TrackInfo {
	var found []audacitybridge.TrackInfo
	for _, t := range tracks {
		if t.Kind == "wave" && t.Name == name {
			found = append(found, t)
		}
	}
	return found
}

// projectEnd is where the project's audio ends: the latest end of any wave track.
func projectEnd(tracks []audacitybridge.TrackInfo) float64 {
	end := 0.0
	for _, t := range tracks {
		if t.Kind == "wave" && t.HasRange && t.End > end {
			end = t.End
		}
	}
	return end
}

func (b *Backups) do(ctx context.Context, name string) error {
	_, err := b.client.Do(ctx, audacitybridge.NewCommand(name))
	return err
}

// copyWindow copies [start, end] of track to Audacity's clipboard.
func (b *Backups) copyWindow(ctx context.Context, track int, start, end float64) error {
	if err := b.client.SelectTracks(ctx, track, 1); err != nil {
		return err
	}
	if err := b.client.SelectTime(ctx, start, end); err != nil {
		return err
	}
	return b.do(ctx, "Copy")
}

// BackupAround clones the window of request.GUID's track around [request.Start, request.End] (the configured window either side,
// clamped to the project) to a new muted track named BackupTrackName(id), and adds the row with the request's label. The
// narrator's audio is not changed, so the Result is changed false with no undo step. A track that is gone is RefusedStale;
// anything else that cannot be backed up (a label that breaks the row's text rule among them) is Refused, and nothing is sent.
func (b *Backups) BackupAround(ctx context.Context, request dawport.BackupRequest) (dawport.Result, error) {
	path := b.table()
	if path == "" {
		return dawport.Refused(messageBackupNoProject), nil
	}
	if !backupText(request.GUID) || !backupText(request.ChapterID) || !finite(request.Start) || !finite(request.End) ||
		request.Start < 0 || request.End < request.Start || (request.Label != "" && !backupText(request.Label)) {
		return dawport.Refused(messageBackupBadRequest), nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	unlock := lockBackups(path)
	defer unlock()
	table, err := readBackups(path, b.config.Reporter)
	if err != nil {
		return backupsRefusal(err)
	}
	if len(table.Backups) >= MaxBackups {
		return dawport.Refused(messageBackupTableFull), nil
	}
	tracks, err := b.client.Tracks(ctx)
	if err != nil {
		return dawport.Result{}, err
	}
	source := tracksNamed(tracks, request.GUID)
	switch len(source) {
	case 0:
		return dawport.RefusedStale(messageBackupNoTrack), nil
	case 1:
	default:
		return dawport.Refused(messageBackupTwoTracks), nil
	}
	start := math.Max(0, request.Start-b.window())
	end := math.Min(projectEnd(tracks), request.End+b.window())
	if end <= start {
		return dawport.Refused(messageBackupNoAudio), nil
	}

	id := newBackupID()
	name := BackupTrackName(id)
	if err := b.client.Stop(ctx); err != nil {
		return dawport.Result{}, err
	}
	if err := b.copyWindow(ctx, source[0].Index, start, end); err != nil {
		return dawport.Result{}, err
	}
	newTrack := "NewMonoTrack"
	if source[0].Channels == 2 {
		newTrack = "NewStereoTrack"
	}
	if err := b.do(ctx, newTrack); err != nil {
		return dawport.Result{}, err
	}
	// Audacity adds the new track last.
	index := len(tracks)
	if err := b.client.SetTrackName(ctx, index, name); err != nil {
		return dawport.Result{}, err
	}
	if err := b.client.SelectTracks(ctx, index, 1); err != nil {
		return dawport.Result{}, err
	}
	if err := b.client.SelectTime(ctx, start, start); err != nil {
		return dawport.Result{}, err
	}
	if err := b.do(ctx, "Paste"); err != nil {
		return dawport.Result{}, err
	}
	if _, err := b.client.Do(ctx, audacitybridge.NewCommand("SetTrackAudio").Int("Track", index).Bool("Mute", true)); err != nil {
		return dawport.Result{}, err
	}
	after, err := b.client.Tracks(ctx)
	if err != nil {
		return dawport.Result{}, err
	}
	if kept := tracksNamed(after, name); len(kept) != 1 || !kept[0].HasRange || kept[0].End <= kept[0].Start {
		return dawport.Result{}, ErrBackupLost
	}

	table.Backups = append(table.Backups, Backup{
		ID: id, GUID: request.GUID, ChapterID: request.ChapterID, Start: start, End: end, CreatedAt: b.now().UTC(), Label: request.Label,
	})
	if err := writeBackups(path, table); err != nil {
		return dawport.Result{}, err
	}
	return dawport.OK(fmt.Sprintf("Backed up %s s of audio in Audacity.", seconds(end-start)), false), nil
}

// RestoreBackup copies the backup's audio back over the same window of the track it came from, and stamps the row's Restored with
// the time. The backup track and the row are kept, so a restore can be made again. An id the table does not have is Refused; a
// backup or source track that is gone is RefusedStale, and nothing is restored from a guess. Prune waits for a restore in flight.
func (b *Backups) RestoreBackup(ctx context.Context, backupGUID string) (dawport.Result, error) {
	path := b.table()
	if path == "" {
		return dawport.Refused(messageBackupNoProject), nil
	}
	if !backupID.MatchString(backupGUID) {
		return dawport.Refused(messageNoBackup), nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	unlock := lockBackups(path)
	table, err := readBackups(path, b.config.Reporter)
	unlock()
	if err != nil {
		return backupsRefusal(err)
	}
	var row *Backup
	for i := range table.Backups {
		if table.Backups[i].ID == backupGUID {
			row = &table.Backups[i]
		}
	}
	if row == nil {
		return dawport.Refused(messageNoBackup), nil
	}
	tracks, err := b.client.Tracks(ctx)
	if err != nil {
		return dawport.Result{}, err
	}
	backup := tracksNamed(tracks, BackupTrackName(row.ID))
	switch len(backup) {
	case 0:
		return dawport.RefusedStale(messageBackupTrackGone), nil
	case 1:
	default:
		return dawport.Refused(messageBackupTwoBackups), nil
	}
	source := tracksNamed(tracks, row.GUID)
	switch len(source) {
	case 0:
		return dawport.RefusedStale(messageBackupSourceGone), nil
	case 1:
	default:
		return dawport.Refused(messageBackupTwoTracks), nil
	}
	if err := b.client.Stop(ctx); err != nil {
		return dawport.Result{}, err
	}
	if err := b.copyWindow(ctx, backup[0].Index, row.Start, row.End); err != nil {
		return dawport.Result{}, err
	}
	if err := b.client.SelectTracks(ctx, source[0].Index, 1); err != nil {
		return dawport.Result{}, err
	}
	if err := b.client.SelectTime(ctx, row.Start, row.End); err != nil {
		return dawport.Result{}, err
	}
	if err := b.do(ctx, "Paste"); err != nil {
		return dawport.Result{}, err
	}
	message := fmt.Sprintf("Restored %s s of audio from the backup in Audacity.", seconds(row.End-row.Start))
	// The audio is already back, so a table that cannot take the stamp is said, never returned as an error that reads as nothing done.
	if err := b.stampRestored(path, row.ID); err != nil {
		message += " " + messageRestoreNotRecorded
	}
	return dawport.OK(message, true), nil
}

// stampRestored records now as the row's Restored. The table is read again under its lock, since only b.mu was held while
// Audacity pasted; a row that is no longer there is left alone.
func (b *Backups) stampRestored(path, id string) error {
	unlock := lockBackups(path)
	defer unlock()
	table, err := readBackups(path, b.config.Reporter)
	if err != nil {
		return err
	}
	at := b.now().UTC()
	for i := range table.Backups {
		if table.Backups[i].ID == id {
			table.Backups[i].Restored = &at
			return writeBackups(path, table)
		}
	}
	return nil
}

// BackupEntry is a row as List reads it back: Missing when Audacity no longer has the backup's track.
type BackupEntry struct {
	Backup
	Missing bool
}

// List reads the table and checks each row against the open project's tracks. A row whose track is gone is Missing, never matched
// to another track.
func (b *Backups) List(ctx context.Context) ([]BackupEntry, error) {
	path := b.table()
	if path == "" {
		return []BackupEntry{}, audacitybridge.Sentence(messageBackupNoProject)
	}
	unlock := lockBackups(path)
	table, err := readBackups(path, b.config.Reporter)
	unlock()
	if err != nil {
		return []BackupEntry{}, err
	}
	tracks, err := b.client.Tracks(ctx)
	if err != nil {
		return []BackupEntry{}, err
	}
	entries := make([]BackupEntry, 0, len(table.Backups))
	for _, row := range table.Backups {
		entries = append(entries, BackupEntry{Backup: row, Missing: len(tracksNamed(tracks, BackupTrackName(row.ID))) != 1})
	}
	return entries, nil
}

// Prune removes the rows created more than retention ago, and the backup tracks they name, and returns their ids. It touches no
// other row and no other track; a row whose track is already gone is removed with nothing sent. The retention setting and when
// to prune are the host's (SN-D82).
func (b *Backups) Prune(ctx context.Context, retention time.Duration) ([]string, error) {
	path := b.table()
	if path == "" {
		return nil, audacitybridge.Sentence(messageBackupNoProject)
	}
	if retention <= 0 {
		return nil, fmt.Errorf("%w: a retention of %v", audacitybridge.ErrInvalidValue, retention)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	unlock := lockBackups(path)
	defer unlock()
	table, err := readBackups(path, b.config.Reporter)
	if err != nil {
		return nil, err
	}
	cutoff := b.now().Add(-retention)
	var kept []Backup
	var removed []string
	for _, row := range table.Backups {
		if !row.CreatedAt.Before(cutoff) {
			kept = append(kept, row)
			continue
		}
		// Indexes shift as tracks go, so each removal reads the tracks again and removes only the one exact name.
		tracks, err := b.client.Tracks(ctx)
		if err != nil {
			return removed, b.keepRows(path, table, removed, err)
		}
		if found := tracksNamed(tracks, BackupTrackName(row.ID)); len(found) == 1 {
			err := b.client.SelectTracks(ctx, found[0].Index, 1)
			if err == nil {
				err = b.do(ctx, "RemoveTracks")
			}
			if err != nil {
				return removed, b.keepRows(path, table, removed, err)
			}
		}
		removed = append(removed, row.ID)
	}
	if len(removed) == 0 {
		return nil, nil
	}
	table.Backups = kept
	return removed, writeBackups(path, table)
}

// keepRows writes the table without the rows already removed when a prune stops part way, so a row never outlives its track.
func (b *Backups) keepRows(path string, table backupsTable, removed []string, cause error) error {
	gone := map[string]bool{}
	for _, id := range removed {
		gone[id] = true
	}
	var rows []Backup
	for _, row := range table.Backups {
		if !gone[row.ID] {
			rows = append(rows, row)
		}
	}
	table.Backups = rows
	return errors.Join(cause, writeBackups(path, table))
}

// backupsRefusal answers a table that cannot be used with its sentence; any other error is returned.
func backupsRefusal(err error) (dawport.Result, error) {
	var unusable errBackupsUnusable
	if errors.As(err, &unusable) {
		return dawport.Refused(string(unusable)), nil
	}
	return dawport.Result{}, err
}
