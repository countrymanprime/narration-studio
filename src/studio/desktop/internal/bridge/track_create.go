package bridge

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// CreatedTrack is what track_create answers: the new track's GUID, the name REAPER gave it (the name asked for, trimmed,
// with any line break or tab inside it turned into a space) and its 0-based index in the project's track list.
type CreatedTrack struct {
	GUID  string
	Name  string
	Index int
}

// CreatedFolder is what track_create answers for a chapter folder (#2840): the folder and its first child. Child is zero when the script is
// older than the chapter folder: it ignored the child's name and added Folder as a plain track. More holds the children after the first, in
// the order they were asked for (#3748), and is shorter than asked for when the script is older than that: it adds the first child only.
type CreatedFolder struct {
	Folder CreatedTrack
	Child  CreatedTrack
	More   []CreatedTrack
}

// Children is every child the script answered, in order: the first, then More. Empty when the script added no child.
func (f CreatedFolder) Children() []CreatedTrack {
	if f.Child.GUID == "" {
		return nil
	}
	return append([]CreatedTrack{f.Child}, f.More...)
}

// ErrTrackNameEmpty means the name for a new track is empty once trimmed, so nothing was sent (or the script refused it).
var ErrTrackNameEmpty = errors.New("the new track needs a name")

// trackNameEmptySentence is the script's own ERROR for an empty name (narration_track_create.lua).
const trackNameEmptySentence = "The new track needs a name."

// CreateTrack adds one track named name at the end of REAPER's track list, in one undo point, and answers it. It never saves
// the project, refuses while REAPER records (ErrRecording) and is not idempotent: each call adds a track. A blank name is
// ErrTrackNameEmpty before anything is sent.
func (a *Actions) CreateTrack(ctx context.Context, name string) (CreatedTrack, error) {
	return a.createTrack(ctx, name)
}

// CreateChildTrack adds a track named name inside the folder parentGUID names, after its last descendant, as a direct child of it
// (a voice in a chapter's folder, docs/prds/booth-voice-tracks.prd.md): the folder depths are moved so every folder still closes where
// it did, a parent that is not a folder becomes one, and the track records from the folder's first child's input. One undo point; it
// never saves the project. A parent that is gone is a *TrackStaleError and nothing is added.
func (a *Actions) CreateChildTrack(ctx context.Context, name, parentGUID string) (CreatedTrack, error) {
	if normalizeGUID(parentGUID) == "" {
		return CreatedTrack{}, fmt.Errorf("no folder to add the track to")
	}
	return a.createTrack(ctx, name, normalizeGUID(parentGUID))
}

// CreateFolderTrack adds a chapter folder named name holding the children named children, in that order and after every other track, in one
// undo point (#2840, #3748): the folder opens, the children sit one level down and the last closes it. A folder left open at the end of the
// project is closed on its last track first, so the new folder is not nested in the chapter before it. It never saves the project, refuses
// while REAPER records (ErrRecording), and is not idempotent. A blank name, no child or a blank child name is ErrTrackNameEmpty before anything
// is sent; two child names equal without case (ASCII letters only) are refused by the script with nothing added.
//
// The children after the first travel in one field, a name a line: the bridge reads at most eight fields, so one field per name would merge
// every name past the third into one track. A line break inside a name becomes a space here, as the script does, so no name can split in two.
// A script from before #3748 reads the first child only: the answer then holds fewer children than asked for, with no error, and a caller that
// sent several compares len(Children()) with what it asked for.
func (a *Actions) CreateFolderTrack(ctx context.Context, name string, children ...string) (CreatedFolder, error) {
	if len(children) == 0 {
		return CreatedFolder{}, ErrTrackNameEmpty
	}
	cleaned := make([]string, 0, len(children))
	for _, child := range children {
		child = strings.TrimSpace(lineBreaks.ReplaceAllString(child, " "))
		if child == "" {
			return CreatedFolder{}, ErrTrackNameEmpty
		}
		cleaned = append(cleaned, child)
	}
	rest := []string{"", cleaned[0]}
	if len(cleaned) > 1 {
		rest = append(rest, strings.Join(cleaned[1:], "\n"))
	}
	return a.create(ctx, name, rest...)
}

// lineBreaks is what the script turns into one space inside a track name: a run of them (narration_track_create.lua, clean_name).
var lineBreaks = regexp.MustCompile(`[\r\n\t]+`)

func (a *Actions) createTrack(ctx context.Context, name string, parent ...string) (CreatedTrack, error) {
	created, err := a.create(ctx, name, parent...)
	return created.Folder, err
}

// create sends track_create with name and the optional parent and child name, and reads the track (and the child) it answers.
func (a *Actions) create(ctx context.Context, name string, rest ...string) (CreatedFolder, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return CreatedFolder{}, ErrTrackNameEmpty
	}
	events, err := a.request(ctx, "track_create", []string{"TRACK_CREATED", "TRACK_STALE"}, append([]string{name}, rest...)...)
	if err != nil {
		var refusal *RefusalError
		if errors.As(err, &refusal) && refusal.Sentence == trackNameEmptySentence {
			return CreatedFolder{}, ErrTrackNameEmpty
		}
		return CreatedFolder{}, err
	}
	var more []CreatedTrack
	for _, event := range events {
		switch event.Tag {
		case "TRACK_STALE":
			return CreatedFolder{}, &TrackStaleError{GUID: event.Fields[2]}
		case "TRACK_CHILD":
			index, err := strconv.Atoi(event.Fields[3])
			if err != nil {
				return CreatedFolder{}, fmt.Errorf("REAPER answered track_create with a child index that is not a number: %w", err)
			}
			more = append(more, CreatedTrack{GUID: normalizeGUID(event.Fields[2]), Index: index, Name: event.Fields[4]})
		case "TRACK_CREATED":
			created, err := createdFrom(event.Fields)
			created.More = more
			return created, err
		}
	}
	return CreatedFolder{}, fmt.Errorf("REAPER ended track_create without answering it")
}

// createdFrom reads TRACK_CREATED|run|guid|index|name[|childGuid|childIndex|childName]: the child only when the script sent one.
func createdFrom(fields []string) (CreatedFolder, error) {
	index, err := strconv.Atoi(fields[3])
	if err != nil {
		return CreatedFolder{}, fmt.Errorf("REAPER answered track_create with an index that is not a number: %w", err)
	}
	out := CreatedFolder{Folder: CreatedTrack{GUID: normalizeGUID(fields[2]), Index: index, Name: fields[4]}}
	if len(fields) < 8 || strings.TrimSpace(fields[5]) == "" {
		return out, nil
	}
	childIndex, err := strconv.Atoi(fields[6])
	if err != nil {
		return CreatedFolder{}, fmt.Errorf("REAPER answered track_create with a child index that is not a number: %w", err)
	}
	out.Child = CreatedTrack{GUID: normalizeGUID(fields[5]), Index: childIndex, Name: fields[7]}
	return out, nil
}

// FolderMove is one track whose folder a ChapterFolders move changes: the track and its old and new folder, by GUID and by the name
// REAPER holds now ("" for the top level).
type FolderMove struct {
	GUID, Name         string
	FromGUID, FromName string
	ToGUID, ToName     string
}

// FolderPlan is what ChapterFolders answered: every track whose folder changes, and how many of them are chapters.
type FolderPlan struct {
	Moves    []FolderMove
	Chapters int
}

// ErrFoldersStale means the moves REAPER planned on apply are not the ones the narrator confirmed (the project changed since the
// preview), so nothing was written.
var ErrFoldersStale = errors.New("the project changed since the moves were shown")

// ChapterFolders moves chapter tracks out of another chapter's folder (#2838): chapterGUIDs are the tracks the app links to chapters.
// With apply false it only answers the moves. With apply true REAPER plans again and writes only when the chapters that move are
// exactly expected, in order (else ErrFoldersStale): only the folder depth of the track before each nested chapter changes, in one undo
// point. It refuses while REAPER records, and never saves the project.
func (a *Actions) ChapterFolders(ctx context.Context, apply bool, chapterGUIDs, expected []string) (FolderPlan, error) {
	mode, closing := "preview", "FOLDERS_PLANNED"
	if apply {
		mode, closing = "apply", "FOLDERS_REPAIRED"
	}
	events, err := a.request(ctx, "chapter_folders", []string{closing, "FOLDERS_STALE"}, mode, joinGUIDs(chapterGUIDs), joinGUIDs(expected))
	if err != nil {
		return FolderPlan{}, err
	}
	var plan FolderPlan
	for _, event := range events {
		switch event.Tag {
		case "FOLDERS_STALE":
			return FolderPlan{}, ErrFoldersStale
		case "FOLDER_MOVE":
			f := event.Fields
			plan.Moves = append(plan.Moves, FolderMove{GUID: f[2], Name: f[3], FromGUID: f[4], FromName: f[5], ToGUID: f[6], ToName: f[7]})
		case closing:
			chapters, err := strconv.Atoi(event.Fields[2])
			if err != nil {
				return FolderPlan{}, fmt.Errorf("REAPER answered %s with %q chapters", closing, event.Fields[2])
			}
			plan.Chapters = chapters
		}
	}
	return plan, nil
}

// joinGUIDs is the comma-separated list chapter_folders reads, each GUID normalized; a GUID with a comma or a pipe is dropped.
func joinGUIDs(guids []string) string {
	out := make([]string, 0, len(guids))
	for _, guid := range guids {
		guid = normalizeGUID(guid)
		if guid != "" && !strings.ContainsAny(guid, ",|") {
			out = append(out, guid)
		}
	}
	return strings.Join(out, ",")
}
