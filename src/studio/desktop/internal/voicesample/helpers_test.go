package voicesample

// The state matrix (definition of done, rule 3) for this package, written before the code. The control here is the host's
// store and its bindings; the pages that draw it are later phases (docs/prds/character-voice-samples.prd.md, States), so
// a cell that needs a page is marked "not tested" with the reason. Each cell names the test that drives it.
//
//	empty                      TestListOfAProjectWithNoSamples
//	one, many                  TestListSortsPrimaryFirstThenNewest
//	at the limit               TestACharacterMayHaveTwentySamples, TestMarkRefusals (character_limit), TestAThirtySecondSampleIsTheLongestAllowed, TestAHalfSecondSampleIsTheShortestAllowed,
//	                           TestProjectLimit
//	huge                       TestProjectLimit (rows that total 200 MiB; no 200 MiB file is written), the 30 s case above
//	loading                    not tested: every call here is synchronous; the page's pending state is phase 3
//	refused                    TestMarkRefusals (every reason, and that nothing is written), TestUpdateRefusals
//	failed                     TestAFailedRowWriteRemovesTheClip, TestAFailedClipWriteLeavesNothing
//	stale (provenance)         TestProvenanceIsComputedOnReadAndNeverStored
//	stale (clip)               TestClipStateOnList, TestClipHashIsCheckedBeforeItIsServed
//	long text                  TestLabelAndNoteLimitsCountUTF16Units
//	right-to-left, emoji       TestLabelAndNoteLimitsCountUTF16Units, TestMarkKeepsTextAsGiven
//	rapid double-fire          TestMarkingTheSameRangeTwiceIsOneSample, TestConcurrentMarksKeepOnePrimaryAndEveryRow
//	reload mid-action          TestAStoreIsReadBackByANewService, TestAFailedRowWriteRemovesTheClip (a save that did not finish)
//	leave mid-action           not tested: the host finishes a call it started whatever the page does; the page is phase 3
//	hand-edited file           TestHandEditedFileNamesAreIgnored, TestCorruptStoresAreKeptAside
//	newer / unreadable file    TestANewerStoreIsRefusedAndNeverOverwritten, TestAnUnreadableStoreIsNotOverwritten
//	the rpp never answers      TestMarkRefusals/project_unreadable (not a project, no project file, unreadable)
//	late, out of order,
//	lost or repeated event     not tested: the host has no stream from the DAW; the project is read from the saved file on each call
//	wrong project open         TestMarkRefusals/stale_alignment (an item or take the saved project does not hold)
//	wrong version              TestANewerStoreIsRefusedAndNeverOverwritten
//	restarts mid-session       TestAStoreIsReadBackByANewService
//	paths                      TestPathFixtures

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"desktop/internal/editlog"
	"desktop/internal/persist"
)

const (
	testChapter = "c-0001"
	testItem    = "{11111111-1111-1111-1111-111111111111}"
	testTake    = "{22222222-2222-2222-2222-222222222222}"
	testRecord  = "record-1"
	testRate    = 8000
)

// sineFrames is a 200 Hz sine at rate: a zero every 20 frames at 8 kHz, so a cut at a multiple of 20 frames is already on one.
func sineFrames(rate, frames int) []float64 {
	out := make([]float64, frames)
	for i := range out {
		out[i] = 0.5 * math.Sin(2*math.Pi*200*float64(i)/float64(rate))
	}
	return out
}

// wavBytes writes mono samples as 16-bit PCM (bits 16) or 24-bit PCM (bits 24) over channels identical channels, with a LIST
// chunk before the data so the chunk walk is exercised.
func wavBytes(rate, channels, bits int, mono []float64) []byte {
	var data bytes.Buffer
	for _, value := range mono {
		for c := 0; c < channels; c++ {
			if bits == 24 {
				sample := int32(math.Round(value * 8388607))
				data.Write([]byte{byte(sample), byte(sample >> 8), byte(sample >> 16)})
			} else {
				_ = binary.Write(&data, binary.LittleEndian, int16(math.Round(value*32767)))
			}
		}
	}
	var format bytes.Buffer
	blockAlign := uint16(bits / 8 * channels)
	_ = binary.Write(&format, binary.LittleEndian, uint16(1))
	_ = binary.Write(&format, binary.LittleEndian, uint16(channels))
	_ = binary.Write(&format, binary.LittleEndian, uint32(rate))
	_ = binary.Write(&format, binary.LittleEndian, uint32(rate)*uint32(blockAlign))
	_ = binary.Write(&format, binary.LittleEndian, blockAlign)
	_ = binary.Write(&format, binary.LittleEndian, uint16(bits))
	chunk := func(out *bytes.Buffer, id string, payload []byte) {
		out.WriteString(id)
		_ = binary.Write(out, binary.LittleEndian, uint32(len(payload)))
		out.Write(payload)
		if len(payload)%2 == 1 {
			out.WriteByte(0)
		}
	}
	var body bytes.Buffer
	body.WriteString("WAVE")
	chunk(&body, "fmt ", format.Bytes())
	chunk(&body, "LIST", []byte("INFOodd"))
	chunk(&body, "data", data.Bytes())
	var out bytes.Buffer
	out.WriteString("RIFF")
	_ = binary.Write(&out, binary.LittleEndian, uint32(body.Len()))
	out.Write(body.Bytes())
	return out.Bytes()
}

// rppText is a saved REAPER project with one item playing source from sourceStart for length seconds.
func rppText(file string, sourceStart, length float64, extra string) string {
	return fmt.Sprintf(`<REAPER_PROJECT 0.1 "7.0" 1
  <TRACK
    NAME "Chapter 1"
    <ITEM
      POSITION 0
      LENGTH %v
      IGUID %s
      SOFFS %v
      GUID %s
      NAME "take"
      <SOURCE WAVE
        FILE "%s"
      >
    >%s
  >
>
`, length, testItem, sourceStart, testTake, file, extra)
}

type fakeAlignment struct {
	mu     sync.Mutex
	heard  Heard
	err    error
	called int
}

func (f *fakeAlignment) Heard(_, _, _ string) (Heard, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.called++
	return f.heard, f.err
}

type fakeCuts struct {
	hidden []Hidden
	err    error
}

func (f *fakeCuts) Hidden(string) ([]Hidden, error) { return f.hidden, f.err }

// rig is a project folder with a saved project, one WAV, a manuscript and the fakes a Service reads.
type rig struct {
	t         testing.TB
	project   string
	rpp       string
	wav       string
	book      Book
	alignment *fakeAlignment
	cuts      *fakeCuts
	now       time.Time
	nextID    atomic.Int64
	clock     sync.Mutex
	config    Config
	service   *Service
}

// aliceBook is the manuscript the keys below point into: p-000001 holds "Off with her head!" as words 0 to 3.
func aliceBook() Book {
	return Book{
		Chapters: []Chapter{{ID: testChapter, Title: "Chapter One"}, {ID: "c-0002", Title: "Chapter Two"}},
		Lines: []editlog.Line{
			{ChapterID: testChapter, ID: "p-000001", Index: 0, Text: "“Off with her head!” the Queen shouted."},
			{ChapterID: testChapter, ID: "p-000002", Index: 1, Text: "The soldiers were silent."},
			{ChapterID: "c-0002", ID: "p-000003", Index: 2, Text: "Alice was not a bit hurt."},
		},
	}
}

// newRig writes a 70 s, 8 kHz, 16-bit mono sine as take.wav, a project that plays all of it, and a service over them.
func newRig(t *testing.T) *rig {
	t.Helper()
	return newRigWith(t, wavBytes(testRate, 1, 16, sineFrames(testRate, 70*testRate)), 70)
}

// newRigWith is newRig over a different source, played for length seconds.
func newRigWith(t testing.TB, source []byte, length float64) *rig {
	t.Helper()
	r := &rig{t: t, project: t.TempDir(), book: aliceBook(), now: time.Date(2026, 10, 18, 9, 30, 0, 0, time.UTC)}
	r.wav = filepath.Join(r.project, "take.wav")
	r.rpp = filepath.Join(r.project, "Show.rpp")
	writeFile(t, r.wav, source)
	writeFile(t, r.rpp, []byte(rppText("take.wav", 0, length, "")))
	r.alignment = &fakeAlignment{heard: heardBoth(testRecord)}
	r.cuts = &fakeCuts{}
	r.config = Config{
		Project:     r.project,
		ProjectFile: func() (string, error) { return r.rpp, nil },
		Manuscript:  func() (Book, error) { return r.book, nil },
		Alignment:   r.alignment,
		Cuts:        r.cuts,
		Reporter:    &persist.Reporter{},
	}
	r.service = r.build()
	return r
}

func (r *rig) build() *Service {
	service := New(r.config)
	service.now = func() time.Time {
		r.clock.Lock()
		defer r.clock.Unlock()
		r.now = r.now.Add(time.Second)
		return r.now
	}
	service.newID = func() string { return fmt.Sprintf("%032x", r.nextID.Add(1)) }
	return service
}

func heardBoth(record string) Heard {
	word := &HeardWord{ItemGUID: testItem, TakeGUID: testTake}
	return Heard{RecordID: record, First: word, Last: word}
}

// request is a mark of seconds [start, end] of the source for character "hatter", with the words "Off" to "head!”".
func request(start, end float64) MarkRequest {
	return MarkRequest{
		ChapterID: testChapter, ItemGUID: testItem, TakeGUID: testTake, SourceStart: start, SourceEnd: end,
		StartKey: "p-000001:0", EndKey: "p-000001:3", CharacterID: "hatter", Label: "Angry, to the Duke", AlignmentRecordID: testRecord,
	}
}

func (r *rig) mark(req MarkRequest) (Sample, error) {
	r.t.Helper()
	return r.service.Mark(context.Background(), req)
}

func (r *rig) mustMark(req MarkRequest) Sample {
	r.t.Helper()
	sample, err := r.mark(req)
	if err != nil {
		r.t.Fatalf("mark %+v: %v", req, err)
	}
	return sample
}

func (r *rig) list() List {
	r.t.Helper()
	list, err := r.service.List()
	if err != nil {
		r.t.Fatal(err)
	}
	return list
}

func (r *rig) storePath() string { return filepath.Join(Dir(r.project), "samples.json") }

func (r *rig) clipPath(id string) string {
	path, ok := ClipPath(r.project, id)
	if !ok {
		r.t.Fatalf("%q is not a clip id", id)
	}
	return path
}

func (r *rig) clipFiles() []string {
	entries, err := os.ReadDir(filepath.Join(Dir(r.project), "clips"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		r.t.Fatal(err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names
}

// stored reads samples.json as the host wrote it.
func (r *rig) stored() storeFile {
	r.t.Helper()
	raw, err := os.ReadFile(r.storePath())
	if err != nil {
		r.t.Fatal(err)
	}
	var file storeFile
	if err := json.Unmarshal(raw, &file); err != nil {
		r.t.Fatal(err)
	}
	return file
}

// seed writes rows straight to samples.json, so a test can start from a store it did not build through Mark.
func (r *rig) seed(rows ...Stored) {
	r.t.Helper()
	raw, err := json.MarshalIndent(storeFile{SchemaVersion: Version, Samples: rows}, "", "  ")
	if err != nil {
		r.t.Fatal(err)
	}
	writeFile(r.t, r.storePath(), raw)
}

// row is a valid stored sample for character, with a clip of bytes that need not exist on disk.
func row(id int, character string, primary bool, bytes int64) Stored {
	return Stored{
		ID: fmt.Sprintf("%032x", 0xf0000+id), CharacterID: character, Label: fmt.Sprintf("row %d", id), Primary: primary,
		CreatedAt: time.Date(2026, 10, 1, 0, 0, id, 0, time.UTC),
		Clip:      StoredClip{Bytes: bytes, DurationMs: 1000, SampleRate: testRate, Channels: 1, BitsPerSample: 16, SHA256: strings.Repeat("0", 64)},
		Source: StoredSource{
			ChapterID: testChapter, StartKey: "p-000001:0", EndKey: "p-000001:3", Text: "“Off with her head!”",
			ItemGUID: testItem, TakeGUID: testTake, SourceFile: "take.wav", SourceStart: 1, SourceEnd: 2,
		},
	}
}

func writeFile(t testing.TB, path string, content []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
}

func sha(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

// refusalOf is the typed refusal in err, or fails the test.
func refusalOf(t *testing.T, err error) *Refusal {
	t.Helper()
	var refusal *Refusal
	if !errors.As(err, &refusal) {
		t.Fatalf("err = %v, want a refusal", err)
	}
	if strings.TrimSpace(refusal.Message) == "" {
		t.Fatalf("refusal %s has no sentence", refusal.Reason)
	}
	return refusal
}

func nan() float64 { return math.NaN() }
func inf() float64 { return math.Inf(1) }
