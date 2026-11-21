package measure

import (
	"context"
	"encoding/json"
	"strconv"

	"desktop/internal/evidence"
)

// The measurement cache keeps a file's delivery measurement (MeasureFile's answer) in the evidence cache, so a file
// measured once is not measured again after the app restarts.
//
// A stored measurement is answered only for a file whose whole content hashes to the SHA-256 the measurement was
// made from. The entry's key (path, size and a hash of the file's first, middle and last 64 KiB) only finds the
// entry: it cannot see an edit made in place elsewhere in a file of the same length, and neither can the size and
// the modification time, which a copy can restore. So every read hashes the whole file, which costs about 2% of
// measuring it (0.24 to 0.43 s against 17 to 20 s for an hour of audio).

const (
	// measurementAnalyzerID identifies this file's entries in the evidence cache (evidence.CacheEntryKey); their
	// analyzer version is AnalyzerVersion, so a change to what a measured value means leaves the old entries unread.
	measurementAnalyzerID = "measure.file"
	// measurementBlobVersion is the entry's own schema version (the evidence store never looks inside the blob). An
	// entry of another version is measured again.
	measurementBlobVersion = 1
)

// measurementBlob is the opaque JSON this file stores in the evidence cache. Its report carries no file path: the
// answer takes the path it was asked for.
type measurementBlob struct {
	SchemaVersion int             `json:"schemaVersion"`
	Measurement   FileMeasurement `json:"measurement"`
}

// CachedMeasureFile wraps compute (MeasureFile, or a test's stand-in) with the measurement cache in store: the
// function it answers serves a whole-file measurement from store when the file's content is the content that
// measurement was made from, and otherwise calls compute and stores its answer. projectFolder makes the entry's key
// relative to the project for a file inside it (evidence.Identify). A nil store answers compute unchanged.
//
// A served measurement names the path it was asked for and the file's modification time as it is now; every other
// value is the stored one. While the file is hashed for the check, opts.Progress is told the bytes read and
// cancelling ctx answers ctx's error. An entry that is missing, undecodable, of another version or of other content
// is measured again and written over.
//
// Three answers are never stored: a range's (opts.Range), an error (ErrFileChanged included), and an MP3's that
// carries no levels, whether for want of a decoder ("not checked") or because the decode failed ("not measurable"):
// either can be the decoder's doing and not the file's, and would otherwise stay after the decoder is put right. No option is part of the key: Range is never stored, Progress changes nothing, and
// a Decoder only adds the levels a stored MP3 measurement already has.
func CachedMeasureFile(store *evidence.CacheStore, projectFolder string, compute func(context.Context, string, Options) (FileMeasurement, error)) func(context.Context, string, Options) (FileMeasurement, error) {
	if store == nil {
		return compute
	}
	return func(ctx context.Context, path string, opts Options) (FileMeasurement, error) {
		if opts.Range != nil {
			return compute(ctx, path, opts)
		}
		identity, err := evidence.Identify(path, projectFolder)
		if err != nil {
			// compute says what is wrong with the file, in the words the narrator already reads.
			return compute(ctx, path, opts)
		}
		key := measurementCacheKey(identity)
		if stored, ok := readMeasurement(store, key, identity.Size); ok {
			current, err := fingerprintFile(ctx, path, opts.Progress)
			if ctxErr := ctx.Err(); ctxErr != nil {
				return FileMeasurement{}, ctxErr
			}
			if err == nil && current.SHA256 == stored.Fingerprint.SHA256 {
				stored.Report.File = path
				stored.Fingerprint.ModifiedAt = current.ModifiedAt
				return stored, nil
			}
		}
		measured, err := compute(ctx, path, opts)
		if err != nil {
			return measured, err
		}
		if storable(measured) {
			writeMeasurement(store, key, measured)
		}
		return measured, nil
	}
}

// storable reports whether measured is a finished answer about the file's content: one with a content hash, and
// not an MP3's without levels.
func storable(measured FileMeasurement) bool {
	if measured.Fingerprint.SHA256 == "" {
		return false
	}
	report := measured.Report
	return report.MP3 == nil || report.RMSdBFS != nil || report.SamplePeakdBFS != nil
}

// readMeasurement answers key's stored measurement when it can be the measurement of a file of size bytes: an entry
// of this schema version that carries a content hash and was measured from a file of that size. Whether the content
// is the same is the caller's check.
func readMeasurement(store *evidence.CacheStore, key evidence.CacheEntryKey, size int64) (FileMeasurement, bool) {
	raw, ok := store.Read(key)
	if !ok {
		return FileMeasurement{}, false
	}
	var blob measurementBlob
	if err := json.Unmarshal(raw, &blob); err != nil || blob.SchemaVersion != measurementBlobVersion {
		return FileMeasurement{}, false
	}
	fingerprint := blob.Measurement.Fingerprint
	if fingerprint.SHA256 == "" || fingerprint.SizeBytes != size {
		return FileMeasurement{}, false
	}
	return blob.Measurement, true
}

// writeMeasurement stores measured under key. A failure to write is not reported: the cache saves time, and the
// measurement just made is still answered.
func writeMeasurement(store *evidence.CacheStore, key evidence.CacheEntryKey, measured FileMeasurement) {
	measured.Report.File = ""
	if encoded, err := json.Marshal(measurementBlob{SchemaVersion: measurementBlobVersion, Measurement: measured}); err == nil {
		_ = store.Write(key, encoded)
	}
}

func measurementCacheKey(identity evidence.SourceIdentity) evidence.CacheEntryKey {
	return evidence.CacheEntryKey{
		Source:          identity,
		AnalyzerID:      measurementAnalyzerID,
		AnalyzerVersion: strconv.Itoa(AnalyzerVersion),
	}
}
