package main

import (
	"context"
	"errors"
	"os"
	"strconv"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/reaper"
	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
	"github.com/countrymanprime/narration-utils/shell/internal/manuscript"
	"github.com/countrymanprime/narration-utils/shell/internal/voicesample"
)

// The narrator's voice samples: stretches of a take marked as how a character sounds, each copied into
// <project>/narration-utils/voice-samples/ with a record of where it came from (internal/voicesample,
// docs/prds/character-voice-samples.prd.md). The bindings take ids, word keys and seconds, never a path. The host finds the
// audio file in the saved REAPER project by item and take GUID; the page gets the words and a state for where a sample came
// from, and never the file or the GUIDs.

// voiceSamplesChangedEvent is emitted after any change to the samples; its payload is {revision}, and the page re-reads.
const voiceSamplesChangedEvent = "voice_samples_changed"

// voiceSamplesChanged is the event's payload: a number that rises with every change this process makes.
type voiceSamplesChanged struct {
	Revision int64 `json:"revision"`
}

// voiceSampleAnswer is what a mark or an update answers: the sample, or why the host refused (nothing was saved).
type voiceSampleAnswer struct {
	Status  string              `json:"status"`
	Sample  *voicesample.Sample `json:"sample,omitempty"`
	Reason  voicesample.Reason  `json:"reason,omitempty"`
	Message string              `json:"message,omitempty"`
}

func saved(sample voicesample.Sample) voiceSampleAnswer {
	return voiceSampleAnswer{Status: "saved", Sample: &sample}
}

// voiceSampleRefusal turns an error from the store into a refused answer when it is the host saying no, and reports whether it was.
func voiceSampleRefusal(err error) (voiceSampleAnswer, bool) {
	var refusal *voicesample.Refusal
	if !errors.As(err, &refusal) {
		return voiceSampleAnswer{}, false
	}
	return voiceSampleAnswer{Status: "refused", Reason: refusal.Reason, Message: refusal.Sentence()}, true
}

// VoiceSamplesList returns every voice sample, sorted by character and then primary first and newest, each with the state of its
// clip and of the words it was marked on, with what they add up to and the limits.
func (h *Host) VoiceSamplesList() (string, error) {
	return encodeBinding(h.voiceSamples().List())
}

// VoiceSampleMark copies the stretch of one take the request names into a clip and stores it as a voice sample of a character.
// It answers {status: "saved", sample}, or {status: "refused", reason, message} when the stretch cannot be copied (nothing was
// saved); a request that is not valid, or a file that cannot be read or written, is a rejected promise.
func (h *Host) VoiceSampleMark(request voicesample.MarkRequest) (string, error) {
	sample, err := h.voiceSamples().Mark(context.Background(), request)
	if answer, ok := voiceSampleRefusal(err); ok {
		return encodeBinding(answer, nil)
	}
	if err != nil {
		return "", err
	}
	h.emitVoiceSamplesChanged()
	return encodeBinding(saved(sample), nil)
}

// VoiceSampleUpdate changes a voice sample's label, note and character. It answers like VoiceSampleMark.
func (h *Host) VoiceSampleUpdate(id string, change voicesample.Change) (string, error) {
	sample, err := h.voiceSamples().Update(id, change)
	if answer, ok := voiceSampleRefusal(err); ok {
		return encodeBinding(answer, nil)
	}
	if err != nil {
		return "", err
	}
	h.emitVoiceSamplesChanged()
	return encodeBinding(saved(sample), nil)
}

// VoiceSampleSetPrimary makes a voice sample its character's primary (the one the quick play uses) and returns the samples.
func (h *Host) VoiceSampleSetPrimary(id string) (string, error) {
	list, err := h.voiceSamples().SetPrimary(id)
	if err == nil {
		h.emitVoiceSamplesChanged()
	}
	return encodeBinding(list, err)
}

// VoiceSampleRemove deletes a voice sample and its clip. A sample that is not there is not an error: removed is then 0.
func (h *Host) VoiceSampleRemove(id string) (string, error) {
	removed, err := h.voiceSamples().Remove(id)
	if err == nil && removed.Removed > 0 {
		h.emitVoiceSamplesChanged()
	}
	return encodeBinding(removed, err)
}

// VoiceSamplesRemoveAll deletes every voice sample and every clip in the project.
func (h *Host) VoiceSamplesRemoveAll() (string, error) {
	removed, err := h.voiceSamples().RemoveAll()
	if err == nil && removed.Removed > 0 {
		h.emitVoiceSamplesChanged()
	}
	return encodeBinding(removed, err)
}

// followMerge moves the absorbed Story Bible entry's voice samples to the entry it was merged into, after the merge succeeded
// (undoID is the id it answered). The merge has happened whatever this does, so a failure here is not the merge's: the samples
// stay with the absorbed entry, which the Story Bible lists under "a character who is no longer in the Story Bible" with a way to
// move them, and the reason goes to host.log.
func (h *Host) followMerge(undoID, sourceID, targetID string) {
	if h.services().config.projectFolder == "" {
		return
	}
	followed, err := h.voiceSamples().FollowMerge(undoID, sourceID, targetID)
	if err != nil {
		_ = h.log.Report("voice_samples_merge_follow", err.Error())
		return
	}
	if followed.Moved > 0 {
		h.emitVoiceSamplesChanged()
	}
}

// unfollowMerge gives the samples a merge moved back to the entry they came from, after the Story Bible took that merge back. It
// fails the way followMerge does: the entries are restored whatever happens here, and the samples then stay where they are.
func (h *Host) unfollowMerge(undoID string) {
	if h.services().config.projectFolder == "" {
		return
	}
	followed, err := h.voiceSamples().UndoFollow(undoID)
	if err != nil {
		_ = h.log.Report("voice_samples_unmerge_follow", err.Error())
		return
	}
	if followed.Moved > 0 {
		h.emitVoiceSamplesChanged()
	}
}

func (h *Host) emitVoiceSamplesChanged() {
	emitEvent(voiceSamplesChangedEvent, voiceSamplesChanged{Revision: h.voiceSamplesRevision.Add(1)})
}

// voiceSamples builds the voice samples store over one services() snapshot: it keeps no state of its own, so a project switch in
// the middle of a call never mixes two projects.
func (h *Host) voiceSamples() *voicesample.Service {
	svc := h.services()
	config := voicesample.Config{
		Project:       svc.config.projectFolder,
		Manuscript:    voiceSamplesBook(svc.manuscript),
		Reporter:      h.persist,
		ProjectReader: reaper.ProjectReader{},
	}
	if svc.settings != nil {
		folder, store := svc.config.projectFolder, svc.settings
		config.ProjectFile = func() (string, error) { return selectedProjectFile(folder, store) }
	}
	if svc.coverage != nil && svc.settings != nil {
		reader := &voiceChapterReader{
			coverage: svc.coverage,
			params:   coverageSettings(svc.settings).Alignment,
			cuts: editlog.New(editlog.Config{
				Project:    svc.config.projectFolder,
				Manuscript: editLogBook(svc.manuscript),
				Reporter:   h.persist,
			}),
		}
		config.Alignment, config.Cuts = reader, reader
	}
	return voicesample.New(config)
}

// voiceSamplesBook reads the current manuscript's chapters, with their titles, and its lines in reading order.
func voiceSamplesBook(service *manuscript.Service) func() (voicesample.Book, error) {
	return func() (voicesample.Book, error) {
		if service == nil {
			return voicesample.Book{}, nil
		}
		data, err := service.Load()
		if err != nil {
			return voicesample.Book{}, err
		}
		var book voicesample.Book
		for _, chapter := range manuscriptObjects(data["chapters"]) {
			id, _ := chapter["id"].(string)
			title, _ := chapter["title"].(string)
			book.Chapters = append(book.Chapters, voicesample.Chapter{ID: id, Title: title})
		}
		for _, paragraph := range manuscriptObjects(data["paragraphs"]) {
			chapterID, _ := paragraph["chapterId"].(string)
			id, _ := paragraph["id"].(string)
			text, _ := paragraph["text"].(string)
			book.Lines = append(book.Lines, editlog.Line{ChapterID: chapterID, ID: id, Index: paragraphIndex(paragraph["index"]), Text: text})
		}
		return book, nil
	}
}

// voiceChapterReader answers what a mark needs of one chapter's stored recording check: the record the page's word times came
// from, where the two words were heard, and which ranges of a source file the narrator's cuts hid. It reads the check once for
// the chapter and keeps the answer for the rest of the call, and it is built for one call.
type voiceChapterReader struct {
	coverage *coverage.Service
	params   coverage.AlignmentParams
	cuts     *editlog.Service

	chapter  string
	loaded   bool
	recordID string
	view     coverage.AlignmentView
	err      error
}

// load reads the chapter's check. A check that is not current (never run, or the manuscript, the audio or the settings changed
// since) has no record id and no words, which a mark refuses as stale.
func (r *voiceChapterReader) load(chapterID string) error {
	if r.loaded && r.chapter == chapterID {
		return r.err
	}
	r.chapter, r.loaded, r.recordID, r.view, r.err = chapterID, true, "", coverage.AlignmentView{}, nil
	result, err := r.coverage.Result(chapterID, r.params)
	if err != nil {
		r.err = err
		return err
	}
	if !result.Current() {
		return nil
	}
	view, err := r.coverage.Alignment(chapterID, r.params)
	if err != nil {
		r.err = err
		return err
	}
	r.recordID, r.view = result.Result.RecordID, view
	return nil
}

// Heard is voicesample.Alignment over the stored check.
func (r *voiceChapterReader) Heard(chapterID, startKey, endKey string) (voicesample.Heard, error) {
	if err := r.load(chapterID); err != nil {
		return voicesample.Heard{}, err
	}
	heard := voicesample.Heard{RecordID: r.recordID}
	if r.recordID == "" {
		return heard, nil
	}
	// A slice, not a map: one word is both ends of a stretch of one word.
	for _, end := range []struct {
		key  string
		word **voicesample.HeardWord
	}{{startKey, &heard.First}, {endKey, &heard.Last}} {
		if token, ok := tokenOfKey(r.view, end.key); ok && token.Item != nil {
			if item, found := alignmentItemAt(r.view.Items, *token.Item); found {
				*end.word = &voicesample.HeardWord{ItemGUID: item.ItemGUID, TakeGUID: item.TakeGUID}
			}
		}
	}
	return heard, nil
}

// Hidden is voicesample.Cuts: for each cut of the chapter that still holds, the span of source seconds its words were heard in,
// on the item they were heard on. A cut whose words changed, a wordless cut and a word nothing was heard for hide nothing here.
func (r *voiceChapterReader) Hidden(chapterID string) ([]voicesample.Hidden, error) {
	if err := r.load(chapterID); err != nil {
		return nil, err
	}
	if r.recordID == "" {
		return nil, nil
	}
	cuts, err := r.cuts.CutsList(chapterID)
	if err != nil {
		return nil, err
	}
	var hidden []voicesample.Hidden
	for _, cut := range cuts.Cuts {
		if cut.Stale {
			continue
		}
		spans := map[string]*voicesample.Hidden{}
		for _, key := range cut.Keys {
			token, ok := tokenOfKey(r.view, key)
			if !ok || token.Item == nil || token.Start == nil || token.End == nil {
				continue
			}
			item, found := alignmentItemAt(r.view.Items, *token.Item)
			if !found || item.ItemGUID == "" {
				continue
			}
			span := spans[item.ItemGUID]
			if span == nil {
				spans[item.ItemGUID] = &voicesample.Hidden{ItemGUID: item.ItemGUID, Start: *token.Start, End: *token.End}
				continue
			}
			span.Start, span.End = min(span.Start, *token.Start), max(span.End, *token.End)
		}
		for _, span := range spans {
			hidden = append(hidden, *span)
		}
	}
	return hidden, nil
}

// tokenOfKey is the alignment token of the word a `paragraphId:ordinal` key names.
func tokenOfKey(view coverage.AlignmentView, key string) (coverage.TokenLine, bool) {
	cut := strings.LastIndexByte(key, ':')
	if cut <= 0 {
		return coverage.TokenLine{}, false
	}
	ordinal, err := strconv.Atoi(key[cut+1:])
	if err != nil {
		return coverage.TokenLine{}, false
	}
	for _, token := range view.Tokens {
		if token.ParagraphID != nil && *token.ParagraphID == key[:cut] && token.Word == ordinal {
			return token, true
		}
	}
	return coverage.TokenLine{}, false
}

// voiceSamplesPresent reports whether the project has any voice sample data on disk, so a Clear can tell the page to re-read.
func voiceSamplesPresent(project string) bool {
	if project == "" {
		return false
	}
	_, err := os.Stat(voicesample.Dir(project))
	return err == nil
}
