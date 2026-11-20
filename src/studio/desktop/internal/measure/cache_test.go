package measure

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"desktop/internal/evidence"
)

func writeWAVFile(t *testing.T, wav []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "take.wav")
	if err := os.WriteFile(path, wav, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func identityOf(t *testing.T, path string) evidence.SourceIdentity {
	t.Helper()
	identity, err := evidence.Identify(path, "")
	if err != nil {
		t.Fatal(err)
	}
	return identity
}

// Per src/studio/desktop/internal/measure/cache.go, peaks are cached per source identity in the evidence cache, over the whole source, so a second item
// playing a different range of the same file never re-decodes it.
func TestCachedPeaksFileComputesOnceAndCachesForTheWholeSource(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, sine(8000, 2, 220, -6, 0))
	path := writeWAVFile(t, wav)
	identity := identityOf(t, path)
	store := evidence.NewCacheStore(t.TempDir())

	first, err := CachedPeaksFile(context.Background(), store, identity, path, &Range{StartSeconds: 0, LengthSeconds: 1}, 50)
	if err != nil {
		t.Fatal(err)
	}
	if first.Buckets != 50 || first.StartSeconds != 0 {
		t.Fatalf("first = %+v", first)
	}
	if store.Misses() != 1 {
		t.Fatalf("misses = %d, want 1 (computed once)", store.Misses())
	}

	second, err := CachedPeaksFile(context.Background(), store, identity, path, &Range{StartSeconds: 1, LengthSeconds: 1}, 50)
	if err != nil {
		t.Fatal(err)
	}
	if second.Buckets != 50 || second.StartSeconds != 1 {
		t.Fatalf("second = %+v", second)
	}
	if store.Hits() != 1 || store.Misses() != 1 {
		t.Fatalf("hits = %d, misses = %d; want the second range to hit the whole-source entry", store.Hits(), store.Misses())
	}
}

func TestCachedPeaksFileAnswersTheWholeFileWhenRangeIsNil(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, sine(8000, 1, 220, -6, 0))
	path := writeWAVFile(t, wav)
	store := evidence.NewCacheStore(t.TempDir())

	peaks, err := CachedPeaksFile(context.Background(), store, identityOf(t, path), path, nil, 50)
	if err != nil {
		t.Fatal(err)
	}
	if peaks.Buckets != 50 || peaks.StartSeconds != 0 {
		t.Fatalf("peaks = %+v", peaks)
	}
}

// A request that does not fall on a bucket boundary answers the bucket it actually has: the first returned
// bucket's own start, bucket-aligned to the source's absolute zero, which the caller must be able
// to tell apart from the range it asked for.
func TestCachedPeaksFileSlicesToTheNearestBucketBoundary(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, sine(8000, 2, 220, -6, 0))
	path := writeWAVFile(t, wav)
	store := evidence.NewCacheStore(t.TempDir())

	peaks, err := CachedPeaksFile(context.Background(), store, identityOf(t, path), path, &Range{StartSeconds: 0.51, LengthSeconds: 0.5}, 50)
	if err != nil {
		t.Fatal(err)
	}
	// floor(0.51*50)=25 -> 25/50=0.5; ceil(1.01*50)=51 -> 51-25=26 buckets.
	if peaks.StartSeconds != 0.5 || peaks.Buckets != 26 || len(peaks.RMS) != 26 {
		t.Fatalf("peaks = %+v", peaks)
	}
}

func TestCachedPeaksFileOfARangePastTheEndHasWhatExists(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, sine(8000, 1, 220, -6, 0))
	path := writeWAVFile(t, wav)
	store := evidence.NewCacheStore(t.TempDir())

	peaks, err := CachedPeaksFile(context.Background(), store, identityOf(t, path), path, &Range{StartSeconds: 0.5, LengthSeconds: 10}, 50)
	if err != nil {
		t.Fatal(err)
	}
	if peaks.Buckets != 25 {
		t.Fatalf("peaks = %+v, want the half second that exists", peaks)
	}
}

func TestCachedPeaksFileRejectsAnInvalidRange(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, silence(8000, 0.1))
	path := writeWAVFile(t, wav)
	store := evidence.NewCacheStore(t.TempDir())

	if _, err := CachedPeaksFile(context.Background(), store, identityOf(t, path), path, &Range{StartSeconds: -1, LengthSeconds: 1}, 50); err == nil {
		t.Fatal("a negative range start was accepted")
	}
}

func TestCachedPeaksFileOfSomethingThatIsNotAWAVFails(t *testing.T) {
	path := writeWAVFile(t, []byte("ID3\x04\x00 an mp3"))
	store := evidence.NewCacheStore(t.TempDir())

	if _, err := CachedPeaksFile(context.Background(), store, identityOf(t, path), path, nil, 50); !errors.Is(err, ErrNotWAV) {
		t.Fatalf("err = %v, want ErrNotWAV", err)
	}
}

// A restarted app (a fresh CacheStore over the same directory) still finds the entry a previous run wrote.
func TestCachedPeaksFileIsFoundAcrossCacheStoreInstances(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, sine(8000, 1, 220, -6, 0))
	path := writeWAVFile(t, wav)
	identity := identityOf(t, path)
	dir := t.TempDir()

	if _, err := CachedPeaksFile(context.Background(), evidence.NewCacheStore(dir), identity, path, nil, 50); err != nil {
		t.Fatal(err)
	}

	reopened := evidence.NewCacheStore(dir)
	if _, err := CachedPeaksFile(context.Background(), reopened, identity, path, nil, 50); err != nil {
		t.Fatal(err)
	}
	if reopened.Hits() != 1 {
		t.Fatalf("hits = %d, want 1 (found the previous run's entry)", reopened.Hits())
	}
}

func TestCachedPeaksFileStopsWhenCancelled(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, sine(8000, 1, 220, -6, 0))
	path := writeWAVFile(t, wav)
	store := evidence.NewCacheStore(t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := CachedPeaksFile(ctx, store, identityOf(t, path), path, nil, 50); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

// A click repaired in place leaves the file's length and its first, middle and last 64 KB as they were, so the cache
// key does not move: the entry's own modification time is what tells the waveform is from before the edit (#3778).
func TestCachedPeaksFileComputesAgainWhenTheFileWasEditedInPlace(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, sine(8000, 60, 220, -6, 0)) // 960 KB: the hashed blocks leave most of it unread
	path := writeWAVFile(t, wav)
	project := t.TempDir()
	store := evidence.NewCacheStore(project)
	before, err := CachedPeaksFile(context.Background(), store, identityOf(t, path), path, nil, 50)
	if err != nil {
		t.Fatal(err)
	}

	// Ten seconds in, half a second of silence over the tone, and the file saved a minute later.
	edited := append([]byte(nil), wav...)
	at := 44 + 10*8000*2
	clear(edited[at : at+8000])
	if err := os.WriteFile(path, edited, 0o600); err != nil {
		t.Fatal(err)
	}
	later := identityOf(t, path).ModTime.Add(time.Minute)
	if err := os.Chtimes(path, later, later); err != nil {
		t.Fatal(err)
	}
	identity := identityOf(t, path)
	if was := identityOf(t, writeWAVFile(t, wav)); was.PartialHash != identity.PartialHash || was.Size != identity.Size {
		t.Fatal("the edit moved the hash or the size: this test needs an edit the key cannot see")
	}

	after, err := CachedPeaksFile(context.Background(), store, identity, path, nil, 50)
	if err != nil {
		t.Fatal(err)
	}
	bucket := 10*50 + 5
	if before.MinMax[2*bucket+1] == 0 || after.MinMax[2*bucket] != 0 || after.MinMax[2*bucket+1] != 0 {
		t.Fatalf("bucket %d: before max %d, after min %d max %d; want the tone before and silence after", bucket, int8(before.MinMax[2*bucket+1]), int8(after.MinMax[2*bucket]), int8(after.MinMax[2*bucket+1]))
	}
	// The edited file's entry is written over the old one, and is then read, not computed a third time.
	misses := store.Misses()
	if _, err := CachedPeaksFile(context.Background(), store, identity, path, nil, 50); err != nil || store.Misses() != misses {
		t.Fatalf("err = %v, misses %d -> %d; want the edited file's entry read from the cache", err, misses, store.Misses())
	}
	if entries, _ := os.ReadDir(evidence.CacheDir(project)); len(entries) != 1 {
		t.Fatalf("%d cache files, want the one entry written over", len(entries))
	}
}
