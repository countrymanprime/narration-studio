package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"desktop/internal/assetmove"
	"desktop/internal/assets"
	"desktop/internal/settings"
)

// The models folder is a setting only the move below writes: its tool is not one the settings binding offers, so saving it there is
// refused and the folder can never change without its files going with it. It lives in the global settings file.
const (
	assetsSettingsTool      = "Assets"
	modelsFolderKey         = "models_folder"
	previousModelsFolderKey = "previous_models_folder"
)

// assetKindDirs are the per-kind folders inside the models folder: what a move copies, and all the "delete the old copy" ever removes.
func assetKindDirs() []string {
	return []string{ttsCacheDir, whisperCacheDir, spacyCacheDir, moonshineCacheDir, dictionaryCacheDir, encoderCacheDir, analysisCacheDir, assets.WiktextractDir}
}

// assetBaseFor is the folder downloads live in: the one the narrator moved them to, or the per-user cache folder.
func assetBaseFor(store *settings.Store) (string, error) {
	folders, err := modelsFoldersFor(store)
	return folders.active, err
}

// modelsFolders is where the downloads are, where they are by default, and the folder a move left a copy in that the narrator has not
// yet answered for ("" when none). note says, when the settings file holds a folder that cannot be used as written, what the app did.
type modelsFolders struct {
	active, def, previous, note string
	custom                      bool
}

// modelsFoldersFor reads the folders from the settings. A folder in the file that is not a full path (a hand-edited file) is not
// followed: the default is used, and the note says so.
func modelsFoldersFor(store *settings.Store) (modelsFolders, error) {
	def, err := assetCacheBase()
	if err != nil {
		return modelsFolders{}, err
	}
	folders := modelsFolders{active: def, def: def}
	if store == nil {
		return folders, nil
	}
	values := store.Global(assetsSettingsTool)
	if custom := strings.TrimSpace(values[modelsFolderKey]); custom != "" {
		switch {
		case !filepath.IsAbs(custom):
			folders.note = fmt.Sprintf("The models folder in your settings (%s) is not a full path, so the default folder is used.", custom)
		default:
			folders.active, folders.custom = custom, true
			if _, statErr := os.Stat(custom); statErr != nil {
				folders.note = "The models folder cannot be found. Reconnect its disk, or move the downloads back with the reset button."
			}
		}
	}
	if previous := strings.TrimSpace(values[previousModelsFolderKey]); previous != "" && filepath.IsAbs(previous) {
		folders.previous = previous
	}
	return folders, nil
}

// The phases of a move as the UI polls them (src/studio/ui/src/api/contracts/assets.ts).
const (
	movePhaseIdle      = "idle"
	movePhaseCopying   = "copying"
	movePhaseVerifying = "verifying"
	movePhaseSwitching = "switching"
	movePhaseSuccess   = "success"
	movePhaseCancelled = "cancelled"
	movePhaseError     = "error"
)

// modelsMoveState is the one move that may run, and the last one's result until the next starts. Its zero value is "idle".
type modelsMoveState struct {
	mu sync.Mutex
	// +checklocks:mu
	id string
	// +checklocks:mu
	phase string
	// +checklocks:mu
	target string
	// +checklocks:mu
	message string
	// +checklocks:mu
	errorText string
	// +checklocks:mu
	done int64
	// +checklocks:mu
	total int64
	// +checklocks:mu
	cancel context.CancelFunc
	// +checklocks:mu
	started time.Time
}

func (m *modelsMoveState) running() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.phase == movePhaseCopying || m.phase == movePhaseVerifying || m.phase == movePhaseSwitching
}

// modelsMoving reports whether the models folder is being moved, so a download or a removal waits: it would write into a folder that
// is about to be left.
func (h *Host) modelsMoving() bool { return h.modelsMove.running() }

var errModelsMoved = errors.New("the models folder changed while this was starting: try again")

var errModelsMoving = errors.New("the models folder is being moved: try again when the move has finished")

func (h *Host) modelsMoveSnapshot() map[string]any {
	m := &h.modelsMove
	m.mu.Lock()
	defer m.mu.Unlock()
	phase := m.phase
	if phase == "" {
		phase = movePhaseIdle
	}
	percent := 0
	switch {
	case phase == movePhaseSuccess:
		percent = 100
	case m.total > 0:
		percent = int(min(m.done*100/m.total, 99))
	}
	startedAt := ""
	if !m.started.IsZero() {
		startedAt = m.started.UTC().Format(time.RFC3339Nano)
	}
	return map[string]any{"id": m.id, "phase": phase, "startedAt": startedAt, "target": m.target, "message": m.message, "percent": percent,
		"bytesDone": m.done, "bytesTotal": m.total, "error": m.errorText}
}

func (h *Host) cancelModelsMove() map[string]any {
	m := &h.modelsMove
	m.mu.Lock()
	if m.cancel != nil && (m.phase == movePhaseCopying || m.phase == movePhaseVerifying) {
		m.cancel()
	}
	m.mu.Unlock()
	return h.modelsMoveSnapshot()
}

// moveStartHook is a seam for tests, called before the move takes its locks.
var moveStartHook func()

// startModelsMove begins moving the models folder to target ("" is the default folder) and answers with the job. It refuses, before
// anything is written, a target that cannot work, a download in progress and a second move. The folders it moves from are read inside
// the same critical section that marks the move as running, so a move that finished meanwhile is seen and not overwritten.
func (h *Host) startModelsMove(target string) (map[string]any, error) {
	store := h.settingsStore()
	if hook := moveStartHook; hook != nil {
		hook()
	}
	h.mu.Lock()
	m := &h.modelsMove
	m.mu.Lock()
	plan, toDefault, folders, err := h.planMoveLocked(store, target)
	if err != nil {
		m.mu.Unlock()
		h.mu.Unlock()
		return nil, err
	}
	parent := h.ctx
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	m.id, m.phase, m.target, m.errorText, m.done, m.total, m.cancel = fmt.Sprintf("move-%d", time.Now().UnixNano()), movePhaseCopying, plan.Target, "", 0, 0, cancel
	m.message = "Copying the models…"
	m.started = time.Now()
	m.mu.Unlock()
	h.mu.Unlock()
	go h.runModelsMove(ctx, plan, toDefault, folders)
	return h.modelsMoveSnapshot(), nil
}

// planMoveLocked checks that a move may start and makes its plan from the folders as they are now. The caller holds h.mu and m.mu.
//
// +checklocks:h.mu
// +checklocks:h.modelsMove.mu
func (h *Host) planMoveLocked(store *settings.Store, target string) (assetmove.Plan, bool, modelsFolders, error) {
	m := &h.modelsMove
	if m.phase == movePhaseCopying || m.phase == movePhaseVerifying || m.phase == movePhaseSwitching {
		return assetmove.Plan{}, false, modelsFolders{}, fmt.Errorf("the models are already being moved")
	}
	if len(h.removing) > 0 {
		return assetmove.Plan{}, false, modelsFolders{}, fmt.Errorf("a download is being removed: try again in a moment")
	}
	for _, job := range h.installJobs {
		if job.running() {
			return assetmove.Plan{}, false, modelsFolders{}, fmt.Errorf("a download is running: wait for it to finish or cancel it, then move the models")
		}
	}
	folders, err := modelsFoldersFor(store)
	if err != nil {
		return assetmove.Plan{}, false, modelsFolders{}, err
	}
	if folders.previous != "" {
		return assetmove.Plan{}, false, modelsFolders{}, fmt.Errorf("the old copy in %s is still on this computer: delete it or keep it before moving the models again", folders.previous)
	}
	toDefault := strings.TrimSpace(target) == ""
	if toDefault {
		target = folders.def
	} else if !filepath.IsAbs(target) {
		return assetmove.Plan{}, false, modelsFolders{}, fmt.Errorf("choose a folder by its full path")
	}
	plan := assetmove.Plan{Source: folders.active, Target: filepath.Clean(target), Dirs: assetKindDirs()}
	if err := assetmove.Check(plan); err != nil {
		return assetmove.Plan{}, false, modelsFolders{}, errors.New(moveRefusalText(err))
	}
	return plan, toDefault, folders, nil
}

func (h *Host) runModelsMove(ctx context.Context, plan assetmove.Plan, toDefault bool, folders modelsFolders) {
	m := &h.modelsMove
	defer func() {
		m.mu.Lock()
		cancel := m.cancel
		m.mu.Unlock()
		if cancel != nil {
			cancel()
		}
	}()
	move := h.moveModels
	if move == nil {
		move = assetmove.Move
	}
	made := assetmove.MissingFolders(plan.Target)
	err := h.guardedMove(ctx, move, plan, func(p assetmove.Progress) {
		m.mu.Lock()
		defer m.mu.Unlock()
		m.phase, m.done, m.total = p.Phase, p.Done, p.Total
		if p.Phase == assetmove.PhaseVerifying {
			m.message = "Checking the copy…"
		}
	})
	if err == nil {
		m.mu.Lock()
		m.phase, m.message = movePhaseSwitching, "Switching…"
		m.mu.Unlock()
		if err = h.switchModelsFolder(plan, toDefault, folders); err != nil {
			h.rollBackMove(plan, made)
		} else {
			_ = assetmove.Finish(plan.Target)
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	switch {
	case err == nil:
		m.phase, m.message, m.done = movePhaseSuccess, "The models are in the new folder and in use.", m.total
	case ctx.Err() != nil && errors.Is(err, context.Canceled):
		m.phase, m.message, m.errorText = movePhaseCancelled, "The move was cancelled. Your models are still where they were.", ""
	default:
		_ = h.log.Report("models_move_failed", err.Error())
		m.phase, m.errorText = movePhaseError, moveFailureText(err)
		m.message = m.errorText
	}
}

// guardedMove runs the mover and turns a panic into a failure, so a move never stays "copying" for good.
func (h *Host) guardedMove(ctx context.Context, move func(context.Context, assetmove.Plan, func(assetmove.Progress)) error, plan assetmove.Plan, report func(assetmove.Progress)) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("the move stopped unexpectedly: %v", recovered)
		}
	}()
	return move(ctx, plan, report)
}

// switchModelsFolder is the step after a verified copy: write the setting, then point every manager at the new folder. The old folder
// is remembered for the offer to delete it, and nothing in it is touched. If the setting cannot be written the registry is not changed.
func (h *Host) switchModelsFolder(plan assetmove.Plan, toDefault bool, folders modelsFolders) error {
	store := h.settingsStore()
	if store == nil {
		return fmt.Errorf("the settings could not be saved")
	}
	changes := map[string]*string{modelsFolderKey: &plan.Target}
	if toDefault {
		changes[modelsFolderKey] = nil
	}
	if holdsAssets(plan.Source, plan.Dirs) {
		source := plan.Source
		changes[previousModelsFolderKey] = &source
	}
	if err := store.Save(assetsSettingsTool, "global", changes); err != nil {
		// A write that failed may still have landed: if the setting now names the new folder it is the folder in use, whatever was reported.
		if now, _ := modelsFoldersFor(store); now.active != plan.Target || now.custom == toDefault {
			return err
		}
	}
	h.mu.Lock()
	h.assets = h.buildAssetRegistry()
	h.mu.Unlock()
	return nil
}

// rollBackMove takes away a copy that was placed but never used, so the narrator can try the same folder once the cause is gone. It
// removes only the copied per-kind folders and the marker, and the target itself only if the move made it, and only if the setting
// still names the old folder: a copy the setting now points at is never removed.
func (h *Host) rollBackMove(plan assetmove.Plan, made []string) {
	if now, _ := modelsFoldersFor(h.settingsStore()); now.active == plan.Target {
		return
	}
	_ = assetmove.RemoveKinds(plan.Target, plan.Dirs)
	_ = assetmove.Finish(plan.Target)
	assetmove.RemoveEmpty(made)
}

func holdsAssets(root string, dirs []string) bool {
	for _, dir := range dirs {
		if entries, err := os.ReadDir(filepath.Join(root, dir)); err == nil && len(entries) > 0 {
			return true
		}
	}
	return false
}

// settingsStore is the settings store, read the way the registry builder does: nil in a test that builds a host by hand.
func (h *Host) settingsStore() *settings.Store { return h.services().settings }

var errNoOldCopy = errors.New("there is no old copy to answer for")

// previousCopy is the old copy awaiting an answer, checked to be safe to act on.
func (h *Host) previousCopy() (string, error) {
	folders, err := modelsFoldersFor(h.settingsStore())
	if err != nil {
		return "", err
	}
	if folders.previous == "" {
		return "", errNoOldCopy
	}
	return folders.previous, nil
}

// keepOldModels ends the offer without deleting anything.
func (h *Host) keepOldModels() error {
	if _, err := h.previousCopy(); err != nil {
		return err
	}
	return h.settingsStore().Save(assetsSettingsTool, "global", map[string]*string{previousModelsFolderKey: nil})
}

// deleteOldModels removes the asset folders of the old copy, and the old folder if nothing else is in it. It refuses while the old copy
// is the one in use or holds it, while a move runs, and while work that may still be reading it is running.
func (h *Host) deleteOldModels() error {
	previous, err := h.previousCopy()
	if err != nil {
		return err
	}
	if h.modelsMoving() {
		return errModelsMoving
	}
	folders, _ := modelsFoldersFor(h.settingsStore())
	if assetmove.Related(previous, folders.active) {
		return fmt.Errorf("that folder is the one the models are in now, so it was not deleted")
	}
	if err := assetmove.Covered(previous, folders.active, assetKindDirs()); err != nil {
		return fmt.Errorf("the models folder in use is not complete (%v), so the old copy was not deleted", err)
	}
	h.mu.RLock()
	idle := h.idleLocked()
	h.mu.RUnlock()
	if !idle {
		return fmt.Errorf("something that may still be reading the old copy is running: delete it when that has finished")
	}
	if err := assetmove.RemoveOld(previous, assetKindDirs()); err != nil {
		return fmt.Errorf("the old copy could only be partly deleted, so some of it may be gone: %w", err)
	}
	return h.settingsStore().Save(assetsSettingsTool, "global", map[string]*string{previousModelsFolderKey: nil})
}

// moveRefusalText is why a target was refused before anything was copied, in the narrator's words.
func moveRefusalText(err error) string {
	switch {
	case errors.Is(err, assetmove.ErrSameFolder):
		return "The models are already in that folder."
	case errors.Is(err, assetmove.ErrTargetInsideSource):
		return "Choose a folder outside the one the models are in now."
	case errors.Is(err, assetmove.ErrSourceInsideTarget):
		return "Choose a folder that does not contain the one the models are in now."
	case errors.Is(err, assetmove.ErrTargetNotEmpty):
		return "That folder is not empty. Choose an empty folder, or make a new one."
	}
	return "That folder cannot be used: " + err.Error()
}

// moveFailureText is what a narrator reads when a move failed: what happened, and that the models are where they were.
func moveFailureText(err error) string {
	const untouched = " Your models are still where they were."
	var short *assets.InsufficientSpaceError
	switch {
	case errors.As(err, &short):
		return fmt.Sprintf("The disk that folder is on does not have room: the models need about %s and it has %s free. Free some space or choose another folder.", sizeText(short.Need), sizeText(short.Free)) + untouched
	case assets.IsDiskFull(err):
		return "The disk filled up while the models were being copied. Free some space or choose another folder." + untouched
	case errors.Is(err, assetmove.ErrMismatch):
		return "A copied file did not match the original, so the copy was thrown away. Try again; if it keeps happening, the disk may be failing." + untouched
	case errors.Is(err, assetmove.ErrLink):
		return "The current folder holds a link to somewhere else, which is not moved." + untouched
	case errors.Is(err, fs.ErrPermission):
		return "That folder cannot be written to. Choose another folder." + untouched
	case errors.Is(err, assetmove.ErrTargetNotEmpty), errors.Is(err, assetmove.ErrSameFolder), errors.Is(err, assetmove.ErrTargetInsideSource), errors.Is(err, assetmove.ErrSourceInsideTarget):
		return moveRefusalText(err) + untouched
	}
	return "The models could not be copied to that folder. Check that it is on a disk that is connected and has room, then try again." + untouched
}

// pickModelsFolderPath asks for the new folder; "" means the narrator cancelled.
func (h *Host) pickModelsFolderPath() (string, error) {
	if h.pickModelsFolder != nil {
		return h.pickModelsFolder()
	}
	return pickFolder("Choose the new folder for models and downloads")
}

// sizeText is a size a narrator reads: whole megabytes below a gigabyte, one decimal of a gigabyte above.
func sizeText(n uint64) string {
	const megabyte, gigabyte = 1 << 20, 1 << 30
	if n >= gigabyte {
		return fmt.Sprintf("%.1f GB", float64(n)/gigabyte)
	}
	return fmt.Sprintf("%d MB", (n+megabyte/2)/megabyte)
}
