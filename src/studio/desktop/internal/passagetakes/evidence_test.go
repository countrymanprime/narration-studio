package passagetakes

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"desktop/internal/coverage"
	"desktop/internal/evidence"
	"desktop/internal/measure"
)

const rate = 16000

// tone is seconds of a 220 Hz sine at peakDB dBFS; gap is seconds of silence.
func tone(seconds, peakDB float64) []float64 {
	out := make([]float64, int(seconds*rate))
	amp := math.Pow(10, peakDB/20)
	for i := range out {
		out[i] = amp * math.Sin(2*math.Pi*220*float64(i)/rate)
	}
	return out
}

func gap(seconds float64) []float64 { return make([]float64, int(seconds*rate)) }

// noisy adds a quiet hiss under samples, so a silence has a room tone to measure.
func noisy(samples []float64, db float64) []float64 {
	amp := math.Pow(10, db/20)
	seed := uint32(1)
	for i := range samples {
		seed = seed*1664525 + 1013904223
		samples[i] += amp * (float64(seed)/math.MaxUint32*2 - 1)
	}
	return samples
}

// writeWAV writes 16-bit mono PCM to dir/name and answers its path.
func writeWAV(t *testing.T, dir, name string, parts ...[]float64) string {
	t.Helper()
	var samples []float64
	for _, part := range parts {
		samples = append(samples, part...)
	}
	var data bytes.Buffer
	for _, s := range samples {
		_ = binary.Write(&data, binary.LittleEndian, int16(math.Max(-1, math.Min(1, s))*32767))
	}
	var file bytes.Buffer
	file.WriteString("RIFF")
	_ = binary.Write(&file, binary.LittleEndian, uint32(36+data.Len()))
	file.WriteString("WAVEfmt ")
	for _, field := range []any{uint32(16), uint16(1), uint16(1), uint32(rate), uint32(rate * 2), uint16(2), uint16(16)} {
		_ = binary.Write(&file, binary.LittleEndian, field)
	}
	file.WriteString("data")
	_ = binary.Write(&file, binary.LittleEndian, uint32(data.Len()))
	file.Write(data.Bytes())
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, file.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// fourWords: paragraph p-1 holds four script words heard on item 0 (A's first take): three read as written, one misread.
func fourWords(in *Input) {
	tokens := make([]coverage.TokenLine, 4)
	for i := range tokens {
		tokens[i] = coverage.TokenLine{Index: i, ParagraphID: strptr("p-1"), Word: i, Text: "w", Status: "read", Item: intptr(0)}
	}
	tokens[2].Status = "misread"
	in.View.Paragraphs = []coverage.AlignmentParagraph{{ID: "p-1", Text: "one two three four"}}
	in.View.Tokens = tokens
	in.FirstToken, in.LastToken = 0, 3
}

// recorded points A's two takes at real WAVs in dir: take 1 a read with a 1.2 s pause, take 2 the same 4 dB quieter.
func recorded(t *testing.T, dir string) func(*Input) {
	loud := writeWAV(t, dir, "loud.wav", noisy(concat(gap(0.5), tone(2, -12), gap(1.2), tone(2, -12), gap(0.5)), -60))
	quiet := writeWAV(t, dir, "quiet.wav", noisy(concat(gap(0.5), tone(2, -16), gap(1.2), tone(2, -16), gap(0.5)), -60))
	return func(in *Input) {
		a := &in.Project.Tracks[0].Items[0]
		a.Length = 6.2
		a.Takes[0].SourceFile, a.Takes[0].SOFFS = loud, 0
		a.Takes[1].SourceFile, a.Takes[1].SOFFS = quiet, 0
	}
}

func concat(parts ...[]float64) []float64 {
	var out []float64
	for _, p := range parts {
		out = append(out, p...)
	}
	return out
}

func evidenceOf(t *testing.T, cache *MeasureCache, mutate ...func(*Input)) EvidenceView {
	t.Helper()
	in := Input{ChapterID: "ch-1", View: view(), FirstToken: 1, LastToken: 2, Project: project()}
	for _, m := range mutate {
		m(&in)
	}
	resolved, err := Resolve(in)
	if err != nil {
		t.Fatal(err)
	}
	return Evidence(resolved, cache)
}

func isFigure(f Figure) bool {
	return (f.OK && f.Value != nil && f.Reason == "") || (!f.OK && f.Value == nil && f.Reason != "")
}

func TestOneEntryPerOfferedTake(t *testing.T) {
	resolved := resolve(t, nil)
	got := Evidence(resolved, NewMeasureCache(func(Range) (TakeMeasure, bool) { return unmeasured("spy"), false }, nil, ""))
	if len(got.Takes) != len(resolved.View.Candidates) || len(got.Takes) < 2 {
		t.Fatalf("takes = %d, candidates = %d", len(got.Takes), len(resolved.View.Candidates))
	}
	for i, take := range got.Takes {
		if take.ID != resolved.View.Candidates[i].ID {
			t.Errorf("take %d is %q, candidate is %q", i, take.ID, resolved.View.Candidates[i].ID)
		}
	}
}

func TestMatchedShareIsComputedFromTheTakeRange(t *testing.T) {
	got := evidenceOf(t, nil, fourWords)
	first, second := got.Takes[0], got.Takes[1]
	if !first.Matched.OK || *first.Matched.Value != 75 {
		t.Fatalf("take 1 read three of four words as written: %+v", first.Matched)
	}
	if second.Matched.OK || second.Matched.Reason == "" {
		t.Fatalf("take 2 was never aligned, so its share is a reason, not 0: %+v", second.Matched)
	}
}

func TestFiguresAreValuesOrReasons(t *testing.T) {
	dir := t.TempDir()
	short := writeWAV(t, dir, "short.wav", tone(0.3, -12))
	got := evidenceOf(t, NewMeasureCache(MeasureRange, nil, ""), recorded(t, dir), func(in *Input) {
		in.Project.Tracks[1].Items[1].Takes[0].SourceFile = filepath.Join(dir, "gone.wav") // lane C: deleted after the project was saved
	})
	measured := got.Takes[0].Measure
	for name, f := range map[string]Figure{"pause": measured.Pause, "rms": measured.RMS, "nf": measured.NF, "breaths": measured.Breaths} {
		if !f.OK || !isFigure(f) {
			t.Errorf("%s of a readable WAV = %+v", name, f)
		}
	}
	if math.Abs(*measured.Pause.Value-1.2) > 0.1 {
		t.Errorf("longest pause = %v, want about 1.2 s", *measured.Pause.Value)
	}

	for _, take := range got.Takes {
		for _, f := range []Figure{take.Matched, take.Measure.Pause, take.Measure.RMS, take.Measure.NF, take.Measure.Clarity, take.Measure.Breaths} {
			if !isFigure(f) {
				t.Errorf("%s: %+v is both or neither a value and a reason", take.ID, f)
			}
		}
		if take.Measure.Clarity.OK || take.Measure.Clarity.Reason != ReasonClarityNotMeasured {
			t.Errorf("%s clarity = %+v", take.ID, take.Measure.Clarity)
		}
	}

	unreadable := NewMeasureCache(MeasureRange, nil, "").Get(Range{File: filepath.Join(dir, "gone.wav"), Kind: "WAVE", Start: 0, Length: 2})
	if unreadable.RMS.OK || unreadable.RMS.Reason == "" {
		t.Errorf("an unreadable file = %+v", unreadable)
	}
	tiny := NewMeasureCache(MeasureRange, nil, "").Get(Range{File: short, Kind: "WAVE", Start: 0, Length: 0.3})
	if tiny.NF.OK || tiny.NF.Reason == "" {
		t.Errorf("a take shorter than the noise window = %+v", tiny.NF)
	}
	standalone := evidenceOf(t, nil)
	if f := standalone.Takes[0].Measure.RMS; f.OK || f.Reason != ReasonNoMeasurer {
		t.Errorf("a host that measures nothing = %+v", f)
	}
}

func TestLevelIsComparableBetweenTakes(t *testing.T) {
	got := evidenceOf(t, NewMeasureCache(MeasureRange, nil, ""), recorded(t, t.TempDir()))
	loud, quiet := got.Takes[0].Measure.RMS, got.Takes[1].Measure.RMS
	if !loud.OK || !quiet.OK {
		t.Fatalf("levels = %+v, %+v", loud, quiet)
	}
	if spread := *loud.Value - *quiet.Value; math.Abs(spread-4) > 0.3 {
		t.Fatalf("two takes 4 dB apart measure %.2f dB apart", spread)
	}
}

// TK-1 part 2: a take the Booth's passage map stamped is placed from the map; a take recorded elsewhere stays aligned.
func TestATakeTheBoothMappedIsPlacedExactly(t *testing.T) {
	got := evidenceOf(t, nil, boothRecorded(take1))
	if got.Takes[0].Via != ViaMap {
		t.Errorf("take 1, which the Booth recorded over the passage, is placed %q", got.Takes[0].Via)
	}
	for _, take := range got.Takes[1:] {
		if take.Via != ViaAligned {
			t.Errorf("%s, recorded elsewhere, is placed %q", take.ID, take.Via)
		}
	}
	// The map's figures change nothing else: the matched share is still the alignment's.
	if aligned := evidenceOf(t, nil); got.Takes[0].Matched.OK != aligned.Takes[0].Matched.OK {
		t.Errorf("matched = %+v, without the map %+v", got.Takes[0].Matched, aligned.Takes[0].Matched)
	}
	for name, mutate := range map[string]func(*Input){
		"no map":             func(*Input) {},
		"a stale mark":       func(in *Input) { boothRecorded(take1)(in); in.Marks[1].Stale = true },
		"another paragraph":  func(in *Input) { boothRecorded(take1)(in); in.Marks[0].PID, in.Marks[1].Prev.PID = "p-2", "p-2" },
		"an unstamped run":   func(in *Input) { boothRecorded("")(in) },
		"another take's ids": boothRecorded(take2),
	} {
		if via := evidenceOf(t, nil, mutate).Takes[0].Via; via != ViaAligned {
			t.Errorf("%s: take 1 is placed %q", name, via)
		}
	}
}

func TestReadOnlyAndCached(t *testing.T) {
	dir, project := t.TempDir(), t.TempDir()
	decodes := 0
	cache := NewMeasureCache(func(r Range) (TakeMeasure, bool) { decodes++; return MeasureRange(r) }, evidence.NewCacheStore(project), project)
	setup := recorded(t, dir)
	before, _ := os.ReadDir(dir)
	first := evidenceOf(t, cache, setup)
	afterFirst := decodes
	second := evidenceOf(t, cache, setup)
	if afterFirst != 2 || decodes != afterFirst {
		t.Fatalf("decodes: %d on the first call, %d after the second", afterFirst, decodes)
	}
	a, _ := json.Marshal(first)
	b, _ := json.Marshal(second)
	if !bytes.Equal(a, b) {
		t.Fatal("the cached answer differs")
	}
	if after, _ := os.ReadDir(dir); len(after) != len(before) {
		t.Fatalf("the call wrote files beside the audio: %d before, %d after", len(before), len(after))
	}
}

func TestEvidenceHoldsNoPathOrGUID(t *testing.T) {
	encoded, err := json.Marshal(evidenceOf(t, NewMeasureCache(MeasureRange, nil, ""), recorded(t, t.TempDir())))
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"itemGuid", "takeGuid", "sourceFile", "passageId"} {
		if strings.Contains(string(encoded), `"`+key+`"`) {
			t.Errorf("the answer carries %s", key)
		}
	}
	if strings.Contains(string(encoded), ".wav") || strings.Contains(string(encoded), string(os.PathSeparator)+"loud") {
		t.Errorf("the answer names a file: %s", encoded)
	}
}

// The stored figures of a take range (MeasureCache). The spies below answer figures without decoding, so the source is
// any bytes: sourceBytes long enough that its first, middle and last 64 KiB (the blocks the source identity hashes)
// leave unsampled bytes between them.
const (
	sourceBytes     = 400 * 1024
	sampledOffset   = 10
	unsampledOffset = 100 * 1024
)

var sourceTime = time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

// source writes a file of sourceBytes into dir, last modified at sourceTime, and answers a two second range of it.
func source(t *testing.T, dir string) Range {
	t.Helper()
	path := filepath.Join(dir, "take.wav")
	if err := os.WriteFile(path, bytes.Repeat([]byte{7}, sourceBytes), 0o600); err != nil {
		t.Fatal(err)
	}
	setModified(t, path, sourceTime)
	return Range{File: path, Kind: "WAVE", Start: 1, Length: 2}
}

func setModified(t *testing.T, path string, when time.Time) {
	t.Helper()
	if err := os.Chtimes(path, when, when); err != nil {
		t.Fatal(err)
	}
}

// overwriteByte changes one byte of path in place, keeping its size.
func overwriteByte(t *testing.T, path string, offset int64) {
	t.Helper()
	file, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.WriteAt([]byte{9}, offset); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

// counted is a cache over project whose measurer counts its calls into calls and answers the call's number as the
// pause, so a figure says which measurement made it.
func counted(project string, calls *int) *MeasureCache {
	return NewMeasureCache(func(Range) (TakeMeasure, bool) {
		*calls++
		return measuredAs(float64(*calls)), true
	}, evidence.NewCacheStore(project), project)
}

func measuredAs(pause float64) TakeMeasure {
	return TakeMeasure{
		Pause: valueOf(pause), RMS: valueOf(-18.3), NF: reasonOf("Too short."),
		Clarity: reasonOf(ReasonClarityNotMeasured), Breaths: valueOf(2),
	}
}

func pauseOf(t *testing.T, m TakeMeasure) float64 {
	t.Helper()
	if !m.Pause.OK {
		t.Fatalf("no pause: %+v", m)
	}
	return *m.Pause.Value
}

// storedKey is the entry of r in project's cache, and the store to read it from.
func storedKey(t *testing.T, project string, r Range) (*evidence.CacheStore, evidence.CacheEntryKey) {
	t.Helper()
	identity, err := evidence.Identify(r.File, project)
	if err != nil {
		t.Fatal(err)
	}
	store := evidence.NewCacheStore(project)
	return store, NewMeasureCache(nil, store, project).key(identity, r)
}

// The owner's rule: a stored figure is answered only for the content it was measured from, never for a size and a time.
func TestAFileOnlyTouchedIsAnsweredFromTheStoredFigures(t *testing.T) {
	project, calls := t.TempDir(), 0
	r := source(t, t.TempDir())
	cache := counted(project, &calls)
	cache.Get(r)
	setModified(t, r.File, sourceTime.Add(time.Minute))
	if got := pauseOf(t, counted(project, &calls).Get(r)); got != 1 || calls != 1 {
		t.Fatalf("a touched file was measured again: measurement %v of %d, want the stored first", got, calls)
	}
}

func TestARestartAnswersFromTheStoredFigures(t *testing.T) {
	dir, project := t.TempDir(), t.TempDir()
	setup := recorded(t, dir)
	first := evidenceOf(t, NewMeasureCache(MeasureRange, evidence.NewCacheStore(project), project), setup)

	decodes := 0
	restarted := NewMeasureCache(func(r Range) (TakeMeasure, bool) { decodes++; return MeasureRange(r) }, evidence.NewCacheStore(project), project)
	second := evidenceOf(t, restarted, setup)
	if decodes != 0 {
		t.Fatalf("a new cache over the same project decoded %d takes", decodes)
	}
	a, _ := json.Marshal(first)
	b, _ := json.Marshal(second)
	if !bytes.Equal(a, b) {
		t.Fatalf("the stored answer differs:\n%s\n%s", a, b)
	}
	if !first.Takes[0].Measure.Pause.OK {
		t.Fatalf("the stored take was not measured: %+v", first.Takes[0].Measure)
	}
}

func TestAnEditedSourceIsMeasuredAgain(t *testing.T) {
	for name, edit := range map[string]func(*testing.T, string){
		"bytes of a sampled block rewritten, size and time kept": func(t *testing.T, path string) {
			overwriteByte(t, path, sampledOffset)
			setModified(t, path, sourceTime)
		},
		"bytes between the sampled blocks rewritten, time moved": func(t *testing.T, path string) {
			overwriteByte(t, path, unsampledOffset)
			setModified(t, path, sourceTime.Add(time.Minute))
		},
		"bytes between the sampled blocks rewritten, size and time kept": func(t *testing.T, path string) {
			overwriteByte(t, path, unsampledOffset)
			setModified(t, path, sourceTime)
		},
	} {
		t.Run(name, func(t *testing.T) {
			project, calls := t.TempDir(), 0
			r := source(t, t.TempDir())
			cache := counted(project, &calls)
			cache.Get(r)
			edit(t, r.File)
			if got := pauseOf(t, cache.Get(r)); got != 2 || calls != 2 {
				t.Fatalf("after the edit: measurement %v of %d, want the second", got, calls)
			}
			if got := pauseOf(t, counted(project, &calls).Get(r)); got != 2 || calls != 2 {
				t.Fatalf("the new measurement was not stored: measurement %v of %d", got, calls)
			}
		})
	}
}

func TestAnotherAnalyzerVersionMisses(t *testing.T) {
	project, calls := t.TempDir(), 0
	r := source(t, t.TempDir())
	counted(project, &calls).Get(r)
	newer := counted(project, &calls)
	newer.version = "2"
	if got := pauseOf(t, newer.Get(r)); got != 2 {
		t.Fatalf("a newer analyzer was answered measurement %v, made by the older one", got)
	}
}

func TestEachRangeAndSourceKindHasItsOwnEntry(t *testing.T) {
	project, calls := t.TempDir(), 0
	r := source(t, t.TempDir())
	cache := counted(project, &calls)
	trimmed, moved, otherKind := r, r, r
	trimmed.Length, moved.Start, otherKind.Kind = 1.5, 1.25, "MP3"
	for i, asked := range []Range{r, trimmed, moved, otherKind} {
		if got := pauseOf(t, cache.Get(asked)); got != float64(i+1) {
			t.Fatalf("range %d (%+v) was answered measurement %v", i+1, asked, got)
		}
	}
	for i, asked := range []Range{r, trimmed, moved, otherKind} {
		if got := pauseOf(t, cache.Get(asked)); got != float64(i+1) || calls != 4 {
			t.Fatalf("range %d asked again was answered measurement %v of %d", i+1, got, calls)
		}
	}
}

func TestAnEntryThatCannotBeUsedIsDeletedAndMeasuredAgain(t *testing.T) {
	for name, blob := range map[string]string{
		"not JSON":                 `{"schemaVersion":1,"measure":`,
		"a newer blob version":     `{"schemaVersion":2,"sourceSha256":"00","measure":{"pause":{"ok":true,"value":9},"rms":{"ok":true,"value":9},"nf":{"ok":true,"value":9},"clarity":{"ok":false,"reason":"Not measured"},"breaths":{"ok":true,"value":9}}}`,
		"no blob version":          `{"sourceSha256":"00","measure":{"pause":{"ok":true,"value":9},"rms":{"ok":true,"value":9},"nf":{"ok":true,"value":9},"clarity":{"ok":false,"reason":"Not measured"},"breaths":{"ok":true,"value":9}}}`,
		"a figure with no value":   `{"schemaVersion":1,"sourceSha256":"00","measure":{"pause":{"ok":true},"rms":{"ok":true,"value":9},"nf":{"ok":true,"value":9},"clarity":{"ok":false,"reason":"Not measured"},"breaths":{"ok":true,"value":9}}}`,
		"a figure with no reason":  `{"schemaVersion":1,"sourceSha256":"00","measure":{"pause":{"ok":true,"value":9},"rms":{"ok":true,"value":9},"nf":{"ok":true,"value":9},"clarity":{"ok":false},"breaths":{"ok":true,"value":9}}}`,
		"a value beside a reason":  `{"schemaVersion":1,"sourceSha256":"00","measure":{"pause":{"ok":false,"value":9,"reason":"x"},"rms":{"ok":true,"value":9},"nf":{"ok":true,"value":9},"clarity":{"ok":false,"reason":"Not measured"},"breaths":{"ok":true,"value":9}}}`,
		"figures left out":         `{"schemaVersion":1,"sourceSha256":"00","measure":{}}`,
		"another analyzer's shape": `{"schemaVersion":1,"durationSeconds":4,"silences":[]}`,
	} {
		t.Run(name, func(t *testing.T) {
			project := t.TempDir()
			r := source(t, t.TempDir())
			store, key := storedKey(t, project, r)
			if err := store.Write(key, []byte(blob)); err != nil {
				t.Fatal(err)
			}
			// The measurer fails, so nothing is written over the entry: only a delete removes it.
			failing := NewMeasureCache(func(Range) (TakeMeasure, bool) { return unmeasured("spy"), false }, store, project)
			if got := failing.Get(r); got.Pause.OK || got.Pause.Reason != "spy" {
				t.Fatalf("the entry was answered: %+v", got)
			}
			if _, found := store.Read(key); found {
				t.Fatal("the entry was left in the cache")
			}
			calls := 0
			if got := pauseOf(t, counted(project, &calls).Get(r)); got != 1 {
				t.Fatalf("measurement %v", got)
			}
		})
	}
}

func TestFiguresNotFromDecodedAudioAreNotStored(t *testing.T) {
	project, calls := t.TempDir(), 0
	r := source(t, t.TempDir())
	failing := NewMeasureCache(func(Range) (TakeMeasure, bool) { calls++; return unmeasured("spy"), false }, evidence.NewCacheStore(project), project)
	failing.Get(r)
	if got := failing.Get(r); calls != 2 || got.RMS.Reason != "spy" {
		t.Fatalf("a failed measurement was asked for %d times and answered %+v", calls, got)
	}
	if entries, _ := os.ReadDir(evidence.CacheDir(project)); len(entries) != 0 {
		t.Fatalf("a failed measurement left %d cache entries", len(entries))
	}

	// MeasureRange itself: bytes that are no WAV, and a format that is not measured.
	for _, unread := range []Range{r, {File: r.File, Kind: "MP3", Start: 0, Length: 2}} {
		if got, decoded := MeasureRange(unread); decoded || got.RMS.OK {
			t.Errorf("%s: MeasureRange = %+v, decoded %v", unread.Kind, got, decoded)
		}
	}
	wav := writeWAV(t, t.TempDir(), "read.wav", noisy(concat(gap(0.5), tone(2, -12), gap(0.5)), -60))
	if got, decoded := MeasureRange(Range{File: wav, Kind: "WAVE", Start: 0, Length: 3}); !decoded || !got.RMS.OK || !got.Pause.OK {
		t.Errorf("a readable WAV: MeasureRange = %+v, decoded %v", got, decoded)
	}
}

func TestASourceSavedWhileItIsMeasuredIsNotStored(t *testing.T) {
	for name, save := range map[string]func(*testing.T, string){
		"its bytes changed": func(t *testing.T, path string) {
			overwriteByte(t, path, sampledOffset)
			setModified(t, path, sourceTime)
		},
		"its time moved": func(t *testing.T, path string) { setModified(t, path, sourceTime.Add(time.Minute)) },
		"it was removed": func(t *testing.T, path string) {
			if err := os.Remove(path); err != nil {
				t.Fatal(err)
			}
		},
	} {
		t.Run(name, func(t *testing.T) {
			project := t.TempDir()
			r := source(t, t.TempDir())
			saving := NewMeasureCache(func(r Range) (TakeMeasure, bool) { save(t, r.File); return measuredAs(1), true }, evidence.NewCacheStore(project), project)
			if got := pauseOf(t, saving.Get(r)); got != 1 {
				t.Fatalf("the measurement was not answered: %v", got)
			}
			if entries, _ := os.ReadDir(evidence.CacheDir(project)); len(entries) != 0 {
				t.Fatalf("figures of a file that changed under them were stored (%d entries)", len(entries))
			}
		})
	}
}

func TestWithoutAStoreEveryCallMeasures(t *testing.T) {
	calls := 0
	r := source(t, t.TempDir())
	cache := NewMeasureCache(func(Range) (TakeMeasure, bool) { calls++; return measuredAs(float64(calls)), true }, nil, "")
	cache.Get(r)
	if got := pauseOf(t, cache.Get(r)); got != 2 {
		t.Fatalf("the second call was answered measurement %v", got)
	}
}

func TestAFileThatCannotBeReadIsAReasonWithOrWithoutAStore(t *testing.T) {
	dir, project := t.TempDir(), t.TempDir()
	for name, cache := range map[string]*MeasureCache{
		"stored":   NewMeasureCache(MeasureRange, evidence.NewCacheStore(project), project),
		"unstored": NewMeasureCache(MeasureRange, nil, ""),
	} {
		for _, file := range []string{filepath.Join(dir, "gone.wav"), dir} {
			got := cache.Get(Range{File: file, Kind: "WAVE", Start: 0, Length: 2})
			if got != unmeasured(reasonUnreadable) {
				t.Errorf("%s, %s: %+v", name, file, got)
			}
		}
	}
	if entries, _ := os.ReadDir(evidence.CacheDir(project)); len(entries) != 0 {
		t.Fatalf("an unreadable file left %d cache entries", len(entries))
	}
}

// A source that is there but cannot be opened answers what MeasureRange says of it, as it did before the figures were
// stored. A mode binds neither root nor Windows, so the test skips where the file opens anyway;
// TestAFileWithNoIdentityIsMeasuredAndNotStored proves the same path on every platform and account.
func TestAFileThatCannotBeOpenedKeepsTheMeasurersReason(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("a file mode does not stop a read on Windows")
	}
	project := t.TempDir()
	wav := writeWAV(t, t.TempDir(), "locked.wav", noisy(concat(gap(0.5), tone(2, -12), gap(0.5)), -60))
	if err := os.Chmod(wav, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(wav, 0o600) })
	if file, err := os.Open(wav); err == nil {
		_ = file.Close()
		t.Skip("this user (root) reads a file of mode 000")
	}
	r := Range{File: wav, Kind: "WAVE", Start: 0, Length: 3}
	want, decoded := MeasureRange(r)
	if decoded || want.RMS.Reason != "The take's source could not be read: permission denied." {
		t.Fatalf("MeasureRange = %+v, decoded %v", want, decoded)
	}
	for name, cache := range map[string]*MeasureCache{
		"stored":   NewMeasureCache(MeasureRange, evidence.NewCacheStore(project), project),
		"unstored": NewMeasureCache(MeasureRange, nil, ""),
	} {
		if got := cache.Get(r); got != want {
			t.Errorf("%s: %+v, want the measurer's %+v", name, got, want)
		}
	}
	if entries, _ := os.ReadDir(evidence.CacheDir(project)); len(entries) != 0 {
		t.Fatalf("a file that cannot be opened left %d cache entries", len(entries))
	}
}

// The same on any platform and as any user: a file whose identity cannot be read is handed to the measurer, whose
// answer is given whatever it is and never stored.
func TestAFileWithNoIdentityIsMeasuredAndNotStored(t *testing.T) {
	for name, measured := range map[string]struct {
		figures TakeMeasure
		decoded bool
	}{
		"the measurer cannot read it either": {unmeasured("spy"), false},
		"the measurer reads it":              {measuredAs(7), true},
	} {
		t.Run(name, func(t *testing.T) {
			project, calls := t.TempDir(), 0
			r := source(t, t.TempDir())
			cache := NewMeasureCache(func(Range) (TakeMeasure, bool) { calls++; return measured.figures, measured.decoded }, evidence.NewCacheStore(project), project)
			cache.identify = func(string, string) (evidence.SourceIdentity, error) {
				return evidence.SourceIdentity{}, fs.ErrPermission
			}
			cache.Get(r)
			if got := cache.Get(r); calls != 2 || !sameMeasure(got, measured.figures) {
				t.Fatalf("after %d measurements: %+v, want the measurer's %+v", calls, got, measured.figures)
			}
			if entries, _ := os.ReadDir(evidence.CacheDir(project)); len(entries) != 0 {
				t.Fatalf("a file with no identity left %d cache entries", len(entries))
			}
		})
	}
}

func sameMeasure(a, b TakeMeasure) bool {
	x, errA := json.Marshal(a)
	y, errB := json.Marshal(b)
	return errors.Join(errA, errB) == nil && bytes.Equal(x, y)
}

// The parameters of the key, spelled out: an entry is of one source kind, one set of diagnostic thresholds and one
// version of the measure package, so a change to any of them misses every entry stored before it.
func TestTheKeyNamesTheKindTheDiagnosticOptionsAndTheMeasureVersion(t *testing.T) {
	project := t.TempDir()
	r := source(t, t.TempDir())
	_, key := storedKey(t, project, r)
	options, err := json.Marshal(measure.DefaultDiagnosticOptions())
	if err != nil {
		t.Fatal(err)
	}
	version := strconv.Itoa(measure.AnalyzerVersion)
	if want := evidence.HashParts("WAVE", string(options), version); key.ParamHash != want {
		t.Fatalf("parameters hash %s, want that of the kind, the options and the version, %s", key.ParamHash, want)
	}
	for name, without := range map[string]string{
		"the options": evidence.HashParts("WAVE", version),
		"the version": evidence.HashParts("WAVE", string(options)),
		"the kind":    evidence.HashParts(string(options), version),
	} {
		if key.ParamHash == without {
			t.Errorf("the parameters hash leaves out %s", name)
		}
	}
}

// copyTree copies the folder from to the new folder to, keeping each file's modification time.
func copyTree(t *testing.T, from, to string) {
	t.Helper()
	err := filepath.WalkDir(from, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(from, path)
		if err != nil {
			return err
		}
		target := filepath.Join(to, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o750)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.WriteFile(target, raw, 0o600); err != nil {
			return err
		}
		return os.Chtimes(target, info.ModTime(), info.ModTime())
	})
	if err != nil {
		t.Fatal(err)
	}
}

// An entry names its source by its path inside the project, so a project copied or moved whole (another disk, another
// computer) still answers from the cache that travelled with it.
func TestACopiedProjectAnswersFromTheCacheItCarries(t *testing.T) {
	original, calls := filepath.Join(t.TempDir(), "book"), 0
	media := filepath.Join(original, "media")
	if err := os.MkdirAll(media, 0o750); err != nil {
		t.Fatal(err)
	}
	r := source(t, media)
	counted(original, &calls).Get(r)
	if calls != 1 {
		t.Fatalf("%d measurements of the original", calls)
	}

	copied := filepath.Join(t.TempDir(), "elsewhere", "book")
	copyTree(t, original, copied)
	moved := r
	moved.File = filepath.Join(copied, "media", filepath.Base(r.File))
	if got := pauseOf(t, counted(copied, &calls).Get(moved)); calls != 1 || got != 1 {
		t.Fatalf("the copy was answered measurement %v after %d measurements, want the stored first", got, calls)
	}
}

// The stored blob, byte for byte: an entry this build writes is one a later build must still read.
func TestTheStoredBlobShape(t *testing.T) {
	project, calls := t.TempDir(), 0
	r := source(t, t.TempDir())
	sum, err := sha256File(r.File)
	if err != nil {
		t.Fatal(err)
	}
	blob := `{"schemaVersion":1,"sourceSha256":"` + sum + `","measure":{"pause":{"ok":true,"value":1},"rms":{"ok":true,"value":-18.3},"nf":{"ok":false,"reason":"Too short."},"clarity":{"ok":false,"reason":"Not measured"},"breaths":{"ok":true,"value":2}}}`
	counted(project, &calls).Get(r)
	store, key := storedKey(t, project, r)
	written, found := store.Read(key)
	if !found || string(written) != blob {
		t.Fatalf("stored blob (found %v):\n%s\nwant:\n%s", found, written, blob)
	}
	if key.AnalyzerID != "passagetakes.measure" || key.AnalyzerVersion != "1" || *key.PlayedRange != (evidence.PlayedRange{Start: 1, End: 3}) {
		t.Fatalf("key = %+v over %+v", key, *key.PlayedRange)
	}

	// Read back from the literal, not from what this build wrote.
	other := t.TempDir()
	otherStore, otherKey := storedKey(t, other, r)
	if err := otherStore.Write(otherKey, []byte(blob)); err != nil {
		t.Fatal(err)
	}
	if got := counted(other, &calls).Get(r); calls != 1 || pauseOf(t, got) != 1 || got.NF.Reason != "Too short." {
		t.Fatalf("the literal blob was not answered: %+v after %d measurements", got, calls)
	}
}
