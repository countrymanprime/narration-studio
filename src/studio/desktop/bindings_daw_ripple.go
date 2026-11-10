package main

import (
	"fmt"
	"strings"

	"desktop/internal/dawport"
)

// Edits that move the audio after them (closing a cut, shortening a gap, stacking takes, replacing words with a different length) shift every
// later item on the ITEM'S OWN track (narration_range.lua, narration_takes.lua, narration_replace.lua). In a chapter whose voices are tracks inside a
// folder that moves one voice and leaves the others where they were, so the voices drift apart. Until those commands ripple across the chapter's
// folder, they are refused for a chapter whose audio is on more than one track, with the sentence below (#3043). An edit that moves nothing (a
// split, a gain change, a click repair, an FX range, a cut that leaves a gap) acts on the item's own track and is not refused.

const rippleSeveralVoicesSentence = "This chapter's audio is on more than one voice track, and %s would move the audio after the edit on one voice only and leave the others behind. That is not available for a chapter with several voices yet: leave a gap instead, or make this edit in %s."

// rippleRefusal is the refusal for edit what (named as the sentence reads it, such as "Shortening a gap") in the DAW named daw.
func rippleRefusal(daw, what string) dawport.Result {
	return dawport.Refused(fmt.Sprintf(rippleSeveralVoicesSentence, strings.ToLower(what[:1])+what[1:], daw))
}

// voiceTracksWithAudio is how many distinct tracks the items sit on, as the folder read reports them (TrackGUID); a flat link's items carry none
// and count as one track.
func voiceTracksWithAudio(items []dawport.TrackItem) int {
	seen := map[string]bool{}
	for _, item := range items {
		if item.Length > 0 && (item.Muted == nil || !*item.Muted) {
			seen[strings.ToUpper(item.TrackGUID)] = true
		}
	}
	return len(seen)
}

// chapterFolderTrack is the GUID of the chapter's linked track when it is a folder in the saved project (a chapter of voices), else "". An edit that
// moves the audio after it sends it so the script moves the later items of every voice inside, not only the item's own track.
func chapterFolderTrack(svc hostServices, chapterID string) string {
	return chapterFolderOf(svc, chapterID)
}

// chapterFolderOf is the saved-project read behind chapterFolderTrack; a test swaps it (and restores it) to stand in for a project file.
var chapterFolderOf = readChapterFolderTrack

func readChapterFolderTrack(svc hostServices, chapterID string) string {
	link, refused, err := readAloudTrackGUID(svc, chapterID)
	if err != nil || refused != nil {
		return ""
	}
	project, err := liveSelectedProject(svc)
	if err != nil {
		return ""
	}
	if members, ok := project.WithDescendants(link); ok && len(members) > 0 && members[0].IsFolder {
		return link
	}
	return ""
}
