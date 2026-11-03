package main

import (
	"desktop/internal/creditsid"
	"desktop/internal/manuscript"
	"fmt"
	"os"
	"time"

	"desktop/internal/chaptermatch"
	"desktop/internal/tracks"
)

// trackOption is one track the narrator can pick when a chapter's match is not
// confident (the matcher never picks for them, and never creates a track).
type trackOption struct {
	GUID  string `json:"guid"`
	Name  string `json:"name"`
	Index int    `json:"index"`
}

// matchTrack is a trackOption with where the track sits in REAPER's folders and
// whether it has audio of its own, so the picker can draw the project's tree.
type matchTrack struct {
	trackOption
	Depth    int  `json:"depth"`
	IsFolder bool `json:"isFolder"`
	// HasAudio is false for a folder with no items, which cannot be a link target.
	HasAudio bool `json:"hasAudio"`
}

// chapterTrackMatch is ChapterTrackMatch's payload: which track holds a chapter and where its recorded audio ends, from
// the selected .rpp as of its last save.
type chapterTrackMatch struct {
	ChapterID    string `json:"chapterId"`
	ChapterTitle string `json:"chapterTitle"`
	// ProjectFile is the .rpp read; SavedAt its modification time, which the
	// UI shows as "as of last save" (REAPER may hold newer, unsaved takes).
	ProjectFile string `json:"projectFile"`
	SavedAt     string `json:"savedAt"`
	chaptermatch.Result
	// Tracks lists every track for the picker.
	Tracks []matchTrack `json:"tracks"`
	// RecordedEnd is set only for a confirmed or matched track with audible
	// items: an uncertain guess never yields a resume point.
	RecordedEnd *tracks.RecordedEnd `json:"recordedEnd"`
}

// chapterTrackMatchFor resolves chapterID's track in the project's selected
// .rpp. A narrator-confirmed link (chapter-track-map.json) wins over names;
// no match is a status, not an error. Everything comes from one h.services()
// snapshot, so the manuscript, the mapping and the .rpp belong to the same
// project even if a project switch lands mid-call.
func (h *Host) chapterTrackMatchFor(chapterID string) (chapterTrackMatch, error) {
	match, _, err := chapterTrackMatchIn(h.services(), chapterID)
	return match, err
}

// chapterTrackMatchIn is chapterTrackMatchFor over one services snapshot; it also returns the parsed project, so a
// caller (the tail-audio locate) can go on to a track the narrator picked without reading the .rpp again.
func chapterTrackMatchIn(svc hostServices, chapterID string) (chapterTrackMatch, tracks.Project, error) {
	chapters, project, confirmed, err := matchInputs(svc)
	if err != nil {
		return chapterTrackMatch{}, tracks.Project{}, err
	}

	// The credits are not matched to tracks by name (manuscriptChapters leaves them out), but one asked about still answers: its
	// confirmed link if it has one, else no match and every track to pick from.
	if kind, isCredits := creditsid.Kind(chapterID); isCredits {
		chapters = append(chapters, chaptermatch.Chapter{ID: chapterID, Title: creditsid.Title(kind)})
	}
	result, err := chaptermatch.ForChapter(chapterID, chapters, project, confirmed)
	if err != nil {
		return chapterTrackMatch{}, tracks.Project{}, fmt.Errorf("that chapter is not part of the current manuscript")
	}
	match := chapterTrackMatch{
		ChapterID:   chapterID,
		ProjectFile: project.Path,
		SavedAt:     savedAt(project.Path),
		Result:      result,
		Tracks:      make([]matchTrack, 0, len(project.Tracks)),
	}
	for _, chapter := range chapters {
		if chapter.ID == chapterID {
			match.ChapterTitle = chapter.Title
		}
	}
	for _, track := range project.Tracks {
		match.Tracks = append(match.Tracks, matchTrack{
			trackOption: trackOption{GUID: track.GUID, Name: track.Name, Index: track.Index},
			Depth:       track.Depth, IsFolder: track.IsFolder, HasAudio: len(track.Items) > 0,
		})
	}
	if result.Track != nil {
		if end, ok := chaptermatch.RecordedEnd(project, *result.Track); ok {
			match.RecordedEnd = &end
		}
	}
	return match, project, nil
}

// matchInputs is what both matcher directions read, from one services
// snapshot: the manuscript's chapters, the selected .rpp as of its last save,
// and every narrator-confirmed link (track GUID -> chapter id).
func matchInputs(svc hostServices) ([]chaptermatch.Chapter, tracks.Project, map[string]string, error) {
	documentID, store, err := mappingContext(svc)
	if err != nil {
		return nil, tracks.Project{}, nil, err
	}
	chapters, err := manuscriptChapters(svc)
	if err != nil {
		return nil, tracks.Project{}, nil, err
	}
	project, err := selectedProject(svc)
	if err != nil {
		return nil, tracks.Project{}, nil, err
	}
	mappings, err := store.List(documentID)
	if err != nil {
		return nil, tracks.Project{}, nil, err
	}
	confirmed := make(map[string]string, len(mappings))
	for _, mapping := range mappings {
		confirmed[mapping.TrackGUID] = mapping.ChapterID
	}
	return chapters, project, confirmed, nil
}

// manuscriptChapters is the current manuscript's chapter list in the
// matcher's shape (every chapter, reference ones included, so a track named
// after a reference section is not mistaken for a narration chapter).
func manuscriptChapters(svc hostServices) ([]chaptermatch.Chapter, error) {
	raw, err := svc.manuscript.Chapters()
	if err != nil {
		return nil, err
	}
	chapters := make([]chaptermatch.Chapter, 0, len(raw))
	for _, chapter := range raw {
		// The credits are linked by hand: a track is never matched to one by its name.
		if manuscript.IsCredits(chapter) {
			continue
		}
		id, _ := chapter["id"].(string)
		title, _ := chapter["title"].(string)
		chapters = append(chapters, chaptermatch.Chapter{ID: id, Title: title})
	}
	return chapters, nil
}

// savedAt is path's modification time (UTC, RFC 3339), or "" when it cannot
// be read.
func savedAt(path string) string {
	info, err := os.Stat(path)
	if err != nil {
		return ""
	}
	return info.ModTime().UTC().Format(time.RFC3339)
}
