package voicesample

// Voice samples kept in the DAW (phase 6, docs/prds/character-voice-samples.prd.md, Where a sample is kept). The state matrix for
// the DAW label, each cell with the test that drives it:
//
//	storage project (default)      TestAProjectSampleIsUnchanged
//	both, one, many                TestBothCopiesTheClipAndAddsTheRegion
//	daw only                       TestDawOnlyKeepsNoFileAndPlaysTheLabelledRange
//	DAW cannot label (no role)     TestADawChoiceTheDawCannotHonourIsRefusedBeforeAnything
//	DAW refuses (recording)        TestTheDawRefusingTheRegionSavesNothing
//	label in the saved project     TestTheRegionInTheSavedProjectIsOK
//	label moved                    TestAMovedRegionMovesTheSample
//	label deleted                  TestADeletedRegionEndsTheSample
//	not saved in the DAW yet       TestARegionNotSavedYetIsNotMissing
//	item gone                      TestARegionWhoseItemIsGoneHasNoAudio
//	region stretched past 30 s     TestARegionStretchedPastThirtySecondsHasNoAudio
//	saved project unreadable       TestAnUnreadableProjectIsReported
//	hand-edited store              TestADawSampleWithoutARegionIsCorrupt
//	rapid double-fire              TestMarkingTheSameRangeTwiceInTheDawIsOneRegion
//	the DAW never answers, late,
//	repeats, restarts              not tested: the role's own tests (bridge/voice_sample_region_test.go) cover the bridge; here the
//	                               DAW is an interface that answers or fails
//	right-to-left, emoji           TestRegionNamesKeepTheCharacterAndLabelOnOneLine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"unicode"
	"unicode/utf8"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

type fakeRegions struct {
	calls []string
	err   error
}

func (f *fakeRegions) AddVoiceSampleRegion(_ context.Context, start, end float64, name string) (dawport.VoiceSampleRegionKept, error) {
	f.calls = append(f.calls, fmt.Sprintf("%.3f-%.3f %s", start, end, name))
	if f.err != nil {
		return dawport.VoiceSampleRegionKept{}, f.err
	}
	return dawport.VoiceSampleRegionKept{Number: len(f.calls), Outcome: "created"}, nil
}

// withRegions writes the saved project as the DAW would after saving: the item and the given regions (start, end, name).
func (r *rig) saveProject(length float64, regions ...[3]any) {
	r.t.Helper()
	text := rppText("take.wav", 0, length, "")
	var lines strings.Builder
	for index, region := range regions {
		fmt.Fprintf(&lines, "  MARKER %d %v %q 1 0 1 R {AAAAAAAA-0000-4000-8000-00000000000%d} 0 \n  MARKER %d %v \"\" 1\n", index+1, region[0], region[2], index+1, index+1, region[1])
	}
	text = strings.TrimSuffix(text, ">\n") + lines.String() + ">\n"
	writeFile(r.t, r.rpp, []byte(text))
	r.service = r.build() // a Service reads the saved project once; the host builds one per call
}

func (r *rig) useDaw(storage string, regions *fakeRegions) {
	r.config.Storage = func() string { return storage }
	r.config.Regions = regions
	r.config.CharacterName = func(id string) string { return map[string]string{"hatter": "Hatter"}[id] }
	r.service = r.build()
}

func nameOf(r *rig, id string) string {
	return r.stored().Samples[0].DawRegion.Name
}

func TestAProjectSampleIsUnchanged(t *testing.T) {
	r := newRig(t)
	sample := r.mustMark(request(10, 12))
	if sample.Storage != "" || sample.Daw != nil || r.stored().Samples[0].DawRegion != nil {
		t.Fatalf("a project sample carries DAW state: %+v", sample)
	}
}

func TestBothCopiesTheClipAndAddsTheRegion(t *testing.T) {
	r := newRig(t)
	regions := &fakeRegions{}
	r.useDaw(StorageBoth, regions)
	sample := r.mustMark(request(10, 12))
	if len(r.clipFiles()) != 1 || sample.Storage != StorageBoth || sample.ClipState != ClipOK {
		t.Fatalf("sample = %+v, clips %v", sample, r.clipFiles())
	}
	// The window is 9.85 s to 12.15 s on an item at 0 that plays from 0 at rate 1.
	if len(regions.calls) != 1 || !strings.HasPrefix(regions.calls[0], "9.850-12.150 Voice sample: Hatter - Angry, to the Duke [") {
		t.Fatalf("calls = %q", regions.calls)
	}
	stored := r.stored().Samples[0]
	if stored.Storage != StorageBoth || stored.DawRegion == nil || stored.DawRegion.Number != 1 || stored.Clip.SHA256 == "" {
		t.Fatalf("stored = %+v", stored)
	}
	// The region is not in the saved project yet: the store says so, and the DAW has unsaved edits.
	if sample.Daw == nil || sample.Daw.State != DawLabelMissing {
		t.Fatalf("daw = %+v", sample.Daw)
	}
}

func TestDawOnlyKeepsNoFileAndPlaysTheLabelledRange(t *testing.T) {
	r := newRig(t)
	regions := &fakeRegions{}
	r.useDaw(StorageDAW, regions)
	sample := r.mustMark(request(10, 12))
	if len(r.clipFiles()) != 0 {
		t.Fatalf("a DAW-only sample copied a clip: %v", r.clipFiles())
	}
	stored := r.stored().Samples[0]
	if stored.Clip.SHA256 != "" || stored.Clip.DurationMs != 2300 || stored.Storage != StorageDAW {
		t.Fatalf("stored = %+v", stored)
	}
	// Until the project is saved the sample has no audio.
	if got, err := r.service.Clip(sample.ID); err != nil || got.State != ClipMissing || got.Data != nil {
		t.Fatalf("clip before saving = %+v, %v", got, err)
	}
	r.saveProject(70, [3]any{9.85, 12.15, stored.DawRegion.Name})
	listed := r.list().Samples[0]
	if listed.Daw.State != DawOK || listed.ClipState != ClipOK {
		t.Fatalf("listed = %+v daw %+v", listed, listed.Daw)
	}
	got, err := r.service.Clip(sample.ID)
	if err != nil || got.State != ClipOK || got.Path != "" || int64(len(got.Data)) != got.Bytes {
		t.Fatalf("clip = %+v, %v", got, err)
	}
	// 2.3 s of 8 kHz 16-bit mono, plus the 44 byte header the writer adds.
	if len(got.Data) < 2*8000*2 || len(got.Data) > 2*8000*3 {
		t.Fatalf("%d bytes of audio", len(got.Data))
	}
	if r.list().Totals.Bytes != 0 {
		t.Fatalf("a DAW-only sample counts against the project's clip bytes: %+v", r.list().Totals)
	}
}

func TestTheRegionInTheSavedProjectIsOK(t *testing.T) {
	r := newRig(t)
	r.useDaw(StorageBoth, &fakeRegions{})
	r.mustMark(request(10, 12))
	r.saveProject(70, [3]any{9.85, 12.15, nameOf(r, "")})
	if state := r.list().Samples[0].Daw.State; state != DawOK {
		t.Fatalf("state = %s", state)
	}
}

func TestAMovedRegionMovesTheSample(t *testing.T) {
	r := newRig(t)
	r.useDaw(StorageDAW, &fakeRegions{})
	sample := r.mustMark(request(10, 12))
	r.saveProject(70, [3]any{20.0, 23.0, nameOf(r, "")})
	listed := r.list().Samples[0]
	if listed.Daw.State != DawLabelMoved || listed.Daw.Start != 20 || listed.Daw.End != 23 || listed.ClipState != ClipOK {
		t.Fatalf("listed = %+v daw %+v", listed, listed.Daw)
	}
	got, err := r.service.Clip(sample.ID)
	// 3 s of audio now: the sample is whatever is under the region.
	if err != nil || len(got.Data) < 3*8000*2 || len(got.Data) > 3*8000*2+200 {
		t.Fatalf("%d bytes, %v", len(got.Data), err)
	}
}

func TestADeletedRegionEndsTheSample(t *testing.T) {
	r := newRig(t)
	r.useDaw(StorageDAW, &fakeRegions{})
	sample := r.mustMark(request(10, 12))
	r.saveProject(70, [3]any{1.0, 2.0, "Chapter 1"})
	listed := r.list().Samples[0]
	if listed.Daw.State != DawLabelMissing || listed.ClipState != ClipMissing {
		t.Fatalf("listed = %+v", listed)
	}
	if got, err := r.service.Clip(sample.ID); err != nil || got.State != ClipMissing || got.Data != nil {
		t.Fatalf("clip = %+v, %v", got, err)
	}
}

func TestARegionNotSavedYetIsNotMissing(t *testing.T) {
	r := newRig(t)
	r.config.Unsaved = func() bool { return true }
	r.useDaw(StorageDAW, &fakeRegions{})
	r.mustMark(request(10, 12))
	if state := r.list().Samples[0].Daw.State; state != DawNotSaved {
		t.Fatalf("state = %s, want not_saved", state)
	}
}

func TestARegionWhoseItemIsGoneHasNoAudio(t *testing.T) {
	r := newRig(t)
	r.useDaw(StorageDAW, &fakeRegions{})
	sample := r.mustMark(request(10, 12))
	name := nameOf(r, "")
	writeFile(t, r.rpp, []byte(fmt.Sprintf("<REAPER_PROJECT 0.1 \"7.0\" 1\n  MARKER 1 9.85 %q 1 0 1 R {AAAAAAAA-0000-4000-8000-000000000001} 0 \n  MARKER 1 12.15 \"\" 1\n>\n", name)))
	r.service = r.build()
	listed := r.list().Samples[0]
	if listed.Daw.State != DawSourceMissing || listed.ClipState != ClipMissing {
		t.Fatalf("listed = %+v daw %+v", listed, listed.Daw)
	}
	if got, _ := r.service.Clip(sample.ID); got.State != ClipMissing {
		t.Fatalf("clip = %+v", got)
	}
}

func TestARegionStretchedPastThirtySecondsHasNoAudio(t *testing.T) {
	r := newRig(t)
	r.useDaw(StorageDAW, &fakeRegions{})
	sample := r.mustMark(request(10, 12))
	r.saveProject(70, [3]any{9.85, 50.0, nameOf(r, "")})
	if got, _ := r.service.Clip(sample.ID); got.State != ClipMissing {
		t.Fatalf("clip = %+v", got)
	}
}

func TestAnUnreadableProjectIsReported(t *testing.T) {
	r := newRig(t)
	r.useDaw(StorageBoth, &fakeRegions{})
	r.mustMark(request(10, 12))
	if err := os.Remove(r.rpp); err != nil {
		t.Fatal(err)
	}
	r.service = r.build()
	if state := r.list().Samples[0].Daw.State; state != DawProjectUnreadable {
		t.Fatalf("state = %s", state)
	}
}

func TestADawChoiceTheDawCannotHonourIsRefusedBeforeAnything(t *testing.T) {
	r := newRig(t)
	r.config.Storage = func() string { return StorageDAW }
	r.service = r.build()
	_, err := r.mark(request(10, 12))
	var refusal *Refusal
	if !errors.As(err, &refusal) || refusal.Reason != ReasonDawUnavailable {
		t.Fatalf("err = %v", err)
	}
	if _, statErr := os.Stat(r.storePath()); statErr == nil || len(r.clipFiles()) != 0 {
		t.Fatalf("something was written: %v", r.clipFiles())
	}
}

func TestTheDawRefusingTheRegionSavesNothing(t *testing.T) {
	for _, c := range []struct {
		err    error
		reason Reason
	}{{bridge.ErrRecording, ReasonDawRefused}, {&bridge.RefusalError{Sentence: "no"}, ReasonDawRefused}} {
		r := newRig(t)
		r.useDaw(StorageBoth, &fakeRegions{err: c.err})
		_, err := r.mark(request(10, 12))
		var refusal *Refusal
		if !errors.As(err, &refusal) || refusal.Reason != c.reason {
			t.Fatalf("err = %v", err)
		}
		if _, statErr := os.Stat(r.storePath()); statErr == nil || len(r.clipFiles()) != 0 {
			t.Fatalf("something was written after a refusal: %v", r.clipFiles())
		}
	}
	r := newRig(t)
	r.useDaw(StorageBoth, &fakeRegions{err: errors.New("REAPER did not answer")})
	if _, err := r.mark(request(10, 12)); err == nil || errors.As(err, new(*Refusal)) {
		t.Fatalf("a DAW that did not answer must be a failure, not a refusal: %v", err)
	}
}

func TestMarkingTheSameRangeTwiceInTheDawIsOneRegion(t *testing.T) {
	r := newRig(t)
	regions := &fakeRegions{}
	r.useDaw(StorageDAW, regions)
	first := r.mustMark(request(10, 12))
	second := r.mustMark(request(10, 12))
	if first.ID != second.ID || len(regions.calls) != 1 {
		t.Fatalf("ids %s %s, calls %q", first.ID, second.ID, regions.calls)
	}
}

func TestRegionNamesKeepTheCharacterAndLabelOnOneLine(t *testing.T) {
	r := newRig(t)
	r.useDaw(StorageBoth, &fakeRegions{})
	req := request(10, 12)
	req.Label = "غاضب 😠  to the Duke"
	r.mustMark(req)
	name := nameOf(r, "")
	if strings.ContainsAny(name, "\r\n\t") || !strings.HasPrefix(name, RegionPrefix+"Hatter - غاضب 😠 to the Duke [") {
		t.Fatalf("name = %q", name)
	}
}

func TestADawSampleWithoutARegionIsCorrupt(t *testing.T) {
	for _, bad := range []Stored{{Storage: StorageDAW}, {Storage: "elsewhere"}, {Storage: StorageProject, DawRegion: &StoredRegion{Name: RegionPrefix + "x", Number: 1, Start: 0, End: 1}}} {
		if err := validStorage(bad); err == nil {
			t.Fatalf("%+v was accepted", bad)
		}
	}
	if err := validClip(StoredClip{Bytes: 10, DurationMs: 600, SampleRate: 8000, Channels: 1, BitsPerSample: 16}, true); err != nil {
		t.Fatalf("a DAW-only clip record: %v", err)
	}
	if err := validClip(StoredClip{Bytes: 10, DurationMs: 600, SampleRate: 8000, Channels: 1, BitsPerSample: 16}, false); err == nil {
		t.Fatal("a project clip without a checksum was accepted")
	}
}

// syncRegions is a DAW that can be asked from several goroutines at once, as a double press is.
type syncRegions struct {
	mu    sync.Mutex
	calls []string
}

func (f *syncRegions) AddVoiceSampleRegion(_ context.Context, start, end float64, name string) (dawport.VoiceSampleRegionKept, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, fmt.Sprintf("%.3f-%.3f %s", start, end, name))
	return dawport.VoiceSampleRegionKept{Number: len(f.calls), Outcome: "created"}, nil
}

// Every press of a double press is its own call with its own id, so the DAW cannot tell them apart by name: only one may reach it.
func TestConcurrentDawMarksAddOneRegion(t *testing.T) {
	for _, storage := range []string{StorageDAW, StorageBoth} {
		t.Run(storage, func(t *testing.T) {
			r := newRig(t)
			regions := &syncRegions{}
			r.config.Storage = func() string { return storage }
			r.config.Regions = regions
			r.service = r.build()
			var group sync.WaitGroup
			for range 8 {
				group.Add(1)
				go func() {
					defer group.Done()
					_, _ = r.mark(request(10, 12))
				}()
			}
			group.Wait()
			if samples := len(r.stored().Samples); samples != 1 || len(regions.calls) != 1 {
				t.Fatalf("samples = %d, regions asked of the DAW = %d: %q", samples, len(regions.calls), regions.calls)
			}
		})
	}
}

// A character's name is the Story Bible's, and nothing caps it: the region name must stay short enough that the store stays readable,
// or the next read sets every sample in the project aside as corrupt.
func TestARegionNameIsCappedSoTheStoreStaysReadable(t *testing.T) {
	r := newRig(t)
	r.useDaw(StorageDAW, &fakeRegions{})
	r.config.CharacterName = func(string) string { return strings.Repeat("x", 10001) }
	r.service = r.build()
	r.mustMark(request(10, 12))
	if listed := r.list(); len(listed.Samples) != 1 {
		t.Fatalf("the sample is gone after a long name: %+v", listed)
	}
	entries, _ := os.ReadDir(Dir(r.project))
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".corrupt") {
			t.Fatalf("the store was set aside as corrupt: %s", entry.Name())
		}
	}
}

// What reaches the DAW is text a person reads on a marker: no control characters, and bytes that are not UTF-8 are dropped, so the
// name the DAW saves is the name the store holds and the read-back can find it.
func TestARegionNameHasNoControlCharactersOrBrokenUTF8(t *testing.T) {
	r := newRig(t)
	regions := &fakeRegions{}
	r.useDaw(StorageDAW, regions)
	r.config.CharacterName = func(string) string { return "Ha\x00t\x1b[31mter\xff" }
	r.service = r.build()
	r.mustMark(request(10, 12))
	name := r.stored().Samples[0].DawRegion.Name
	if !utf8.ValidString(name) || strings.ContainsFunc(name, unicode.IsControl) || !strings.Contains(regions.calls[0], name) {
		t.Fatalf("name = %q, DAW was asked %q", name, regions.calls)
	}
}

// A saved project can hold a region end that is not a finite number (parseFloat reads "inf"): the list must still encode.
func TestARegionWithAnInfiniteEndStillEncodes(t *testing.T) {
	r := newRig(t)
	r.useDaw(StorageDAW, &fakeRegions{})
	r.mustMark(request(10, 12))
	r.saveProject(20, [3]any{5, "inf", nameOf(r, "")})
	listed := r.list()
	if _, err := json.Marshal(listed); err != nil {
		t.Fatalf("the list does not encode: %v", err)
	}
	if state := listed.Samples[0].Daw.State; state != DawProjectUnreadable && state != DawLabelMissing {
		t.Fatalf("state = %s", state)
	}
}

// A sample kept only in the DAW has no file: removing it frees no bytes.
func TestRemovingADawOnlySampleFreesNoBytes(t *testing.T) {
	r := newRig(t)
	r.useDaw(StorageDAW, &fakeRegions{})
	sample := r.mustMark(request(10, 12))
	removed, err := r.service.Remove(sample.ID)
	if err != nil || removed.Removed != 1 || removed.Bytes != 0 {
		t.Fatalf("removed = %+v, err = %v", removed, err)
	}
}

// Marking a stretch that already has a sample, with another storage than the sample has, brings the sample up to what is asked: it
// adds the clip or the region it lacks and never takes one away, so a repeat press is never silently ignored.
func TestMarkingAKeptStretchWithAnotherStorageUpgradesTheSample(t *testing.T) {
	cases := []struct {
		name         string
		first, again string
		storage      string // what the sample holds after
		regions      int    // regions asked of the DAW in all
		clip         bool
	}{
		{"project then DAW adds the region and keeps the clip", StorageProject, StorageDAW, StorageBoth, 1, true},
		{"project then both adds the region", StorageProject, StorageBoth, StorageBoth, 1, true},
		{"DAW then project adds the clip and keeps the region", StorageDAW, StorageProject, StorageBoth, 1, true},
		{"DAW then both adds the clip", StorageDAW, StorageBoth, StorageBoth, 1, true},
		{"both then DAW changes nothing", StorageBoth, StorageDAW, StorageBoth, 1, true},
		{"both then project changes nothing", StorageBoth, StorageProject, StorageBoth, 1, true},
		{"DAW twice changes nothing", StorageDAW, StorageDAW, StorageDAW, 1, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := newRig(t)
			regions := &fakeRegions{}
			current := c.first
			r.config.Storage = func() string { return current }
			r.config.Regions = regions
			r.service = r.build()
			first := r.mustMark(request(10, 12))
			current = c.again
			second := r.mustMark(request(10, 12))
			if first.ID != second.ID {
				t.Fatalf("a second sample was made: %s then %s", first.ID, second.ID)
			}
			stored := r.stored().Samples
			want := c.storage
			if want == StorageProject {
				want = ""
			}
			if len(stored) != 1 || stored[0].Storage != want || len(regions.calls) != c.regions {
				t.Fatalf("samples = %d, storage = %q (want %q), regions asked = %d (want %d)", len(stored), stored[0].Storage, want, len(regions.calls), c.regions)
			}
			if _, err := os.Stat(r.clipPath(first.ID)); (err == nil) != c.clip {
				t.Fatalf("clip on disk = %v, want %v", err == nil, c.clip)
			}
			if c.storage != StorageProject && stored[0].Storage != StorageProject && (stored[0].Storage == StorageDAW || stored[0].Storage == StorageBoth) && stored[0].DawRegion == nil {
				t.Fatal("a sample kept in the DAW has no region")
			}
			if c.clip && stored[0].Clip.SHA256 == "" {
				t.Fatalf("a sample with a clip has no checksum: %+v", stored[0].Clip)
			}
			if listed := r.list(); len(listed.Samples) != 1 {
				t.Fatalf("the store does not read back: %+v", listed)
			}
		})
	}
}

// The DAW refusing the region of an upgrade leaves the sample as it was, and no clip the upgrade wrote.
func TestAnUpgradeTheDawRefusesLeavesTheSampleAsItWas(t *testing.T) {
	r := newRig(t)
	current := StorageProject
	regions := &fakeRegions{}
	r.config.Storage = func() string { return current }
	r.config.Regions = regions
	r.service = r.build()
	first := r.mustMark(request(10, 12))
	regions.err = bridge.ErrRecording
	current = StorageDAW
	if _, err := r.mark(request(10, 12)); err == nil {
		t.Fatal("the upgrade was accepted while the DAW refused")
	}
	stored := r.stored().Samples
	if len(stored) != 1 || stored[0].Storage != "" || stored[0].DawRegion != nil || stored[0].ID != first.ID {
		t.Fatalf("the sample changed: %+v", stored)
	}
}

// An upgrade that adds a clip counts it against the project's 200 MiB, and one that would pass it is refused, leaving the sample.
func TestAnUpgradeThatAddsAClipIsHeldToTheProjectLimit(t *testing.T) {
	r := newRig(t)
	current := StorageDAW
	r.config.Storage = func() string { return current }
	r.config.Regions = &fakeRegions{}
	r.service = r.build()
	r.mustMark(request(10, 12))
	file := r.stored()
	file.Samples = append(file.Samples, Stored{
		ID: fmt.Sprintf("%032x", 99), CharacterID: "queen", CreatedAt: file.Samples[0].CreatedAt,
		Source: file.Samples[0].Source,
		Clip:   StoredClip{Bytes: MaxProjectBytes, DurationMs: 600, SampleRate: 8000, Channels: 1, BitsPerSample: 16, SHA256: strings.Repeat("a", 64)},
	})
	file.Samples[1].Source.ItemGUID = "other"
	r.seed(file.Samples...)
	current = StorageProject
	_, err := r.mark(request(10, 12))
	if refusal := refusalOf(t, err); refusal.Reason != ReasonProjectLimit {
		t.Fatalf("err = %v, want project_limit", err)
	}
	if stored := r.stored().Samples; stored[0].Storage != StorageDAW {
		t.Fatalf("the sample changed: %+v", stored[0])
	}
}
