package main

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"desktop/internal/chaptermatch"
	"desktop/internal/dawport"
	"desktop/internal/evidence"
	"desktop/internal/tracks"
)

// This file holds an atomic "set this chapter's track" and "unlink this
// chapter", and one read of every narration chapter's link state and track
// facts from a single parse of the saved .rpp (ChapterTrackMatch per row would
// parse it once per chapter).

// chapterTrackSetResult is ChapterTrackSet's payload: the link as written, the
// link it displaced from another chapter (null when the track was free), and
// every link that remains.
type chapterTrackSetResult struct {
	DocumentID string `json:"documentId"`
	evidence.ChapterLinkSet
	Mappings []evidence.TrackMapping `json:"mappings"`
}

// chapterTrackSet makes trackGUID chapterID's one confirmed link, replacing
// any link the chapter had and taking the track from any chapter that held it
// (a chapter has exactly one track). Like mappingConfirm it refuses a chapter outside the manuscript, so
// the stored title is always the real one.
func (h *Host) chapterTrackSet(chapterID, trackGUID string) (chapterTrackSetResult, error) {
	svc := h.services()
	documentID, store, err := mappingContext(svc)
	if err != nil {
		return chapterTrackSetResult{}, err
	}
	if trackGUID == "" {
		return chapterTrackSetResult{}, fmt.Errorf("choose a track before linking a chapter")
	}
	title, ok, err := chapterTitle(svc, chapterID)
	if err != nil {
		return chapterTrackSetResult{}, err
	}
	if !ok {
		return chapterTrackSetResult{}, fmt.Errorf("that chapter is not part of the current manuscript")
	}
	set, err := store.SetChapter(documentID, chapterID, title, trackGUID)
	if err != nil {
		return chapterTrackSetResult{}, err
	}
	mappings, err := store.List(documentID)
	if err != nil {
		return chapterTrackSetResult{}, err
	}
	return chapterTrackSetResult{DocumentID: documentID, ChapterLinkSet: set, Mappings: mappings}, nil
}

// chapterTrackUnlink removes every link chapterID holds and returns the links
// that remain, in ChapterTrackMapList's shape.
func (h *Host) chapterTrackUnlink(chapterID string) (map[string]any, error) {
	svc := h.services()
	documentID, store, err := mappingContext(svc)
	if err != nil {
		return nil, err
	}
	if _, ok, err := chapterTitle(svc, chapterID); err != nil {
		return nil, err
	} else if !ok {
		return nil, fmt.Errorf("that chapter is not part of the current manuscript")
	}
	if _, err := store.ClearChapter(documentID, chapterID); err != nil {
		return nil, err
	}
	mappings, err := store.List(documentID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"documentId": documentID, "mappings": mappings}, nil
}

// linksProjectState says whether the saved .rpp could be read: ready, none
// found, several found and none chosen, or unreadable.
type linksProjectState string

const (
	linksProjectReady  linksProjectState = "ready"
	linksProjectNone   linksProjectState = "none"
	linksProjectChoose linksProjectState = "choose"
	linksProjectError  linksProjectState = "error"
)

// trackSpan is a track's first item start to its last item end, in project
// seconds.
type trackSpan struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

// trackSummary is what the chapter track panel shows about one track, as of
// the .rpp's last save. LinkedChapterID is the chapter the track is confirmed
// for ("" when none), so linking it elsewhere can say which chapter loses it.
type trackSummary struct {
	GUID               string     `json:"guid"`
	Index              int        `json:"index"`
	Name               string     `json:"name"`
	Color              string     `json:"color"`
	Muted              bool       `json:"muted"`
	Soloed             bool       `json:"soloed"`
	Depth              int        `json:"depth"`
	IsFolder           bool       `json:"isFolder"`
	ItemCount          int        `json:"itemCount"`
	PlayableCount      int        `json:"playableCount"`
	MissingSourceCount int        `json:"missingSourceCount"`
	UnsupportedCount   int        `json:"unsupportedCount"`
	Span               *trackSpan `json:"span"`
	LinkedChapterID    string     `json:"linkedChapterId"`
}

// chapterTrackLink is one narration chapter's row: the matcher's answer (as
// ChapterTrackMatch gives it), every confirmed link the chapter holds (with
// when it was confirmed, including a link to a track the project no longer
// has), and where the matched track's audio ends.
type chapterTrackLink struct {
	ChapterID    string `json:"chapterId"`
	ChapterTitle string `json:"chapterTitle"`
	// ChapterSubtitle is the chapter's subtitle field ("" when it has none). It
	// never reaches the wire (json:"-"): the UI already builds its own display
	// name with chapterName(). It exists so a host-side consumer that writes a
	// chapter's name as plain text (chapterRegionPlanIn) can follow the same
	// rule without a new wire payload.
	ChapterSubtitle string `json:"-"`
	chaptermatch.Result
	Links       []evidence.TrackMapping `json:"links"`
	RecordedEnd *tracks.RecordedEnd     `json:"recordedEnd"`
	// Members is the direct children of the folder the chapter's track is, in REAPER's order (empty when the track is not a folder or
	// the chapter has none): the one answer every page reads for what the chapter's folder holds (#3269).
	Members []chapterMember `json:"members"`
}

// chapterMember is one direct child of a chapter's linked folder. IsVoice is false for a track another chapter is linked to (nested
// chapters), which is never a voice of this chapter whatever the layout says.
type chapterMember struct {
	GUID    string `json:"guid"`
	Name    string `json:"name"`
	IsVoice bool   `json:"isVoice"`
}

// linkedTrackSet is the lower-cased GUIDs of the tracks mappings link: the one rule for "is another chapter's track", used by the voices
// and by the chapter row's members, so the two cannot disagree on a GUID's case.
func linkedTrackSet(mappings []evidence.TrackMapping) map[string]bool {
	linked := make(map[string]bool, len(mappings))
	for _, mapping := range mappings {
		linked[strings.ToLower(mapping.TrackGUID)] = true
	}
	return linked
}

// chapterMembersOf is the direct children of the folder track guid in project, with whether each is a voice of the chapter: not a track
// some chapter is linked to (linked, from linkedTrackSet: the same rule chapterVoicesIn applies, GUIDs compared without case).
func chapterMembersOf(project tracks.Project, guid string, linked map[string]bool) []chapterMember {
	members := []chapterMember{}
	all, ok := project.WithDescendants(guid)
	if !ok || !all[0].IsFolder {
		return members
	}
	for _, member := range all[1:] {
		if member.Depth != all[0].Depth+1 {
			continue
		}
		members = append(members, chapterMember{GUID: member.GUID, Name: member.Name, IsVoice: !linked[strings.ToLower(member.GUID)]})
	}
	return members
}

// chapterTrackLinks is ChapterTrackLinks' payload. When Project is not ready,
// Message says why, Tracks is empty and every chapter's status is none (the
// match is unknown without a project), but its confirmed links are listed.
type chapterTrackLinks struct {
	Project     linksProjectState  `json:"project"`
	Message     string             `json:"message"`
	ProjectFile string             `json:"projectFile"`
	SavedAt     string             `json:"savedAt"`
	Tracks      []trackSummary     `json:"tracks"`
	Chapters    []chapterTrackLink `json:"chapters"`
}

func (h *Host) chapterTrackLinks() (chapterTrackLinks, error) {
	svc := h.services()
	lister, support := trackListerFrom(svc)
	ctx, cancel := context.WithTimeout(context.Background(), tracksLiveTimeout)
	defer cancel()
	return chapterTrackLinksLive(ctx, svc, lister, support)
}

// chapterTrackLinksLive is chapterTrackLinksIn judged against the engine's live track list when the engine has the linked
// project open (liveProject, tracks_live.go), so a track added and linked since the last save is not "missing". Otherwise it is
// chapterTrackLinksIn. support is why lister is nil.
func chapterTrackLinksLive(ctx context.Context, svc hostServices, lister dawport.TrackLister, support dawport.Support) (chapterTrackLinks, error) {
	project, state, message := readLinksProject(svc)
	if state == linksProjectReady {
		if live, reason, _ := liveProject(ctx, readAloudAdapterName(svc), lister, support, project.Path, project); reason == "" {
			project = live
		}
	}
	return chapterTrackLinksOver(svc, project, state, message)
}

// chapterTrackLinksIn reads the manuscript, the confirmed links and the saved
// .rpp once, from one services snapshot, and resolves every narration chapter
// against them. It refuses without a project or a manuscript, as
// mappingContext does; a missing or unreadable .rpp is a state, not an error.
func chapterTrackLinksIn(svc hostServices) (chapterTrackLinks, error) {
	project, state, message := readLinksProject(svc)
	return chapterTrackLinksOver(svc, project, state, message)
}

// chapterTrackLinksOver resolves every narration chapter against project, as read by readLinksProject (state and message say
// whether it could be).
func chapterTrackLinksOver(svc hostServices, project tracks.Project, state linksProjectState, message string) (chapterTrackLinks, error) {
	documentID, store, err := mappingContext(svc)
	if err != nil {
		return chapterTrackLinks{}, err
	}
	// ChaptersUnmeasured: the recorded fractions would parse the .rpp a second time.
	raw, err := svc.manuscript.ChaptersUnmeasured()
	if err != nil {
		return chapterTrackLinks{}, err
	}
	mappings, err := store.List(documentID)
	if err != nil {
		return chapterTrackLinks{}, err
	}
	confirmed := make(map[string]string, len(mappings))
	for _, mapping := range mappings {
		confirmed[mapping.TrackGUID] = mapping.ChapterID
	}
	chapters := make([]chaptermatch.Chapter, 0, len(raw))
	narration := make([]chaptermatch.Chapter, 0, len(raw))
	// subtitles holds each chapter's subtitle by id, off to the side of chaptermatch.Chapter: the matcher compares
	// titles only, so the subtitle never joins the matched/narration lists above, only chapterTrackLink's own
	// (non-wire) field below.
	subtitles := make(map[string]string, len(raw))
	for _, chapter := range raw {
		id, _ := chapter["id"].(string)
		title, _ := chapter["title"].(string)
		subtitle, _ := chapter["subtitle"].(string)
		subtitles[id] = subtitle
		chapters = append(chapters, chaptermatch.Chapter{ID: id, Title: title})
		if kind, _ := chapter["contentKind"].(string); kind == "" || kind == "narration" {
			narration = append(narration, chaptermatch.Chapter{ID: id, Title: title})
		}
	}

	linkedTracks := linkedTrackSet(mappings)
	links := chapterTrackLinks{Tracks: []trackSummary{}, Chapters: make([]chapterTrackLink, 0, len(narration))}
	links.Project, links.Message = state, message
	if state == linksProjectReady {
		links.ProjectFile, links.SavedAt = project.Path, savedAt(project.Path)
		for _, track := range project.Tracks {
			links.Tracks = append(links.Tracks, summarizeTrack(track, confirmed[track.GUID]))
		}
	}
	// One resolver for every chapter: each track's name is matched against the titles once, not once per chapter (#3272).
	resolver := chaptermatch.NewResolver(chapters, project)
	for _, chapter := range narration {
		row := chapterTrackLink{ChapterID: chapter.ID, ChapterTitle: chapter.Title, ChapterSubtitle: subtitles[chapter.ID], Links: []evidence.TrackMapping{}, Members: []chapterMember{}}
		for _, mapping := range mappings {
			if mapping.ChapterID == chapter.ID {
				row.Links = append(row.Links, mapping)
			}
		}
		if state != linksProjectReady {
			row.Result = chaptermatch.Result{Status: chaptermatch.StatusNone, Candidates: []chaptermatch.Candidate{}, Warnings: []chaptermatch.Warning{}}
			links.Chapters = append(links.Chapters, row)
			continue
		}
		result, err := resolver.ForChapter(chapter.ID, confirmed)
		if err != nil {
			return chapterTrackLinks{}, err
		}
		row.Result = result
		// Members follow the chapter's one confirmed link, never a name-matched guess: an unlinked chapter has no folder of its own.
		if len(row.Links) == 1 {
			row.Members = chapterMembersOf(project, row.Links[0].TrackGUID, linkedTracks)
		}
		if result.Track != nil {
			if end, ok := chaptermatch.RecordedEnd(project, *result.Track); ok {
				row.RecordedEnd = &end
			}
		}
		links.Chapters = append(links.Chapters, row)
	}
	return links, nil
}

// readLinksProject parses the project's selected .rpp, telling apart no .rpp
// found, several with none chosen, and one that could not be read.
func readLinksProject(svc hostServices) (tracks.Project, linksProjectState, string) {
	candidates, selected, err := discoverProjectFiles(svc.config.projectFolder, svc.settings)
	if err != nil {
		return tracks.Project{}, linksProjectError, err.Error()
	}
	if selected == "" {
		if len(candidates) == 0 {
			return tracks.Project{}, linksProjectNone, "No REAPER project (.rpp) file was found in this project folder."
		}
		return tracks.Project{}, linksProjectChoose, "Choose which REAPER project file to use in the audio engine panel."
	}
	project, err := readProject(selected)
	if err != nil {
		return tracks.Project{}, linksProjectError, fmt.Sprintf("Could not read %s: %v", filepath.Base(selected), err)
	}
	return project, linksProjectReady, ""
}

// summarizeTrack counts a track's items the way the audio engine panel does (playable
// is supported with its source present) and spans them.
func summarizeTrack(track tracks.Track, linkedChapterID string) trackSummary {
	summary := trackSummary{
		GUID: track.GUID, Index: track.Index, Name: track.Name, Color: track.Color,
		Muted: track.Muted, Soloed: track.Soloed, Depth: track.Depth, IsFolder: track.IsFolder, ItemCount: len(track.Items), LinkedChapterID: linkedChapterID,
	}
	for _, item := range track.Items {
		switch {
		case !item.SourceAvailable:
			summary.MissingSourceCount++
		case !item.Supported:
			summary.UnsupportedCount++
		default:
			summary.PlayableCount++
		}
		end := item.Position + item.Length
		if summary.Span == nil {
			summary.Span = &trackSpan{Start: item.Position, End: end}
			continue
		}
		summary.Span.Start = min(summary.Span.Start, item.Position)
		summary.Span.End = max(summary.Span.End, end)
	}
	return summary
}
