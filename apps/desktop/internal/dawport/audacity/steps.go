package audacity

import (
	"context"
	"fmt"
	"math"
	"slices"
	"sync"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// steps is the role of each capability Audacity has only with backups on (takes, punch, stack_takes, cut_range, fx_range; PRD
// DQ-18). Audacity keeps no takes and its edits change the audio itself, so each edit is a listed series of scripting commands
// made after BackupAround has cloned the audio around it (ADR 0863): a roll (steps_roll.go), a cut and an effect on a range
// (steps_range.go), and a stack and an un-stack (steps_stack.go). Each answers a Result whose Steps are the edits in the order
// they were sent and whose UndoSteps counts the ones that add an Audacity undo point (selecting and copying add none); how many
// Audacity really adds is checked on the owner's pass (docs/operations/audacity-verification-pass.md).
//
// Every check is made before the backup, and the backup before the first edit: a request out of shape is Refused, a track named
// that Audacity no longer lists is RefusedStale, and a backup that is refused or fails stops the call with its answer. The role
// treats backups as unavailable when the adapter has no project folder for them; then a cut, an effect, a stack and an un-stack
// refuse with the capability's sentence and send nothing, and a roll records over the audio, as the destructive capability the
// page confirmed says. Whether the narrator turned backups on is the resolver's to enforce. Audacity's track id is its name (ADR
// 0863 point 3), so an item, track or take GUID in a request is the name of an Audacity track. Setting the active take,
// hiding takes, punching in and reading the play position are not built for Audacity and answer ADR 0144's sentence.
type steps struct {
	client  *audacitybridge.Client
	backups *Backups
	// mu keeps one edit's commands, from its checks to its last edit, from interleaving with another's on the shared pipe.
	mu sync.Mutex
}

var (
	_ dawport.Puncher        = (*steps)(nil)
	_ dawport.TakeSelector   = (*steps)(nil)
	_ dawport.TakeStacker    = (*steps)(nil)
	_ dawport.RangeCutter    = (*steps)(nil)
	_ dawport.RangeFXApplier = (*steps)(nil)
)

// stepTolerance is how far apart two times may be and still be the same, in seconds: GetInfo reports six significant digits.
const stepTolerance = 0.05

// The sentences the steps answer with that every edit shares.
const (
	messageStepTrackGone = "That track is no longer in the Audacity project, so nothing was changed."
	messageStepTwoTracks = "More than one Audacity track has that name, so the app will not guess which to change. Rename one, then try again."
)

// backupsSentence is the sentence for a capability that needs backups while they are off, as the resolver words it.
func backupsSentence(c dawport.Capability) string {
	return needBackups[c] + " needs Audacity backups. Turn on Audio backups in Settings."
}

// canBackUp is whether this adapter can make a backup at all: it has the app's project folder to keep the table in.
func (s *steps) canBackUp() bool { return s.backups.table() != "" }

// oneTrack is the one wave track called name: RefusedStale when there is none, and Refused when there are two.
func oneTrack(tracks []audacitybridge.TrackInfo, name string) (audacitybridge.TrackInfo, dawport.Result, bool) {
	found := tracksNamed(tracks, name)
	switch len(found) {
	case 0:
		return audacitybridge.TrackInfo{}, dawport.RefusedStale(messageStepTrackGone), false
	case 1:
		return found[0], dawport.Result{}, true
	default:
		return audacitybridge.TrackInfo{}, dawport.Refused(messageStepTwoTracks), false
	}
}

// backUp clones the request's window. ok is false when the backup was refused (its Result is the answer) or failed (err).
func (s *steps) backUp(ctx context.Context, request dawport.BackupRequest) (dawport.Result, bool, error) {
	result, err := s.backups.BackupAround(ctx, request)
	if err != nil {
		return dawport.Result{}, false, err
	}
	return result, result.OK, nil
}

func (s *steps) do(ctx context.Context, name string) error {
	_, err := s.client.Do(ctx, audacitybridge.NewCommand(name))
	return err
}

// selectRange selects [start, end] of one track.
func (s *steps) selectRange(ctx context.Context, track int, start, end float64) error {
	if err := s.client.SelectTracks(ctx, track, 1); err != nil {
		return err
	}
	return s.client.SelectTime(ctx, start, end)
}

// edits is what a call has done so far: the step text for each kind of edit, in the order first made, and the undo points.
type edits struct {
	steps []string
	undo  int
}

// did records one edit: its step text, once however often it is repeated, and the undo points it added.
func (e *edits) did(step string, undo int) {
	if !slices.Contains(e.steps, step) {
		e.steps = append(e.steps, step)
	}
	e.undo += undo
}

// done is a call that changed the audio, with its steps and undo points.
func (e *edits) done(message string) dawport.Result {
	return dawport.OK(message, true).WithUndoSteps(e.undo).WithSteps(e.steps)
}

// clock words project seconds as m:ss for a message or a backup's label.
func clock(seconds float64) string {
	whole := int(math.Round(seconds))
	return fmt.Sprintf("%d:%02d", whole/60, whole%60)
}

// plural is "1 take" or "2 takes".
func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}

// What is not built for Audacity: ADR 0144's sentence, and nothing sent.

func (*steps) PunchTo(context.Context, float64, float64) (float64, error) { return 0, ErrNotAvailable }
func (*steps) PlayPosition(context.Context) (dawport.PlayPosition, error) {
	return dawport.PlayPosition{}, ErrNotAvailable
}
func (*steps) SetActiveTake(context.Context, string, string) (dawport.ActiveTakeSet, error) {
	return dawport.ActiveTakeSet{}, ErrNotAvailable
}
func (*steps) HideTakes(context.Context, string, string) (dawport.Result, error) {
	return dawport.Refused(string(ErrNotAvailable)), nil
}
