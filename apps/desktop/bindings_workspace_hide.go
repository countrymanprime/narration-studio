package main

import (
	"context"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/passagetakes"
)

// hideTakesTimeout bounds one hide_takes request: a single undo block in REAPER, like set_active_take.
const hideTakesTimeout = takeReviewCreateTakeTimeout

// WorkspaceHideTakes mutes the other takes of the passage between firstToken and lastToken of chapterID's stored alignment,
// keeping keepCandidateID, one of the ids WorkspaceTakes offers (SND-5b; the Studio Next mock's hideTakes). Nothing is
// deleted, and REAPER adds one undo step when anything changed. As for WorkspaceUseTake, the page sends ids and token
// indices only: the item and kept take GUIDs are read here from the saved project, and an id the host does not offer is
// refused as stale (threat model row 5f). The answer is a DawResult (ADR 0810): the takes capability's own sentence when
// the resolver refuses it (a standalone launch, a DAW not answering, Experimental actions off, the toggle off), checked
// before the passage is read, and nothing is sent to REAPER on any refusal. A token range outside the alignment is an
// error, as for WorkspaceTakes.
func (h *Host) WorkspaceHideTakes(chapterID string, firstToken int, lastToken int, keepCandidateID string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	if support := resolver.Support(dawport.CapTakes); !support.Available {
		return encodeBinding(dawport.Refused(support.Message), nil)
	}
	resolved, _, err := h.workspaceTakesResolved(svc, chapterID, firstToken, lastToken)
	if err != nil {
		return "", err
	}
	run := h.runLog.Begin("hide_takes", "chapter_id", chapterID)
	ctx, cancel := context.WithTimeout(context.Background(), hideTakesTimeout)
	defer cancel()
	var hide passagetakes.Hider
	if svc.takeSelector != nil {
		hide = svc.takeSelector.HideTakes
	}
	result := passagetakes.Hide(ctx, hide, resolved, keepCandidateID)
	if result.Refused != "" {
		run.End("refused")
	} else {
		run.End("ok")
	}
	return encodeBinding(result, nil)
}
