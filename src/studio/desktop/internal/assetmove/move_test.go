package assetmove

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"
)

var kinds = []string{"tts", "whisper", "wiktextract"}

// seed writes a small asset cache under root and returns every file's relative path and content.
func seed(t *testing.T, root string) map[string]string {
	t.Helper()
	files := map[string]string{
		"tts/voice.onnx":          strings.Repeat("v", 5000),
		"tts/voice.json":          `{"a":1}`,
		"whisper/small/model.bin": strings.Repeat("w", 9000),
		"whisper/small/.manifest": "manifest",
		"wiktextract/index.db":    "index",
	}
	for name, content := range files {
		path := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return files
}

func listing(t *testing.T, root string) []string {
	t.Helper()
	var names []string
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err == nil && path != root {
			rel, _ := filepath.Rel(root, path)
			names = append(names, filepath.ToSlash(rel))
		}
		return nil
	})
	sort.Strings(names)
	return names
}

func assertIntact(t *testing.T, source string, files map[string]string) {
	t.Helper()
	for name, want := range files {
		got, err := os.ReadFile(filepath.Join(source, filepath.FromSlash(name)))
		if err != nil || string(got) != want {
			t.Fatalf("source file %s changed: %v", name, err)
		}
	}
}

func TestMoveCopiesVerifiesAndLeavesTheSourceUntouched(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	files := seed(t, source)
	var last Progress
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, func(p Progress) { last = p }); err != nil {
		t.Fatal(err)
	}
	for name, want := range files {
		got, err := os.ReadFile(filepath.Join(target, filepath.FromSlash(name)))
		if err != nil || string(got) != want {
			t.Fatalf("%s not copied: %v", name, err)
		}
	}
	assertIntact(t, source, files)
	if last.Total == 0 || last.Done != last.Total {
		t.Fatalf("progress ended at %+v", last)
	}
	for _, name := range listing(t, target) {
		if strings.Contains(name, movingPrefix) && name != journalName {
			t.Fatalf("staging left behind: %s", name)
		}
	}
}

func TestMoveIgnoresFoldersThatAreNotAssetKinds(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	seed(t, source)
	if err := os.WriteFile(filepath.Join(source, "notes.txt"), []byte("mine"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(target, "notes.txt")); err == nil {
		t.Fatal("a file that is not an asset was copied")
	}
}

func TestMoveCancelledPartwayLeavesNoCopyAndTheSourceUntouched(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	files := seed(t, source)
	ctx, cancel := context.WithCancel(context.Background())
	seen := 0
	err := Move(ctx, Plan{Source: source, Target: target, Dirs: kinds}, func(p Progress) {
		if p.Phase == PhaseCopying && p.Done > 0 {
			if seen++; seen == 2 {
				cancel()
			}
		}
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
	assertIntact(t, source, files)
	if _, statErr := os.Stat(target); statErr == nil {
		t.Fatalf("the target the move made was not removed: %v", listing(t, target))
	}
}

func TestMoveCancelledInAnExistingEmptyTargetKeepsTheFolderButNothingInIt(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), t.TempDir()
	files := seed(t, source)
	ctx, cancel := context.WithCancel(context.Background())
	err := Move(ctx, Plan{Source: source, Target: target, Dirs: kinds}, func(p Progress) {
		if p.Phase == PhaseCopying && p.Done > 0 {
			cancel()
		}
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
	assertIntact(t, source, files)
	if left := listing(t, target); len(left) != 0 {
		t.Fatalf("target holds %v", left)
	}
}

func TestMoveRefusesACopyThatDoesNotMatchTheSource(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	files := seed(t, source)
	afterCopy = func(dst string) error {
		if filepath.Base(dst) == "model.bin" {
			return os.WriteFile(dst, []byte(strings.Repeat("X", 9000)), 0o644) // same size, other bytes
		}
		return nil
	}
	t.Cleanup(func() { afterCopy = func(string) error { return nil } })
	err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil)
	if !errors.Is(err, ErrMismatch) {
		t.Fatalf("want ErrMismatch, got %v", err)
	}
	assertIntact(t, source, files)
	if _, statErr := os.Stat(target); statErr == nil {
		t.Fatalf("a copy that failed its check was left at the target: %v", listing(t, target))
	}
}

func TestMoveRefusesATruncatedCopy(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	seed(t, source)
	afterCopy = func(dst string) error {
		if filepath.Base(dst) == "voice.onnx" {
			return os.Truncate(dst, 10)
		}
		return nil
	}
	t.Cleanup(func() { afterCopy = func(string) error { return nil } })
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); !errors.Is(err, ErrMismatch) {
		t.Fatalf("want ErrMismatch, got %v", err)
	}
}

func TestMoveStopsOnAWriteFailureAndCleansUp(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	files := seed(t, source)
	boom := errors.New("no space left on device")
	afterCopy = func(string) error { return boom }
	t.Cleanup(func() { afterCopy = func(string) error { return nil } })
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); !errors.Is(err, boom) {
		t.Fatalf("want the write error, got %v", err)
	}
	assertIntact(t, source, files)
	if _, statErr := os.Stat(target); statErr == nil {
		t.Fatal("target left behind")
	}
}

func TestMoveRefusesATargetInsideTheSource(t *testing.T) {
	source := filepath.Join(t.TempDir(), "old")
	files := seed(t, source)
	err := Move(context.Background(), Plan{Source: source, Target: filepath.Join(source, "tts", "deeper"), Dirs: kinds}, nil)
	if !errors.Is(err, ErrTargetInsideSource) {
		t.Fatalf("want ErrTargetInsideSource, got %v", err)
	}
	assertIntact(t, source, files)
	if _, statErr := os.Stat(filepath.Join(source, "tts", "deeper")); statErr == nil {
		t.Fatal("a folder was made inside the source")
	}
}

func TestMoveRefusesASourceInsideTheTarget(t *testing.T) {
	parent := t.TempDir()
	source := filepath.Join(parent, "models")
	seed(t, source)
	if err := Move(context.Background(), Plan{Source: source, Target: parent, Dirs: kinds}, nil); !errors.Is(err, ErrSourceInsideTarget) {
		t.Fatalf("want ErrSourceInsideTarget, got %v", err)
	}
}

func TestMoveRefusesTheSameFolder(t *testing.T) {
	source := filepath.Join(t.TempDir(), "old")
	seed(t, source)
	if err := Move(context.Background(), Plan{Source: source, Target: source + string(filepath.Separator), Dirs: kinds}, nil); !errors.Is(err, ErrSameFolder) {
		t.Fatalf("want ErrSameFolder, got %v", err)
	}
}

func TestMoveRefusesATargetThatIsNotEmpty(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), t.TempDir()
	files := seed(t, source)
	if err := os.WriteFile(filepath.Join(target, "mine.txt"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); !errors.Is(err, ErrTargetNotEmpty) {
		t.Fatalf("want ErrTargetNotEmpty, got %v", err)
	}
	assertIntact(t, source, files)
	if got := listing(t, target); len(got) != 1 || got[0] != "mine.txt" {
		t.Fatalf("target changed: %v", got)
	}
}

func TestMoveClearsAStagingFolderAnInterruptedMoveLeft(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), t.TempDir()
	seed(t, source)
	stale := filepath.Join(target, movingPrefix+"123456", "tts")
	if err := os.MkdirAll(stale, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, movingPrefix+"123456", stagingMarker), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); err != nil {
		t.Fatalf("an earlier interrupted move blocked this one: %v", err)
	}
	for _, name := range listing(t, target) {
		if strings.Contains(name, movingPrefix) && name != journalName {
			t.Fatalf("stale staging kept: %s", name)
		}
	}
}

func TestMoveRefusesATargetThatCannotBeWritten(t *testing.T) {
	source := filepath.Join(t.TempDir(), "old")
	files := seed(t, source)
	blocker := filepath.Join(t.TempDir(), "afile")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	for name, target := range map[string]string{"a file": blocker, "under a file": filepath.Join(blocker, "models")} {
		if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); err == nil {
			t.Fatalf("%s: want an error", name)
		}
	}
	assertIntact(t, source, files)
}

func TestMoveRefusesAReadOnlyTarget(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("permissions are not enforced for this user")
	}
	source, parent := filepath.Join(t.TempDir(), "old"), t.TempDir()
	files := seed(t, source)
	if err := os.Chmod(parent, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(parent, 0o755) })
	if err := Move(context.Background(), Plan{Source: source, Target: parent}, nil); err == nil {
		t.Fatal("want an error for a read-only target")
	}
	assertIntact(t, source, files)
}

func TestMoveOfASourceWithNothingDownloadedMovesNothing(t *testing.T) {
	if err := Move(context.Background(), Plan{Source: filepath.Join(t.TempDir(), "nope"), Target: filepath.Join(t.TempDir(), "new"), Dirs: kinds}, nil); err != nil {
		t.Fatalf("a source with nothing downloaded yet moves as nothing: %v", err)
	}
}

func TestMoveRefusesALinkInTheSource(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("links need privileges on Windows")
	}
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	seed(t, source)
	if err := os.Symlink("/etc/hostname", filepath.Join(source, "tts", "link")); err != nil {
		t.Fatal(err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); !errors.Is(err, ErrLink) {
		t.Fatalf("want ErrLink, got %v", err)
	}
}

func TestRemoveOldDeletesOnlyTheAssetFolders(t *testing.T) {
	old := filepath.Join(t.TempDir(), "old")
	seed(t, old)
	if err := os.WriteFile(filepath.Join(old, "mine.txt"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := RemoveOld(old, kinds); err != nil {
		t.Fatal(err)
	}
	if got := listing(t, old); len(got) != 1 || got[0] != "mine.txt" {
		t.Fatalf("left %v", got)
	}
}

func TestRemoveOldRemovesTheFolderItselfWhenItIsEmptyAfterwards(t *testing.T) {
	old := filepath.Join(t.TempDir(), "old")
	seed(t, old)
	if err := RemoveOld(old, kinds); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(old); err == nil {
		t.Fatal("the emptied folder was kept")
	}
}

func TestRemoveOldRefusesARoot(t *testing.T) {
	for _, path := range []string{"", string(filepath.Separator), "."} {
		if err := RemoveOld(path, kinds); err == nil {
			t.Fatalf("%q: want a refusal", path)
		}
	}
}

func TestMoveReportsProgressInBothPhases(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	seed(t, source)
	phases := map[string]bool{}
	timeout := time.After(10 * time.Second)
	done := make(chan error, 1)
	go func() {
		done <- Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, func(p Progress) { phases[p.Phase] = true })
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-timeout:
		t.Fatal("timed out")
	}
	if !phases[PhaseCopying] || !phases[PhaseVerifying] {
		t.Fatalf("phases seen: %v", phases)
	}
}

func TestRelatedSeesTheSameFolderAndEitherHoldingTheOther(t *testing.T) {
	root := t.TempDir()
	for target, want := range map[string]bool{root: true, filepath.Join(root, "a"): true, filepath.Dir(root): true, t.TempDir(): false} {
		if got := Related(root, target); got != want {
			t.Fatalf("Related(%s, %s) = %v", root, target, got)
		}
	}
}

func TestEveryCopiedFileIsFlushedBeforeItIsChecked(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	files := seed(t, source)
	synced := 0
	syncFile = func(f *os.File) error { synced++; return f.Sync() }
	t.Cleanup(func() { syncFile = func(f *os.File) error { return f.Sync() } })
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); err != nil {
		t.Fatal(err)
	}
	if synced != len(files)+1 { // and the marker
		t.Fatalf("%d of %d files were flushed", synced, len(files)+1)
	}
}

func TestAFlushFailureStopsTheMove(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	seed(t, source)
	boom := errors.New("flush failed")
	syncFile = func(*os.File) error { return boom }
	t.Cleanup(func() { syncFile = func(f *os.File) error { return f.Sync() } })
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); !errors.Is(err, boom) {
		t.Fatalf("want the flush error, got %v", err)
	}
	if _, err := os.Stat(target); err == nil {
		t.Fatal("target left behind")
	}
}

func TestCoveredAcceptsACompleteCopyAndNamesWhatIsMissingOrShort(t *testing.T) {
	old, now := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	seed(t, old)
	if err := Move(context.Background(), Plan{Source: old, Target: now, Dirs: kinds}, nil); err != nil {
		t.Fatal(err)
	}
	if err := Covered(old, now, kinds); err != nil {
		t.Fatalf("a complete copy was refused: %v", err)
	}
	if err := os.Remove(filepath.Join(now, "whisper", "small", "model.bin")); err != nil {
		t.Fatal(err)
	}
	if err := Covered(old, now, kinds); !errors.Is(err, ErrIncomplete) {
		t.Fatalf("a missing file was accepted: %v", err)
	}
	if err := os.WriteFile(filepath.Join(now, "whisper", "small", "model.bin"), []byte("short"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Covered(old, now, kinds); !errors.Is(err, ErrIncomplete) {
		t.Fatalf("a short file was accepted: %v", err)
	}
	if err := os.RemoveAll(filepath.Join(now, "tts")); err != nil {
		t.Fatal(err)
	}
	if err := Covered(old, filepath.Join(t.TempDir(), "gone"), kinds); !errors.Is(err, ErrIncomplete) {
		t.Fatalf("a missing folder was accepted: %v", err)
	}
}

func TestCoveredIgnoresKindsTheOldFolderNeverHad(t *testing.T) {
	old, now := filepath.Join(t.TempDir(), "old"), t.TempDir()
	if err := os.MkdirAll(filepath.Join(old, "tts"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := Covered(old, now, kinds); err != nil {
		t.Fatalf("an empty kind folder needs nothing: %v", err)
	}
}

func TestMoveSeesALinkedParentAsInsideTheSource(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("links need privileges on Windows")
	}
	source := filepath.Join(t.TempDir(), "old")
	files := seed(t, source)
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(source, alias); err != nil {
		t.Fatal(err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: filepath.Join(alias, "new"), Dirs: kinds}, nil); !errors.Is(err, ErrTargetInsideSource) {
		t.Fatalf("want ErrTargetInsideSource, got %v", err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: alias, Dirs: kinds}, nil); !errors.Is(err, ErrSameFolder) {
		t.Fatalf("want ErrSameFolder, got %v", err)
	}
	assertIntact(t, source, files)
}

func TestMoveSeesTheSameFolderUnderAnotherSpellingOfItsName(t *testing.T) {
	source := filepath.Join(t.TempDir(), "Old")
	seed(t, source)
	variant := filepath.Join(filepath.Dir(source), "oLd")
	if _, err := os.Stat(variant); err != nil {
		t.Skip("this file system tells Old from old")
	}
	if err := Move(context.Background(), Plan{Source: source, Target: variant, Dirs: kinds}, nil); !errors.Is(err, ErrSameFolder) {
		t.Fatalf("want ErrSameFolder, got %v", err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: filepath.Join(variant, "x"), Dirs: kinds}, nil); !errors.Is(err, ErrTargetInsideSource) {
		t.Fatalf("want ErrTargetInsideSource, got %v", err)
	}
}

func TestMoveRefusesAKindFolderOfTheSourceAsTarget(t *testing.T) {
	source := filepath.Join(t.TempDir(), "old")
	files := seed(t, source)
	if err := Move(context.Background(), Plan{Source: source, Target: filepath.Join(source, "whisper"), Dirs: kinds}, nil); !errors.Is(err, ErrTargetInsideSource) {
		t.Fatalf("want ErrTargetInsideSource, got %v", err)
	}
	assertIntact(t, source, files)
}

func TestNamesWindowsWouldChangeAreRefused(t *testing.T) {
	for path, bad := range map[string]bool{`D:\models`: false, `D:\models.`: true, `D:\models \x`: true, `D:\a.b\c`: false, `D:\..\x`: false, `D:\x \`: true} {
		if got := hasTrailingDotOrSpace(path); got != bad {
			t.Fatalf("%q: %v", path, got)
		}
	}
}

func TestMoveRefusesAnEntryThatIsNotAFileOrAFolder(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("no named pipes here")
	}
	if _, err := exec.LookPath("mkfifo"); err != nil {
		t.Skip("no mkfifo")
	}
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	seed(t, source)
	if err := exec.Command("mkfifo", filepath.Join(source, "tts", "pipe")).Run(); err != nil {
		t.Skip("mkfifo failed")
	}
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); !errors.Is(err, ErrLink) {
		t.Fatalf("want ErrLink, got %v", err)
	}
}

func TestAnInterruptedMovesPlacedFoldersAreRecognisedAndCleanedOnTheNextTry(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	files := seed(t, source)
	// The crash window: every folder renamed into place, the setting never written, so Finish was never called.
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); err != nil {
		t.Fatal(err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); err != nil {
		t.Fatalf("an interrupted move blocked the next: %v", err)
	}
	assertIntact(t, source, files)
	if err := Covered(source, target, kinds); err != nil {
		t.Fatal(err)
	}
	if err := Finish(target); err != nil {
		t.Fatal(err)
	}
	for _, name := range listing(t, target) {
		if strings.Contains(name, movingPrefix) {
			t.Fatalf("marker kept after Finish: %s", name)
		}
	}
}

func TestRecoveryNeverTouchesAFileThatIsNotTheInterruptedMovesOwn(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
	seed(t, source)
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "mine.txt"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); !errors.Is(err, ErrTargetNotEmpty) {
		t.Fatalf("want ErrTargetNotEmpty, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(target, "mine.txt")); err != nil {
		t.Fatal("a foreign file was touched")
	}
	if _, err := os.Stat(filepath.Join(target, "tts")); err != nil {
		t.Fatal("the leftovers were removed although the folder is not just leftovers")
	}
}

func TestAForgedMarkerCannotNameAFolderOutsideTheKinds(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), t.TempDir()
	seed(t, source)
	victim := filepath.Join(target, "documents")
	if err := os.MkdirAll(victim, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, journalName), []byte(`{"dirs":["documents","../x"]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); !errors.Is(err, ErrTargetNotEmpty) {
		t.Fatalf("want ErrTargetNotEmpty, got %v", err)
	}
	if _, err := os.Stat(victim); err != nil {
		t.Fatal("a folder the marker named was removed")
	}
}

func TestSweepStaleRemovesOnlyStagingFolders(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, movingPrefix+"123456", "tts"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, movingPrefix+"123456", stagingMarker), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "tts"), 0o755); err != nil {
		t.Fatal(err)
	}
	if removed := SweepStale(root); len(removed) != 1 {
		t.Fatalf("removed %v", removed)
	}
	if got := listing(t, root); len(got) != 1 || got[0] != "tts" {
		t.Fatalf("left %v", got)
	}
}

func TestRemoveKindsKeepsTheFolderItself(t *testing.T) {
	root := filepath.Join(t.TempDir(), "root")
	seed(t, root)
	if err := RemoveKinds(root, kinds); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(root); err != nil {
		t.Fatal("the folder itself was removed")
	}
}

// Break 1: a folder of the narrator's that happens to start like our staging folders is not ours to remove or to ignore.
func TestMoveNeverRemovesAFolderItDidNotMake(t *testing.T) {
	source, target := filepath.Join(t.TempDir(), "old"), t.TempDir()
	seed(t, source)
	mine := filepath.Join(target, movingPrefix+"mine")
	if err := os.MkdirAll(mine, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(mine, "precious.txt"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); !errors.Is(err, ErrTargetNotEmpty) {
		t.Fatalf("want ErrTargetNotEmpty, got %v", err)
	}
	if removed := SweepStale(target); len(removed) != 0 {
		t.Fatalf("SweepStale removed %v", removed)
	}
	if err := RemoveOld(target, kinds); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(mine, "precious.txt")); err != nil {
		t.Fatal("the narrator's folder was removed")
	}
}

// Break 2: a move that does not complete leaves no folder it created, however deep, and none that was there before.
func TestMoveCancelledLeavesNoFoldersItCreated(t *testing.T) {
	source, base := filepath.Join(t.TempDir(), "old"), t.TempDir()
	files := seed(t, source)
	target := filepath.Join(base, "a", "b", "c")
	ctx, cancel := context.WithCancel(context.Background())
	err := Move(ctx, Plan{Source: source, Target: target, Dirs: kinds}, func(p Progress) {
		if p.Phase == PhaseCopying && p.Done > 0 {
			cancel()
		}
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
	assertIntact(t, source, files)
	if got := listing(t, base); len(got) != 0 {
		t.Fatalf("folders left behind: %v", got)
	}
}

func TestAFailedMoveKeepsTheParentFoldersThatWereThereBefore(t *testing.T) {
	source, base := filepath.Join(t.TempDir(), "old"), t.TempDir()
	seed(t, source)
	if err := os.MkdirAll(filepath.Join(base, "a"), 0o755); err != nil {
		t.Fatal(err)
	}
	afterCopy = func(string) error { return errors.New("boom") }
	t.Cleanup(func() { afterCopy = func(string) error { return nil } })
	if err := Move(context.Background(), Plan{Source: source, Target: filepath.Join(base, "a", "b", "c"), Dirs: kinds}, nil); err == nil {
		t.Fatal("want an error")
	}
	if got := listing(t, base); len(got) != 1 || got[0] != "a" {
		t.Fatalf("left %v", got)
	}
}

func TestMoveToANameTheDiskRefusesLeavesNoParentsBehind(t *testing.T) {
	source, base := filepath.Join(t.TempDir(), "old"), t.TempDir()
	seed(t, source)
	long := strings.Repeat("x", 300)
	if err := Move(context.Background(), Plan{Source: source, Target: filepath.Join(base, "a", "b", long), Dirs: kinds}, nil); err == nil {
		t.Skip("this disk accepts a name that long")
	}
	if got := listing(t, base); len(got) != 0 {
		t.Fatalf("folders left behind: %v", got)
	}
}

func TestRemoveEmptyRemovesOnlyEmptyFolders(t *testing.T) {
	root := t.TempDir()
	empty, full := filepath.Join(root, "a", "b"), filepath.Join(root, "c")
	for _, dir := range []string{empty, full} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(full, "keep"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	RemoveEmpty([]string{empty, filepath.Dir(empty), full})
	if _, err := os.Stat(filepath.Join(root, "a")); err == nil {
		t.Fatal("an empty folder was kept")
	}
	if _, err := os.Stat(filepath.Join(full, "keep")); err != nil {
		t.Fatal("a folder with a file was removed")
	}
}

func TestMissingFoldersListsWhatMakingThePathWouldCreateDeepestFirst(t *testing.T) {
	root := t.TempDir()
	got := MissingFolders(filepath.Join(root, "a", "b"))
	if len(got) != 2 || filepath.Base(got[0]) != "b" || filepath.Base(got[1]) != "a" {
		t.Fatalf("got %v", got)
	}
	if got := MissingFolders(root); len(got) != 0 {
		t.Fatalf("an existing folder: %v", got)
	}
}

func TestFinishWithNoMarkerIsFine(t *testing.T) {
	if err := Finish(t.TempDir()); err != nil {
		t.Fatal(err)
	}
}

func TestACopyWithAnExtraFileOrAMissingOneFailsTheCheck(t *testing.T) {
	for name, hook := range map[string]func(dst string) error{
		"extra": func(dst string) error {
			if filepath.Base(dst) == "voice.json" {
				return os.WriteFile(filepath.Join(filepath.Dir(dst), "stowaway"), []byte("x"), 0o644)
			}
			return nil
		},
		"missing": func(dst string) error {
			if filepath.Base(dst) == "voice.json" {
				return os.Remove(dst)
			}
			return nil
		},
	} {
		source, target := filepath.Join(t.TempDir(), "old"), filepath.Join(t.TempDir(), "new")
		seed(t, source)
		afterCopy = hook
		err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil)
		afterCopy = func(string) error { return nil }
		if !errors.Is(err, ErrMismatch) {
			t.Fatalf("%s: want ErrMismatch, got %v", name, err)
		}
		if _, statErr := os.Stat(target); statErr == nil {
			t.Fatalf("%s: target left behind", name)
		}
	}
}

func TestCheckRefusesATargetThatIsAFileAndAnUnreadableSource(t *testing.T) {
	file := filepath.Join(t.TempDir(), "f")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Check(Plan{Source: filepath.Join(t.TempDir(), "old"), Target: file, Dirs: kinds}); err == nil {
		t.Fatal("a file was accepted as the target")
	}
}

func TestCoveredFindsAFolderTheOldOneHasAndTheNewOneLacks(t *testing.T) {
	old := filepath.Join(t.TempDir(), "old")
	seed(t, old)
	if err := Covered(old, t.TempDir(), kinds); !errors.Is(err, ErrIncomplete) {
		t.Fatalf("got %v", err)
	}
}

func TestMoveWithNoProgressCallbackAndAnEmptySourceWorks(t *testing.T) {
	target := filepath.Join(t.TempDir(), "new")
	if err := Move(context.Background(), Plan{Source: t.TempDir(), Target: target, Dirs: kinds}, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(target); err != nil {
		t.Fatal("the target was not made")
	}
}
