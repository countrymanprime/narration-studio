package evidence

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeSourceFile(t *testing.T, path string, content []byte) {
	t.Helper()
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestIdentifyIsDeterministicForTheSameFile(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	writeSourceFile(t, path, bytes.Repeat([]byte("audio"), 100))

	first, err := Identify(path, "")
	if err != nil {
		t.Fatal(err)
	}
	second, err := Identify(path, "")
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatalf("two reads of the same, untouched file disagree: %#v vs %#v", first, second)
	}
	if first.Size != 500 {
		t.Errorf("Size = %d, want 500", first.Size)
	}
	if first.PartialHash == "" {
		t.Error("PartialHash is empty")
	}
}

func TestIdentifyDetectsAChangedMiddleBlockEvenWhenSizeAndModTimeMatch(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")

	size := 3 * partialBlockSize
	original := bytes.Repeat([]byte{0xAA}, size)
	writeSourceFile(t, path, original)
	stamp := time.Now().Add(-time.Hour).Truncate(time.Second)
	if err := os.Chtimes(path, stamp, stamp); err != nil {
		t.Fatal(err)
	}
	before, err := Identify(path, "")
	if err != nil {
		t.Fatal(err)
	}

	edited := bytes.Repeat([]byte{0xAA}, size)
	edited[size/2] = 0xBB // touch only a byte the "middle" block samples
	writeSourceFile(t, path, edited)
	if err := os.Chtimes(path, stamp, stamp); err != nil {
		t.Fatal(err)
	}
	after, err := Identify(path, "")
	if err != nil {
		t.Fatal(err)
	}

	if before.Size != after.Size || before.ModTime != after.ModTime {
		t.Fatalf("test setup: size/mtime should match (size %d vs %d, mtime %v vs %v)", before.Size, after.Size, before.ModTime, after.ModTime)
	}
	if before.PartialHash == after.PartialHash {
		t.Error("PartialHash did not change when the file's middle block changed, size and mtime held constant (the blind spot of a size, mtime and partial-hash identity)")
	}
}

func TestIdentifyPathIsProjectRelativeInsideTheFolder(t *testing.T) {
	folder := t.TempDir()
	mediaDir := filepath.Join(folder, "media")
	if err := os.MkdirAll(mediaDir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(mediaDir, "take.wav")
	writeSourceFile(t, path, []byte("audio"))

	identity, err := Identify(path, folder)
	if err != nil {
		t.Fatal(err)
	}
	if identity.Path != "media/take.wav" {
		t.Fatalf("Path = %q, want a project-relative, forward-slash path", identity.Path)
	}
}

func TestIdentifyPathIsAbsoluteOutsideTheFolder(t *testing.T) {
	projectFolder := t.TempDir()
	other := t.TempDir()
	path := filepath.Join(other, "take.wav")
	writeSourceFile(t, path, []byte("audio"))

	identity, err := Identify(path, projectFolder)
	if err != nil {
		t.Fatal(err)
	}
	if identity.Path != filepath.Clean(path) {
		t.Fatalf("Path = %q, want the absolute path for a source outside the project folder", identity.Path)
	}
}

func TestIdentifyOnMissingFileReturnsError(t *testing.T) {
	if _, err := Identify(filepath.Join(t.TempDir(), "missing.wav"), ""); err == nil {
		t.Fatal("want an error for a file that does not exist")
	}
}

func TestIdentifyOnADirectoryReturnsError(t *testing.T) {
	if _, err := Identify(t.TempDir(), ""); err == nil {
		t.Fatal("want an error when path is a directory")
	}
}

func TestFullHashMatchesForIdenticalContentAndDiffersOtherwise(t *testing.T) {
	folder := t.TempDir()
	pathA := filepath.Join(folder, "a.wav")
	pathB := filepath.Join(folder, "b.wav")
	pathC := filepath.Join(folder, "c.wav")
	writeSourceFile(t, pathA, []byte("identical content"))
	writeSourceFile(t, pathB, []byte("identical content"))
	writeSourceFile(t, pathC, []byte("different content"))

	hashA, err := FullHash(pathA)
	if err != nil {
		t.Fatal(err)
	}
	hashB, err := FullHash(pathB)
	if err != nil {
		t.Fatal(err)
	}
	hashC, err := FullHash(pathC)
	if err != nil {
		t.Fatal(err)
	}
	if hashA != hashB {
		t.Errorf("FullHash differs for identical content: %q vs %q", hashA, hashB)
	}
	if hashA == hashC {
		t.Error("FullHash matches for different content")
	}
}

func TestFullHashOnMissingFileReturnsError(t *testing.T) {
	if _, err := FullHash(filepath.Join(t.TempDir(), "missing.wav")); err == nil {
		t.Fatal("want an error for a file that does not exist")
	}
}

func TestFullHashOnADirectoryReturnsError(t *testing.T) {
	if _, err := FullHash(t.TempDir()); err == nil {
		t.Fatal("FullHash on a directory: want an error, got nil")
	}
}

// rewriteKeepingTime changes path's bytes (same length) and puts its modification time back, so only a read can tell it changed.
func rewriteKeepingTime(t *testing.T, path string, content []byte) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	writeSourceFile(t, path, content)
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
}

// A repeat ask costs a stat: the file's bytes are changed behind the cache with its size and time kept, and the cache still answers what it read first.
func TestIdentityCacheAnswersAgainWithoutReadingTheFile(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	writeSourceFile(t, path, bytes.Repeat([]byte("a"), 1000))
	var cache IdentityCache

	first, err := cache.Identify(path, folder)
	if err != nil {
		t.Fatal(err)
	}
	rewriteKeepingTime(t, path, bytes.Repeat([]byte("b"), 1000))
	if direct, _ := Identify(path, folder); direct.PartialHash == first.PartialHash {
		t.Fatal("the rewrite did not change what a read sees; the test cannot tell a read from a stat")
	}
	again, err := cache.Identify(path, folder)
	if err != nil || again != first {
		t.Fatalf("again = %+v (%v), want the first answer %+v with no read", again, err, first)
	}
}

func TestIdentityCacheReadsAgainWhenTheSizeTheTimeOrTheFileChanges(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	writeSourceFile(t, path, bytes.Repeat([]byte("a"), 1000))
	var cache IdentityCache
	first, _ := cache.Identify(path, folder)

	cases := map[string]func(){
		"a longer file": func() { writeSourceFile(t, path, bytes.Repeat([]byte("a"), 1500)) },
		"a new time": func() {
			writeSourceFile(t, path, bytes.Repeat([]byte("c"), 1500))
			later := time.Now().Add(time.Hour)
			if err := os.Chtimes(path, later, later); err != nil {
				t.Fatal(err)
			}
		},
		// The same length, different bytes, and the time moved on (any editor saving over the take): only the time tells.
		"a same-size rewrite with a new time": func() {
			writeSourceFile(t, path, bytes.Repeat([]byte("e"), 1500))
			later := time.Now().Add(2 * time.Hour)
			if err := os.Chtimes(path, later, later); err != nil {
				t.Fatal(err)
			}
		},
		"a replaced file": func() {
			replacement := filepath.Join(folder, "new.wav")
			writeSourceFile(t, replacement, bytes.Repeat([]byte("d"), 700))
			if err := os.Rename(replacement, path); err != nil {
				t.Fatal(err)
			}
		},
	}
	for _, name := range []string{"a longer file", "a new time", "a same-size rewrite with a new time", "a replaced file"} {
		cases[name]()
		got, err := cache.Identify(path, folder)
		want, _ := Identify(path, folder)
		if err != nil || got != want || got == first {
			t.Fatalf("%s: got %+v (%v), want a fresh read %+v, not the first %+v", name, got, err, want, first)
		}
		first = got
	}
}

func TestIdentityCacheDoesNotRememberAFileThatCannotBeRead(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	var cache IdentityCache
	if _, err := cache.Identify(path, folder); err == nil {
		t.Fatal("a missing file was identified")
	}
	writeSourceFile(t, path, []byte("now there"))
	if got, err := cache.Identify(path, folder); err != nil || got.Size != 9 {
		t.Fatalf("got %+v (%v), want the file that now exists", got, err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, err := cache.Identify(path, folder); err == nil {
		t.Fatal("a removed file was answered from the cache")
	}
}

func TestANilIdentityCacheIdentifiesLikeIdentify(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	writeSourceFile(t, path, []byte("audio"))
	var cache *IdentityCache
	got, err := cache.Identify(path, folder)
	want, _ := Identify(path, folder)
	if err != nil || got != want {
		t.Fatalf("got %+v (%v), want %+v", got, err, want)
	}
}
