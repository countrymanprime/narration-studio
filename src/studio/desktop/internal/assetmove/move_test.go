package assetmove

import (
	"context"
	"errors"
	"os"
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
		if strings.Contains(name, movingPrefix) {
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
	stale := filepath.Join(target, movingPrefix+"dead", "tts")
	if err := os.MkdirAll(stale, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := Move(context.Background(), Plan{Source: source, Target: target, Dirs: kinds}, nil); err != nil {
		t.Fatalf("an earlier interrupted move blocked this one: %v", err)
	}
	for _, name := range listing(t, target) {
		if strings.Contains(name, movingPrefix) {
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
