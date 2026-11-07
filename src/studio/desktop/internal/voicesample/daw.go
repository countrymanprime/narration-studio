package voicesample

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
	"unicode"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/tracks"
)

// Where a sample is kept (VoiceSamples.storage, docs/prds/character-voice-samples.prd.md, Where a sample is kept).
const (
	// StorageProject copies the clip into the project folder. It is the default, and what a sample made before phase 6 is.
	StorageProject = "project"
	// StorageDAW keeps no copy: the sample is a region in the DAW's project, and plays the labelled range of its source.
	StorageDAW = "daw"
	// StorageBoth copies the clip and adds the region.
	StorageBoth = "both"
)

// RegionPrefix starts the name of every region this package asks the DAW for. It is dawport.VoiceSampleRegionPrefix.
const RegionPrefix = dawport.VoiceSampleRegionPrefix

// regionTolerance is how far a saved region may be from where the host added it before the sample reads as moved (seconds).
const regionTolerance = 0.01

// RegionAdder is the part of the DAW's VoiceSampleRegionKeeper role the store needs.
type RegionAdder interface {
	AddVoiceSampleRegion(ctx context.Context, start, end float64, name string) (dawport.VoiceSampleRegionKept, error)
}

// RegionRemover is the part of the DAW's VoiceSampleRegionKeeper role that takes a region back. The Regions the host gives is asked
// whether it is one; a DAW that cannot delete leaves the region where it is.
type RegionRemover interface {
	DeleteVoiceSampleRegion(ctx context.Context, number int) (dawport.VoiceSampleRegionRemoved, error)
}

// regionDeleteTimeout is how long the DAW has to answer a delete before the region is left where it is.
const regionDeleteTimeout = 10 * time.Second

// DawState says what the DAW's saved project holds for a sample kept in the DAW. Computed on every read, never stored.
type DawState string

const (
	// DawOK is the region where the host added it.
	DawOK DawState = "ok"
	// DawLabelMoved is the region found elsewhere: the narrator moved it, so the sample is the audio now under it.
	DawLabelMoved DawState = "label_moved"
	// DawLabelMissing is no region of that name in the saved project: the narrator deleted or renamed it, and the sample has ended.
	DawLabelMissing DawState = "label_missing"
	// DawNotSaved is no such region in the saved project while the DAW has unsaved edits: it may be there once the project is saved.
	DawNotSaved DawState = "not_saved"
	// DawSourceMissing is a region whose item or take is no longer in the saved project, so there is no audio under it.
	DawSourceMissing DawState = "source_missing"
	// DawProjectUnreadable is a saved project that could not be read.
	DawProjectUnreadable DawState = "project_unreadable"
)

// DawView is a DAW-kept sample's region as the page gets it. Start and End are the project seconds the saved project holds for it
// (zero when it holds none).
type DawView struct {
	State DawState `json:"state"`
	Name  string   `json:"name"`
	Start float64  `json:"start"`
	End   float64  `json:"end"`
}

func (s *Service) storage() string {
	if s.config.Storage != nil {
		switch choice := s.config.Storage(); choice {
		case StorageDAW, StorageBoth:
			return choice
		}
	}
	return StorageProject
}

func keptInDaw(stored Stored) bool {
	return stored.Storage == StorageDAW || stored.Storage == StorageBoth
}

// regionName is the name the DAW's region carries: the prefix, the character, the label and the first characters of the sample id, so
// two samples with one label never share a region name and a region is found again by name alone.
func (s *Service) regionName(id, characterID, label string) string {
	character := characterID
	if s.config.CharacterName != nil {
		if named := strings.TrimSpace(s.config.CharacterName(characterID)); named != "" {
			character = named
		}
	}
	if label == "" {
		label = "sample"
	}
	return RegionPrefix + oneLine(character, maxRegionPart) + " - " + oneLine(label, maxRegionPart) + " [" + id[:6] + "]"
}

// maxRegionPart caps the character and the label in a region name. The Story Bible does not cap a character's name, and the store
// rejects a region name over maxText bytes, which would set the whole store aside as corrupt on its next read.
const maxRegionPart = 80

// oneLine is text a person reads on a DAW marker: broken UTF-8 and control characters dropped, white space collapsed to single
// spaces, and at most limit characters, so the name the DAW saves is the name the store holds.
func oneLine(text string, limit int) string {
	text = strings.ToValidUTF8(text, "")
	text = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && !unicode.IsSpace(r) {
			return -1
		}
		return r
	}, text)
	text = strings.Join(strings.Fields(text), " ")
	if runes := []rune(text); len(runes) > limit {
		text = strings.TrimSpace(string(runes[:limit]))
	}
	return text
}

// projectTime is where source time t falls on the project's timeline for an item and take, and sourceTime is the way back.
func projectTime(item tracks.Item, take tracks.Take, t float64) float64 {
	return item.Position + (t-take.SourceStart())/take.Rate()
}

func sourceTime(item tracks.Item, take tracks.Take, t float64) float64 {
	return take.SourceStart() + (t-item.Position)*take.Rate()
}

// cachedProject reads the saved project once per Service, so a list of many samples parses it once.
func (s *Service) cachedProject() (tracks.Project, error) {
	if !s.projectRead {
		s.project, s.projectErr = s.savedProject()
		s.projectRead = true
	}
	return s.project, s.projectErr
}

// dawRegion finds the stored sample's region in the saved project and says what it holds. The region is found by name, and the item
// and take it plays by the GUIDs the sample was marked on.
func (s *Service) dawRegion(stored Stored) (DawView, tracks.Region, tracks.Item, tracks.Take) {
	view := DawView{Name: stored.DawRegion.Name}
	project, err := s.cachedProject()
	if err != nil {
		view.State = DawProjectUnreadable
		return view, tracks.Region{}, tracks.Item{}, tracks.Take{}
	}
	var found *tracks.Region
	for index := range project.Regions {
		if project.Regions[index].Name == stored.DawRegion.Name {
			found = &project.Regions[index]
			break
		}
	}
	if found == nil {
		view.State = DawLabelMissing
		if s.config.Unsaved != nil && s.config.Unsaved() {
			view.State = DawNotSaved
		}
		return view, tracks.Region{}, tracks.Item{}, tracks.Take{}
	}
	// The saved project is a file another program wrote: a region end like "inf" parses, and could not be encoded for the page.
	if !finite(found.Start) || !finite(found.End) {
		view.State = DawProjectUnreadable
		return view, tracks.Region{}, tracks.Item{}, tracks.Take{}
	}
	view.Start, view.End = found.Start, found.End
	_, item, itemOK := project.ItemByGUID(stored.Source.ItemGUID)
	take, takeOK := tracks.Take{}, false
	if itemOK {
		take, takeOK = takeOf(item, stored.Source.TakeGUID)
	}
	switch {
	case !itemOK || !takeOK:
		view.State = DawSourceMissing
	case math.Abs(found.Start-stored.DawRegion.Start) > regionTolerance || math.Abs(found.End-stored.DawRegion.End) > regionTolerance:
		view.State = DawLabelMoved
	default:
		view.State = DawOK
	}
	return view, *found, item, take
}

// playable says whether a DAW view's audio can be played: the region is there and so is what it plays.
func playable(state DawState) bool { return state == DawOK || state == DawLabelMoved }

// errNoDawAudio is the answer for a DAW-kept sample with nothing to play: its region or source is gone, or the region now spans a
// length no sample may.
var errNoDawAudio = errors.New("the DAW holds no audio for this voice sample")

// dawAudio cuts the audio under a DAW-kept sample's region out of its source file into memory. The source is the take the saved
// project names for the sample's item and take, never a path from the page or from samples.json. A region the narrator moved plays
// the audio now under it, if that is 0.5 to 30 seconds and inside the file.
func (s *Service) dawAudio(stored Stored) ([]byte, error) {
	view, region, item, take := s.dawRegion(stored)
	if !playable(view.State) {
		return nil, errNoDawAudio
	}
	start, end := sourceTime(item, take, region.Start), sourceTime(item, take, region.End)
	if !finite(start) || !finite(end) || end-start < MinSeconds-1e-6 || end-start > MaxSeconds+1e-6 {
		return nil, errNoDawAudio
	}
	_, source, file, err := openSource(take)
	if err != nil {
		return nil, errNoDawAudio
	}
	defer func() { _ = file.Close() }()
	rate := float64(source.Format.SampleRate)
	first := int64(math.Round(math.Max(start, 0) * rate))
	last := min(int64(math.Round(end*rate)), source.Frames)
	if last-first < int64(math.Ceil(MinSeconds*rate-1e-6)) {
		return nil, errNoDawAudio
	}
	var out bytes.Buffer
	if err := source.Copy(&out, file, first, last-first); err != nil {
		return nil, fmt.Errorf("could not read the recording: %w", err)
	}
	return out.Bytes(), nil
}

// addRegion asks the DAW for the region a new DAW-kept sample is kept as, over the window's range on the project's timeline.
func (s *Service) addRegion(ctx context.Context, id string, req checked, item tracks.Item, take tracks.Take, first, last float64) (*StoredRegion, error) {
	if s.config.Regions == nil {
		return nil, refuse(ReasonDawUnavailable)
	}
	region := &StoredRegion{
		Name:  s.regionName(id, req.CharacterID, req.label),
		Start: math.Max(projectTime(item, take, first), 0), End: projectTime(item, take, last),
	}
	kept, err := s.config.Regions.AddVoiceSampleRegion(ctx, region.Start, region.End, region.Name)
	switch {
	case err != nil:
		if _, refused := dawport.RefusedFrom(err); refused || errors.Is(err, dawport.ErrNotSupported) {
			return nil, refuse(ReasonDawUnavailable)
		}
		var refusal *bridge.RefusalError
		if errors.Is(err, bridge.ErrRecording) || errors.Is(err, bridge.ErrBadVoiceSampleRegion) || errors.As(err, &refusal) {
			return nil, refuse(ReasonDawRefused)
		}
		return nil, fmt.Errorf("could not add the voice sample's region: %w", err)
	}
	region.Number = kept.Number
	return region, nil
}

// RegionReader is the part of the DAW's VoiceSampleRegionKeeper role that lists the regions. When the Regions the host gives has it,
// a region is read back under its number and name before it is deleted.
type RegionReader interface {
	ReadVoiceSampleRegions(ctx context.Context) (dawport.VoiceSampleRegions, error)
}

// dropRegion asks the DAW to delete the region of a sample the store no longer holds (a removed sample, or a mark that could not
// be written) and answers why the region stays, or "" when it is gone, was already gone, or is no longer ours (the narrator turned it
// into something else, or deleted it and the DAW reused its number for another sample's region: nothing of ours is left to delete).
// It never fails what the caller was doing, and the request's cancellation does not reach it.
func (s *Service) dropRegion(ctx context.Context, region *StoredRegion) string {
	if region == nil || region.Number < 1 {
		return ""
	}
	remover, ok := s.config.Regions.(RegionRemover)
	if !ok {
		return whyRegionStays(dawport.ErrNotSupported)
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), regionDeleteTimeout)
	defer cancel()
	// The store's number is the host's record, and the bridge only checks the prefix: read back what holds the number now, so a number
	// that moved to another sample's region (or came from a hand-edited store) never deletes a region that is not this sample's.
	if reader, ok := s.config.Regions.(RegionReader); ok {
		listed, err := reader.ReadVoiceSampleRegions(ctx)
		if err != nil {
			return whyRegionStays(err)
		}
		mine := false
		for _, found := range listed.Regions {
			if found.Number == region.Number && found.Name == region.Name {
				mine = true
			}
		}
		if !mine {
			return ""
		}
	}
	if _, err := remover.DeleteVoiceSampleRegion(ctx, region.Number); err != nil {
		return whyRegionStays(err)
	}
	return ""
}

// whyRegionStays words, for the end of "... stays in the DAW's project, ...", what kept the DAW from deleting a region.
func whyRegionStays(err error) string {
	var refusal *bridge.RefusalError
	switch {
	case errors.Is(err, bridge.ErrStale):
		return ""
	case errors.Is(err, bridge.ErrRecording):
		return "because the DAW is recording"
	case errors.Is(err, dawport.ErrNotSupported):
		return "because the DAW is not connected"
	case errors.As(err, &refusal), errors.Is(err, bridge.ErrBadVoiceSampleRegion):
		return "because the DAW would not delete it"
	}
	if _, refused := dawport.RefusedFrom(err); refused {
		return "because the DAW is not connected"
	}
	return "because the DAW did not answer"
}

// tellRegionsStay tells the narrator that count regions of samples the store no longer holds stay in the DAW's project, and why. The
// samples themselves are gone whatever the DAW said; only the regions are left, for the narrator to delete there. markFailed words it
// for the region a mark added before it could not be kept.
func (s *Service) tellRegionsStay(count int, why string, markFailed bool) {
	if count == 0 {
		return
	}
	sentence := "The voice sample was removed, but its region stays in the DAW's project, " + why + ". Delete it there if you no longer want it."
	if count > 1 {
		sentence = fmt.Sprintf("The voice samples were removed, but %d of their regions stay in the DAW's project, %s. Delete them there if you no longer want them.", count, why)
	}
	if markFailed {
		sentence = "The voice sample could not be kept, but the region it added stays in the DAW's project, " + why + ". Delete it there."
	}
	s.config.Reporter.Tell("voice_sample_region_stays", fmt.Sprintf("%d voice sample region(s) left in the DAW project %s", count, why), sentence)
}

// takeRegionBack deletes the region a mark added when the mark could not be kept (the store would not take the row, or the same range
// was kept in the meantime), so the project is left as it was. A region the DAW will not delete stays, and the narrator is told; the
// error the mark answers is the mark's own either way.
func (s *Service) takeRegionBack(ctx context.Context, region *StoredRegion) {
	if why := s.dropRegion(ctx, region); why != "" {
		s.tellRegionsStay(1, why, true)
	}
}
