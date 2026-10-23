package voicesample

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"desktop/internal/measure"
)

// 20 ms at 8 kHz is the sine's half period, so every multiple of 20 frames is already a zero crossing and a window cut there
// does not move when it snaps.
const half = 20.0 / testRate

func TestLimitsAreTheOwnersDecisions(t *testing.T) {
	limits := Limits()
	want := LimitsView{MinSeconds: 0.5, MaxSeconds: 30, PerCharacter: 20, ProjectBytes: 200 << 20, LabelUnits: 60, NoteUnits: 500}
	if limits != want {
		t.Fatalf("limits = %+v, want %+v", limits, want)
	}
}

func TestMarkWritesTheClipThenTheRowAndAnswersTheSample(t *testing.T) {
	r := newRig(t)
	sample := r.mustMark(request(10, 12))

	if sample.ID != fmt.Sprintf("%032x", 1) || sample.CharacterID != "hatter" || sample.Label != "Angry, to the Duke" || !sample.Primary {
		t.Fatalf("sample = %+v", sample)
	}
	if sample.ClipState != ClipOK || sample.Source.State != SourceOK || sample.Source.ChapterTitle != "Chapter One" {
		t.Fatalf("states = %s, %s, title %q", sample.ClipState, sample.Source.State, sample.Source.ChapterTitle)
	}
	if sample.Source.Text != "“Off with her head!”" || sample.Source.StartKey != "p-000001:0" || sample.Source.EndKey != "p-000001:3" {
		t.Fatalf("source = %+v", sample.Source)
	}
	// 2 s asked, 150 ms of handle each side: 2.3 s at 8 kHz, 16-bit mono.
	if sample.DurationMs != 2300 {
		t.Fatalf("duration = %d ms, want 2300", sample.DurationMs)
	}
	clip, err := os.ReadFile(r.clipPath(sample.ID))
	if err != nil {
		t.Fatal(err)
	}
	if int64(len(clip)) != sample.Bytes {
		t.Fatalf("clip is %d bytes, the sample says %d", len(clip), sample.Bytes)
	}
	stored := r.stored().Samples[0]
	if stored.Clip.SHA256 != sha(clip) || stored.Clip.SampleRate != testRate || stored.Clip.Channels != 1 || stored.Clip.BitsPerSample != 16 {
		t.Fatalf("stored clip = %+v", stored.Clip)
	}
	if stored.Source.ItemGUID != testItem || stored.Source.TakeGUID != testTake || stored.Source.SourceFile != r.wav ||
		stored.Source.SourceStart != 9.85 || stored.Source.SourceEnd != 12.15 {
		t.Fatalf("stored source = %+v", stored.Source)
	}
	if got := r.clipFiles(); len(got) != 1 || got[0] != sample.ID+".wav" {
		t.Fatalf("clip files = %v", got)
	}
}

// The copied clip decodes to exactly the samples of the window it was cut from: no resampling, dithering or conversion.
func TestMarkCopiesTheWindowBitForBit(t *testing.T) {
	const rate, frames = 48000, 10 * 48000
	noise := make([]float64, frames)
	for i := range noise {
		noise[i] = float64((i*7919)%2001-1000) / 1000 * 0.9
	}
	r := newRig(t)
	source := wavBytes(rate, 2, 24, noise)
	writeFile(t, r.wav, source)
	writeFile(t, r.rpp, []byte(rppText("take.wav", 0, 10, "")))

	sample := r.mustMark(request(3, 4.5))
	stored := r.stored().Samples[0]
	first := int64(stored.Source.SourceStart*rate + 0.5)
	count := int64(stored.Source.SourceEnd*rate+0.5) - first
	if stored.Clip.SampleRate != rate || stored.Clip.Channels != 2 || stored.Clip.BitsPerSample != 24 {
		t.Fatalf("the clip is not in the source's format: %+v", stored.Clip)
	}
	if want := (4.5 - 3 + 0.3) * rate; float64(count) < want-0.004*rate || float64(count) > want+0.004*rate {
		t.Fatalf("clip has %d frames, want about %v", count, want)
	}
	const sourceData, clipData, frameBytes = 60, 44, 6 // wavBytes lays out 60 bytes before its data; the clip writes 44
	clip, err := os.ReadFile(r.clipPath(sample.ID))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(clip[clipData:clipData+count*frameBytes], source[sourceData+first*frameBytes:sourceData+(first+count)*frameBytes]) {
		t.Fatal("the clip's sample bytes differ from the source window's")
	}
	sourceReader, err := measure.NewWAVReader(bytes.NewReader(source))
	if err != nil {
		t.Fatal(err)
	}
	if skipped, err := sourceReader.Skip(first); err != nil || skipped != first {
		t.Fatalf("skipped %d of %d frames: %v", skipped, first, err)
	}
	want, err := sourceReader.Read(int(count))
	if err != nil {
		t.Fatal(err)
	}
	clipReader, err := measure.NewWAVReader(bytes.NewReader(clip))
	if err != nil {
		t.Fatal(err)
	}
	gotChannels, err := clipReader.Read(int(count) + 100)
	if err != nil {
		t.Fatal(err)
	}
	for c := range want {
		if len(gotChannels[c]) != int(count) {
			t.Fatalf("channel %d: %d frames, want %d", c, len(gotChannels[c]), count)
		}
		for i := range want[c] {
			if gotChannels[c][i] != want[c][i] {
				t.Fatalf("channel %d frame %d differs: %v vs %v", c, i, gotChannels[c][i], want[c][i])
			}
		}
	}
}

func TestHandlesAreAddedEachSideAndClampedToThePlayedRangeAndToACut(t *testing.T) {
	cases := []struct {
		name         string
		sourceStart  float64
		length       float64
		hidden       []Hidden
		start, end   float64
		wantA, wantB float64
	}{
		{"both handles", 0, 70, nil, 10, 12, 9.85, 12.15},
		{"played range starts at the sample", 10, 60, nil, 10, 12, 10, 12.15},
		{"played range ends at the sample", 0, 12, nil, 10, 12, 9.85, 12},
		{"a cut just before the words", 0, 70, []Hidden{{ItemGUID: testItem, Start: 9, End: 9.95}}, 10, 12, 9.95, 12.15},
		{"a cut just after the words", 0, 70, []Hidden{{ItemGUID: testItem, Start: 12.05, End: 13}}, 10, 12, 9.85, 12.05},
		{"a cut of another item is not this item's", 0, 70, []Hidden{{ItemGUID: "{other}", Start: 9, End: 9.95}}, 10, 12, 9.85, 12.15},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := newRig(t)
			writeFile(t, r.rpp, []byte(rppText("take.wav", c.sourceStart, c.length, "")))
			r.cuts.hidden = c.hidden
			r.mustMark(request(c.start, c.end))
			got := r.stored().Samples[0].Source
			if got.SourceStart != c.wantA || got.SourceEnd != c.wantB {
				t.Fatalf("window = [%v, %v], want [%v, %v]", got.SourceStart, got.SourceEnd, c.wantA, c.wantB)
			}
		})
	}
}

// A cut moves a crossing at most MaxShift (2 ms) from where it was asked; the window still starts and ends on a crossing.
func TestBothEndsSnapToTheNearestZeroCrossing(t *testing.T) {
	r := newRig(t)
	// 9.85 s is frame 78800, a zero. Ask 5 frames (0.6 ms) later on each side: the asked window is [9.8506, 12.1494].
	r.mustMark(request(10.0006, 11.9994))
	got := r.stored().Samples[0].Source
	for name, at := range map[string]float64{"start": got.SourceStart, "end": got.SourceEnd} {
		frame := at * testRate
		if int64(frame+0.5)%20 != 0 {
			t.Errorf("%s = %v s (frame %v) is not on a zero crossing", name, at, frame)
		}
		if distance := at - map[string]float64{"start": 9.8506, "end": 12.1494}[name]; distance > 0.002 || distance < -0.002 {
			t.Errorf("%s moved %v s, more than 2 ms", name, distance)
		}
	}
}

func TestAThirtySecondSampleIsTheLongestAllowed(t *testing.T) {
	r := newRig(t)
	// 29.7 s asked and 0.3 s of handle: exactly 30 s.
	sample := r.mustMark(request(10, 39.7))
	if sample.DurationMs != 30000 {
		t.Fatalf("duration = %d ms", sample.DurationMs)
	}
	_, err := r.mark(request(10, 39.7+half))
	if refusal := refusalOf(t, err); refusal.Reason != ReasonTooLong {
		t.Fatalf("a sample over 30 s: %v", refusal)
	}
	if len(r.list().Samples) != 1 {
		t.Fatal("the refused mark was stored")
	}
}

func TestAHalfSecondSampleIsTheShortestAllowed(t *testing.T) {
	r := newRig(t)
	// 0.2 s asked and 0.3 s of handle: exactly 0.5 s.
	if sample := r.mustMark(request(10, 10.2)); sample.DurationMs != 500 {
		t.Fatalf("duration = %d ms", sample.DurationMs)
	}
	// Played range 20 to 20.4 s: handles cannot grow it past 0.4 s.
	writeFile(t, r.rpp, []byte(rppText("take.wav", 20, 0.4, "")))
	_, err := r.mark(request(20, 20.4))
	if refusal := refusalOf(t, err); refusal.Reason != ReasonTooShort {
		t.Fatalf("a sample under 0.5 s: %v", refusal)
	}
}

func TestMarkRefusals(t *testing.T) {
	notAProject := func(r *rig) { writeFile(t, r.rpp, []byte("this is not a REAPER project")) }
	cases := []struct {
		name   string
		reason Reason
		setup  func(r *rig, req *MarkRequest)
	}{
		{"stale_alignment/the page has an older record", ReasonStaleAlignment, func(r *rig, req *MarkRequest) { req.AlignmentRecordID = "record-0" }},
		{"stale_alignment/the page sent no record", ReasonStaleAlignment, func(r *rig, req *MarkRequest) { req.AlignmentRecordID = "" }},
		{"stale_alignment/no check is current", ReasonStaleAlignment, func(r *rig, req *MarkRequest) { r.alignment.heard.RecordID = "" }},
		{"stale_alignment/no alignment is wired", ReasonStaleAlignment, func(r *rig, req *MarkRequest) { r.config.Alignment = nil }},
		{"stale_alignment/the manuscript lost the words", ReasonStaleAlignment, func(r *rig, req *MarkRequest) { r.book.Lines[0].Text = "Off with" }},
		{"stale_alignment/the manuscript lost the chapter", ReasonStaleAlignment, func(r *rig, req *MarkRequest) { r.book.Chapters = nil }},
		{"stale_alignment/the item is not in the saved project", ReasonStaleAlignment, func(r *rig, req *MarkRequest) {
			writeFile(t, r.rpp, []byte(strings.ReplaceAll(rppText("take.wav", 0, 70, ""), testItem, "{99999999-9999-9999-9999-999999999999}")))
		}},
		{"stale_alignment/the take is not in the saved project", ReasonStaleAlignment, func(r *rig, req *MarkRequest) {
			writeFile(t, r.rpp, []byte(strings.ReplaceAll(rppText("take.wav", 0, 70, ""), testTake, "{99999999-9999-9999-9999-999999999999}")))
		}},
		{"stale_alignment/the page names another item than the words were heard on", ReasonStaleAlignment, func(r *rig, req *MarkRequest) {
			req.ItemGUID = "{33333333-3333-3333-3333-333333333333}"
		}},
		{"not_heard/the first word", ReasonNotHeard, func(r *rig, req *MarkRequest) { r.alignment.heard.First = nil }},
		{"not_heard/the last word", ReasonNotHeard, func(r *rig, req *MarkRequest) { r.alignment.heard.Last = nil }},
		{"spans_takes/the words were heard on two items", ReasonSpansTakes, func(r *rig, req *MarkRequest) {
			r.alignment.heard.Last = &HeardWord{ItemGUID: "{44444444-4444-4444-4444-444444444444}", TakeGUID: testTake}
		}},
		{"spans_takes/the words were heard on two takes", ReasonSpansTakes, func(r *rig, req *MarkRequest) {
			r.alignment.heard.Last = &HeardWord{ItemGUID: testItem, TakeGUID: "{55555555-5555-5555-5555-555555555555}"}
		}},
		{"spans_takes/the range starts before the played range", ReasonSpansTakes, func(r *rig, req *MarkRequest) {
			writeFile(t, r.rpp, []byte(rppText("take.wav", 10.5, 20, "")))
		}},
		{"spans_takes/the range ends after the played range", ReasonSpansTakes, func(r *rig, req *MarkRequest) {
			writeFile(t, r.rpp, []byte(rppText("take.wav", 0, 11.9, "")))
		}},
		{"spans_cut/a cut inside the words", ReasonSpansCut, func(r *rig, req *MarkRequest) {
			r.cuts.hidden = []Hidden{{ItemGUID: testItem, Start: 10.5, End: 10.9}}
		}},
		{"spans_cut/a cut over the start", ReasonSpansCut, func(r *rig, req *MarkRequest) {
			r.cuts.hidden = []Hidden{{ItemGUID: testItem, Start: 9, End: 10.1}}
		}},
		{"spans_cut/a cut over the end", ReasonSpansCut, func(r *rig, req *MarkRequest) {
			r.cuts.hidden = []Hidden{{ItemGUID: testItem, Start: 11.9, End: 13}}
		}},
		{"too_short/the played range is a third of a second", ReasonTooShort, func(r *rig, req *MarkRequest) {
			writeFile(t, r.rpp, []byte(rppText("take.wav", 10, 0.3, "")))
			req.SourceEnd = 10.3
		}},
		{"too_long/thirty-one seconds", ReasonTooLong, func(r *rig, req *MarkRequest) { req.SourceEnd = 41 }},
		{"too_long/more words than a sample can hold", ReasonTooLong, func(r *rig, req *MarkRequest) {
			r.book.Lines[0].Text = strings.Repeat("word ", 1200)
			req.EndKey = "p-000001:1100"
		}},
		{"unsupported_source/an mp3", ReasonUnsupportedSource, func(r *rig, req *MarkRequest) {
			writeFile(t, r.wav, append([]byte("ID3\x03\x00\x00\x00\x00\x00\x00"), make([]byte, 4096)...))
		}},
		{"unsupported_source/eight-bit PCM", ReasonUnsupportedSource, func(r *rig, req *MarkRequest) {
			source := wavBytes(testRate, 1, 16, sineFrames(testRate, 70*testRate))
			source[34] = 8 // the fmt chunk's bits per sample
			writeFile(t, r.wav, source)
		}},
		{"unsupported_source/a file that is empty", ReasonUnsupportedSource, func(r *rig, req *MarkRequest) { writeFile(t, r.wav, nil) }},
		{"source_missing/the file was deleted", ReasonSourceMissing, func(r *rig, req *MarkRequest) {
			if err := os.Remove(r.wav); err != nil {
				t.Fatal(err)
			}
		}},
		{"source_missing/the project names a folder", ReasonSourceMissing, func(r *rig, req *MarkRequest) {
			if err := os.Remove(r.wav); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(r.wav, 0o755); err != nil {
				t.Fatal(err)
			}
		}},
		{"project_unreadable/the file is not a project", ReasonProjectUnreadable, func(r *rig, req *MarkRequest) { notAProject(r) }},
		{"project_unreadable/the project file is gone", ReasonProjectUnreadable, func(r *rig, req *MarkRequest) {
			if err := os.Remove(r.rpp); err != nil {
				t.Fatal(err)
			}
		}},
		{"project_unreadable/no project file is chosen", ReasonProjectUnreadable, func(r *rig, req *MarkRequest) { r.config.ProjectFile = nil }},
		{"project_unreadable/the choice fails", ReasonProjectUnreadable, func(r *rig, req *MarkRequest) {
			r.config.ProjectFile = func() (string, error) { return "", errors.New("no project is linked") }
		}},
		{"character_limit/twenty samples", ReasonCharacterLimit, func(r *rig, req *MarkRequest) {
			rows := make([]Stored, 0, 20)
			for i := 1; i <= 20; i++ {
				rows = append(rows, row(i, "hatter", i == 1, 1000))
			}
			r.seed(rows...)
		}},
		{"project_limit/the clips fill the project", ReasonProjectLimit, func(r *rig, req *MarkRequest) {
			r.seed(row(1, "queen", true, MaxProjectBytes-100))
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := newRig(t)
			req := request(10, 12)
			c.setup(r, &req)
			r.service = r.build()
			before, hadStore := os.ReadFile(r.storePath())
			_, err := r.mark(req)
			refusal := refusalOf(t, err)
			if refusal.Reason != c.reason {
				t.Fatalf("reason = %s (%s), want %s", refusal.Reason, refusal.Message, c.reason)
			}
			if got := r.clipFiles(); len(got) != 0 {
				t.Fatalf("a refused mark left clips behind: %v", got)
			}
			after, nowHasStore := os.ReadFile(r.storePath())
			if (hadStore == nil) != (nowHasStore == nil) || !bytes.Equal(before, after) {
				t.Fatal("a refused mark changed samples.json")
			}
		})
	}
}

func TestMarkRefusalSentencesAreForTheNarrator(t *testing.T) {
	want := map[Reason]string{
		ReasonStaleAlignment:    "The recording changed since this chapter was checked. Check it again, then mark the sample.",
		ReasonSpansTakes:        "Choose words inside one take.",
		ReasonSpansCut:          "Restore the cut words or choose words without them.",
		ReasonTooLong:           "A sample is at most 30 seconds.",
		ReasonUnsupportedSource: "Only WAV recordings can be copied.",
	}
	for reason, sentence := range want {
		if got := (&Refusal{Reason: reason}).Sentence(); got != sentence {
			t.Errorf("%s: %q, want %q", reason, got, sentence)
		}
	}
	for _, reason := range Reasons() {
		if (&Refusal{Reason: reason}).Sentence() == "" {
			t.Errorf("%s has no sentence", reason)
		}
	}
}

func TestInvalidRequestsAreErrorsNotRefusals(t *testing.T) {
	cases := map[string]func(req *MarkRequest){
		"no chapter":         func(req *MarkRequest) { req.ChapterID = "" },
		"no item":            func(req *MarkRequest) { req.ItemGUID = "" },
		"no take":            func(req *MarkRequest) { req.TakeGUID = "" },
		"no character":       func(req *MarkRequest) { req.CharacterID = " " },
		"character control":  func(req *MarkRequest) { req.CharacterID = "ha\x00tter" },
		"character too long": func(req *MarkRequest) { req.CharacterID = strings.Repeat("a", 129) },
		"nan start":          func(req *MarkRequest) { req.SourceStart = nan() },
		"negative start":     func(req *MarkRequest) { req.SourceStart = -1 },
		"end before start":   func(req *MarkRequest) { req.SourceEnd = 5 },
		"infinite end":       func(req *MarkRequest) { req.SourceEnd = inf() },
		"a week and a day":   func(req *MarkRequest) { req.SourceEnd = 8 * 24 * 3600 },
		"bad key":            func(req *MarkRequest) { req.StartKey = "p-000001" },
		"words backwards":    func(req *MarkRequest) { req.StartKey, req.EndKey = req.EndKey, req.StartKey },
		"record id too long": func(req *MarkRequest) { req.AlignmentRecordID = strings.Repeat("r", 65) },
		"label too long":     func(req *MarkRequest) { req.Label = strings.Repeat("a", 61) },
		"note too long":      func(req *MarkRequest) { req.Note = strings.Repeat("a", 501) },
		"label with a break": func(req *MarkRequest) { req.Label = "one\ntwo" },
		"note with a bell":   func(req *MarkRequest) { req.Note = "ding\a" },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			r := newRig(t)
			req := request(10, 12)
			change(&req)
			_, err := r.mark(req)
			var refusal *Refusal
			if err == nil || errors.As(err, &refusal) || !errors.Is(err, ErrInvalid) {
				t.Fatalf("err = %v, want ErrInvalid and no refusal", err)
			}
			if r.alignment.called != 0 {
				t.Fatal("an invalid request reached the alignment")
			}
		})
	}
}

func TestACharacterMayHaveTwentySamples(t *testing.T) {
	r := newRig(t)
	rows := make([]Stored, 0, 19)
	for i := 1; i <= 19; i++ {
		rows = append(rows, row(i, "hatter", i == 1, 1000))
	}
	r.seed(rows...)
	sample := r.mustMark(request(10, 12))
	if sample.Primary {
		t.Fatal("the twentieth sample took the primary mark from the first")
	}
	if got := len(r.list().Samples); got != 20 {
		t.Fatalf("samples = %d", got)
	}
	// Another character is unaffected by Hatter's twenty.
	other := request(10, 12)
	other.CharacterID = "queen"
	r.mustMark(other)
}

func TestProjectLimit(t *testing.T) {
	r := newRig(t)
	// One sample is a 2.3 s, 8 kHz, 16-bit clip. Rows that fill the project to exactly its cap less that clip leave it room for
	// exactly one: the rows are not backed by files, so no 200 MiB is written.
	probe := newRig(t)
	size := probe.mustMark(request(10, 12)).Bytes
	r.seed(row(1, "queen", true, MaxProjectBytes-size))
	if sample := r.mustMark(request(10, 12)); sample.Bytes != size {
		t.Fatalf("a clip that fills the project exactly was %d bytes, want %d", sample.Bytes, size)
	}
	list := r.list()
	if list.Totals.Bytes != MaxProjectBytes || list.Totals.Count != 2 {
		t.Fatalf("totals = %+v, want the cap", list.Totals)
	}
	other := request(20, 22)
	_, err := r.mark(other)
	if refusal := refusalOf(t, err); refusal.Reason != ReasonProjectLimit {
		t.Fatalf("a clip over the cap: %v", refusal)
	}
	// Removing a sample frees its bytes.
	if _, err := r.service.Remove(list.Samples[0].ID); err != nil {
		t.Fatal(err)
	}
	r.mustMark(other)
}

func TestMarkingTheSameRangeTwiceIsOneSample(t *testing.T) {
	r := newRig(t)
	first := r.mustMark(request(10, 12))
	again := r.mustMark(request(10, 12))
	if first.ID != again.ID {
		t.Fatalf("a repeated mark made a second sample: %s and %s", first.ID, again.ID)
	}
	if got := len(r.list().Samples); got != 1 || len(r.clipFiles()) != 1 {
		t.Fatalf("samples = %d, clips = %v", got, r.clipFiles())
	}
	// The same words for another character are another sample.
	queen := request(10, 12)
	queen.CharacterID = "queen"
	if other := r.mustMark(queen); other.ID == first.ID || !other.Primary {
		t.Fatalf("the same range for another character: %+v", other)
	}
}

func TestConcurrentMarksKeepOnePrimaryAndEveryRow(t *testing.T) {
	r := newRig(t)
	var wg sync.WaitGroup
	errs := make(chan error, 10)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Each call builds its own service, as the host does; they share only the files.
			_, err := r.build().Mark(context.Background(), request(10+float64(i)*3, 12+float64(i)*3))
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	list := r.list()
	primaries := 0
	for _, sample := range list.Samples {
		if sample.Primary {
			primaries++
		}
	}
	if len(list.Samples) != 10 || primaries != 1 || len(r.clipFiles()) != 10 {
		t.Fatalf("samples = %d, primaries = %d, clips = %d", len(list.Samples), primaries, len(r.clipFiles()))
	}
}

func TestMakePrimaryMovesTheMarkOnlyWhenAsked(t *testing.T) {
	r := newRig(t)
	first := r.mustMark(request(10, 12))
	second := r.mustMark(request(20, 22))
	if !first.Primary || second.Primary {
		t.Fatalf("a second sample took the mark: %v, %v", first.Primary, second.Primary)
	}
	asked := request(30, 32)
	asked.MakePrimary = true
	third := r.mustMark(asked)
	if !third.Primary {
		t.Fatal("makePrimary did not make the sample primary")
	}
	primaries := map[string]bool{}
	for _, sample := range r.list().Samples {
		primaries[sample.ID] = sample.Primary
	}
	if primaries[first.ID] || primaries[second.ID] || !primaries[third.ID] {
		t.Fatalf("primaries = %v", primaries)
	}
}

func TestMarkKeepsTextAsGiven(t *testing.T) {
	r := newRig(t)
	req := request(10, 12)
	req.Label = "  مرحبا 🎩 שלום  "
	req.Note = "line one\r\nline two\tindented  "
	sample := r.mustMark(req)
	if sample.Label != "مرحبا 🎩 שלום" || sample.Note != "line one\nline two\tindented" {
		t.Fatalf("label %q, note %q", sample.Label, sample.Note)
	}
	if again := r.list().Samples[0]; again.Label != sample.Label || again.Note != sample.Note {
		t.Fatalf("after a round trip: %q, %q", again.Label, again.Note)
	}
	// A narrator may leave both empty.
	bare := request(20, 22)
	bare.Label, bare.Note = "", ""
	r.mustMark(bare)
}

func TestAFailedRowWriteRemovesTheClip(t *testing.T) {
	r := newRig(t)
	r.service.rename = func(from, to string) error {
		if filepath.Base(to) == "samples.json" {
			return errors.New("the disk is full")
		}
		return os.Rename(from, to)
	}
	_, err := r.mark(request(10, 12))
	var refusal *Refusal
	if err == nil || errors.As(err, &refusal) {
		t.Fatalf("err = %v, want a failure that is not a refusal", err)
	}
	if got := r.clipFiles(); len(got) != 0 {
		t.Fatalf("the clip of a sample that was never stored is still on disk: %v", got)
	}
	if _, statErr := os.Stat(r.storePath()); statErr == nil {
		t.Fatal("samples.json was written")
	}
	r.service = r.build()
	r.mustMark(request(10, 12)) // the narrator can save again
}

func TestAFailedClipWriteLeavesNothing(t *testing.T) {
	r := newRig(t)
	if err := os.MkdirAll(Dir(r.project), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(Dir(r.project), "clips"), []byte("a file where the clips folder goes"))
	if _, err := r.mark(request(10, 12)); err == nil {
		t.Fatal("a mark that could not write its clip succeeded")
	}
	if _, statErr := os.Stat(r.storePath()); statErr == nil {
		t.Fatal("samples.json was written")
	}
}

// A source shorter than the recording the check heard is a changed recording: the window it was asked for is not in the file.
func TestASourceShorterThanItsPlayedRangeIsAChangedRecording(t *testing.T) {
	r := newRig(t)
	writeFile(t, r.wav, wavBytes(testRate, 1, 16, sineFrames(testRate, 6*testRate)))
	_, err := r.mark(request(10, 12))
	if refusal := refusalOf(t, err); refusal.Reason != ReasonStaleAlignment {
		t.Fatalf("refusal = %v", refusal)
	}
	if len(r.clipFiles()) != 0 {
		t.Fatalf("clip files = %v", r.clipFiles())
	}
}
