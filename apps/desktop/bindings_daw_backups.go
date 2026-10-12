package main

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/audacity"
	"github.com/countrymanprime/narration-utils/shell/internal/passagetakes"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
)

// backupTimeout bounds one backup or restore: Audacity copies and pastes up to the window either side of the edit, which at the
// longest window is ten minutes of audio.
const backupTimeout = 2 * time.Minute

// The backups settings (ADR 0863): the seconds cloned either side of an edit and the days a backup is kept, in the DAW tool.
const (
	backupWindowKey    = "backups.window_seconds"
	backupRetentionKey = "backups.retention_days"
)

// backupLabelMaxBytes is a label's longest, as the backups table keeps it (audacity's row text rule).
const backupLabelMaxBytes = 256

const (
	backupLabelSentence        = "A backup needs a label of 1 to 256 bytes of plain text saying what it was made for."
	backupNotConnectedSentence = "%s is not connected to this app, so nothing was backed up or restored."
)

// DawBackupAround clones the audio around the words firstToken..lastToken of chapterID before an edit, so it can be put back
// (SN-D82, ADR 0863; the Studio Next mock's backupAround). The page sends a chapter id, two token indices and the label the
// Backups list shows ("Roll at ¶ 3"), never a track, a time or a path: the words' project seconds are resolved here from the
// stored alignment (passagetakes.ResolveRange) and the track is the chapter's one linked track, and the DAW adds the narrator's
// window either side (DAW.backups.window_seconds). The answer is a DawResult (ADR 0810): the backups capability's own sentence when
// the resolver refuses it (REAPER, the built-in recorder, a standalone launch, Audacity not connected, the toggle off), checked
// first; then a label that is not plain text; then the range's and the link's own refusals. Nothing is sent to the DAW on any of
// them. A backup changes no audio, so it answers changed false and no undo step.
func (h *Host) DawBackupAround(chapterID string, firstToken int, lastToken int, label string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), backupTimeout)
	defer cancel()
	run := h.runLog.Begin("backup_around", "chapter_id", chapterID)
	result, err := dawBackupAroundIn(ctx, resolver.Kind().String(), resolver.Support(dawport.CapBackups), svc.backupKeeper, backupSourcesIn(svc), chapterID, firstToken, lastToken, label)
	endStackRun(run, result, err)
	return encodeBinding(result, err)
}

// DawRestoreBackup puts the audio of the backup backupID back over the same window of the track it came from (the mock's
// restoreBackup). The page sends the id DawBackups listed, nothing else. The same capability refusal first; an id the table does not
// have is the DAW's refusal, changed false; a backup or source track that is gone is code stale. A restore is not undoable in the app
// (docs/research/studio-next-undo-inverse-table.md row 1): it is one step in the DAW's own undo.
func (h *Host) DawRestoreBackup(backupID string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), backupTimeout)
	defer cancel()
	run := h.runLog.Begin("restore_backup")
	result, err := dawRestoreBackupIn(ctx, resolver.Kind().String(), resolver.Support(dawport.CapBackups), svc.backupKeeper, backupID)
	endStackRun(run, result, err)
	return encodeBinding(result, err)
}

// DawBackups answers the project's backups table, newest first, in the file's own shape ({schemaVersion, backups}, ADR 0863), for
// the Backups list. It reads the file only and asks the DAW nothing, so it answers on any launch; a project with no table has none.
// A table written by a newer app, or one that cannot be read, rejects with its sentence.
func (h *Host) DawBackups() (string, error) {
	svc := h.services()
	return encodeBinding(dawBackupsIn(svc.config.projectFolder, h.persist))
}

// dawBackupsList is DawBackups' answer, the shape of backups.json.
type dawBackupsList struct {
	SchemaVersion int               `json:"schemaVersion"`
	Backups       []audacity.Backup `json:"backups"`
}

// dawBackupsIn reads project's table through reporter (a corrupt file is kept aside and reported, as every read is).
func dawBackupsIn(project string, reporter *persist.Reporter) (dawBackupsList, error) {
	if project == "" {
		return dawBackupsList{}, errNoProject
	}
	rows, err := audacity.ReadBackups(project, reporter)
	if err != nil {
		return dawBackupsList{}, err
	}
	return dawBackupsList{SchemaVersion: audacity.BackupsSchemaVersion, Backups: newestFirst(rows)}, nil
}

// backupSources are what a backup's request is built from, each read on the host: the words' project seconds, and the chapter's
// track as the DAW names it. Either answers a refusal instead when the chapter cannot be backed up.
type backupSources struct {
	window func(chapterID string, first, last int) (start, end float64, refused *dawport.Result, err error)
	track  func(chapterID string) (string, *dawport.Result, error)
}

// backupSourcesIn reads the stored alignment of svc's coverage service and the chapter's link in the audio engine panel.
func backupSourcesIn(svc hostServices) backupSources {
	return backupSources{
		window: func(chapterID string, first, last int) (float64, float64, *dawport.Result, error) {
			if svc.coverage == nil {
				return 0, 0, nil, errNoProject
			}
			view, err := svc.coverage.Alignment(chapterID, coverageSettings(svc.settings).Alignment)
			if err != nil {
				return 0, 0, nil, err
			}
			resolved, refused := passagetakes.ResolveRange(view, chapterID, first, last)
			if refused != nil {
				return 0, 0, refused, nil
			}
			return resolved.Request.Start, resolved.Request.End, nil, nil
		},
		track: func(chapterID string) (string, *dawport.Result, error) {
			track, refused, err := readAloudTrackGUID(svc, chapterID)
			if err != nil || refused == nil {
				return track, nil, err
			}
			result := dawport.Refused(refused.Message)
			return "", &result, nil
		},
	}
}

// dawBackupAroundIn is DawBackupAround with the launch's DAW name, backups support, role and sources given. keeper is nil with no
// live adapter.
func dawBackupAroundIn(ctx context.Context, name string, support dawport.Support, keeper dawport.BackupKeeper, sources backupSources,
	chapterID string, firstToken, lastToken int, label string) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if !backupLabel(label) {
		return dawport.Refused(backupLabelSentence), nil
	}
	start, end, refused, err := sources.window(chapterID, firstToken, lastToken)
	if err != nil {
		return dawport.Result{}, err
	}
	if refused != nil {
		return *refused, nil
	}
	track, refused, err := sources.track(chapterID)
	if err != nil {
		return dawport.Result{}, err
	}
	if refused != nil {
		return *refused, nil
	}
	if keeper == nil {
		return dawport.Refused(fmt.Sprintf(backupNotConnectedSentence, name)), nil
	}
	result, err := keeper.BackupAround(ctx, dawport.BackupRequest{GUID: track, ChapterID: chapterID, Start: start, End: end, Label: label})
	if err != nil {
		return backupRefusal(name, err, "make the backup"), nil
	}
	return result, nil
}

// dawRestoreBackupIn is DawRestoreBackup with the launch's DAW name, backups support and role given.
func dawRestoreBackupIn(ctx context.Context, name string, support dawport.Support, keeper dawport.BackupKeeper, backupID string) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if keeper == nil {
		return dawport.Refused(fmt.Sprintf(backupNotConnectedSentence, name)), nil
	}
	result, err := keeper.RestoreBackup(ctx, backupID)
	if err != nil {
		return backupRefusal(name, err, "put the backup back"), nil
	}
	return result, nil
}

// backupLabel reports whether label is a row's text: 1 to 256 bytes of valid UTF-8 with no control characters.
func backupLabel(label string) bool {
	if label == "" || len(label) > backupLabelMaxBytes || !utf8.ValidString(label) {
		return false
	}
	return strings.IndexFunc(label, unicode.IsControl) < 0
}

// backupRefusal words an error the role returned rather than answered: the role answers its own refusals as a Result, so these
// are a capability refusal, the DAW not answering, no answer in time, or a command the DAW refused.
func backupRefusal(name string, err error, what string) dawport.Result {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused
	}
	var sentence audacitybridge.Sentence
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return dawport.Refused(fmt.Sprintf("%s did not answer within %d seconds. Check the project before trying again.", name, int(backupTimeout.Seconds())))
	case errors.As(err, &sentence):
		return dawport.Refused(strings.TrimSuffix(string(sentence), ".") + ".")
	}
	return dawport.Refused(fmt.Sprintf("%s could not %s: %s.", name, what, err.Error()))
}

// backupWindowSeconds is the narrator's window either side of an edit, or the default when the setting is not a value Settings
// would save.
func backupWindowSeconds(store *settings.Store) float64 {
	return backupSetting(store, backupWindowKey, audacity.DefaultBackupWindow)
}

// backupRetention is how long a backup is kept, from the narrator's days.
func backupRetention(store *settings.Store) time.Duration {
	return time.Duration(backupSetting(store, backupRetentionKey, 7)) * 24 * time.Hour
}

func backupSetting(store *settings.Store, key string, fallback float64) float64 {
	if store == nil {
		return fallback
	}
	value, _ := store.Effective("DAW", key, "")
	if validateNumberSetting(key, numberSpecs["DAW"][key], value) != nil {
		return fallback
	}
	number, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return number
}

// backupPruner is the part of the Audacity backups role the host prunes through (audacity.Backups.Prune).
type backupPruner interface {
	Prune(ctx context.Context, retention time.Duration) ([]string, error)
}

// pruneBackupsOnOpen removes the backups older than the narrator's retention, and their tracks, once a project opens. It runs only
// while the resolver says backups can be used, so it never sends Audacity anything while the app reports it is not connected, and
// it waits for a restore in flight (Prune holds the role's lock). A project switched away from before it starts is left alone. A
// track Audacity would not remove keeps its row, and the failure is logged.
func (h *Host) pruneBackupsOnOpen(keeper dawport.BackupKeeper) {
	pruner, ok := keeper.(backupPruner)
	if !ok {
		return
	}
	svc := h.services()
	if svc.backupKeeper != keeper {
		return
	}
	resolver, _ := h.dawResolverFor(svc)
	if !resolver.Support(dawport.CapBackups).Available {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), backupTimeout)
	defer cancel()
	if _, err := pruner.Prune(ctx, backupRetention(svc.settings)); err != nil {
		_ = h.log.Report("daw_backups_prune", "Some old Audacity backups were kept, because removing them failed: "+err.Error())
	}
}

// newestFirst orders rows by when they were made, the newest first; rows made at the same time keep the table's order.
func newestFirst(rows []audacity.Backup) []audacity.Backup {
	sorted := slices.Clone(rows)
	slices.SortStableFunc(sorted, func(a, b audacity.Backup) int { return b.CreatedAt.Compare(a.CreatedAt) })
	return sorted
}

// audacityBackups is the Audacity adapter's backups role with the pipe client under it, so configureLocked can close the pipe when
// the next project replaces the role.
type audacityBackups struct {
	*audacity.Backups
	pipe *audacitybridge.Client
}

func (a audacityBackups) closePipe() { _ = a.pipe.Close() }

// audacityBackupsFor is the Audacity backups role for the project configureLocked opens, with its table under project and the
// narrator's window read from store on each backup. The pipe is opened on the role's first request, never here.
func audacityBackupsFor(project string, reporter *persist.Reporter, store *settings.Store) audacityBackups {
	pipe := audacitybridge.New(audacitybridge.PipeTransport(), audacitybridge.Options{})
	adapter := audacity.NewWithBackups(pipe, audacity.BackupsConfig{
		Project:       func() string { return project },
		Reporter:      reporter,
		WindowSetting: func() float64 { return backupWindowSeconds(store) },
	})
	return audacityBackups{Backups: adapter.Backups(), pipe: pipe}
}
