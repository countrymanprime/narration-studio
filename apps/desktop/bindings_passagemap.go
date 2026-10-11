package main

import (
	"context"
	"strings"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/manuscript"
	"github.com/countrymanprime/narration-utils/shell/internal/passagemap"
)

// The Booth's passage map (docs/architecture/manuscript-teleprompter.md#the-passage-map): when a recording stops, the UI
// sends the run of marks it noted (where each take began, and where the one before it ended), the host checks them against
// the manuscript, stamps them with the ids the DAW gave the recorded item and take, and keeps them in
// <project>/narration-utils/passagemap.json. The UI never sends an id the DAW gave: the host reads it from the chapter's
// linked track, or the built-in recorder's take name (threat-model row 5k).

// passageMapStampTimeout bounds how long the stamp waits for the DAW to report the chapter's track: on a timeout the run is
// kept unstamped.
const passageMapStampTimeout = 3 * time.Second

// PassageMapMarkInput is one mark of PassageMapRecordRun's run: where a take began, how many seconds into the chapter
// recording, its kind (start, roll or stop) and, for a roll or a stop, where the take before it ended.
type PassageMapMarkInput struct {
	PID  string               `json:"pid"`
	Word int                  `json:"word"`
	Sec  float64              `json:"sec"`
	Kind string               `json:"kind"`
	Prev *PassageMapMarkPlace `json:"prev,omitempty"`
}

// PassageMapMarkPlace is a paragraph id and a word index in it.
type PassageMapMarkPlace struct {
	PID  string `json:"pid"`
	Word int    `json:"word"`
}

// PassageMapRecordRun stores one recording's run of marks for chapterID (a start, any rolls and a stop, in time order) and
// returns the marks as stored, stamped with the DAW's ids. A run that breaks a rule is refused and nothing is saved.
func (h *Host) PassageMapRecordRun(chapterID string, run []PassageMapMarkInput) (string, error) {
	marks := make([]passagemap.MarkInput, 0, len(run))
	for _, input := range run {
		mark := passagemap.MarkInput{PID: input.PID, Word: input.Word, Sec: input.Sec, Kind: input.Kind}
		if input.Prev != nil {
			mark.Prev = &passagemap.Place{PID: input.Prev.PID, Word: input.Prev.Word}
		}
		marks = append(marks, mark)
	}
	svc := h.services()
	return encodeBinding(h.passageMapIn(svc, trackStateReaderFrom(svc)).RecordRun(chapterID, marks))
}

// PassageMapList returns a chapter's marks, runs in the order they were recorded, each checked against the current
// manuscript: a mark whose paragraph is gone or whose word is past its end comes back stale, never moved.
func (h *Host) PassageMapList(chapterID string) (string, error) {
	svc := h.services()
	return encodeBinding(h.passageMapIn(svc, nil).List(chapterID))
}

// passageMapIn builds the passage map store over one services() snapshot: it keeps no state of its own, so a project switch
// in the middle of a call never mixes two projects. reader is the DAW's track state role the stamp reads.
func (h *Host) passageMapIn(svc hostServices, reader trackStateReader) *passagemap.Service {
	return passagemap.New(passagemap.Config{
		Project:    svc.config.projectFolder,
		Manuscript: passageMapBook(svc.manuscript),
		Stamp: func(chapterID string) (passagemap.Stamp, error) {
			return h.passageMapStamp(svc, reader, chapterID)
		},
		Reporter: h.persist,
	})
}

// passageMapStamp reads the ids a run that just ended was recorded under. With the built-in recorder it is the take's name
// (the item and its one take are the same file). With the DAW it is the last item on the chapter's one linked track and
// that item's active take, read through the track state role; a chapter with no link, or a DAW that does not answer,
// leaves the run unstamped.
func (h *Host) passageMapStamp(svc hostServices, reader trackStateReader, chapterID string) (passagemap.Stamp, error) {
	if h.recordingEngine(svc) == engineBuiltin {
		if svc.recorder == nil {
			return passagemap.Stamp{}, nil
		}
		state := svc.recorder.Snapshot()
		name := ""
		switch {
		case state.Last != nil:
			name = state.Last.Name
		case state.Take != nil:
			name = *state.Take
		}
		return passagemap.Stamp{ItemGUID: name, TakeGUIDs: []string{name}}, nil
	}
	_, links, err := chapterLinksFor(svc, chapterID)
	if err != nil || len(links) != 1 || reader == nil {
		return passagemap.Stamp{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), passageMapStampTimeout)
	defer cancel()
	state, err := reader.ChapterTrackState(ctx, links[0])
	if err != nil || len(state.Items) == 0 {
		return passagemap.Stamp{}, err
	}
	item := state.Items[len(state.Items)-1]
	stamp := passagemap.Stamp{ItemGUID: item.ItemGUID}
	if item.TakeGUID != "" {
		stamp.TakeGUIDs = []string{item.TakeGUID}
	}
	return stamp, nil
}

// passageMapBook reads the current manuscript's chapter ids and each paragraph's word count.
func passageMapBook(service *manuscript.Service) func() (passagemap.Book, error) {
	return func() (passagemap.Book, error) {
		if service == nil {
			return passagemap.Book{}, nil
		}
		data, err := service.Load()
		if err != nil {
			return passagemap.Book{}, err
		}
		var book passagemap.Book
		for _, chapter := range manuscriptObjects(data["chapters"]) {
			id, _ := chapter["id"].(string)
			book.Chapters = append(book.Chapters, id)
		}
		for _, paragraph := range manuscriptObjects(data["paragraphs"]) {
			chapterID, _ := paragraph["chapterId"].(string)
			id, _ := paragraph["id"].(string)
			text, _ := paragraph["text"].(string)
			book.Lines = append(book.Lines, passagemap.Line{ChapterID: chapterID, ID: id, Words: len(strings.Fields(text))})
		}
		return book, nil
	}
}
