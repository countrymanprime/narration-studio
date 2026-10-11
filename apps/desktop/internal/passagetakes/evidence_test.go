package passagetakes

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
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
		in.Groups = nil
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
	got := Evidence(resolved, NewMeasureCache(func(Range) TakeMeasure { return unmeasured("spy") }))
	if len(got.Takes) != len(resolved.View.Candidates) || len(got.Takes) < 3 {
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
	got := evidenceOf(t, NewMeasureCache(MeasureRange), recorded(t, dir), func(in *Input) {
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

	unreadable := NewMeasureCache(MeasureRange).Get(Range{File: filepath.Join(dir, "gone.wav"), Kind: "WAVE", Start: 0, Length: 2})
	if unreadable.RMS.OK || unreadable.RMS.Reason == "" {
		t.Errorf("an unreadable file = %+v", unreadable)
	}
	tiny := NewMeasureCache(MeasureRange).Get(Range{File: short, Kind: "WAVE", Start: 0, Length: 0.3})
	if tiny.NF.OK || tiny.NF.Reason == "" {
		t.Errorf("a take shorter than the noise window = %+v", tiny.NF)
	}
	standalone := evidenceOf(t, nil)
	if f := standalone.Takes[0].Measure.RMS; f.OK || f.Reason != ReasonNoMeasurer {
		t.Errorf("a host that measures nothing = %+v", f)
	}
}

func TestLevelIsComparableBetweenTakes(t *testing.T) {
	got := evidenceOf(t, NewMeasureCache(MeasureRange), recorded(t, t.TempDir()))
	loud, quiet := got.Takes[0].Measure.RMS, got.Takes[1].Measure.RMS
	if !loud.OK || !quiet.OK {
		t.Fatalf("levels = %+v, %+v", loud, quiet)
	}
	if spread := *loud.Value - *quiet.Value; math.Abs(spread-4) > 0.3 {
		t.Fatalf("two takes 4 dB apart measure %.2f dB apart", spread)
	}
}

func TestPlacementIsAlignedUntilTheMapExists(t *testing.T) {
	for _, take := range evidenceOf(t, nil).Takes {
		if take.Via != ViaAligned {
			t.Errorf("%s via %q", take.ID, take.Via)
		}
	}
	// Nothing reads the Booth's passage map yet, so the one place ViaMap may appear is its declaration.
	source, err := os.ReadFile("evidence.go")
	if err != nil {
		t.Fatal(err)
	}
	if n := strings.Count(string(source), "ViaMap"); n != 1 {
		t.Fatalf("ViaMap appears %d times in evidence.go; only its declaration may name it until a map is read", n)
	}
}

func TestReadOnlyAndCached(t *testing.T) {
	dir := t.TempDir()
	decodes := 0
	cache := NewMeasureCache(func(r Range) TakeMeasure { decodes++; return MeasureRange(r) })
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
		t.Fatalf("the call wrote files: %d before, %d after", len(before), len(after))
	}
}

func TestEvidenceHoldsNoPathOrGUID(t *testing.T) {
	encoded, err := json.Marshal(evidenceOf(t, NewMeasureCache(MeasureRange), recorded(t, t.TempDir())))
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
