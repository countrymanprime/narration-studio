package main

import (
	"bytes"
	"context"
	"desktop/internal/brand"
	"desktop/internal/evidence"
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/coverage"
	"desktop/internal/tracks"
)

// minimalMonoWAV builds a small real RIFF/WAVE file (16-bit PCM mono, a short tone) that measure.PeaksFile can
// actually decode - coverageProject's own "media/take.wav" (bindings_workspace_test.go) is deliberately just the
// bytes "RIFF audio", enough for the tracks parser's file-exists check but not a real WAV, so a binding test that
// wants real peaks needs its own fixture.
func minimalMonoWAV(t *testing.T, seconds float64, sampleRate int) []byte {
	t.Helper()
	frames := int(math.Round(seconds * float64(sampleRate)))
	var data bytes.Buffer
	for i := 0; i < frames; i++ {
		sample := int16(math.Round(0.5 * 32767 * math.Sin(2*math.Pi*220*float64(i)/float64(sampleRate))))
		if err := binary.Write(&data, binary.LittleEndian, sample); err != nil {
			t.Fatal(err)
		}
	}
	var fmtChunk bytes.Buffer
	blockAlign := uint16(2)
	_ = binary.Write(&fmtChunk, binary.LittleEndian, uint16(1))          // PCM
	_ = binary.Write(&fmtChunk, binary.LittleEndian, uint16(1))          // mono
	_ = binary.Write(&fmtChunk, binary.LittleEndian, uint32(sampleRate)) // sample rate
	_ = binary.Write(&fmtChunk, binary.LittleEndian, uint32(sampleRate)*uint32(blockAlign))
	_ = binary.Write(&fmtChunk, binary.LittleEndian, blockAlign)
	_ = binary.Write(&fmtChunk, binary.LittleEndian, uint16(16)) // bits per sample

	writeChunk := func(out *bytes.Buffer, id string, payload []byte) {
		out.WriteString(id)
		_ = binary.Write(out, binary.LittleEndian, uint32(len(payload)))
		out.Write(payload)
	}
	var body bytes.Buffer
	body.WriteString("WAVE")
	writeChunk(&body, "fmt ", fmtChunk.Bytes())
	writeChunk(&body, "data", data.Bytes())

	var out bytes.Buffer
	out.WriteString("RIFF")
	_ = binary.Write(&out, binary.LittleEndian, uint32(body.Len()))
	out.Write(body.Bytes())
	return out.Bytes()
}

// workspacePeaksProject is coverageProject (bindings_workspace_test.go) with a real, decodable WAV in place of
// its placeholder "media/take.wav": one track, one 4-second item over 2 seconds of real audio starting 1 second
// into the source (SOFFS 1), so the played range [1, 3) exercises CachedPeaksFile's slicing.
func workspacePeaksProject(t *testing.T) string {
	t.Helper()
	project := coverageProject(t)
	wav := minimalMonoWAV(t, 4, 8000)
	if err := os.WriteFile(filepath.Join(project, "media", "take.wav"), wav, 0o600); err != nil {
		t.Fatal(err)
	}
	return project
}

func TestWorkspacePeaksAnswersEveryAnalyzedItemsWaveform(t *testing.T) {
	host := coverageHost(t, workspacePeaksProject(t), true, fakeAlignedCoverageSidecar())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()

	got := bindingAnswer[WorkspacePeaksView](t)(host.WorkspacePeaks("c-0001"))

	if got.ChapterID != "c-0001" || len(got.Items) != 1 {
		t.Fatalf("got = %+v", got)
	}
	item := got.Items[0]
	if item.Reason != "" || item.Peaks == nil {
		t.Fatalf("item = %+v", item)
	}
	// coverageProject's item has LENGTH 4, PLAYRATE 1, SOFFS 0 (bindings_workspace_test.go): the whole 4 s source is
	// its played range, at DefaultPeaksPerSecond (50/s).
	if item.Peaks.Buckets != 4*50 || item.Peaks.StartSeconds != 0 {
		t.Fatalf("peaks = %+v", item.Peaks)
	}
}

func TestWorkspacePeaksOfAnItemWithNoUsableSourceAnswersAReasonNotAnError(t *testing.T) {
	// coverageProject's own fixture (unmodified): its "media/take.wav" is just the placeholder bytes "RIFF audio",
	// which exists on disk (SourceAvailable) but is not a real WAV a decoder can read.
	host := coverageHost(t, coverageProject(t), true, fakeAlignedCoverageSidecar())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()

	got := bindingAnswer[WorkspacePeaksView](t)(host.WorkspacePeaks("c-0001"))

	if len(got.Items) != 1 {
		t.Fatalf("got = %+v", got)
	}
	if item := got.Items[0]; item.Peaks != nil || item.Reason == "" {
		t.Fatalf("item = %+v, want a Reason and no Peaks", item)
	}
}

func TestWorkspacePeaksWithNoProjectRefuses(t *testing.T) {
	host := newTestHost(t)

	if _, err := host.WorkspacePeaks("c-0001"); err != errNoProject {
		t.Fatalf("err = %v, want errNoProject", err)
	}
}

func TestWorkspacePeaksCachesAcrossCalls(t *testing.T) {
	project := workspacePeaksProject(t)
	host := coverageHost(t, project, true, fakeAlignedCoverageSidecar())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()

	first := bindingAnswer[WorkspacePeaksView](t)(host.WorkspacePeaks("c-0001"))
	second := bindingAnswer[WorkspacePeaksView](t)(host.WorkspacePeaks("c-0001"))

	if first.Items[0].Peaks == nil || second.Items[0].Peaks == nil {
		t.Fatal("expected peaks on both calls")
	}
	if first.Items[0].Peaks.Buckets != second.Items[0].Peaks.Buckets {
		t.Fatalf("first = %d buckets, second = %d buckets; the cached answer must match", first.Items[0].Peaks.Buckets, second.Items[0].Peaks.Buckets)
	}
	if _, err := os.Stat(filepath.Join(project, brand.ProjectFolder, "analysis", "cache")); err != nil {
		t.Fatalf("expected the evidence cache directory to exist after the first call: %v", err)
	}
}

// The waveform of a chapter is asked on every visit: the take is identified through the project's cache, so the second visit reads none,
// and another project starts with a cache of its own.
func TestWorkspacePeaksSharesTheProjectsIdentityCacheAcrossCalls(t *testing.T) {
	project := workspacePeaksProject(t)
	host := coverageHost(t, project, true, fakeAlignedCoverageSidecar())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()
	// A new time: the first call has to read the take, and can only have done so through the cache counted here.
	old := time.Now().Add(-time.Hour)
	if err := os.Chtimes(filepath.Join(project, "media", "take.wav"), old, old); err != nil {
		t.Fatal(err)
	}
	identities := host.services().identities
	before := identities.Reads()

	for call, want := range []int64{1, 1} {
		got := bindingAnswer[WorkspacePeaksView](t)(host.WorkspacePeaks("c-0001"))
		if got.Items[0].Peaks == nil || identities.Reads()-before != want {
			t.Fatalf("call %d: item %+v after %d reads of the take, want peaks and %d", call+1, got.Items[0], identities.Reads()-before, want)
		}
	}

	next := host.config
	next.projectFolder = coverageProject(t)
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
	if host.services().identities == identities {
		t.Fatal("another project kept the last project's identity cache")
	}
}

func TestPeaksSourcesReadAFileOnceHoweverManyItemsAsk(t *testing.T) {
	project := workspacePeaksProject(t)
	file := filepath.Join(project, "media", "take.wav")
	whole := newPeaksSources(context.Background(), evidence.NewCacheStore(project), nil, project).whole

	first := whole(file)
	if first.reason != "" || first.whole.Buckets != 4*50 {
		t.Fatalf("first = %+v", first)
	}
	// The file is gone: an answer now can only be the one kept from the first ask.
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	if second := whole(file); second.reason != "" || second.whole.Buckets != first.whole.Buckets {
		t.Fatalf("second = %+v, want the first ask's peaks without reading the file again", second)
	}
	// A new reader (the next call) reads the file as it is now.
	if next := newPeaksSources(context.Background(), evidence.NewCacheStore(project), nil, project).whole(file); next.reason == "" {
		t.Fatalf("next = %+v, want a reason for the missing file", next)
	}
}

func TestWorkspacePeaksCutsEveryItemOfOneSourceFromItsOwnRange(t *testing.T) {
	project := workspacePeaksProject(t)
	// A second item over the same recording, playing its seconds [1, 3).
	rpp := filepath.Join(project, "book.rpp")
	saved, err := os.ReadFile(rpp)
	if err != nil {
		t.Fatal(err)
	}
	second := `    <ITEM
      POSITION 4
      LENGTH 2
      IGUID {ITEM-2}
      SOFFS 1
      PLAYRATE 1 1 0 -1 0 0.0025
      <SOURCE WAVE
        FILE "media/take.wav"
      >
    >
  >
>
`
	if err := os.WriteFile(rpp, append(bytes.TrimSuffix(saved, []byte("  >\n>\n")), second...), 0o600); err != nil {
		t.Fatal(err)
	}
	host := coverageHost(t, project, true, fakeTwoItemCoverageSidecar())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()

	got := bindingAnswer[WorkspacePeaksView](t)(host.WorkspacePeaks("c-0001"))

	if len(got.Items) != 2 || got.Items[0].Peaks == nil || got.Items[1].Peaks == nil {
		t.Fatalf("got = %+v", got)
	}
	if p := got.Items[0].Peaks; p.Buckets != 4*50 || p.StartSeconds != 0 {
		t.Fatalf("first item's peaks = %d buckets from %v", p.Buckets, p.StartSeconds)
	}
	if p := got.Items[1].Peaks; p.Buckets != 2*50 || p.StartSeconds != 1 || len(p.MinMax) != 2*2*50 {
		t.Fatalf("second item's peaks = %d buckets from %v", p.Buckets, p.StartSeconds)
	}
}

// An item reads its source in the order it always did: a file that cannot be read says so whatever the range is, and
// a bad range is refused before the file's peaks are read (so a file that is not a WAV does not answer for it).
func TestItemPeaksChecksTheFileThenTheRangeThenThePeaks(t *testing.T) {
	project := coverageProject(t) // its media/take.wav is the bytes "RIFF audio": readable, not a WAV
	stub := filepath.Join(project, "media", "take.wav")
	missing := filepath.Join(project, "media", "gone.wav")
	items := func(file string) tracks.Project {
		return tracks.Project{Tracks: []tracks.Track{{Items: []tracks.Item{{GUID: "{ITEM-1}", Takes: []tracks.Take{{SourceFile: file, SourceAvailable: true}}}}}}}
	}
	item := func(start float64) coverage.AlignmentItem {
		return coverage.AlignmentItem{Index: 0, ItemGUID: "{ITEM-1}", Live: true, SourceStart: start, Length: 2, PlayRate: 1}
	}
	for _, c := range []struct {
		name, file string
		start      float64
		want       string
	}{
		{"missing file, bad range", missing, -1, "this item's source audio could not be read"},
		{"missing file, good range", missing, 0, "this item's source audio could not be read"},
		{"not a WAV, bad range", stub, -1, "this item's waveform could not be computed"},
		{"not a WAV, good range", stub, 0, "no waveform"},
	} {
		sources := newPeaksSources(context.Background(), evidence.NewCacheStore(project), nil, project)
		if got := itemPeaks(sources, items(c.file), item(c.start)); got.Reason != c.want || got.Peaks != nil {
			t.Errorf("%s: got %+v, want reason %q", c.name, got, c.want)
		}
		if _, read := sources.peaks[c.file]; read != (c.name == "not a WAV, good range") {
			t.Errorf("%s: the file's peaks were read = %v", c.name, read)
		}
	}
}

// fakeTwoItemCoverageSidecar is fakeAlignedCoverageSidecar (bindings_workspace_test.go) with a second analyzed item,
// "{ITEM-2}".
func fakeTwoItemCoverageSidecar() coverage.Launcher {
	return func(_ context.Context, _ string, args ...string) (coverage.Child, error) {
		values := map[string]string{}
		for i := 0; i+1 < len(args); i++ {
			if strings.HasPrefix(args[i], "--") {
				values[args[i]] = args[i+1]
			}
		}
		child := &coverageChild{}
		go func() {
			results := fmt.Sprintf(`COVERAGE|{"schemaVersion":1,"chapterId":%q,"bodyTokens":1,"presentTokens":1,"missingTokens":0,"extraTokens":0,"longestMissingRun":0,"alignment":{"maxMisreadRun":8,"minAnchorRun":3},"items":{"analyzed":2,"muted":0,"playedSeconds":6,"transcribed":2,"reused":0},"analysis":{"model":"small","language":null,"equivalencesHash":null}}`+"\n", values["--chapter-id"])
			results += `COVERAGE_ITEM|{"index":0,"itemGuid":"{ITEM-1}","status":"analyzed","words":"transcribed","playedSeconds":4,"wordCount":1,"model":"small","language":null}` + "\n"
			results += `COVERAGE_ITEM|{"index":1,"itemGuid":"{ITEM-2}","status":"analyzed","words":"transcribed","playedSeconds":2,"wordCount":0,"model":"small","language":null}` + "\n"
			results += `COVERAGE_PARAGRAPH|{"id":"p-000001","tokens":1,"present":1,"longestMissingRun":0}` + "\n"
			results += `COVERAGE_TOKEN|{"i":0,"p":"p-000001","w":0,"text":"Alice.","status":"read","heard":null,"item":0,"start":0.0,"end":0.5}` + "\n"
			code := 0
			if err := os.WriteFile(values["--out"], []byte(results), 0o600); err != nil {
				code = 1
			}
			_ = os.WriteFile(values["--progress"], []byte("DONE|100|Finished\n"), 0o600)
			child.mu.Lock()
			child.code = &code
			child.mu.Unlock()
		}()
		return child, nil
	}
}
