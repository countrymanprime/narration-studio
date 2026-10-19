package audacity

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// The roles that read and move the narrator's place in the project, over the ids TrackIDs gives a track (Audacity has none of its own):
// select a chapter's track, read which track is selected and where the cursor is, go to a track's end or a time, and read a track's
// state for the Booth. Audacity has no record-arm, so "armed" is "selected": the track a recording would go to.

var (
	_            dawport.TrackSelector    = (*Session)(nil)
	_            dawport.PlaceFollower    = (*Session)(nil)
	_            dawport.TrackStateReader = (*Session)(nil)
	_            dawport.RegionWriter     = (*Session)(nil)
	errTrackGone                          = "this chapter's track is no longer in the Audacity project"
)

// maxTrackItems is how many clips a track's state lists, as the REAPER bridge limits its items.
const maxTrackItems = 1000

// audioTracks are the project's audio tracks with the id each has now, in track order.
type audioTrack struct {
	audacitybridge.TrackInfo
	id string
}

func (s *Session) audioTracks(ctx context.Context) ([]audioTrack, error) {
	infos, err := s.client.Tracks(ctx)
	if err != nil {
		return nil, err
	}
	var wave []audacitybridge.TrackInfo
	for _, t := range infos {
		if t.Kind == "wave" {
			wave = append(wave, t)
		}
	}
	names := make([]string, len(wave))
	for i, t := range wave {
		names[i] = t.Name
	}
	ids := TrackIDs(names)
	out := make([]audioTrack, len(wave))
	for i, t := range wave {
		out[i] = audioTrack{TrackInfo: t, id: ids[i]}
	}
	return out, nil
}

// trackByID finds the audio track whose id is trackID now. A track that is gone, renamed or whose name now repeats differently is a
// *bridge.TrackStaleError: nothing is read or changed on another track.
func (s *Session) trackByID(ctx context.Context, trackID string) (audioTrack, []audioTrack, error) {
	all, err := s.audioTracks(ctx)
	if err != nil {
		return audioTrack{}, nil, err
	}
	for _, t := range all {
		if t.id == trackID {
			return t, all, nil
		}
	}
	return audioTrack{}, all, &bridge.TrackStaleError{GUID: trackID}
}

// SelectTrack selects trackGUID alone ("Select in Audacity"). It changes nothing else: no undo step, no scroll.
func (s *Session) SelectTrack(ctx context.Context, trackGUID string) (dawport.SelectedTrack, error) {
	track, _, err := s.trackByID(ctx, trackGUID)
	if err != nil {
		return dawport.SelectedTrack{}, err
	}
	if err := s.client.SelectTracks(ctx, track.Index, 1); err != nil {
		return dawport.SelectedTrack{}, err
	}
	return dawport.SelectedTrack{TrackGUID: track.id}, nil
}

// ReadPlace says which audio track is selected (its id, or "" when none or several are) and where the cursor is. Audacity's cursor
// and selection are one thing: a range the narrator selected reads as a cursor at its start.
func (s *Session) ReadPlace(ctx context.Context) (dawport.Place, error) {
	all, err := s.audioTracks(ctx)
	if err != nil {
		return dawport.Place{}, err
	}
	place := dawport.Place{}
	for _, t := range all {
		if t.Selected {
			place.Selected++
			place.TrackID = t.id
		}
	}
	if place.Selected != 1 {
		place.TrackID = ""
	}
	if place.Cursor, _, err = s.client.Selection(ctx); err != nil {
		return dawport.Place{}, err
	}
	return place, nil
}

// GoTo selects trackID alone and puts the cursor at the end of what is on it, or at a time in project seconds. It starts nothing.
func (s *Session) GoTo(ctx context.Context, trackID string, target dawport.PlaceTarget) error {
	if trackID == "" {
		return errors.New("choose a track to go to")
	}
	track, _, err := s.trackByID(ctx, trackID)
	if err != nil {
		return err
	}
	at := target.Seconds
	if target.End {
		at = track.End
	}
	if at < 0 || math.IsNaN(at) || math.IsInf(at, 0) {
		return fmt.Errorf("%w: a place of %v seconds", audacitybridge.ErrInvalidValue, at)
	}
	if err := s.client.SelectTracks(ctx, track.Index, 1); err != nil {
		return err
	}
	return s.client.SelectTime(ctx, at, at)
}

// ChapterTrackState reads the track trackGUID names (or only the selection and the cursor, when it is empty). What Audacity cannot
// report stays at its zero: no play position, no project path, no change count. Playing and Recording are what this app started and
// has not stopped, as the Session tracks them; a transport started or stopped in Audacity is invisible to it. A track that is gone is
// a *bridge.TrackStaleError.
func (s *Session) ChapterTrackState(ctx context.Context, trackGUID string) (dawport.TrackState, error) {
	state := dawport.TrackState{TrackGUID: trackGUID}
	var named audioTrack
	var all []audioTrack
	var err error
	if trackGUID != "" {
		if named, all, err = s.trackByID(ctx, trackGUID); err != nil {
			return dawport.TrackState{}, err
		}
	} else if all, err = s.audioTracks(ctx); err != nil {
		return dawport.TrackState{}, err
	}
	for _, t := range all {
		if t.Selected {
			state.ArmedCount++
		}
	}
	if state.EditCursor, _, err = s.client.Selection(ctx); err != nil {
		return dawport.TrackState{}, err
	}
	state.Playing, state.Recording = s.transport.snapshot()
	state.PlayState = playStateBits(state.Playing, state.Recording)
	if trackGUID == "" {
		return state, nil
	}
	state.TrackArmed = named.Selected
	clips, err := s.client.Clips(ctx)
	if err != nil {
		return dawport.TrackState{}, err
	}
	for _, c := range clips {
		if c.Track != named.Index {
			continue
		}
		state.ItemsTotal++
		if len(state.Items) < maxTrackItems {
			id := ClipID(named.id, c.Start)
			state.Items = append(state.Items, dawport.TrackItem{ItemGUID: id, TakeGUID: id, Position: c.Start, Length: c.End - c.Start, PlayRate: 1})
		}
	}
	return state, nil
}

// playStateBits is REAPER's GetPlayState bit field: 1 playing, 4 recording (a recording is also playing).
func playStateBits(playing, recording bool) int {
	bits := 0
	if playing || recording {
		bits |= 1
	}
	if recording {
		bits |= 4
	}
	return bits
}

var regionColour = regexp.MustCompile(`^[0-9A-Fa-f]{6}$`)

// regionTolerance is how close a region's bounds must be to count as the same, as REAPER's regions role compares them.
const regionTolerance = 0.01

// CreateRegions makes a range label `[nu:region] <title>` for each row that has none (the same title and bounds within 0.01 s), and
// with update moves the one label a title has to new bounds. A title held by several labels is left alone and counted as ambiguous.
// Audacity has no regions, and a label is not a render target there, so these are the chapters' places in the project for the
// readiness signals and the narrator's eye; colour has nothing to colour. A row with no title or a backwards range is invalid.
func (s *Session) CreateRegions(ctx context.Context, rows []dawport.Region, colour string, update bool) (dawport.RegionsCreated, error) {
	var out dawport.RegionsCreated
	if colour != "" && !regionColour.MatchString(colour) {
		return out, bridge.ErrBadRegions
	}
	labels, err := s.client.Labels(ctx)
	if err != nil {
		return out, err
	}
	regions := func() map[string][]audacitybridge.LabelInfo {
		byTitle := map[string][]audacitybridge.LabelInfo{}
		for _, l := range labels {
			if title, ok := strings.CutPrefix(l.Text, regionPrefix); ok && l.End > l.Start {
				byTitle[title] = append(byTitle[title], l)
			}
		}
		return byTitle
	}
	for _, row := range rows {
		title := oneLine(audacitybridge.SanitizeText(row.Title, 0))
		if title == "" || row.Start < 0 || !(row.End > row.Start) || math.IsInf(row.End, 0) {
			out.Invalid++
			continue
		}
		text := audacitybridge.SanitizeText(regionPrefix+title, maxLabelBytes)
		held := regions()[strings.TrimPrefix(text, regionPrefix)]
		exists := false
		for _, l := range held {
			if math.Abs(l.Start-row.Start) <= regionTolerance && math.Abs(l.End-row.End) <= regionTolerance {
				exists = true
			}
		}
		switch {
		case exists:
			out.Existing++
		case update && len(held) == 1:
			start, end := row.Start, row.End
			if err := s.client.SetLabel(ctx, held[0].Index, audacitybridge.LabelEdit{Start: &start, End: &end}); err != nil {
				return out, err
			}
			out.Updated++
		case update && len(held) > 1:
			out.Ambiguous++
		default:
			if err := s.addLabel(ctx, labels, row.Start, row.End, text); err != nil {
				return out, err
			}
			out.Created++
		}
		if labels, err = s.client.Labels(ctx); err != nil {
			return out, err
		}
	}
	return out, nil
}
