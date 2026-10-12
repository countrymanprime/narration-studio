package audacity

import (
	"context"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// The steps of a stack, in the Studio Next mock's words (STACK_PLAN.steps), and of an un-stack.
const (
	stepAddTakeTrack     = "Add a take track"
	stepPasteReads       = "Paste each later read into it"
	stepSplitWhereLineUp = "Split at the point where the reads line up"
	stepShiftFollowing   = "Shift the audio that follows to close the gap"
	stepMuteReads        = "Mute the reads that are not on top"
	stepPutReadsBack     = "Paste the reads back where they were recorded, moving the audio that follows"
	stepRemoveTakeTracks = "Remove the take tracks"
)

// The sentences a stack or an un-stack refuses with.
const (
	messageStackBad        = "That stack request has no passage, takes or times Audacity can use, so nothing was changed."
	messageNothingToStack  = "There is nothing to stack or move back."
	messageOnePassage      = "Audacity stacks one passage at a time. Stack the passages one by one."
	messageTooManyReads    = "Audacity stacks at most three later reads of a passage at a time."
	messageOneSpot         = "A take can only go to the first read's spot."
	messageReadLonger      = "That read is longer than the first read, so it cannot be one of its takes."
	messageStackChanged    = "The chapter changed since the plan was made. Nothing was stacked."
	messageAlreadyStacked  = "That read is already stacked in Audacity, so nothing was stacked."
	messageUnstackChanged  = "The chapter changed since the plan was made. Nothing was moved back."
	messageTakeGone        = "A stacked take's track is no longer in the Audacity project, so nothing was moved back."
	messageTakeMoved       = "A stacked take was moved in Audacity since it was stacked, so nothing was moved back."
	messageUnstackTogether = "Every take stacked on that first read goes back together, so nothing was moved back."
	messageStackBackupGone = "The backup made before the stack is no longer in the Audacity project, so nothing was moved back."
)

// maxStackMoves is the most later reads one stack moves: three new tracks, pastes and mutes and the split and shift are 11 undo
// points, under dawport.MaxUndoSteps.
const maxStackMoves = 3

// takeTrackName is the muted track a stacked read is pasted to. It records what an un-stack needs, as REAPER's take P_EXT does:
// the take, where the read was recorded, and the backup the stack made, which holds the audio the stack took out of the chapter.
func takeTrackName(takeID string, from float64, backup string) string {
	return "Narration Utils take " + takeID + " from " + strconv.FormatFloat(from, 'f', 3, 64) + " s, backup " + backup
}

var takeTrack = regexp.MustCompile(`^Narration Utils take (.+) from ([0-9]+\.[0-9]{3}) s, backup (\{[0-9A-F-]{36}\})$`)

// takeOnTrack is a take track as its name records it.
type takeOnTrack struct {
	track  audacitybridge.TrackInfo
	from   float64
	backup string
}

// takeTracks is every take track in tracks, by take id.
func takeTracks(tracks []audacitybridge.TrackInfo) map[string][]takeOnTrack {
	found := map[string][]takeOnTrack{}
	for _, t := range tracks {
		m := takeTrack.FindStringSubmatch(t.Name)
		if t.Kind != "wave" || m == nil || !backupID.MatchString(m[3]) {
			continue
		}
		from, err := strconv.ParseFloat(m[2], 64)
		if err != nil {
			continue
		}
		found[m[1]] = append(found[m[1]], takeOnTrack{track: t, from: from, backup: m[3]})
	}
	return found
}

func near(a, b float64) bool { return math.Abs(a-b) <= stepTolerance }

// stackGroup checks the shape both directions share and returns the one group: one passage, one to maxStackMoves moves with
// distinct take ids a track name can carry, times that are numbers, and a shift of sign (-1 to stack, 1 to move back).
func stackGroup(request dawport.StackRequest, sign float64) (dawport.StackGroup, dawport.Result, bool) {
	switch {
	case len(request.Groups) == 0:
		return dawport.StackGroup{}, dawport.Refused(messageNothingToStack), false
	case len(request.Groups) > 1:
		return dawport.StackGroup{}, dawport.Refused(messageOnePassage), false
	}
	group := request.Groups[0]
	switch {
	case len(group.Moves) == 0:
		return group, dawport.Refused(messageNothingToStack), false
	case len(group.Moves) > maxStackMoves:
		return group, dawport.Refused(messageTooManyReads), false
	}
	if !backupText(group.ItemGUID) || !backupText(request.ChapterID) || !finite(request.Shift) || request.Shift*sign <= 0 {
		return group, dawport.Refused(messageStackBad), false
	}
	seen := map[string]bool{}
	for _, m := range group.Moves {
		name := takeTrackName(m.TakeID, m.From, "{00000000-0000-0000-0000-000000000000}")
		if _, err := audacitybridge.NewCommand("SetTrackStatus").String("Name", name).Encode(); err != nil || !backupText(m.TakeID) ||
			seen[m.TakeID] || !finite(m.From) || !finite(m.To) || !finite(m.Len) || m.From < 0 || m.To < 0 || m.Len <= 0 {
			return group, dawport.Refused(messageStackBad), false
		}
		seen[m.TakeID] = true
	}
	return group, dawport.Result{}, true
}

// StackTakes puts one passage's later reads on its first read's spot, after backing up the passage. For each read it adds a
// muted take track (named by takeTrackName) and pastes the read into it at the first read's spot; then it splits the chapter's
// track where the first read ends and the reads end, and deletes what is between, so the audio that follows moves up by the
// request's Shift. The take tracks are muted, so the first read stays on top. Audacity's tracks report no item ids, so a group's
// ItemGUID is the chapter track's name and a read is checked by its time on it.
//
// Only one passage is stacked per call: Shift is summed over the groups, and Audacity, which has no item to read a first read's
// length from, cannot split it into each passage's own shift.
func (s *steps) StackTakes(ctx context.Context, request dawport.StackRequest) (dawport.Result, error) {
	if !s.canBackUp() {
		return dawport.Refused(backupsSentence(dawport.CapStackTakes)), nil
	}
	group, refusal, ok := stackGroup(request, -1)
	if !ok {
		return refusal, nil
	}
	spot := group.Moves[0].To
	end, first, longest := 0.0, math.Inf(1), 0.0
	for _, m := range group.Moves {
		if !near(m.To, spot) {
			return dawport.Refused(messageOneSpot), nil
		}
		if m.From <= spot+stepTolerance {
			return dawport.Refused(messageStackChanged), nil
		}
		end, first, longest = max(end, m.From+m.Len), min(first, m.From), max(longest, m.Len)
	}
	// The first read ends where the audio that follows will begin, and the reads end at end.
	lineUp := end + request.Shift
	switch {
	case lineUp < spot+stepTolerance || lineUp > first+stepTolerance:
		return dawport.Refused(messageStackChanged), nil
	case spot+longest > lineUp+stepTolerance:
		return dawport.Refused(messageReadLonger), nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	tracks, err := s.client.Tracks(ctx)
	if err != nil {
		return dawport.Result{}, err
	}
	source, refusal, ok := oneTrack(tracks, group.ItemGUID)
	if !ok {
		return refusal, nil
	}
	if !source.HasRange || spot < source.Start-stepTolerance || end > source.End+stepTolerance {
		return dawport.Refused(messageRangeOutside), nil
	}
	stacked := takeTracks(tracks)
	for _, m := range group.Moves {
		if len(stacked[m.TakeID]) > 0 {
			return dawport.Refused(messageAlreadyStacked), nil
		}
	}
	answer, ok, err := s.backUp(ctx, dawport.BackupRequest{
		GUID: group.ItemGUID, ChapterID: request.ChapterID, Start: spot, End: end, Label: "Stack retries as takes",
	})
	if !ok {
		return answer, err
	}
	after, err := s.client.Tracks(ctx)
	if err != nil {
		return dawport.Result{}, err
	}
	backup, ok := newBackupTrack(tracks, after)
	if !ok {
		return dawport.Result{}, ErrBackupLost
	}

	var e edits
	newTrack := "NewMonoTrack"
	if source.Channels == 2 {
		newTrack = "NewStereoTrack"
	}
	var takes []int
	for i, m := range group.Moves {
		// Audacity adds a new track last.
		index := len(after) + i
		if err := s.do(ctx, newTrack); err != nil {
			return dawport.Result{}, err
		}
		if err := s.client.SetTrackName(ctx, index, takeTrackName(m.TakeID, m.From, backup)); err != nil {
			return dawport.Result{}, err
		}
		e.did(stepAddTakeTrack, 1)
		takes = append(takes, index)
		if err := s.selectRange(ctx, source.Index, m.From, m.From+m.Len); err != nil {
			return dawport.Result{}, err
		}
		if err := s.do(ctx, "Copy"); err != nil {
			return dawport.Result{}, err
		}
		if err := s.selectRange(ctx, index, spot, spot); err != nil {
			return dawport.Result{}, err
		}
		if err := s.do(ctx, "Paste"); err != nil {
			return dawport.Result{}, err
		}
		e.did(stepPasteReads, 1)
	}
	if err := s.selectRange(ctx, source.Index, lineUp, end); err != nil {
		return dawport.Result{}, err
	}
	if err := s.do(ctx, "Split"); err != nil {
		return dawport.Result{}, err
	}
	e.did(stepSplitWhereLineUp, 1)
	if err := s.do(ctx, "Delete"); err != nil {
		return dawport.Result{}, err
	}
	e.did(stepShiftFollowing, 1)
	for _, index := range takes {
		if _, err := s.client.Do(ctx, audacitybridge.NewCommand("SetTrackAudio").Int("Track", index).Bool("Mute", true)); err != nil {
			return dawport.Result{}, err
		}
		e.did(stepMuteReads, 1)
	}
	return e.done("Stacked " + plural(len(group.Moves), "take", "takes") + " in Audacity. Done in " +
		strconv.Itoa(len(e.steps)) + " steps."), nil
}

// newBackupTrack is the id of the one backup track in after that was not in before.
func newBackupTrack(before, after []audacitybridge.TrackInfo) (string, bool) {
	had := map[string]bool{}
	for _, t := range before {
		had[t.Name] = true
	}
	var found []string
	for _, t := range after {
		id, ok := strings.CutPrefix(t.Name, BackupTrackName(""))
		if ok && !had[t.Name] && backupID.MatchString(id) {
			found = append(found, id)
		}
	}
	if len(found) != 1 {
		return "", false
	}
	return found[0], true
}

// UnstackTakes moves one passage's stacked reads back to where they were recorded, after backing up the passage. Each move's
// take track must still hold its read at the first read's spot, and record that the read came from the move's To; every take
// stacked with them must go back too. It copies the audio the stack took out of the chapter back from the stack's own backup
// track and pastes it in where the first read ends, so the reads, the pauses between them and the audio that follows go back to
// their recorded times, then removes the take tracks.
func (s *steps) UnstackTakes(ctx context.Context, request dawport.StackRequest) (dawport.Result, error) {
	if !s.canBackUp() {
		return dawport.Refused(backupsSentence(dawport.CapStackTakes)), nil
	}
	group, refusal, ok := stackGroup(request, 1)
	if !ok {
		return refusal, nil
	}
	spot := group.Moves[0].From
	end, first, longest := 0.0, math.Inf(1), 0.0
	for _, m := range group.Moves {
		if !near(m.From, spot) || m.To <= spot+stepTolerance {
			return dawport.Refused(messageUnstackChanged), nil
		}
		end, first, longest = max(end, m.To+m.Len), min(first, m.To), max(longest, m.Len)
	}
	lineUp := end - request.Shift
	if lineUp < spot+longest-stepTolerance || lineUp > first+stepTolerance {
		return dawport.Refused(messageUnstackChanged), nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	tracks, err := s.client.Tracks(ctx)
	if err != nil {
		return dawport.Result{}, err
	}
	source, refusal, ok := oneTrack(tracks, group.ItemGUID)
	if !ok {
		return refusal, nil
	}
	if !source.HasRange || lineUp > source.End+stepTolerance {
		return dawport.Refused(messageRangeOutside), nil
	}
	stacked := takeTracks(tracks)
	backup := ""
	moving := map[string]bool{}
	for _, m := range group.Moves {
		found := stacked[m.TakeID]
		switch {
		case len(found) == 0:
			return dawport.RefusedStale(messageTakeGone), nil
		case len(found) > 1:
			return dawport.Refused(messageStepTwoTracks), nil
		}
		take := found[0]
		if !take.track.HasRange || !near(take.track.Start, spot) || !near(take.track.End, spot+m.Len) {
			return dawport.RefusedStale(messageTakeMoved), nil
		}
		if !near(take.from, m.To) || (backup != "" && take.backup != backup) {
			return dawport.Refused(messageUnstackChanged), nil
		}
		backup = take.backup
		moving[m.TakeID] = true
	}
	for id, found := range stacked {
		for _, take := range found {
			if take.backup == backup && !moving[id] {
				return dawport.Refused(messageUnstackTogether), nil
			}
		}
	}
	held := tracksNamed(tracks, BackupTrackName(backup))
	switch {
	case len(held) == 0:
		return dawport.RefusedStale(messageStackBackupGone), nil
	case len(held) > 1:
		return dawport.Refused(messageBackupTwoBackups), nil
	case !held[0].HasRange || held[0].Start > lineUp+stepTolerance || held[0].End < end-stepTolerance:
		return dawport.RefusedStale(messageStackBackupGone), nil
	}
	answer, ok, err := s.backUp(ctx, dawport.BackupRequest{
		GUID: group.ItemGUID, ChapterID: request.ChapterID, Start: lineUp, End: lineUp, Label: "Un-stack the takes",
	})
	if !ok {
		return answer, err
	}

	// The new backup's track went last, so the indexes read before it still hold.
	var e edits
	if err := s.selectRange(ctx, held[0].Index, lineUp, end); err != nil {
		return dawport.Result{}, err
	}
	if err := s.do(ctx, "Copy"); err != nil {
		return dawport.Result{}, err
	}
	if err := s.selectRange(ctx, source.Index, lineUp, lineUp); err != nil {
		return dawport.Result{}, err
	}
	if err := s.do(ctx, "Paste"); err != nil {
		return dawport.Result{}, err
	}
	e.did(stepPutReadsBack, 1)
	for _, m := range group.Moves {
		// Indexes shift as tracks go, so each removal reads the tracks again and removes only the one exact name.
		now, err := s.client.Tracks(ctx)
		if err != nil {
			return dawport.Result{}, err
		}
		found := tracksNamed(now, stacked[m.TakeID][0].track.Name)
		if len(found) != 1 {
			continue
		}
		if err := s.client.SelectTracks(ctx, found[0].Index, 1); err != nil {
			return dawport.Result{}, err
		}
		if err := s.do(ctx, "RemoveTracks"); err != nil {
			return dawport.Result{}, err
		}
		e.did(stepRemoveTakeTracks, 1)
	}
	return e.done("Moved back " + plural(len(group.Moves), "take", "takes") + " in Audacity. Done in " +
		strconv.Itoa(len(e.steps)) + " steps."), nil
}
