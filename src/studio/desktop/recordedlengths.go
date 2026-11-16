package main

import (
	"desktop/internal/creditsid"
	"desktop/internal/persist"

	"desktop/internal/evidence"
	"desktop/internal/manuscript"
	"desktop/internal/settings"
	"desktop/internal/tracks"
)

// recordedLengths is the manuscript service's recorded-length provider:
// for every chapter, the recorded seconds of its one confirmed track in the saved .rpp (tracks.Track.RecordedSeconds),
// or why there are none. Confirmed links are the only source: a name match, however confident, is never read here.
// It is bound to one project's folder, settings and manuscript in configureLocked.
func recordedLengths(folder string, store *settings.Store, service *manuscript.Service, reporter *persist.Reporter) manuscript.RecordedLengths {
	return func() map[string]manuscript.RecordedLength {
		data, err := service.Load()
		if err != nil {
			return nil
		}
		documentID, _ := data["documentId"].(string)
		if documentID == "" {
			return nil
		}
		mappings, err := evidence.NewMappingStore(folder).List(documentID)
		if err != nil {
			return nil
		}
		project, readable := readSelectedProject(folder, store)
		return recordedLengthsFor(append(chapterIDs(data), creditsid.OpeningID, creditsid.ClosingID), mappings, chapterAudio(reporter, folder, project), readable)
	}
}

// recordedLengthsFor is the provider's rule over already-read inputs: an unlinked chapter says so whether or not a
// project is readable; a linked one needs the project, exactly one link (AR6 A) and that track in the project.
func recordedLengthsFor(chapters []string, mappings []evidence.TrackMapping, project tracks.Project, readable bool) map[string]manuscript.RecordedLength {
	linked := map[string][]string{}
	for _, mapping := range mappings {
		linked[mapping.ChapterID] = append(linked[mapping.ChapterID], mapping.TrackGUID)
	}
	byGUID := make(map[string]tracks.Track, len(project.Tracks))
	for _, track := range project.Tracks {
		byGUID[track.GUID] = track
	}
	lengths := make(map[string]manuscript.RecordedLength, len(chapters))
	for _, id := range chapters {
		guids := linked[id]
		switch {
		case len(guids) == 0:
			lengths[id] = manuscript.RecordedLength{Unavailable: manuscript.RecordedUnlinked}
		case !readable:
			lengths[id] = manuscript.RecordedLength{Unavailable: manuscript.RecordedNoProject}
		case len(guids) > 1:
			lengths[id] = manuscript.RecordedLength{Unavailable: manuscript.RecordedMultipleTracks}
		default:
			track, ok := byGUID[guids[0]]
			if !ok {
				lengths[id] = manuscript.RecordedLength{Unavailable: manuscript.RecordedTrackMissing}
				continue
			}
			lengths[id] = manuscript.RecordedLength{Seconds: project.ChapterRecordedSeconds(track.GUID)}
		}
	}
	return lengths
}

func chapterIDs(data map[string]any) []string {
	raw, _ := data["chapters"].([]any)
	ids := make([]string, 0, len(raw))
	for _, entry := range raw {
		if chapter, ok := entry.(map[string]any); ok {
			if id, _ := chapter["id"].(string); id != "" {
				ids = append(ids, id)
			}
		}
	}
	return ids
}
