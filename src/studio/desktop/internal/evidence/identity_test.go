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

// ageFile gives path a modification time an hour back, past the window in which the cache does not trust a time (racyWindow).
func ageFile(t *testing.T, path string) {
	t.Helper()
	old := time.Now().Add(-time.Hour)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
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

// A repeat ask costs a stat: the cache read the file once and answers the second ask from what it holds.
func TestIdentityCacheAnswersAgainWithoutReadingTheFile(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	writeSourceFile(t, path, bytes.Repeat([]byte("a"), 1000))
	ageFile(t, path)
	var cache IdentityCache

	first, err := cache.Identify(path, folder)
	if err != nil {
		t.Fatal(err)
	}
	again, err := cache.Identify(path, folder)
	if err != nil || again != first || cache.Reads() != 1 {
		t.Fatalf("again = %+v (%v) after %d reads, want the first answer %+v and one read", again, err, cache.Reads(), first)
	}
}

// A check run writes an identity down with Refresh: it sees a rewrite that kept the size and the time, and the cache then answers what the run
// stored, so a lookup after the run agrees with the run (the chapter is not read stale after a fresh check).
func TestRefreshSeesARewriteTheTimeHidesAndTheCacheAnswersWhatItStored(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	writeSourceFile(t, path, bytes.Repeat([]byte("a"), 1000))
	ageFile(t, path)
	var cache IdentityCache
	first, _ := cache.Identify(path, folder)

	rewriteKeepingTime(t, path, bytes.Repeat([]byte("b"), 1000))
	if hidden, _ := cache.Identify(path, folder); hidden != first {
		t.Fatal("the test needs a rewrite the cache cannot see by size and time; it saw it")
	}
	refreshed, err := cache.Refresh(path, folder)
	if err != nil || refreshed.PartialHash == first.PartialHash {
		t.Fatalf("Refresh = %+v (%v), want the new bytes, not the first %+v", refreshed, err, first)
	}
	if got, _ := cache.Identify(path, folder); got != refreshed {
		t.Fatalf("after Refresh the cache answers %+v, want what Refresh stored %+v", got, refreshed)
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

// A file that cannot be read now is forgotten: when it comes back with the size and time it had, the cache reads it and does not answer from before.
func TestIdentityCacheForgetsAFileThatCouldNotBeRead(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	writeSourceFile(t, path, bytes.Repeat([]byte("a"), 1000))
	ageFile(t, path)
	info, _ := os.Stat(path)
	var cache IdentityCache
	first, _ := cache.Identify(path, folder)

	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, err := cache.Identify(path, folder); err == nil {
		t.Fatal("a removed file was identified")
	}
	writeSourceFile(t, path, bytes.Repeat([]byte("b"), 1000))
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	got, err := cache.Identify(path, folder)
	if err != nil || got.PartialHash == first.PartialHash {
		t.Fatalf("got %+v (%v), want a read of the file that came back, not the entry from before %+v", got, err, first)
	}
}

// The identity's Path is relative to the folder it was asked through, so the same file asked through another folder is read again.
func TestIdentityCacheKeepsOneEntryPerProjectFolder(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	writeSourceFile(t, path, []byte("audio"))
	var cache IdentityCache
	inside, _ := cache.Identify(path, folder)
	outside, _ := cache.Identify(path, t.TempDir())
	if inside.Path != "take.wav" || outside.Path != path {
		t.Fatalf("paths %q and %q, want the project-relative one and the absolute one", inside.Path, outside.Path)
	}
}

// A file written a moment ago is read on every ask (a rewrite in the same clock tick, or on a filesystem with a two-second time, would hide
// behind an unchanged size and time); the same file an hour later is read once.
func TestIdentityCacheDoesNotTrustAFreshTimeButTrustsAnOldOne(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	writeSourceFile(t, path, bytes.Repeat([]byte("a"), 1000))
	var cache IdentityCache
	_, _ = cache.Identify(path, folder)
	_, _ = cache.Identify(path, folder)
	if cache.Reads() != 2 {
		t.Fatalf("a file written just now was read %d times in two asks, want 2", cache.Reads())
	}
	ageFile(t, path)
	_, _ = cache.Identify(path, folder)
	_, _ = cache.Identify(path, folder)
	if cache.Reads() != 3 {
		t.Fatalf("the same file an hour later: %d reads in all, want 3 (one more, then remembered)", cache.Reads())
	}
}

// One file reached by two spellings of its path is one entry.
func TestIdentityCacheKeysOneFileOnce(t *testing.T) {
	folder := t.TempDir()
	if err := os.Mkdir(filepath.Join(folder, "d"), 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(folder, "d", "take.wav")
	writeSourceFile(t, path, []byte("audio"))
	ageFile(t, path)
	var cache IdentityCache
	_, _ = cache.Identify(path, folder)
	_, _ = cache.Identify(filepath.Join(folder, "d", "..", "d", "take.wav"), folder)
	if cache.Reads() != 1 {
		t.Fatalf("two spellings of one path made %d reads, want 1", cache.Reads())
	}
}

// Stat answers in local time and the cache holds UTC: they must still compare equal on a machine that is not on UTC.
func TestIdentityCacheHitsOnAMachineNotOnUTC(t *testing.T) {
	previous := time.Local
	time.Local = time.FixedZone("test", 5*3600+1800)
	t.Cleanup(func() { time.Local = previous })
	folder := t.TempDir()
	path := filepath.Join(folder, "take.wav")
	writeSourceFile(t, path, []byte("audio"))
	ageFile(t, path)
	var cache IdentityCache
	_, _ = cache.Identify(path, folder)
	_, _ = cache.Identify(path, folder)
	if cache.Reads() != 1 {
		t.Fatalf("%d reads in two asks in a +05:30 zone, want 1", cache.Reads())
	}
}
