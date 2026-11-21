package measure

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"time"

	"desktop/internal/evidence"
)

// The peaks cache is keyed per source identity in the evidence cache. It always holds the WHOLE
// source's peaks, computed once from position 0: a request narrowed to one item's played range never invalidates
// another item's entry for the same file, a trim only narrows or moves that range without changing the
// cache key, and a retake sharing an earlier item's source file is answered instantly from disk.
//
// An entry is the file's as it was when it was read: it carries the source's modification time, and a file whose time
// has moved since is computed again and the entry written over. The key alone (path, size and a hash of the file's
// first, middle and last 64 KB) cannot see an edit made in place elsewhere in a file of the same length (a repaired
// click, a redrawn breath), and the waveform must not be the one from before it (#3778).
// shortcut: an edit that keeps the file's length, its three hashed blocks and its modification time (a copy that
// restores the time, a save within the time step of a FAT volume) is not seen; a hash of the whole file would see it.

const (
	// peaksAnalyzerID and peaksVersion identify this package's entries in the evidence cache (evidence.CacheEntryKey).
	peaksAnalyzerID = "peaks"
	peaksVersion    = "2" // 2: entries carry the RMS bytes
	// peaksBlobVersion is the cache entry's own schema version (the evidence store never looks inside the blob).
	// 2: entries carry the source's modification time; an older entry is computed again.
	peaksBlobVersion = 2
)

// peaksBlob is the opaque JSON this package stores in the evidence cache: the whole source's Peaks, computed
// once at perSecond buckets a second, and the modification time of the file they were computed from.
type peaksBlob struct {
	SchemaVersion int       `json:"schemaVersion"`
	SourceModTime time.Time `json:"sourceModTime"`
	Peaks         Peaks     `json:"peaks"`
}

// CachedPeaksFile answers path's peaks over rng (or the whole file when rng is nil) at perSecond buckets a
// second, from store's evidence cache when a whole-source entry already exists there, computing and storing
// one otherwise. A source that is not a WAV answers ErrNotWAV, exactly as ComputePeaks/PeaksFile do (EP12 A:
// "no waveform"). rng narrows which buckets come back; the answer's StartSeconds is its first returned
// bucket's own start time, bucket-aligned to the source's absolute zero (see slicePeaks) - it may differ
// slightly from rng.StartSeconds when that does not itself fall on a bucket boundary, the same rounding a
// canvas drawn from these buckets already tolerates.
func CachedPeaksFile(ctx context.Context, store *evidence.CacheStore, identity evidence.SourceIdentity, path string, rng *Range, perSecond int) (Peaks, error) {
	if rng != nil {
		if err := rng.validate(); err != nil {
			return Peaks{}, err
		}
	}
	whole, err := wholeSourcePeaks(ctx, store, identity, path, perSecond)
	if err != nil {
		return Peaks{}, err
	}
	if rng == nil {
		return whole, nil
	}
	return slicePeaks(whole, rng.StartSeconds, rng.StartSeconds+rng.LengthSeconds), nil
}

// wholeSourcePeaks reads identity's whole-source peaks entry from store, computing and writing one with
// PeaksFile when it is missing, unreadable, from another schema, or of a file modified since (every one of those is a cache miss, per
// CacheStore.Read's own rule). A failure to write the entry back is not reported: the cache is a
// performance optimisation, not a correctness requirement, and the peaks just computed are still answered.
func wholeSourcePeaks(ctx context.Context, store *evidence.CacheStore, identity evidence.SourceIdentity, path string, perSecond int) (Peaks, error) {
	key := peaksCacheKey(identity, perSecond)
	if raw, ok := store.Read(key); ok {
		var blob peaksBlob
		if err := json.Unmarshal(raw, &blob); err == nil && blob.SchemaVersion == peaksBlobVersion && blob.SourceModTime.Equal(identity.ModTime) && blob.Peaks.whole() {
			return blob.Peaks, nil
		}
	}
	peaks, err := PeaksFile(ctx, path, nil, perSecond)
	if err != nil {
		return Peaks{}, err
	}
	// A file saved while it was being read is not stored: the entry would carry the earlier time over the later audio.
	if info, err := os.Stat(path); err != nil || !info.ModTime().Equal(identity.ModTime) || info.Size() != identity.Size {
		return peaks, nil
	}
	if encoded, err := json.Marshal(peaksBlob{SchemaVersion: peaksBlobVersion, SourceModTime: identity.ModTime, Peaks: peaks}); err == nil {
		_ = store.Write(key, encoded)
	}
	return peaks, nil
}

// whole reports whether p holds the bytes its bucket count says it does, and some: a stored entry that does not is
// computed again rather than cut past its end.
func (p Peaks) whole() bool {
	return p.Buckets > 0 && p.BucketsPerSecond > 0 && len(p.MinMax) == 2*p.Buckets && (len(p.RMS) == 0 || len(p.RMS) == p.Buckets)
}

func peaksCacheKey(identity evidence.SourceIdentity, perSecond int) evidence.CacheEntryKey {
	return evidence.CacheEntryKey{
		Source:          identity,
		AnalyzerID:      peaksAnalyzerID,
		AnalyzerVersion: peaksVersion,
		ParamHash:       fmt.Sprintf("%d", perSecond),
	}
}

// SlicePeaks answers the buckets of whole (a source's whole peaks, as CachedPeaksFile answers them for a nil
// range) that overlap rng, as CachedPeaksFile does for that range: for a caller that cuts many ranges from one
// source it read once.
func SlicePeaks(whole Peaks, rng Range) (Peaks, error) {
	if err := rng.validate(); err != nil {
		return Peaks{}, err
	}
	return slicePeaks(whole, rng.StartSeconds, rng.StartSeconds+rng.LengthSeconds), nil
}

// slicePeaks narrows whole (starting at source second 0) to the buckets overlapping [start, end), clipped to
// what whole actually holds; end before whole's own start, or start past its end, answers zero buckets.
func slicePeaks(whole Peaks, start, end float64) Peaks {
	first := int(math.Floor(start * float64(whole.BucketsPerSecond)))
	last := int(math.Ceil(end * float64(whole.BucketsPerSecond)))
	if first < 0 {
		first = 0
	}
	if first > whole.Buckets {
		first = whole.Buckets
	}
	if last > whole.Buckets {
		last = whole.Buckets
	}
	if last < first {
		last = first
	}
	sliced := whole
	sliced.StartSeconds = float64(first) / float64(whole.BucketsPerSecond)
	sliced.Buckets = last - first
	sliced.MinMax = append([]byte(nil), whole.MinMax[2*first:2*last]...)
	sliced.RMS = append([]byte(nil), whole.RMS[first:last]...)
	return sliced
}
