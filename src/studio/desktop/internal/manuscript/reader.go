package manuscript

import (
	"desktop/internal/brand"
	"desktop/internal/creditsid"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"

	"desktop/internal/persist"
	"desktop/internal/recordedthrough"
)

// Chapters returns the stable reader contract derived from the immutable
// canonical manuscript plus its separately editable review sidecar.
func (s *Service) Chapters() ([]map[string]any, error) {
	return s.chapters(true)
}

// ChaptersUnmeasured is Chapters without recordedFraction, which reads the saved project and every stored coverage result:
// the stage recommendations read the statuses only and build their own evidence view, so they skip that second parse.
func (s *Service) ChaptersUnmeasured() ([]map[string]any, error) {
	return s.chapters(false)
}

// chapters is the chapter list; measure adds recordedFraction, the recorded length (recordedSeconds or
// recordedUnavailable) and recordedThrough, which only the chapter list carries.
func (s *Service) chapters(measure bool) ([]map[string]any, error) {
	data, err := s.Load()
	if err != nil {
		return nil, err
	}
	notes := s.loadNotes()
	paragraphIDs := paragraphIDsByChapter(objects(data["paragraphs"]))
	recorded, lengths, through := map[string]float64{}, map[string]RecordedLength{}, map[string]recordedthrough.Through{}
	if measure {
		lengths = s.recordedLengths()
		ids := []string{}
		for _, chapter := range objects(data["chapters"]) {
			if !isFrontMatter(chapter) {
				ids = append(ids, text(chapter, "id"))
			}
		}
		through, recorded = s.measured(ids, lengths)
	}
	result := make([]map[string]any, 0, len(objects(data["chapters"])))
	for _, chapter := range objects(data["chapters"]) {
		if isFrontMatter(chapter) {
			continue
		}
		payload := chapterPayload(chapter, notes, recorded, paragraphIDs[text(chapter, "id")], true)
		if length, known := lengths[text(chapter, "id")]; known {
			if length.Unavailable != "" {
				payload["recordedUnavailable"] = string(length.Unavailable)
			} else {
				payload["recordedSeconds"] = length.Seconds
			}
		}
		if place, known := through[text(chapter, "id")]; known {
			payload["recordedThrough"] = place
		}
		result = append(result, payload)
	}
	return s.withCredits(data, result, measure, lengths, recorded), nil
}

// isFrontMatter is a chapter an earlier import wrote for the book's front matter (contentKind "opening"). Front matter is never shown as a
// chapter; the data stays in manuscript.json because the credits read the title and author from it.
func isFrontMatter(chapter map[string]any) bool { return text(chapter, "contentKind") == "opening" }

// frontMatterChapterIDs is the ids of the chapters isFrontMatter names, for the paragraphs under them.
func frontMatterChapterIDs(data map[string]any) map[string]bool {
	ids := map[string]bool{}
	for _, chapter := range objects(data["chapters"]) {
		if isFrontMatter(chapter) {
			ids[text(chapter, "id")] = true
		}
	}
	return ids
}

func (s *Service) SetChapterStatus(chapterID, status string) (map[string]any, error) {
	if !validChapterStatus(status) {
		return nil, fmt.Errorf("unknown chapter status: %s", status)
	}
	if creditsid.IsID(chapterID) {
		return s.setCreditsStatus(chapterID, status)
	}
	s.notesMu.Lock()
	defer s.notesMu.Unlock()
	data, err := s.Load()
	if err != nil {
		return nil, err
	}
	var found map[string]any
	for _, chapter := range objects(data["chapters"]) {
		if text(chapter, "id") == chapterID {
			found = chapter
			break
		}
	}
	if found == nil {
		return nil, fmt.Errorf("unknown manuscript chapter")
	}
	notes := s.loadNotes()
	statusByChapter := object(notes["chapterStatus"])
	statusByChapter[chapterID] = status
	notes["chapterStatus"] = statusByChapter
	if err := s.saveNotes(notes); err != nil {
		return nil, err
	}
	return chapterPayload(found, notes, s.recordedFractions(), nil, false), nil
}

func (s *Service) Notes(chapterID string) []map[string]any {
	result := []map[string]any{}
	for _, note := range objects(s.loadNotes()["notes"]) {
		if chapterID == "" || text(note, "chapterId") == chapterID {
			result = append(result, note)
		}
	}
	return result
}

// ReaderState sends the reader's place: the active chapter and source line and the expanded chapters. A file the old reader
// wrote may also hold chapter and line bookmarks; they stay in the file and are not sent (SN-C383, docs/reference/data-files.md replaced them).
func (s *Service) ReaderState() map[string]any {
	stored := object(s.loadNotes()["readerState"])
	return map[string]any{"activeChapter": stored["activeChapter"], "activeSourceLine": stored["activeSourceLine"], "expandedChapters": stored["expandedChapters"]}
}

func (s *Service) loadNotes() map[string]any {
	s.mu.Lock()
	project := s.project
	s.mu.Unlock()
	if project == "" {
		return emptyNotes()
	}
	// The notes, reader state and chapter statuses are the narrator's own work: a file that cannot be read is kept aside, the
	// narrator is told, and a fresh one is started, so the next note never replaces it without a trace.
	var raw map[string]any
	s.persist.Load().ReadJSON(filepath.Join(project, brand.ProjectFolder, "manuscript-notes.json"), "notes", persist.NarratorData, func(bytes []byte) error {
		var decoded map[string]any
		if err := json.Unmarshal(bytes, &decoded); err != nil {
			return err
		}
		if decoded == nil {
			return fmt.Errorf("not a JSON object")
		}
		raw = decoded
		return nil
	})
	if raw == nil {
		return emptyNotes()
	}
	return normalizeNotes(raw)
}

func (s *Service) saveNotes(notes map[string]any) error {
	s.mu.Lock()
	project := s.project
	s.mu.Unlock()
	if project == "" {
		return fmt.Errorf("save the REAPER project first")
	}
	path := filepath.Join(project, brand.ProjectFolder, "manuscript-notes.json")
	if err := persist.CanOverwrite(path, "notes"); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create manuscript sidecar: %w", err)
	}
	bytes, err := json.MarshalIndent(notes, "", "  ")
	if err != nil {
		return err
	}
	if err := persist.WriteFile(path, bytes, 0o600); err != nil {
		return fmt.Errorf("could not write manuscript sidecar: %w", err)
	}
	return nil
}

func emptyNotes() map[string]any {
	return map[string]any{"notes": []map[string]any{}, "chapterStatus": map[string]any{}, "readerState": map[string]any{"activeChapter": nil, "activeSourceLine": nil, "expandedChapters": nil}}
}
func normalizeNotes(raw map[string]any) map[string]any {
	lower := map[string]any{}
	for key, value := range raw {
		lower[strings.ToLower(key)] = value
	}
	result := emptyNotes()
	if value, ok := lower["notes"]; ok {
		result["notes"] = value
	}
	if value, ok := lower["chapterstatus"]; ok {
		result["chapterStatus"] = value
	}
	if value, ok := lower["readerstate"]; ok {
		result["readerState"] = value
	}
	return result
}
func validChapterStatus(value string) bool {
	return value == "not_started" || value == "recording" || value == "editing" || value == "proofing" || value == "finalized"
}
func objects(value any) []map[string]any {
	list, _ := value.([]any)
	if list == nil {
		if maps, ok := value.([]map[string]any); ok {
			return maps
		}
		return []map[string]any{}
	}
	result := make([]map[string]any, 0, len(list))
	for _, item := range list {
		if object, ok := item.(map[string]any); ok {
			result = append(result, object)
		}
	}
	return result
}
func object(value any) map[string]any {
	result, _ := value.(map[string]any)
	if result == nil {
		return map[string]any{}
	}
	return result
}
func text(value map[string]any, key string) string { result, _ := value[key].(string); return result }
func paragraphPayload(paragraph map[string]any) map[string]any {
	payload := map[string]any{"id": text(paragraph, "id"), "chapterId": text(paragraph, "chapterId"), "chapter": text(paragraph, "chapterTitle"), "index": paragraph["index"], "text": text(paragraph, "text"), "entityIds": []string{}}
	if spans, ok := paragraph["spans"]; ok {
		payload["spans"] = spans
	}
	return payload
}

// chapterPayload is one chapter as the reader contract sends it. recordedFraction is present only for a chapter the
// recording coverage measured (recorded, from RecordedFractions): never a guess from the status.
// payloadsBuilt counts the chapter payloads built in this process: the work a caller that needs one chapter must not do for all of them.
var payloadsBuilt atomic.Int64

// ChapterPayloadsBuilt is how many chapter payloads this process has built, a test's way to count the chapters a call read.
func ChapterPayloadsBuilt() int64 { return payloadsBuilt.Load() }

func chapterPayload(chapter, notes map[string]any, recorded map[string]float64, paragraphIDs []map[string]any, includeParagraphs bool) map[string]any {
	payloadsBuilt.Add(1)
	status := "not_started"
	if stored, ok := object(notes["chapterStatus"])[text(chapter, "id")].(string); ok {
		status = stored
	}
	result := map[string]any{"id": text(chapter, "id"), "title": text(chapter, "title"), "index": chapter["index"], "wordCount": chapter["wordCount"], "contentKind": text(chapter, "contentKind"), "status": status}
	if subtitle := text(chapter, "subtitle"); subtitle != "" {
		result["subtitle"] = subtitle
	}
	// A chapter reclassified after import (SetChapterKind) says when; one imported as narration and now another kind
	// was removed from recording and is listed for Restore.
	if changed := text(chapter, "kindChangedAt"); changed != "" {
		result["kindChangedAt"] = changed
		if text(chapter, "importedKind") == "narration" && !isNarration(chapter) {
			result["removedFromRecording"] = true
		}
	}
	if fraction, measured := recorded[text(chapter, "id")]; measured {
		result["recordedFraction"] = fraction
	}
	if includeParagraphs {
		// Copies, so two chapters that share an id (a malformed file) do not share the list, as when each chapter built its own.
		ids := make([]map[string]any, len(paragraphIDs))
		for i, id := range paragraphIDs {
			ids[i] = map[string]any{"id": id["id"], "index": id["index"]}
		}
		result["paragraphIds"] = ids
	}
	return result
}

// paragraphIDsByChapter is each chapter's paragraph ids, in order, from one pass over the paragraphs: finding them chapter by chapter
// scanned every paragraph for every chapter, which grew with the square of the book (#3560).
func paragraphIDsByChapter(paragraphs []map[string]any) map[string][]map[string]any {
	byChapter := map[string][]map[string]any{}
	for _, paragraph := range paragraphs {
		chapterID := text(paragraph, "chapterId")
		byChapter[chapterID] = append(byChapter[chapterID], map[string]any{"id": text(paragraph, "id"), "index": paragraph["index"]})
	}
	return byChapter
}
