package measure

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"testing"
	"time"

	"desktop/internal/evidence"
)

// countedMeasure is MeasureFile counting its calls, so a test can tell a measurement from a stored answer.
type countedMeasure struct{ calls int }

func (c *countedMeasure) measure(ctx context.Context, path string, opts Options) (FileMeasurement, error) {
	c.calls++
	return MeasureFile(ctx, path, opts)
}

func mustMeasure(t *testing.T, measureFile func(context.Context, string, Options) (FileMeasurement, error), path string, opts Options) FileMeasurement {
	t.Helper()
	got, err := measureFile(context.Background(), path, opts)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// storedMeasurement measures path once through a cache in project, and answers what it measured.
func storedMeasurement(t *testing.T, project, path string) FileMeasurement {
	t.Helper()
	first := &countedMeasure{}
	got := mustMeasure(t, CachedMeasureFile(evidence.NewCacheStore(project), project, first.measure), path, Options{})
	if first.calls != 1 {
		t.Fatalf("the first measurement called compute %d times, want 1", first.calls)
	}
	return got
}

func keyOf(t *testing.T, path, project string) evidence.CacheEntryKey {
	t.Helper()
	identity, err := evidence.Identify(path, project)
	if err != nil {
		t.Fatal(err)
	}
	return measurementCacheKey(identity)
}

// The point of the cache (#3815): a file measured before the app closed is not measured again after it reopens.
func TestCachedMeasureFileAnswersAStoredMeasurementFromANewStoreWithoutMeasuring(t *testing.T) {
	project := t.TempDir()
	path, raw := bigFile(t)
	want := storedMeasurement(t, project, path)

	again := &countedMeasure{}
	var log progressLog
	got := mustMeasure(t, CachedMeasureFile(evidence.NewCacheStore(project), project, again.measure), path, Options{Progress: log.record})

	if again.calls != 0 {
		t.Fatalf("compute was called %d times for a stored measurement, want 0", again.calls)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("stored answer = %+v, want the measured %+v", got, want)
	}
	if got.Report.File != path || got.Fingerprint.SHA256 != sha256Hex(raw) {
		t.Fatalf("stored answer names %q with hash %s", got.Report.File, got.Fingerprint.SHA256)
	}
	// The check's hash reports no progress: see the test of an edited file below.
	if len(log.done) != 0 {
		t.Fatalf("a stored answer reported progress %d times, want none", len(log.done))
	}
}

// The owner's ruling: same size and same modified time are not an identity. This edit keeps both, and keeps the
// three blocks the cache key samples, so only the whole-file hash can see it.
func TestCachedMeasureFileMeasuresAgainWhenAByteChangedOutsideTheSampledBlocks(t *testing.T) {
	project := t.TempDir()
	path, raw := bigFile(t)
	before := storedMeasurement(t, project, path)
	keyBefore := keyOf(t, path, project)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}

	// The high byte of one sample, far from the start, the middle and the end: a full-scale spike.
	const offset = 500_001
	edited := append([]byte(nil), raw...)
	edited[offset] = 0x7F
	if err := os.WriteFile(path, edited, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	if keyAfter := keyOf(t, path, project); !reflect.DeepEqual(keyAfter, keyBefore) {
		t.Fatalf("the edit changed the cache key, so this test proves nothing: %+v, then %+v", keyBefore, keyAfter)
	}

	again := &countedMeasure{}
	var log progressLog
	got := mustMeasure(t, CachedMeasureFile(evidence.NewCacheStore(project), project, again.measure), path, Options{Progress: log.record})

	if again.calls != 1 {
		t.Fatalf("compute was called %d times for an edited file, want 1", again.calls)
	}
	// Only the measurement reports progress, so it never runs to the end for the hash and then starts again.
	log.check(t, int64(len(raw)-44)) // the audio bytes after the WAV header, never backwards
	want := mustMeasure(t, MeasureFile, path, Options{})
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("answer = %+v, want the edited file's %+v", got, want)
	}
	if got.Fingerprint.SHA256 == before.Fingerprint.SHA256 || *got.Report.SamplePeakdBFS == *before.Report.SamplePeakdBFS {
		t.Fatalf("the edited file answered the figures from before the edit: peak %v, hash %s", *got.Report.SamplePeakdBFS, got.Fingerprint.SHA256)
	}

	// The new measurement replaced the old entry.
	third := &countedMeasure{}
	if stored := mustMeasure(t, CachedMeasureFile(evidence.NewCacheStore(project), project, third.measure), path, Options{}); third.calls != 0 || !reflect.DeepEqual(stored, want) {
		t.Fatalf("after the edit was measured: %d compute calls, answer %+v", third.calls, stored)
	}
}

func TestCachedMeasureFileAnswersATouchedFileFromTheStoreWithItsNewModifiedTime(t *testing.T) {
	project := t.TempDir()
	path, _ := bigFile(t)
	before := storedMeasurement(t, project, path)
	touched := time.Date(2031, 5, 6, 7, 8, 9, 0, time.UTC)
	if err := os.Chtimes(path, touched, touched); err != nil {
		t.Fatal(err)
	}

	again := &countedMeasure{}
	got := mustMeasure(t, CachedMeasureFile(evidence.NewCacheStore(project), project, again.measure), path, Options{})

	if again.calls != 0 {
		t.Fatalf("compute was called %d times for a file that was only touched, want 0", again.calls)
	}
	if got.Fingerprint.ModifiedAt != touched.Format(time.RFC3339Nano) {
		t.Fatalf("modified_at = %s, want the file's time now, %s", got.Fingerprint.ModifiedAt, touched.Format(time.RFC3339Nano))
	}
	want := before
	want.Fingerprint.ModifiedAt = got.Fingerprint.ModifiedAt
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("answer = %+v, want the stored figures %+v", got, want)
	}
}

// A file inside the project is keyed by its path relative to the project, and answered with the path asked for.
func TestCachedMeasureFileAnswersThePathItWasAskedFor(t *testing.T) {
	project := t.TempDir()
	path := project + string(os.PathSeparator) + "Chapter 01.wav"
	if err := os.WriteFile(path, encodeWAV(t, 1, 8000, 16, false, longMono(8000)), 0o600); err != nil {
		t.Fatal(err)
	}
	storedMeasurement(t, project, path)

	again := &countedMeasure{}
	got := mustMeasure(t, CachedMeasureFile(evidence.NewCacheStore(project), project, again.measure), path, Options{})
	if again.calls != 0 || got.Report.File != path {
		t.Fatalf("%d compute calls, file = %q; want the stored answer under %q", again.calls, got.Report.File, path)
	}
}

func TestCachedMeasureFileMeasuresAgainWhenTheEntryCannotBeUsed(t *testing.T) {
	// rewrite replaces the stored entry with what a case wants found there.
	cases := map[string]func(t *testing.T, store *evidence.CacheStore, key evidence.CacheEntryKey, blob measurementBlob){
		"an entry of another analyzer version": func(t *testing.T, store *evidence.CacheStore, key evidence.CacheEntryKey, blob measurementBlob) {
			if err := store.Delete(key); err != nil {
				t.Fatal(err)
			}
			key.AnalyzerVersion = strconv.Itoa(AnalyzerVersion - 1)
			writeBlob(t, store, key, blob)
		},
		"an entry that is not a measurement": func(t *testing.T, store *evidence.CacheStore, key evidence.CacheEntryKey, _ measurementBlob) {
			if err := store.Write(key, []byte(`{"schemaVersion":1,"measurement":"none"}`)); err != nil {
				t.Fatal(err)
			}
		},
		"an entry of another blob version": func(t *testing.T, store *evidence.CacheStore, key evidence.CacheEntryKey, blob measurementBlob) {
			blob.SchemaVersion = measurementBlobVersion + 1
			writeBlob(t, store, key, blob)
		},
		"an entry measured from a file of another size": func(t *testing.T, store *evidence.CacheStore, key evidence.CacheEntryKey, blob measurementBlob) {
			blob.Measurement.Fingerprint.SizeBytes++
			writeBlob(t, store, key, blob)
		},
		"an entry with no content hash": func(t *testing.T, store *evidence.CacheStore, key evidence.CacheEntryKey, blob measurementBlob) {
			blob.Measurement.Fingerprint.SHA256 = ""
			writeBlob(t, store, key, blob)
		},
	}
	for name, rewrite := range cases {
		t.Run(name, func(t *testing.T) {
			project := t.TempDir()
			path := writeTemp(t, "chapter.wav", encodeWAV(t, 1, 8000, 16, false, longMono(8000)))
			want := storedMeasurement(t, project, path)
			store := evidence.NewCacheStore(project)
			key := keyOf(t, path, project)
			raw, ok := store.Read(key)
			if !ok {
				t.Fatal("the measurement was not stored")
			}
			var blob measurementBlob
			if err := json.Unmarshal(raw, &blob); err != nil {
				t.Fatal(err)
			}
			rewrite(t, store, key, blob)

			again := &countedMeasure{}
			got := mustMeasure(t, CachedMeasureFile(store, project, again.measure), path, Options{})
			if again.calls != 1 || !reflect.DeepEqual(got, want) {
				t.Fatalf("%d compute calls, answer %+v; want one measurement answering %+v", again.calls, got, want)
			}
			// What it measured is stored over the unusable entry.
			if mustMeasure(t, CachedMeasureFile(store, project, again.measure), path, Options{}); again.calls != 1 {
				t.Fatalf("compute calls = %d after the entry was written over, want still 1", again.calls)
			}
		})
	}
}

func writeBlob(t *testing.T, store *evidence.CacheStore, key evidence.CacheEntryKey, blob measurementBlob) {
	t.Helper()
	encoded, err := json.Marshal(blob)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Write(key, encoded); err != nil {
		t.Fatal(err)
	}
}

// betweenBlocks is a context whose Err runs then on its second call. The hash asks Err before every block, so then
// runs after the first block of the file is hashed and before the second is read.
type betweenBlocks struct {
	context.Context
	calls int
	then  func()
}

func (c *betweenBlocks) Err() error {
	if c.calls++; c.calls == 2 {
		c.then()
	}
	return c.Context.Err()
}

func TestCachedMeasureFileStopsHashingWhenCancelledAndAnswersNothing(t *testing.T) {
	project := t.TempDir()
	path, _ := bigFile(t) // over two hash blocks, so there is a block left to refuse after the first
	storedMeasurement(t, project, path)

	again := &countedMeasure{}
	cancellable, cancel := context.WithCancel(context.Background())
	defer cancel()
	ctx := &betweenBlocks{Context: cancellable, then: cancel}
	got, err := CachedMeasureFile(evidence.NewCacheStore(project), project, again.measure)(ctx, path, Options{})

	// A hash that ran to its end would have matched and answered the stored measurement.
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	if again.calls != 0 || !reflect.DeepEqual(got, FileMeasurement{}) {
		t.Fatalf("a cancelled check called compute %d times and answered %+v, want nothing", again.calls, got)
	}
}

// The edit lands in the block already hashed, so the hash still matches the stored one: only the file's size and
// modified time, read again after the hash as MeasureFile reads them, show that the hash is of a file that moved.
func TestCachedMeasureFileDoesNotAnswerAStoredMeasurementForAFileThatChangedWhileItWasHashed(t *testing.T) {
	project := t.TempDir()
	path, _ := bigFile(t)
	before := storedMeasurement(t, project, path)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}

	edited := false
	ctx := &betweenBlocks{Context: context.Background(), then: func() {
		file, err := os.OpenFile(path, os.O_WRONLY, 0)
		if err != nil {
			t.Error(err)
			return
		}
		defer func() { _ = file.Close() }()
		if _, err := file.WriteAt([]byte{0x7F}, 500_001); err != nil {
			t.Error(err)
		}
		later := info.ModTime().Add(time.Minute)
		if err := os.Chtimes(path, later, later); err != nil {
			t.Error(err)
		}
		edited = true
	}}
	again := &countedMeasure{}
	got, err := CachedMeasureFile(evidence.NewCacheStore(project), project, again.measure)(ctx, path, Options{})

	if !edited {
		t.Fatal("the file was not edited while it was hashed, so this test proves nothing")
	}
	if !errors.Is(err, ErrFileChanged) {
		t.Fatalf("answer = %+v, %v; want ErrFileChanged", got, err)
	}
	if again.calls != 0 || !reflect.DeepEqual(got, FileMeasurement{}) {
		t.Fatalf("%d compute calls, answer %+v; want nothing measured or answered for a file that is still moving", again.calls, got)
	}

	// Once the file is still, the edit is measured and replaces the stored measurement.
	after := mustMeasure(t, CachedMeasureFile(evidence.NewCacheStore(project), project, again.measure), path, Options{})
	if again.calls != 1 || after.Fingerprint.SHA256 == before.Fingerprint.SHA256 {
		t.Fatalf("%d compute calls, hash %s; want the edited file measured once", again.calls, after.Fingerprint.SHA256)
	}
}

// The entry's key holds the file's path relative to the project, so a project folder that is moved or copied keeps
// its stored measurements.
func TestCachedMeasureFileAnswersAStoredMeasurementInACopyOfTheProject(t *testing.T) {
	original, copied := t.TempDir(), t.TempDir()
	const name = "Chapter 01.wav"
	if err := os.WriteFile(filepath.Join(original, name), encodeWAV(t, 1, 8000, 16, false, longMono(8000)), 0o600); err != nil {
		t.Fatal(err)
	}
	want := storedMeasurement(t, original, filepath.Join(original, name))
	if err := os.CopyFS(copied, os.DirFS(original)); err != nil {
		t.Fatal(err)
	}

	again := &countedMeasure{}
	path := filepath.Join(copied, name)
	got := mustMeasure(t, CachedMeasureFile(evidence.NewCacheStore(copied), copied, again.measure), path, Options{})

	if again.calls != 0 {
		t.Fatalf("compute was called %d times in a copy of the project, want 0", again.calls)
	}
	if got.Report.File != path || got.Fingerprint.SHA256 != want.Fingerprint.SHA256 || !reflect.DeepEqual(got.Report.RMSdBFS, want.Report.RMSdBFS) {
		t.Fatalf("answer in the copy = %+v, want the stored figures under %q", got, path)
	}
}

// An entry is filed under AnalyzerVersion, so a version that changes what a value means stops reading the entries
// made before it ("an entry of another analyzer version" above is such an entry).
func TestMeasurementCacheKeyCarriesTheAnalyzerVersion(t *testing.T) {
	project := t.TempDir()
	path := writeTemp(t, "chapter.wav", encodeWAV(t, 1, 8000, 16, false, longMono(8000)))
	key := keyOf(t, path, project)
	if key.AnalyzerID != "measure.file" || key.AnalyzerVersion != strconv.Itoa(AnalyzerVersion) {
		t.Fatalf("key = %s version %s, want measure.file version %d", key.AnalyzerID, key.AnalyzerVersion, AnalyzerVersion)
	}
}

func TestCachedMeasureFileDoesNotStoreAnMP3WhoseLevelsWereNotDecoded(t *testing.T) {
	project := t.TempDir()
	path := mp3Fixture(t)
	calls := &countedMeasure{}
	measureFile := CachedMeasureFile(evidence.NewCacheStore(project), project, calls.measure)

	if got := mustMeasure(t, measureFile, path, Options{}); got.Report.MP3LevelsDecoded {
		t.Fatal("the levels were decoded with no decoder")
	}
	// A decoder is installed: the file must not keep answering "not checked".
	decoder := fakeDecoder{wav: encodeWAV(t, 1, 44100, 16, false, longMono(44100))}
	decoded := mustMeasure(t, measureFile, path, Options{Decoder: decoder})
	if calls.calls != 2 || !decoded.Report.MP3LevelsDecoded || decoded.Report.RMSdBFS == nil {
		t.Fatalf("%d compute calls, report %+v; want the MP3 measured again with its levels", calls.calls, decoded.Report)
	}
	// With its levels decoded it is a finished measurement, and stored.
	if again := mustMeasure(t, measureFile, path, Options{Decoder: decoder}); calls.calls != 2 || !reflect.DeepEqual(again, decoded) {
		t.Fatalf("%d compute calls, answer %+v; want the decoded measurement from the store", calls.calls, again)
	}
}

func TestCachedMeasureFileNeitherStoresNorServesARange(t *testing.T) {
	project := t.TempDir()
	path := writeTemp(t, "chapter.wav", encodeWAV(t, 1, 8000, 16, false, longMono(8000)))
	calls := &countedMeasure{}
	measureFile := CachedMeasureFile(evidence.NewCacheStore(project), project, calls.measure)
	rng := Range{StartSeconds: 0.5, LengthSeconds: 1}

	first := mustMeasure(t, measureFile, path, Options{Range: &rng})
	if _, ok := evidence.NewCacheStore(project).Read(keyOf(t, path, project)); ok {
		t.Fatal("a range's measurement was stored as the file's")
	}
	whole := mustMeasure(t, measureFile, path, Options{})
	second := mustMeasure(t, measureFile, path, Options{Range: &rng})

	if calls.calls != 3 {
		t.Fatalf("compute calls = %d, want 3: both ranges and the whole file", calls.calls)
	}
	if first.Report.Range == nil || !reflect.DeepEqual(second, first) || whole.Report.Range != nil {
		t.Fatalf("range = %+v, then %+v; whole = %+v", first.Report, second.Report, whole.Report)
	}
}

func TestCachedMeasureFileDoesNotStoreWhatComputeCouldNotAnswer(t *testing.T) {
	nan := math.NaN()
	cases := map[string]func(context.Context, string, Options) (FileMeasurement, error){
		"an error": func(context.Context, string, Options) (FileMeasurement, error) {
			return FileMeasurement{}, ErrFileChanged
		},
		"an answer with no content hash": func(_ context.Context, path string, _ Options) (FileMeasurement, error) {
			return FileMeasurement{Report: Report{File: path}}, nil
		},
		"an answer that cannot be written as JSON": func(_ context.Context, path string, _ Options) (FileMeasurement, error) {
			return FileMeasurement{Report: Report{File: path, RMSdBFS: &nan}, Fingerprint: Fingerprint{SHA256: "00"}}, nil
		},
	}
	for name, compute := range cases {
		t.Run(name, func(t *testing.T) {
			project := t.TempDir()
			path := writeTemp(t, "chapter.wav", encodeWAV(t, 1, 8000, 16, false, longMono(8000)))
			store := evidence.NewCacheStore(project)
			want, wantErr := compute(context.Background(), path, Options{})

			got, err := CachedMeasureFile(store, project, compute)(context.Background(), path, Options{})

			if !errors.Is(err, wantErr) || got.Report.File != want.Report.File || got.Fingerprint != want.Fingerprint {
				t.Fatalf("answer = %+v, %v; want compute's own %+v, %v", got, err, want, wantErr)
			}
			if _, ok := store.Read(keyOf(t, path, project)); ok {
				t.Fatal("the answer was stored")
			}
		})
	}
}

func TestCachedMeasureFileWithoutAStoreMeasuresEveryTime(t *testing.T) {
	path := writeTemp(t, "chapter.wav", encodeWAV(t, 1, 8000, 16, false, longMono(8000)))
	calls := &countedMeasure{}
	measureFile := CachedMeasureFile(nil, "", calls.measure)

	first := mustMeasure(t, measureFile, path, Options{})
	second := mustMeasure(t, measureFile, path, Options{})
	if calls.calls != 2 || !reflect.DeepEqual(first, second) {
		t.Fatalf("compute calls = %d, want 2 with no store", calls.calls)
	}
}

func TestCachedMeasureFileLeavesAFileItCannotIdentifyToCompute(t *testing.T) {
	project := t.TempDir()
	calls := &countedMeasure{}
	_, err := CachedMeasureFile(evidence.NewCacheStore(project), project, calls.measure)(context.Background(), project+string(os.PathSeparator)+"gone.wav", Options{})
	if calls.calls != 1 || !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("%d compute calls, err = %v; want compute's own not-exist error", calls.calls, err)
	}
}

// The stored blob is a persisted shape (docs/reference/data-files.md): its version, then the measurement as the
// measure bindings spell it, without the file's path.
func TestMeasurementBlobShape(t *testing.T) {
	project := t.TempDir()
	path := writeTemp(t, "chapter.wav", encodeWAV(t, 1, 8000, 16, false, longMono(8000)))
	lufs, start, clicks := -19.5, 1.25, 0
	measured := FileMeasurement{
		Report: Report{
			File: path, SampleRate: 44100, Channels: 1, DurationSeconds: 3, IntegratedLUFS: &lufs,
			NoiseFloorStartSeconds: &start, ClipRuns: []ClipRun{}, ClickCandidateCount: &clicks,
		},
		Fingerprint: Fingerprint{SizeBytes: 48044, ModifiedAt: "2026-11-21T10:00:00Z", SHA256: "ab12"},
	}
	store := evidence.NewCacheStore(project)
	compute := func(context.Context, string, Options) (FileMeasurement, error) { return measured, nil }
	if got := mustMeasure(t, CachedMeasureFile(store, project, compute), path, Options{}); !reflect.DeepEqual(got, measured) {
		t.Fatalf("answer = %+v, want compute's own with its path", got)
	}

	raw, ok := store.Read(keyOf(t, path, project))
	if !ok {
		t.Fatal("the measurement was not stored")
	}
	const want = `{"schemaVersion":1,"measurement":{"report":{"sample_rate":44100,"channels":1,"duration_seconds":3,` +
		`"integrated_lufs":-19.5,"rms_dbfs":null,"sample_peak_dbfs":null,"true_peak_dbtp":null,"noise_floor_dbfs":null,` +
		`"noise_floor_start_seconds":1.25,"digital_silent_windows":0,"head_room_tone_seconds":null,` +
		`"tail_room_tone_seconds":null,"head_digital_silence_seconds":null,"tail_digital_silence_seconds":null,` +
		`"full_scale_samples":0,"clip_run_count":0,"clip_runs":[],"click_candidate_count":0},` +
		`"fingerprint":{"size_bytes":48044,"modified_at":"2026-11-21T10:00:00Z","sha256":"ab12"}}}`
	if string(raw) != want {
		t.Fatalf("stored blob =\n%s\nwant\n%s", raw, want)
	}
}

// failingDecoder is a decoder that is installed and cannot decode: its fault, or the file's.
type failingDecoder struct{}

func (failingDecoder) DecodeToWAV(context.Context, string, string) error {
	return errors.New("the decoder stopped")
}

func TestCachedMeasureFileDoesNotStoreAnMP3WhoseDecodeFailed(t *testing.T) {
	project := t.TempDir()
	path := mp3Fixture(t)
	calls := &countedMeasure{}
	measureFile := CachedMeasureFile(evidence.NewCacheStore(project), project, calls.measure)

	failed := mustMeasure(t, measureFile, path, Options{Decoder: failingDecoder{}})
	if !failed.Report.MP3LevelsDecoded || failed.Report.RMSdBFS != nil {
		t.Fatalf("report %+v; want a decode that was tried and gave no levels", failed.Report)
	}
	// The decoder is put right: the file must not keep answering "not measurable".
	decoder := fakeDecoder{wav: encodeWAV(t, 1, 44100, 16, false, longMono(44100))}
	if decoded := mustMeasure(t, measureFile, path, Options{Decoder: decoder}); calls.calls != 2 || decoded.Report.RMSdBFS == nil {
		t.Fatalf("%d compute calls, report %+v; want the MP3 measured again with its levels", calls.calls, decoded.Report)
	}
}
