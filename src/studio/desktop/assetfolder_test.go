package main

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/assetmove"
	"desktop/internal/assets"
	"desktop/internal/layout"
	"desktop/internal/process"
	"desktop/internal/settings"
)

type folderFixture struct {
	host    *Host
	base    string // the default folder
	other   string // a parent for chosen folders
	started chan struct{}
}

// newFolderFixture is a started host over an empty user profile: its global settings and its default asset folder are temporary.
func newFolderFixture(t *testing.T) *folderFixture {
	t.Helper()
	base := emptyUserProfile(t)
	store := settings.New(layout.FindRoot("."), "")
	host := &Host{settings: store, installJobs: map[string]*installJob{}, sidecars: process.NewSupervisor(), config: config{repoRoot: layout.FindRoot(".")}}
	host.mu.Lock()
	host.assets = host.buildAssetRegistry()
	host.mu.Unlock()
	return &folderFixture{host: host, base: base, other: t.TempDir(), started: make(chan struct{}, 1)}
}

func (f *folderFixture) seed(t *testing.T, root string) {
	t.Helper()
	for _, name := range []string{"tts/v/model.onnx", "whisper/m/model.bin", "wiktextract/index.db"} {
		path := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(name), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func (f *folderFixture) waitFor(t *testing.T, phase string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if state := f.host.modelsMoveSnapshot(); state["phase"] == phase {
			return state
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("the move never reached %q: %v", phase, f.host.modelsMoveSnapshot())
	return nil
}

func exists(path string) bool { _, err := os.Stat(path); return err == nil }

func TestMovingTheModelsFolderCopiesSwitchesAndRepointsEveryManager(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	target := filepath.Join(f.other, "models")
	if _, err := f.host.startModelsMove(target); err != nil {
		t.Fatal(err)
	}
	state := f.waitFor(t, "success")
	if state["percent"] != 100 {
		t.Fatalf("state = %v", state)
	}
	if got := f.host.registry().base; got != target {
		t.Fatalf("the registry still uses %q", got)
	}
	list, err := f.host.assetsList()
	if err != nil {
		t.Fatal(err)
	}
	if list["cacheRoot"] != target || list["defaultRoot"] != f.base || list["custom"] != true || list["previousRoot"] != f.base {
		t.Fatalf("list = cacheRoot %v defaultRoot %v custom %v previousRoot %v", list["cacheRoot"], list["defaultRoot"], list["custom"], list["previousRoot"])
	}
	for _, entry := range list["assets"].([]map[string]any) {
		if path, _ := entry["path"].(string); !strings.HasPrefix(path, target) {
			t.Fatalf("%v still points at %s", entry["id"], path)
		}
	}
	if !exists(filepath.Join(target, "tts", "v", "model.onnx")) || !exists(filepath.Join(f.base, "tts", "v", "model.onnx")) {
		t.Fatal("the move must copy and leave the old copy in place")
	}
	if got, err := assetBaseFor(f.host.settings); err != nil || got != target {
		t.Fatalf("a restart would use %q, %v", got, err)
	}
}

func TestAMoveThatFailsChangesNothing(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	f.host.moveModels = func(context.Context, assetmove.Plan, func(assetmove.Progress)) error {
		return errors.New("disk exploded")
	}
	target := filepath.Join(f.other, "models")
	if _, err := f.host.startModelsMove(target); err != nil {
		t.Fatal(err)
	}
	state := f.waitFor(t, "error")
	if !strings.Contains(state["error"].(string), "still where they were") {
		t.Fatalf("the failure does not say the models are untouched: %v", state["error"])
	}
	if f.host.registry().base != f.base {
		t.Fatal("the registry moved")
	}
	if got, _ := assetBaseFor(f.host.settings); got != f.base {
		t.Fatalf("the setting changed to %q", got)
	}
	if !exists(filepath.Join(f.base, "tts", "v", "model.onnx")) {
		t.Fatal("the old copy was touched")
	}
	list, _ := f.host.assetsList()
	if list["previousRoot"] != "" || list["custom"] != false {
		t.Fatalf("list = %v", list)
	}
}

func TestCancellingAMoveLeavesTheOldLocationInUse(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	f.host.moveModels = func(ctx context.Context, _ assetmove.Plan, report func(assetmove.Progress)) error {
		report(assetmove.Progress{Phase: assetmove.PhaseCopying, Done: 10, Total: 100})
		f.started <- struct{}{}
		<-ctx.Done()
		return ctx.Err()
	}
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "models")); err != nil {
		t.Fatal(err)
	}
	<-f.started
	if state := f.host.modelsMoveSnapshot(); state["phase"] != "copying" || state["percent"] != 10 {
		t.Fatalf("state = %v", state)
	}
	f.host.cancelModelsMove()
	f.waitFor(t, "cancelled")
	if f.host.registry().base != f.base {
		t.Fatal("the registry moved")
	}
	if got, _ := assetBaseFor(f.host.settings); got != f.base {
		t.Fatalf("the setting changed to %q", got)
	}
}

func TestOnlyOneMoveRunsAtATime(t *testing.T) {
	f := newFolderFixture(t)
	f.host.moveModels = func(ctx context.Context, _ assetmove.Plan, _ func(assetmove.Progress)) error {
		f.started <- struct{}{}
		<-ctx.Done()
		return ctx.Err()
	}
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "a")); err != nil {
		t.Fatal(err)
	}
	<-f.started
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "b")); err == nil {
		t.Fatal("a second move started")
	}
	f.host.cancelModelsMove()
	f.waitFor(t, "cancelled")
}

func TestNoDownloadStartsWhileTheFolderMovesAndNoMoveStartsDuringADownload(t *testing.T) {
	f := newFolderFixture(t)
	f.host.moveModels = func(ctx context.Context, _ assetmove.Plan, _ func(assetmove.Progress)) error {
		f.started <- struct{}{}
		<-ctx.Done()
		return ctx.Err()
	}
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "a")); err != nil {
		t.Fatal(err)
	}
	<-f.started
	if _, err := f.host.startInstall(installSpec{kind: "tts", assetID: "x", noun: "voice", run: func(context.Context, assets.Options) error { return nil }}); err == nil {
		t.Fatal("a download started during the move")
	}
	f.host.cancelModelsMove()
	f.waitFor(t, "cancelled")

	release := make(chan struct{})
	if _, err := f.host.startInstall(installSpec{kind: "tts", assetID: "x", noun: "voice", run: func(ctx context.Context, _ assets.Options) error {
		<-release
		return nil
	}}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "b")); err == nil {
		t.Fatal("a move started during a download")
	}
	close(release)
}

func TestAMoveRefusesTargetsThatCannotWork(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	file := filepath.Join(f.other, "file")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	full := filepath.Join(f.other, "full")
	if err := os.MkdirAll(full, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(full, "a.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	for name, target := range map[string]string{
		"relative":       "models",
		"inside the old": filepath.Join(f.base, "tts", "deeper"),
		"the same":       f.base,
		"a file":         file,
		"not empty":      full,
	} {
		if _, err := f.host.startModelsMove(target); err == nil {
			t.Fatalf("%s: the move started", name)
		}
		if state := f.host.modelsMoveSnapshot(); state["phase"] == "copying" {
			t.Fatalf("%s: a job is running", name)
		}
	}
	if got, _ := assetBaseFor(f.host.settings); got != f.base {
		t.Fatalf("the setting changed to %q", got)
	}
}

func TestTheOldCopyIsDeletedOnlyWhenAskedAndOnlyItsAssetFolders(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	if err := os.WriteFile(filepath.Join(f.base, "mine.txt"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "models")); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "success")
	if !exists(filepath.Join(f.base, "tts")) {
		t.Fatal("the move deleted the old copy by itself")
	}
	if err := f.host.deleteOldModels(); err != nil {
		t.Fatal(err)
	}
	if exists(filepath.Join(f.base, "tts")) || exists(filepath.Join(f.base, "whisper")) || !exists(filepath.Join(f.base, "mine.txt")) {
		t.Fatal("the old copy was not removed exactly")
	}
	if list, _ := f.host.assetsList(); list["previousRoot"] != "" {
		t.Fatalf("the offer stays: %v", list["previousRoot"])
	}
	if !exists(filepath.Join(f.other, "models", "tts", "v", "model.onnx")) {
		t.Fatal("the new copy was touched")
	}
	if err := f.host.deleteOldModels(); err == nil {
		t.Fatal("a second delete had nothing to delete and said nothing")
	}
}

func TestKeepingTheOldCopyDeletesNothingAndEndsTheOffer(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "models")); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "success")
	if err := f.host.keepOldModels(); err != nil {
		t.Fatal(err)
	}
	if !exists(filepath.Join(f.base, "tts", "v", "model.onnx")) {
		t.Fatal("keeping deleted it")
	}
	if list, _ := f.host.assetsList(); list["previousRoot"] != "" {
		t.Fatal("the offer stays")
	}
}

func TestAnotherMoveWaitsForTheAnswerAboutTheOldCopy(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "one")); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "success")
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "two")); err == nil {
		t.Fatal("a second move would forget the first old copy")
	}
}

func TestTheOldCopyIsNotOfferedForDeletionWhileItIsTheOneInUse(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	if err := f.host.settings.Save(assetsSettingsTool, "global", map[string]*string{previousModelsFolderKey: &f.base}); err != nil {
		t.Fatal(err)
	}
	if err := f.host.deleteOldModels(); err == nil {
		t.Fatal("deleted the folder in use")
	}
	if !exists(filepath.Join(f.base, "tts")) {
		t.Fatal("the folder in use was touched")
	}
}

func TestResetMovesBackToTheDefaultFolderBySameSafeMove(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	custom := filepath.Join(f.other, "models")
	if _, err := f.host.startModelsMove(custom); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "success")
	if err := f.host.deleteOldModels(); err != nil {
		t.Fatal(err)
	}
	if _, err := f.host.startModelsMove(""); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "success")
	if f.host.registry().base != f.base {
		t.Fatalf("the registry uses %q", f.host.registry().base)
	}
	list, _ := f.host.assetsList()
	if list["custom"] != false || list["previousRoot"] != custom {
		t.Fatalf("list = custom %v previousRoot %v", list["custom"], list["previousRoot"])
	}
	if !exists(filepath.Join(f.base, "whisper", "m", "model.bin")) || !exists(filepath.Join(custom, "whisper", "m", "model.bin")) {
		t.Fatal("reset must copy back and leave the custom copy for the offer")
	}
}

func TestTheGenericSettingsBindingCannotMoveTheFolder(t *testing.T) {
	f := newFolderFixture(t)
	elsewhere := "C:/elsewhere"
	if err := f.host.saveSettings(assetsSettingsTool, "global", map[string]*string{modelsFolderKey: &elsewhere}); err == nil {
		t.Fatal("the settings binding accepted the models folder, which would switch it without moving the files")
	}
}

func TestADownloadAfterTheSwitchLandsInTheNewFolder(t *testing.T) {
	f := newFolderFixture(t)
	target := filepath.Join(f.other, "models")
	if _, err := f.host.startModelsMove(target); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "success")
	list, _ := f.host.assetsList()
	for _, entry := range list["assets"].([]map[string]any) {
		if path, _ := entry["path"].(string); !strings.HasPrefix(path, target) {
			t.Fatalf("%v would install into %s", entry["id"], path)
		}
	}
}

func TestEveryMoveFailureSaysTheModelsAreWhereTheyWere(t *testing.T) {
	for name, err := range map[string]error{
		"space":    &assets.InsufficientSpaceError{Need: 3 << 30, Free: 1 << 30},
		"mismatch": assetmove.ErrMismatch,
		"link":     assetmove.ErrLink,
		"denied":   fs.ErrPermission,
		"other":    errors.New("anything"),
		"refused":  assetmove.ErrTargetNotEmpty,
	} {
		if text := moveFailureText(err); !strings.Contains(text, "still where they were") {
			t.Fatalf("%s: %q", name, text)
		}
	}
}

func TestAMoveWhoseSettingCannotBeSavedTakesItsCopyBackAndChangesNothing(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	f.host.mu.Lock()
	f.host.settings = nil
	f.host.mu.Unlock()
	target := filepath.Join(f.other, "models")
	if _, err := f.host.startModelsMove(target); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "error")
	if exists(target) {
		t.Fatalf("a copy that was never used was left in %s", target)
	}
	if f.host.registry().base != f.base || !exists(filepath.Join(f.base, "tts", "v", "model.onnx")) {
		t.Fatal("the old location was touched")
	}
}

// H1: a download or a removal that looked up its asset before a move finished must not run against the folder the move left.
func TestADownloadThatLookedUpItsAssetBeforeAMoveIsRefusedAfterIt(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	before := f.host.registry()
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "models")); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "success")
	ran := false
	_, err := f.host.startInstall(installSpec{kind: "tts", assetID: "x", noun: "voice", registry: before, run: func(context.Context, assets.Options) error { ran = true; return nil }})
	if err == nil || ran {
		t.Fatalf("an install from the old registry started (err %v, ran %v)", err, ran)
	}
	if err := f.host.removeAssetIn(before, "tts", "en_US-ljspeech-high"); err == nil {
		t.Fatal("a removal from the old registry was allowed")
	}
}

// H2: a second move that read the folders before the first one finished must read them again, and meet the old copy awaiting an answer.
func TestASecondMoveReadsTheFoldersAfterTheFirstOneFinished(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	reached, release := make(chan struct{}), make(chan struct{})
	moveStartHook = func() { close(reached); <-release }
	t.Cleanup(func() { moveStartHook = nil })
	second := make(chan error, 1)
	go func() { _, err := f.host.startModelsMove(filepath.Join(f.other, "two")); second <- err }()
	<-reached
	moveStartHook = nil
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "one")); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "success")
	close(release)
	if err := <-second; err == nil {
		t.Fatal("the second move started from the stale source and would overwrite the recorded old copy")
	}
	if list, _ := f.host.assetsList(); list["previousRoot"] != f.base {
		t.Fatalf("previousRoot = %v", list["previousRoot"])
	}
}

func TestTheOldCopyIsNotDeletedUnlessTheNewFolderHoldsEverythingInIt(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	target := filepath.Join(f.other, "models")
	if _, err := f.host.startModelsMove(target); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "success")
	if err := os.Remove(filepath.Join(target, "whisper", "m", "model.bin")); err != nil {
		t.Fatal(err)
	}
	err := f.host.deleteOldModels()
	if err == nil || !strings.Contains(err.Error(), "not complete") {
		t.Fatalf("err = %v", err)
	}
	if !exists(filepath.Join(f.base, "whisper", "m", "model.bin")) {
		t.Fatal("the only whole copy was deleted")
	}
	if list, _ := f.host.assetsList(); list["previousRoot"] != f.base {
		t.Fatal("the offer was dropped")
	}
}

func TestAMoveEndsWithItsMarkerGoneFromTheNewFolder(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	target := filepath.Join(f.other, "models")
	if _, err := f.host.startModelsMove(target); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "success")
	entries, _ := os.ReadDir(target)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".models-move-") {
			t.Fatalf("%s was left in the folder in use", entry.Name())
		}
	}
}

func TestAMoveAfterACrashBetweenPlacingAndSwitchingIsNotRefusedAsNotEmpty(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	target := filepath.Join(f.other, "models")
	// The crash window, as the mover leaves it: folders placed, marker still there, the setting never written.
	if err := assetmove.Move(context.Background(), assetmove.Plan{Source: f.base, Target: target, Dirs: assetKindDirs()}, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := f.host.startModelsMove(target); err != nil {
		t.Fatalf("the interrupted move's leftovers blocked the retry: %v", err)
	}
	f.waitFor(t, "success")
}

func TestStartupSweepsAnInterruptedMovesStagingFromTheModelsFolder(t *testing.T) {
	f := newFolderFixture(t)
	stale := filepath.Join(f.base, ".models-move-123456", "tts")
	if err := os.MkdirAll(stale, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(f.base, ".models-move-123456", ".narration-move"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	f.host.cleanStaleDownloads()
	if exists(filepath.Dir(stale)) {
		t.Fatal("stale staging kept")
	}
}

func TestAMoveStopsWhenTheAppShutsDown(t *testing.T) {
	f := newFolderFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	f.host.mu.Lock()
	f.host.ctx = ctx
	f.host.mu.Unlock()
	f.host.moveModels = func(ctx context.Context, _ assetmove.Plan, _ func(assetmove.Progress)) error {
		f.started <- struct{}{}
		<-ctx.Done()
		return ctx.Err()
	}
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "a")); err != nil {
		t.Fatal(err)
	}
	<-f.started
	cancel()
	f.waitFor(t, "cancelled")
}

// M6: a failed settings write never removes a target folder that was there before, and never removes a copy the setting now names.
func TestARolledBackMoveKeepsATargetFolderThatWasThereBefore(t *testing.T) {
	f := newFolderFixture(t)
	f.seed(t, f.base)
	f.host.mu.Lock()
	f.host.settings = nil
	f.host.mu.Unlock()
	target := filepath.Join(f.other, "empty")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := f.host.startModelsMove(target); err != nil {
		t.Fatal(err)
	}
	f.waitFor(t, "error")
	if !exists(target) || exists(filepath.Join(target, "tts")) {
		t.Fatal("the pre-existing folder was removed, or the unused copy was kept")
	}
}

// M7: a models folder in the settings file that is not a full path is not followed.
func TestAModelsFolderThatIsNotAFullPathFallsBackToTheDefaultWithANote(t *testing.T) {
	f := newFolderFixture(t)
	rel := "relative/models"
	if err := f.host.settings.Save(assetsSettingsTool, "global", map[string]*string{modelsFolderKey: &rel}); err != nil {
		t.Fatal(err)
	}
	if got, _ := assetBaseFor(f.host.settings); got != f.base {
		t.Fatalf("base = %q", got)
	}
	f.host.mu.Lock()
	f.host.assets = f.host.buildAssetRegistry()
	f.host.mu.Unlock()
	list, err := f.host.assetsList()
	if err != nil {
		t.Fatal(err)
	}
	if list["custom"] != false || !strings.Contains(list["folderNote"].(string), "not a full path") {
		t.Fatalf("custom %v note %q", list["custom"], list["folderNote"])
	}
}

func TestAModelsFolderThatCannotBeFoundIsSaidSo(t *testing.T) {
	f := newFolderFixture(t)
	gone := filepath.Join(f.other, "unplugged")
	if err := f.host.settings.Save(assetsSettingsTool, "global", map[string]*string{modelsFolderKey: &gone}); err != nil {
		t.Fatal(err)
	}
	f.host.mu.Lock()
	f.host.assets = f.host.buildAssetRegistry()
	f.host.mu.Unlock()
	list, _ := f.host.assetsList()
	if list["custom"] != true || !strings.Contains(list["folderNote"].(string), "cannot be found") {
		t.Fatalf("custom %v note %q", list["custom"], list["folderNote"])
	}
}

func TestARelativeOldCopyInTheSettingsFileIsNeverDeleted(t *testing.T) {
	f := newFolderFixture(t)
	dir := t.TempDir()
	t.Chdir(dir)
	if err := os.MkdirAll(filepath.Join(dir, "precious", "tts"), 0o755); err != nil {
		t.Fatal(err)
	}
	rel := "precious"
	if err := f.host.settings.Save(assetsSettingsTool, "global", map[string]*string{previousModelsFolderKey: &rel}); err != nil {
		t.Fatal(err)
	}
	if err := f.host.deleteOldModels(); err == nil {
		t.Fatal("deleteOldModels acted on a relative path")
	}
	if !exists(filepath.Join(dir, "precious", "tts")) {
		t.Fatal("a relative folder was deleted")
	}
}

func TestTheSettingsBindingNamesTheMoveWhenItRefusesTheFolder(t *testing.T) {
	f := newFolderFixture(t)
	v := "C:/x"
	err := f.host.saveSettings(assetsSettingsTool, "global", map[string]*string{modelsFolderKey: &v})
	if err == nil || !strings.Contains(err.Error(), "Change location") {
		t.Fatalf("err = %v", err)
	}
}

// Break 3: a move must not start while an asset is being removed, as a removal is refused during a move.
func TestNoMoveStartsWhileAnAssetIsBeingRemoved(t *testing.T) {
	f := newFolderFixture(t)
	f.host.mu.Lock()
	f.host.removing = map[string]bool{"tts/x": true}
	f.host.mu.Unlock()
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "models")); err == nil || !strings.Contains(err.Error(), "removed") {
		t.Fatalf("err = %v", err)
	}
	if state := f.host.modelsMoveSnapshot(); state["phase"] != "idle" {
		t.Fatalf("a move started: %v", state)
	}
}

// Break 6: the snapshot carries when the move began, so a page opened mid-move shows the true time.
func TestTheMoveSnapshotSaysWhenTheMoveBegan(t *testing.T) {
	f := newFolderFixture(t)
	f.host.moveModels = func(ctx context.Context, _ assetmove.Plan, _ func(assetmove.Progress)) error {
		f.started <- struct{}{}
		<-ctx.Done()
		return ctx.Err()
	}
	before := time.Now().Add(-time.Second)
	if _, err := f.host.startModelsMove(filepath.Join(f.other, "a")); err != nil {
		t.Fatal(err)
	}
	<-f.started
	at, err := time.Parse(time.RFC3339Nano, f.host.modelsMoveSnapshot()["startedAt"].(string))
	if err != nil || at.Before(before) || at.After(time.Now().Add(time.Second)) {
		t.Fatalf("startedAt = %v, %v", at, err)
	}
	f.host.cancelModelsMove()
	f.waitFor(t, "cancelled")
	if (&Host{}).modelsMoveSnapshot()["startedAt"] != "" {
		t.Fatal("an idle host has a start time")
	}
}
