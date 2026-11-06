package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// Moving chapter tracks out of another chapter's folder (#2838). A project nested by the append bug fixed in the bridge's
// core.append_track (every chapter added after a folder left open at the end of the project landed inside that folder) is put right
// on the narrator's confirmation: ChapterFoldersCheck asks the DAW which tracks would move, writing nothing, and ChapterFoldersRepair
// sends the chapters the narrator confirmed; the DAW plans again and writes only when the plan is the same (chapter_folders in
// narration_track_create.lua). Both read the app's chapter links (the tracks to treat as chapters) and send nothing else.

const (
	chapterFoldersClean    = "clean"
	chapterFoldersNested   = "nested"
	chapterFoldersRepaired = "repaired"
	chapterFoldersStale    = "stale"
	chapterFoldersRefused  = "refused"
	chapterFoldersTimeout  = 15 * time.Second
)

// chapterFolderMove is one track whose folder the repair changes, with the chapter it is linked to ("" for a voice or other track).
type chapterFolderMove struct {
	TrackGUID string `json:"trackGuid"`
	TrackName string `json:"trackName"`
	ChapterID string `json:"chapterId,omitempty"`
	FromGUID  string `json:"fromGuid"`
	FromName  string `json:"fromName"`
	ToGUID    string `json:"toGuid"`
	ToName    string `json:"toName"`
}

// chapterFolders is what ChapterFoldersCheck and ChapterFoldersRepair answer. Outcome is clean (no chapter sits inside another's
// folder), nested (Moves would put it right; Expected is what to send to ChapterFoldersRepair), repaired, stale (the project changed
// since the check: check again) or refused (Reason and Message say why; nothing changed).
type chapterFolders struct {
	Outcome  string              `json:"outcome"`
	Reason   string              `json:"reason,omitempty"`
	Message  string              `json:"message,omitempty"`
	Moves    []chapterFolderMove `json:"moves"`
	Expected []string            `json:"expected"`
}

func chapterFoldersRefusedWith(reason, message string) chapterFolders {
	return chapterFolders{Outcome: chapterFoldersRefused, Reason: reason, Message: message, Moves: []chapterFolderMove{}, Expected: []string{}}
}

// folderRepairerFrom asks svc's resolver for the track_create capability's folder repair role, and says why when it is not there.
func folderRepairerFrom(svc hostServices) (dawport.FolderRepairer, dawport.Support) {
	if svc.dawPortResolver == nil {
		return nil, dawport.Support{Reason: dawport.ReasonStandalone}
	}
	repairer, err := dawport.Role[dawport.FolderRepairer](svc.dawPortResolver, dawport.CapTrackCreate)
	if err != nil {
		var notSupported *dawport.NotSupportedError
		if errors.As(err, &notSupported) {
			return nil, notSupported.Support
		}
		var roleErr *dawport.RoleError
		if errors.As(err, &roleErr) {
			// An engine whose track_create role cannot move tracks between folders (Audacity has no folders).
			return nil, dawport.Support{Reason: dawport.ReasonUnsupported}
		}
		return nil, dawport.Support{Reason: dawport.ReasonFailed, Message: err.Error()}
	}
	return repairer, dawport.Support{Available: true}
}

func chapterFoldersUnavailable(name string, support dawport.Support) chapterFolders {
	switch support.Reason {
	case dawport.ReasonStandalone:
		return chapterFoldersRefusedWith(reaperStandalone, fmt.Sprintf("%s is not connected to this app, so its folders cannot be checked. Start %s, then check again.", name, name))
	case dawport.ReasonNotRunning:
		return chapterFoldersRefusedWith(reaperNotRunning, fmt.Sprintf("%s is not answering, so its folders cannot be checked. Check that %s is open, then check again.", name, name))
	case dawport.ReasonNotYet, dawport.ReasonUnsupported:
		return chapterFoldersRefusedWith(trackCreateUnsupported, fmt.Sprintf("%s cannot move tracks between folders from this app.", name))
	default:
		return chapterFoldersRefusedWith(refusedFailed, fmt.Sprintf("%s could not check its folders: %s.", name, strings.TrimRight(support.Message, ".")))
	}
}

func chapterFoldersError(name string, err error) chapterFolders {
	switch {
	case errors.Is(err, bridge.ErrFoldersStale):
		return chapterFolders{Outcome: chapterFoldersStale, Message: fmt.Sprintf("The tracks in %s changed since they were checked, so nothing was moved. Check again.", name), Moves: []chapterFolderMove{}, Expected: []string{}}
	case errors.Is(err, bridge.ErrRecording):
		return chapterFoldersRefusedWith(trackCreateRecording, fmt.Sprintf("%s is recording. Stop the take, then move the chapters.", name))
	case errors.Is(err, bridge.ErrUnavailable):
		return chapterFoldersUnavailable(name, dawport.Support{Reason: dawport.ReasonStandalone})
	case errors.Is(err, bridge.ErrNoAnswer):
		return chapterFoldersUnavailable(name, dawport.Support{Reason: dawport.ReasonNotRunning})
	}
	return chapterFoldersUnavailable(name, dawport.Support{Reason: dawport.ReasonFailed, Message: err.Error()})
}

// linkedChapterTracks is every track a chapter is linked to, each once, and the chapter linked to it.
func linkedChapterTracks(svc hostServices) ([]string, map[string]string, error) {
	documentID, store, err := mappingContext(svc)
	if err != nil {
		return nil, nil, err
	}
	mappings, err := store.List(documentID)
	if err != nil {
		return nil, nil, err
	}
	var guids []string
	chapterOf := map[string]string{}
	for _, mapping := range mappings {
		key := strings.ToUpper(mapping.TrackGUID)
		if _, seen := chapterOf[key]; !seen {
			guids = append(guids, mapping.TrackGUID)
		}
		chapterOf[key] = mapping.ChapterID
	}
	return guids, chapterOf, nil
}

// chapterFoldersIn checks (apply false) or repairs (apply true, with expected from a check) the chapter folders with repairer.
func chapterFoldersIn(ctx context.Context, svc hostServices, repairer dawport.FolderRepairer, support dawport.Support, apply bool, expected []string) (chapterFolders, error) {
	name := readAloudAdapterName(svc)
	if repairer == nil {
		return chapterFoldersUnavailable(name, support), nil
	}
	guids, chapterOf, err := linkedChapterTracks(svc)
	if err != nil {
		return chapterFolders{}, err
	}
	if len(guids) < 2 {
		// One linked chapter cannot sit inside another's folder: nothing to ask. A repair asked for now had its links removed since the
		// check, so it is stale, never a move that did not happen.
		if apply && len(expected) > 0 {
			return chapterFolders{Outcome: chapterFoldersStale, Message: fmt.Sprintf("The chapter links changed since the folders in %s were checked, so nothing was moved. Check again.", name), Moves: []chapterFolderMove{}, Expected: []string{}}, nil
		}
		return chapterFolders{Outcome: chapterFoldersClean, Moves: []chapterFolderMove{}, Expected: []string{}}, nil
	}
	ctx, cancel := context.WithTimeout(ctx, chapterFoldersTimeout)
	defer cancel()
	plan, err := repairer.ChapterFolders(ctx, apply, guids, expected)
	if err != nil {
		return chapterFoldersError(name, err), nil
	}
	answer := chapterFolders{Moves: []chapterFolderMove{}, Expected: []string{}}
	for _, move := range plan.Moves {
		chapterID := chapterOf[strings.ToUpper(move.GUID)]
		answer.Moves = append(answer.Moves, chapterFolderMove{
			TrackGUID: move.GUID, TrackName: move.Name, ChapterID: chapterID,
			FromGUID: move.FromGUID, FromName: move.FromName, ToGUID: move.ToGUID, ToName: move.ToName,
		})
		if chapterID != "" {
			answer.Expected = append(answer.Expected, move.GUID)
		}
	}
	switch {
	case apply:
		answer.Outcome = chapterFoldersRepaired
	case plan.Chapters == 0:
		answer.Outcome = chapterFoldersClean
	default:
		answer.Outcome = chapterFoldersNested
	}
	return answer, nil
}

// ChapterFoldersCheck asks the DAW whether any linked chapter's track sits inside another linked chapter's folder, and which tracks a
// repair would move. It writes nothing.
func (h *Host) ChapterFoldersCheck() (string, error) {
	svc := h.services()
	repairer, support := folderRepairerFrom(svc)
	return encodeBinding(chapterFoldersIn(context.Background(), svc, repairer, support, false, nil))
}

// ChapterFoldersRepair moves the chapters a check listed (expected, its Expected) out of the folders they sit in, in one undo point, and
// only when the DAW plans exactly those moves again; otherwise it answers stale and changes nothing. Sent only from the narrator's
// confirmation.
func (h *Host) ChapterFoldersRepair(expected []string) (string, error) {
	svc := h.services()
	repairer, support := folderRepairerFrom(svc)
	return encodeBinding(chapterFoldersIn(context.Background(), svc, repairer, support, true, expected))
}
