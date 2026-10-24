package main

import (
	"context"
	"math"
	"path/filepath"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/passagetakes"
)

const (
	takePreviewNotOfferedSentence = "That take isn't one of this passage's takes any more, so nothing played. Open the takes again to hear the ones there now."
	takePreviewEmptySentence      = "That take has no audio to play."
)

// WorkspacePreviewTake plays one take WorkspaceTakes offers for the passage (the tokens firstToken to lastToken of chapterID)
// through the DAW's preview (file_preview), so with a DAW linked the take is heard through the DAW's output and never the app's
// (#2251 item 32). As for WorkspaceUseTake, the page names an offered candidate, never a file or a time: the take's own file and
// range are read here from the saved project, and the path is checked again (bridge.CheckMediaFile) and by the DAW's script. A take
// longer than bridge.MaxPreviewSeconds plays its first minute. The answer is a DawResult with no undo step; DawStopFilePreview stops it.
func (h *Host) WorkspacePreviewTake(chapterID string, firstToken int, lastToken int, candidateID string) (string, error) {
	svc := h.services()
	resolved, _, err := h.workspaceTakesResolved(svc, chapterID, firstToken, lastToken)
	if err != nil {
		return "", err
	}
	choice, offered := resolved.Choice(candidateID)
	if !offered {
		return encodeBinding(dawport.RefusedStale(takePreviewNotOfferedSentence), nil)
	}
	path, start, length, why := takePreviewStretch(choice.Candidate)
	if why != "" {
		return encodeBinding(dawport.Refused(why), nil)
	}
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fileActionTimeout)
	defer cancel()
	// The path is the saved project's, not the page's, so it counts as picked; filePathRefusal still checks it is a local audio file.
	return encodeBinding(dawPreviewFileIn(ctx, svc, resolver.Support(dawport.CapFilePreview), svc.filePreviewer, path, true, start, length), nil)
}

// takePreviewStretch is the file, start and length a preview of the take plays, or the sentence why it cannot play.
func takePreviewStretch(take passagetakes.Candidate) (path string, start, length float64, why string) {
	if !take.Usable {
		return "", 0, 0, take.Reason
	}
	if take.SourceLength <= 0 || take.SourceFile == "" {
		return "", 0, 0, takePreviewEmptySentence
	}
	return filepath.Clean(take.SourceFile), take.SourceStart, math.Min(take.SourceLength, bridge.MaxPreviewSeconds), ""
}
