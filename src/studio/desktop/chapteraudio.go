package main

import (
	"strings"

	"desktop/internal/dawport"
	"desktop/internal/persist"
	"desktop/internal/tracks"
	"desktop/internal/voicetracks"
)

// chapterAudio is project with the rule that a track the narrator marked as not a voice (a music bed, room tone) is not a chapter's
// audio (#3557): the recording check, the recorded length and the recorded end read every track inside a chapter's folder, and a
// bed would otherwise be transcribed and counted as recorded. Only those chapter-audio reads change (tracks.Project.WithAudioSkip): the
// chapter row's members and every voice list still see the track. A setup that cannot be read is kept aside and reported through reporter
// (the repo's rule for a narrator's file that will not parse, persist.Reporter; nil only keeps it) and marks nothing meanwhile.
//
// A track another chapter is linked to, inside a chapter's folder, is not left out here: the folder and its children are one chapter's voices
// except a track marked as not a voice (#3594, pinned by TestANestedChaptersLinkedTrackStillCountsInTheOuterChaptersRecordedLength).
func chapterAudio(reporter *persist.Reporter, folder string, project tracks.Project) tracks.Project {
	setup, err := voicetracks.New(voicetracks.Config{Project: folder, Reporter: reporter}).Get()
	if err != nil {
		return project
	}
	return chapterAudioFrom(setup, project)
}

// chapterAudioFrom is chapterAudio for a caller that already holds the voice setup.
func chapterAudioFrom(setup voicetracks.State, project tracks.Project) tracks.Project {
	if len(setup.NotVoiceGUIDs) == 0 {
		return project
	}
	return project.WithAudioSkip(setup.IsNotVoice)
}

// notVoiceTracksUnder is the GUIDs of the tracks inside the folder link that the narrator marked as not a voice (a music bed). It is what the
// record start sends REAPER with the chapter_end rule, so the end of the chapter's audio leaves them out (#3559). The folder's shape comes from
// the live-over-saved list. Two owner rulings sit side by side here: a marked track stays on the timeline (it moves with its chapter on ripple and
// edits, and plays_at counts it), but it does not decide where the next take starts, as it does not count toward the recorded length (#3557).
// A setup that cannot be read, or a link that is not a folder, answers none (REAPER then counts every track, as before).
func notVoiceTracksUnder(svc hostServices, link string) []string {
	setup, err := voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder}).Get()
	if err != nil || len(setup.NotVoiceGUIDs) == 0 {
		return nil
	}
	project, err := liveSelectedProject(svc)
	if err != nil {
		return nil
	}
	members, ok := project.WithDescendants(link)
	if !ok || len(members) < 2 {
		return nil
	}
	var marked []string
	for _, member := range members[1:] {
		if setup.IsNotVoice(member.GUID) {
			marked = append(marked, member.GUID)
		}
	}
	return marked
}

// chapterAudioSkip is the rule for REAPER's live read of the folder linked to chapter guid (dawport.ChapterAudioState): it names the tracks
// whose items are not the chapter's audio, a track marked as not a voice and every track inside a marked folder (#3558). The chapter's own
// track is never named. nil means every item counts. It reads the saved project, which knows the folder's shape; a track marked but not in
// the saved project yet is still named through the mark itself.
func chapterAudioSkip(reporter *persist.Reporter, folder string, project tracks.Project, guid string) func(trackGUID string) bool {
	// The link's own spelling can differ from the project's (case, a stray space): find the track the project names and use its GUID.
	for _, track := range project.Tracks {
		if strings.EqualFold(track.GUID, strings.TrimSpace(guid)) {
			guid = track.GUID
			break
		}
	}
	ruled := chapterAudio(reporter, folder, project)
	all, ok := project.WithDescendants(guid)
	if !ok {
		all = nil
	}
	kept, _ := ruled.ChapterMembers(guid)
	left := map[string]bool{}
	for _, track := range kept {
		left[strings.ToLower(track.GUID)] = true
	}
	inside := map[string]bool{}
	for _, track := range all {
		inside[strings.ToLower(track.GUID)] = true
	}
	var dropped []string
	for id := range inside {
		if !left[id] {
			dropped = append(dropped, id)
		}
	}
	own := strings.ToLower(guid)
	return func(trackGUID string) bool {
		id := strings.ToLower(trackGUID)
		if id == own {
			return false
		}
		for _, drop := range dropped {
			if drop == id {
				return true
			}
		}
		return ruled.SkipsAudio(trackGUID)
	}
}

// withoutSkippedTracks is state less the items on tracks skip names, with ItemsTotal lowered by the same count so "a read that lists fewer
// items than the project has" still means what it did. A nil skip, or one that names nothing here, answers state itself.
func withoutSkippedTracks(state dawport.TrackState, skip func(trackGUID string) bool) dawport.TrackState {
	if skip == nil {
		return state
	}
	kept := make([]dawport.TrackItem, 0, len(state.Items))
	for _, item := range state.Items {
		if item.TrackGUID != "" && skip(item.TrackGUID) {
			continue
		}
		kept = append(kept, item)
	}
	if len(kept) == len(state.Items) {
		return state
	}
	state.ItemsTotal = max(0, state.ItemsTotal-(len(state.Items)-len(kept)))
	state.Items = kept
	return state
}
