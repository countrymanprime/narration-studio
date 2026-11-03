package bridge

import (
	"context"
	"errors"
	"fmt"
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

// CreatedFolder is what track_create answers for a chapter folder (#2840): the folder and its one child. Child is zero when the script is
// older than the chapter folder: it ignored the child's name and added Folder as a plain track.
type CreatedFolder struct {
	Folder CreatedTrack
	Child  CreatedTrack
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

// CreateFolderTrack adds a chapter folder named name holding one child named childName, both after every other track, in one undo point
// (#2840): a folder left open at the end of the project is closed on its last track first, so the new folder is not nested in the chapter
// before it. It never saves the project, refuses while REAPER records (ErrRecording), and is not idempotent. A blank name or child name is
// ErrTrackNameEmpty before anything is sent.
func (a *Actions) CreateFolderTrack(ctx context.Context, name, childName string) (CreatedFolder, error) {
	childName = strings.TrimSpace(childName)
	if childName == "" {
		return CreatedFolder{}, ErrTrackNameEmpty
	}
	return a.create(ctx, name, "", childName)
}

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
	for _, event := range events {
		if event.Tag == "TRACK_STALE" {
			return CreatedFolder{}, &TrackStaleError{GUID: event.Fields[2]}
		}
		if event.Tag == "TRACK_CREATED" {
			return createdFrom(event.Fields)
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
