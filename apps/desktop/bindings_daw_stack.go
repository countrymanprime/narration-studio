package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/passagetakes"
	"github.com/countrymanprime/narration-utils/shell/internal/runlog"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// stackTakesTimeout bounds one stack_takes or unstack_takes request with the chapter_track_state read before it: each is a
// single undo block in REAPER, like delete_range.
const stackTakesTimeout = deleteRangeTimeout

const (
	stackTooManySentence     = "Stack at most %d passages at a time."
	stackTrackStaleSentence  = "This chapter's track is no longer in the %s project, so nothing was changed. Link the chapter to its track again."
	stackTrackCutOffSentence = "This chapter's track holds more items than %s lists to the app, so nothing was changed."
)

// DawStackTakes puts the later reads of the passages passageIDs of chapterID on the first read's spot as takes of its item,
// and moves the audio after them up (SND-7b, ADR 0860 point 4; the Studio Next mock's stackTakes). The page sends a chapter
// id and passage ids, never a GUID, a time or a path: the host rebuilds the plan itself (passagetakes.StackPlan) from the
// Booth's passage map, which names the items each passage was read into, and the chapter's one linked track as the DAW
// reports it now (chapter_track_state), so a GUID-shaped id is looked up like any other and the plan the page showed is
// never an input (threat model row 5f). The answer is a DawResult (ADR 0810): the stack_takes capability's own sentence
// when the resolver refuses it (a standalone launch, a DAW not answering, Experimental actions off, the toggle off, an
// engine that cannot stack), checked first; then too many passages; then a passage id the chapter does not list or a track
// that is gone (code stale); then a kept take, reads two passages share and nothing to move. Nothing is sent to the DAW on
// any of them. An item that changed between the read and REAPER's own check is REAPER's stale refusal, and nothing changes.
func (h *Host) DawStackTakes(chapterID string, passageIDs []string) (string, error) {
	return h.dawRestack("stack_takes", chapterID, passageIDs, false)
}

// DawUnstackTakes moves the stacked takes of the passages passageIDs of chapterID back to where their reads were recorded
// and the audio after them out again (the mock's unstackTakes). The plan is rebuilt as DawStackTakes rebuilds it
// (passagetakes.UnstackPlan), with the offset each stacked take recorded read from the saved project, so a stack the
// narrator has not saved since answers that there is nothing to move back and says to save. The same refusals as
// DawStackTakes.
func (h *Host) DawUnstackTakes(chapterID string, passageIDs []string) (string, error) {
	return h.dawRestack("unstack_takes", chapterID, passageIDs, true)
}

func (h *Host) dawRestack(command, chapterID string, passageIDs []string, unstack bool) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), stackTakesTimeout)
	defer cancel()
	run := h.runLog.Begin(command, "chapter_id", chapterID)
	sources := h.stackSourcesIn(svc, resolver.Support(dawport.CapTrackState))
	result, err := dawRestackIn(ctx, svc, resolver.Support(dawport.CapStackTakes), svc.takeStacker, sources, chapterID, passageIDs, unstack)
	endStackRun(run, result, err)
	return encodeBinding(result, err)
}

func endStackRun(run *runlog.Run, result dawport.Result, err error) {
	switch {
	case err != nil:
		run.End("error")
	case result.Refused != "":
		run.End("refused")
	default:
		run.End("ok")
	}
}

// stackSources are what a stack's plan is built from, each read on the host: the chapter's passages, its track as the DAW
// reports it now (or the refusal for a chapter whose track cannot be read), and the saved project.
type stackSources struct {
	passages func(chapterID string) ([]passagetakes.StackPassage, error)
	live     func(ctx context.Context, chapterID string) ([]dawport.TrackItem, *dawport.Result, error)
	saved    func() (tracks.Project, error)
}

// stackSourcesIn reads svc's passage map against the current manuscript, the chapter's one linked track through the
// track_state role (trackState is that capability's support), and the selected .rpp.
func (h *Host) stackSourcesIn(svc hostServices, trackState dawport.Support) stackSources {
	return stackSources{
		passages: func(chapterID string) ([]passagetakes.StackPassage, error) {
			book, err := passageMapBook(svc.manuscript)()
			if err != nil {
				return nil, err
			}
			marks, err := h.passageMapIn(svc, nil).List(chapterID)
			if err != nil {
				return nil, err
			}
			return passagetakes.StackPassages(chapterID, book.Lines, marks), nil
		},
		live: func(ctx context.Context, chapterID string) ([]dawport.TrackItem, *dawport.Result, error) {
			guid, refused, err := readAloudTrackGUID(svc, chapterID)
			if err != nil || refused != nil {
				if refused != nil {
					result := dawport.Refused(refused.Message)
					return nil, &result, nil
				}
				return nil, nil, err
			}
			reader := trackStateReaderFrom(svc)
			if reader == nil {
				if !trackState.Available {
					result := dawport.Refused(trackState.Message)
					return nil, &result, nil
				}
				return nil, nil, bridge.ErrUnavailable
			}
			state, err := reader.ChapterTrackState(ctx, guid)
			if err != nil {
				return nil, nil, err
			}
			if state.ItemsTotal > len(state.Items) {
				result := dawport.Refused(fmt.Sprintf(stackTrackCutOffSentence, readAloudAdapterName(svc)))
				return nil, &result, nil
			}
			return state.Items, nil, nil
		},
		saved: func() (tracks.Project, error) { return selectedProject(svc) },
	}
}

// dawRestackIn is DawStackTakes (unstack false) or DawUnstackTakes with the launch's stack_takes support, role and sources
// given. stacker is nil with no live adapter.
func dawRestackIn(ctx context.Context, svc hostServices, support dawport.Support, stacker dawport.TakeStacker, sources stackSources,
	chapterID string, passageIDs []string, unstack bool) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if len(passageIDs) > bridge.MaxStackGroups {
		return dawport.Refused(fmt.Sprintf(stackTooManySentence, bridge.MaxStackGroups)), nil
	}
	name := readAloudAdapterName(svc)
	if stacker == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	passages, err := sources.passages(chapterID)
	if err != nil {
		return dawport.Result{}, err
	}
	in := passagetakes.StackInput{ChapterID: chapterID, PassageIDs: passageIDs, Passages: passages, DAW: name}
	if refused := passagetakes.CheckNamed(in); refused != nil {
		return *refused, nil
	}
	live, refused, err := sources.live(ctx, chapterID)
	if err != nil {
		return stackRefusal(name, err), nil
	}
	if refused != nil {
		return *refused, nil
	}
	in.Live = live
	plan, act := passagetakes.StackPlan, stacker.StackTakes
	if unstack {
		if in.Saved, err = sources.saved(); err != nil {
			return dawport.Result{}, err
		}
		plan, act = passagetakes.UnstackPlan, stacker.UnstackTakes
	}
	request, refusedPlan := plan(in)
	if refusedPlan != nil {
		return *refusedPlan, nil
	}
	result, err := act(ctx, request)
	if err != nil {
		return stackRefusal(name, err), nil
	}
	return result, nil
}

// stackRefusal words an error the track read or the role returned rather than answered: the role answers its own refusals
// as a Result, so these are a capability refusal, a track that is gone, the bridge not answering, or no answer in time.
func stackRefusal(name string, err error) dawport.Result {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused
	}
	var trackStale *bridge.TrackStaleError
	switch {
	case errors.As(err, &trackStale):
		return dawport.RefusedStale(fmt.Sprintf(stackTrackStaleSentence, name))
	case errors.Is(err, bridge.ErrNoAnswer):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperNotRunning).Message)
	case errors.Is(err, bridge.ErrUnavailable):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message)
	case errors.Is(err, bridge.ErrExperimentalOff):
		return dawport.Refused(err.Error())
	case errors.Is(err, context.DeadlineExceeded):
		return dawport.Refused(fmt.Sprintf("%s did not answer the stack within %d seconds. Check the project before trying again.", name, int(stackTakesTimeout.Seconds())))
	}
	return dawport.Refused(fmt.Sprintf("%s could not move the takes: %s.", name, err.Error()))
}
