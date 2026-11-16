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
