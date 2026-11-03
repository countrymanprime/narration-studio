package bridge

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// A character voice sample kept in the project as a REAPER region (narration_voice_sample_region.lua, phase 6 of
// docs/prds/character-voice-samples.prd.md). The host names the region; the script adds it, moves it and lists it.

// VoiceSampleRegionPrefix starts the name of every region this app keeps as a voice sample. The script only moves a region
// whose name starts with it, and the read-back lists only such regions. It is equal to SAMPLE_PREFIX in the script.
const VoiceSampleRegionPrefix = "Voice sample: "

// MaxVoiceSampleRegions is the most regions one read answers with; the script stops at the same count.
const MaxVoiceSampleRegions = 500

// ErrBadVoiceSampleRegion is returned when the range or the name is one REAPER would take wrongly, so nothing was sent.
var ErrBadVoiceSampleRegion = errors.New("the voice sample range or name is not valid")

// VoiceSampleRegionKept is what keep_voice_sample did: the region's number in the project and one of "created", "existing",
// "moved" or "unchanged".
type VoiceSampleRegionKept struct {
	Number  int
	Outcome string
}

// VoiceSampleRegion is one region the read-back found: its number, its project range in seconds and its whole name.
type VoiceSampleRegion struct {
	Number     int
	Start, End float64
	Name       string
}

// VoiceSampleRegions is the read-back: the regions in project order and REAPER's change count at the read, which the host
// compares with the saved project's to tell a region REAPER has but the saved file does not.
type VoiceSampleRegions struct {
	Regions     []VoiceSampleRegion
	ChangeCount int
}

// VoiceSampleRegionStaleError is returned when the region number no longer names a voice sample region in the open project (it
// was deleted, or is another kind of region). Nothing was changed.
type VoiceSampleRegionStaleError struct{ Number int }

func (e *VoiceSampleRegionStaleError) Error() string {
	return "the voice sample's region is no longer in the REAPER project"
}

// Is reports a stale region as ErrStale, so callers can match it with errors.Is.
func (e *VoiceSampleRegionStaleError) Is(target error) bool { return target == ErrStale }

func voiceSampleRegionArgs(start, end float64, name string) ([]string, error) {
	name = strings.TrimSpace(name)
	if !finite(start) || !finite(end) || start < 0 || end <= start || name == "" || !strings.HasPrefix(name, VoiceSampleRegionPrefix) {
		return nil, ErrBadVoiceSampleRegion
	}
	return []string{formatSeconds(start), formatSeconds(end), name}, nil
}

// AddVoiceSampleRegion adds one region named name (which starts with VoiceSampleRegionPrefix) over start to end project seconds, in
// one undo point. It is idempotent: a region with the same name and bounds is answered "existing" and nothing is added. It refuses
// while REAPER records (ErrRecording).
func (a *Actions) AddVoiceSampleRegion(ctx context.Context, start, end float64, name string) (VoiceSampleRegionKept, error) {
	args, err := voiceSampleRegionArgs(start, end, name)
	if err != nil {
		return VoiceSampleRegionKept{}, err
	}
	return a.keepVoiceSample(ctx, append([]string{""}, args...))
}

// MoveVoiceSampleRegion moves and renames region number to the range and name given, keeping its number and colour, in one undo
// point. A number that is not a voice sample region is a *VoiceSampleRegionStaleError.
func (a *Actions) MoveVoiceSampleRegion(ctx context.Context, number int, start, end float64, name string) (VoiceSampleRegionKept, error) {
	args, err := voiceSampleRegionArgs(start, end, name)
	if err != nil || number < 1 {
		return VoiceSampleRegionKept{}, ErrBadVoiceSampleRegion
	}
	return a.keepVoiceSample(ctx, append([]string{strconv.Itoa(number)}, args...))
}

func (a *Actions) keepVoiceSample(ctx context.Context, args []string) (VoiceSampleRegionKept, error) {
	events, err := a.request(ctx, "keep_voice_sample", []string{"VOICE_SAMPLE_KEPT", "VOICE_SAMPLE_STALE"}, args...)
	if err != nil {
		return VoiceSampleRegionKept{}, err
	}
	last := events[len(events)-1]
	if last.Tag == "VOICE_SAMPLE_STALE" {
		number, _ := strconv.Atoi(last.Fields[2])
		return VoiceSampleRegionKept{}, &VoiceSampleRegionStaleError{Number: number}
	}
	return VoiceSampleRegionKept{Number: int(numberAt(last.Fields, 2)), Outcome: last.Fields[3]}, nil
}

// ReadVoiceSampleRegions lists the voice sample regions in the open project, changing nothing.
func (a *Actions) ReadVoiceSampleRegions(ctx context.Context) (VoiceSampleRegions, error) {
	events, err := a.request(ctx, "read_voice_samples", []string{"VOICE_SAMPLES_READ"}, VoiceSampleRegionPrefix)
	if err != nil {
		return VoiceSampleRegions{}, err
	}
	var out VoiceSampleRegions
	for _, event := range events {
		switch event.Tag {
		case "VOICE_SAMPLE_REGION":
			out.Regions = append(out.Regions, VoiceSampleRegion{
				Number: int(numberAt(event.Fields, 2)), Start: numberAt(event.Fields, 3), End: numberAt(event.Fields, 4), Name: event.Fields[5],
			})
		case "VOICE_SAMPLES_READ":
			out.ChangeCount = int(numberAt(event.Fields, 3))
		}
	}
	if len(out.Regions) > MaxVoiceSampleRegions {
		return VoiceSampleRegions{}, fmt.Errorf("REAPER listed more than %d voice sample regions", MaxVoiceSampleRegions)
	}
	return out, nil
}
