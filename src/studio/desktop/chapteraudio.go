package main

import (
	"desktop/internal/persist"
	"desktop/internal/tracks"
	"desktop/internal/voicetracks"
)

// chapterAudio is project with the rule that a track the narrator marked as not a voice (a music bed, room tone) is not a chapter's
// audio (#3557): the recording check, the recorded length and the recorded end read every track inside a chapter's folder, and a
// bed would otherwise be transcribed and counted as recorded. Only those chapter-audio reads change (tracks.Project.WithAudioSkip): the
// chapter row's members and every voice list still see the track. A setup that cannot be read is kept aside and reported through reporter
// (the repo's rule for a narrator's file that will not parse, persist.Reporter; nil only keeps it) and marks nothing meanwhile.
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
// the live-over-saved list; a setup that cannot be read, or a link that is not a folder, answers none (REAPER then counts every track, as before).
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
