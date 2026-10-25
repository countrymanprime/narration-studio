package guide

import (
	"context"
	"errors"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"unicode/utf8"
)

// This file writes the dialogue cues (the quoted lines and who speaks them): manuscript_guide.py refresh_cues, the sidecar's cues
// command, which #2251 step 3 moved here and deleted, and the cues its build wrote, which the host now writes after every build (Build).
// The file is read as Python's load_json read it (pyLoads, so an object keeps its keys in order and a number its text) and written as
// write_json wrote it (pyDumps), so every byte the cues do not change is written back as it was. tests/fixtures/guide-cues (frozen) pins
// both against the sidecar byte for byte (TestRefreshCuesMatchesTheSidecar, TestBuildThenRefreshIsTodaysBuild).

// CueCounts is what a cue refresh found: every quoted line, and how many of them have a speaker.
type CueCounts struct {
	Cues       int
	Attributed int
}

// errCuesShape is the host's refusal where the sidecar's cues command crashed on a value of the wrong type (a KeyError, TypeError or
// AttributeError, or a file that is not UTF-8); the sidecar's own refusals keep its words.
var errCuesShape = errors.New("The Story Bible holds a value the dialogue cues cannot be found with.") //nolint:staticcheck // shown to the narrator

// RefreshCues writes the dialogue cues without a Story Bible build, against the entries already filed under a speaking type, keeping
// the narrator's corrections. With chapterIDs, only those chapters' cues are recomputed and the rest are kept, in manuscript order. With
// no Story Bible yet (or one that is not JSON, or is empty), an empty one is started, which the host reports as stale until a build fills
// source. It holds editMu, so a host edit is not lost under it; a build the sidecar runs at the same time is not held off, as before.
func (s *Service) RefreshCues(ctx context.Context, chapterIDs ...string) (CueCounts, error) {
	if s.project == "" {
		return CueCounts{}, errNoProject
	}
	s.editMu.Lock()
	defer s.editMu.Unlock()
	counts, err := refreshCues(ctx, s.manuscript(), s.guidePath(), chapterIDs)
	s.held = nil
	return counts, err
}

// refreshCues is refresh_cues over the two files: the counts its CUES|<cues>|<with a speaker> line printed, or the error it exited
// with. It returns ctx.Err() once ctx is cancelled, before the file is written.
func refreshCues(ctx context.Context, manuscriptPath, guidePath string, chapterIDs []string) (CueCounts, error) {
	loaded, err := cueBible(guidePath)
	if err != nil {
		return CueCounts{}, err
	}
	if !pyTruthy(loaded) {
		loaded = emptyCueGuide()
	}
	paragraphs, err := ruleManuscript(manuscriptPath)
	if err != nil {
		return CueCounts{}, err
	}
	document, ok := loaded.(*pyObject)
	if !ok {
		return CueCounts{}, errCuesShape // guide.get on a list, a string or a number
	}
	chapters := map[string]bool{}
	for _, id := range chapterIDs {
		chapters[id] = true
	}
	previous, _ := pyGet(document, "dialogue_cues", []any{})
	scope := paragraphs
	if len(chapters) > 0 {
		scope = slices.DeleteFunc(slices.Clone(paragraphs), func(p ruleParagraph) bool { return !chapters[p.chapterID] })
	}
	entities, _ := pyGet(document, "entities", []any{})
	speaking, err := (&ruleBibleFile{document: document}).speakingTypes()
	if err != nil {
		return CueCounts{}, err
	}
	index, err := cueSpeakerIndex(entities, speaking)
	if err != nil {
		return CueCounts{}, err
	}
	fresh, err := dialogueCues(ctx, scope, index, true)
	if err != nil {
		return CueCounts{}, err
	}
	cues, err := mergeDialogueCues(fresh, previous)
	if err != nil {
		return CueCounts{}, err
	}
	if len(chapters) > 0 {
		if cues, err = keepOtherChapters(cues, previous, chapters, paragraphs); err != nil {
			return CueCounts{}, err
		}
	}
	if err := ctx.Err(); err != nil {
		return CueCounts{}, err
	}
	list := make([]any, len(cues))
	counts := CueCounts{Cues: len(cues)}
	for i, cue := range cues {
		list[i] = cue
		if speaker, _ := cue.get("speaker_entity_id"); pyTruthy(speaker) {
			counts.Attributed++
		}
	}
	document.set("dialogue_cues", list)
	if err := writePyDocument(guidePath, document); err != nil {
		return CueCounts{}, err
	}
	return counts, nil
}

// set is object[key] = value: a new key goes last, one already there keeps its place.
func (o *pyObject) set(key string, value any) {
	if _, ok := o.values[key]; !ok {
		o.keys = append(o.keys, key)
	}
	o.values[key] = value
}

// newPyObject is an object with the keys and values in pairs, in that order.
func newPyObject(pairs ...any) *pyObject {
	object := &pyObject{values: map[string]any{}}
	for i := 0; i+1 < len(pairs); i += 2 {
		object.set(pairs[i].(string), pairs[i+1])
	}
	return object
}

// emptyCueGuide is manuscript_guide.py empty_guide, in its key order.
func emptyCueGuide() *pyObject {
	return newPyObject("schema_version", pyInt{big.NewInt(schemaVersion)}, "source", newPyObject(), "generated_at", nil,
		"entities", []any{}, "vocabulary_candidates", []any{}, "absorbed_names", newPyObject())
}

// cueBible is manuscript_guide.py load_json for the cues: nil for a file that is not there, cannot be read or is not JSON; the value
// otherwise, its entries' plain-text aliases made objects and a legacy "user" pronunciation source read as "manual", as load_json does.
// A file that is not UTF-8, or an entry load_json crashed on, is errCuesShape.
func cueBible(path string) (any, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, nil //nolint:nilerr // load_json reads an OSError as no file
	}
	if !utf8.Valid(raw) {
		return nil, errCuesShape // read_text's UnicodeDecodeError, which load_json does not catch
	}
	data, err := pyLoads(universalNewlines(string(raw)))
	if err != nil {
		return nil, nil //nolint:nilerr // load_json reads a JSONDecodeError as no file
	}
	document, ok := data.(*pyObject)
	if !ok {
		return data, nil
	}
	entities, _ := pyGet(document, "entities", []any{})
	walked, err := pyIter(entities)
	if err != nil {
		return nil, errCuesShape
	}
	for _, item := range walked {
		entity, ok := item.(*pyObject)
		if !ok {
			return nil, errCuesShape
		}
		if list, ok := entity.values["aliases"].([]any); ok {
			for i, alias := range list {
				if _, ok := alias.(*pyObject); !ok {
					list[i] = newPyObject("text", alias, "pronunciation", newPyObject(), "occurrences", []any{})
				}
			}
		}
		holders := []*pyObject{entity}
		if aliases := entity.values["aliases"]; pyTruthy(aliases) {
			walkedAliases, err := pyIter(aliases)
			if err != nil {
				return nil, errCuesShape
			}
			for _, alias := range walkedAliases {
				if holder, ok := alias.(*pyObject); ok {
					holders = append(holders, holder)
				}
			}
		}
		for _, holder := range holders {
			if value, ok := holder.values["pronunciation"].(*pyObject); ok {
				holder.set("pronunciation", pyPronunciationSource(value))
			}
		}
	}
	return document, nil
}

// pyPronunciationSource is manuscript_guide.py read_pronunciation_source over a copy: a legacy "user" source reads as "manual", in the
// value and in its alternate.
func pyPronunciationSource(value *pyObject) *pyObject {
	out := &pyObject{keys: slices.Clone(value.keys), values: make(map[string]any, len(value.values))}
	for key, item := range value.values {
		out.values[key] = item
	}
	if out.values["source"] == legacyManualSource {
		out.values["source"] = ManualSource
	}
	if alternate, ok := out.values["alternate"].(*pyObject); ok {
		out.values["alternate"] = pyPronunciationSource(alternate)
	}
	return out
}

// cueSpeakerIndex is manuscript_guide.py character_name_index over the entries as the cues read them: every normalized name and alias
// of an entry whose type speaks, mapped to its id, the first entry to claim a name keeping it. Where the sidecar crashed (a category
// that is a list or an object, a speaking entry's name or alias that is not text, or a speaking entry with names and no id) this is
// errCuesShape; an entry that does not speak is not read further, as there.
func cueSpeakerIndex(entities any, speaking map[string]bool) (map[string]any, error) {
	walked, err := pyIter(entities)
	if err != nil {
		return nil, errCuesShape
	}
	index := map[string]any{}
	for _, item := range walked {
		entity, ok := item.(*pyObject)
		if !ok {
			return nil, errCuesShape
		}
		category, _ := entity.get("category")
		if _, err := pyKey(category); err != nil {
			return nil, errCuesShape
		}
		if text, ok := category.(string); !ok || !speaking[text] {
			continue
		}
		keys, err := cueNameKeys(entity)
		if err != nil {
			return nil, err
		}
		if len(keys) == 0 {
			continue
		}
		id, ok := entity.get("id")
		if !ok {
			return nil, errCuesShape // entity["id"]
		}
		for _, key := range keys {
			if _, taken := index[key]; !taken {
				index[key] = id
			}
		}
	}
	return index, nil
}

// cueNameKeys is manuscript_guide.py entity_name_keys: the entry's normalized canonical name and alias texts, without the empty one.
func cueNameKeys(entity *pyObject) ([]string, error) {
	name, _ := pyGet(entity, "canonical_name", "")
	text, ok := name.(string)
	if !ok {
		return nil, errCuesShape
	}
	keys := []string{normalizeName(text)}
	aliases, _ := pyGet(entity, "aliases", []any{})
	if pyTruthy(aliases) {
		walked, err := pyIter(aliases)
		if err != nil {
			return nil, errCuesShape
		}
		for _, alias := range walked {
			value, err := pyGet(alias, "text", "")
			text, ok := value.(string)
			if err != nil || !ok {
				return nil, errCuesShape
			}
			keys = append(keys, normalizeName(text))
		}
	}
	return slices.DeleteFunc(keys, func(key string) bool { return key == "" }), nil
}

// mergeDialogueCues is manuscript_guide.py merge_dialogue_cues: a fresh cue whose id a corrected cue of the file has takes that cue's
// speaker (and its source, "correction" when it has none) and stays corrected; every other fresh cue is as found. The file's cues are
// read first, all of them: one that is not an object, has no id or an id that is a list or an object is errCuesShape, as the sidecar
// crashed on it.
func mergeDialogueCues(fresh []*pyObject, previous any) ([]*pyObject, error) {
	walked, err := pyIter(previous)
	if err != nil {
		return nil, errCuesShape
	}
	byID := map[string]*pyObject{}
	for _, item := range walked {
		cue, ok := item.(*pyObject)
		if !ok {
			return nil, errCuesShape
		}
		id, ok := cue.get("id")
		if !ok {
			return nil, errCuesShape
		}
		key, err := pyKey(id)
		if err != nil {
			return nil, errCuesShape
		}
		byID[key] = cue
	}
	merged := make([]*pyObject, 0, len(fresh))
	for _, cue := range fresh {
		id, _ := cue.get("id")
		if prior := byID["S"+id.(string)]; prior != nil && pyTruthy(prior) && pyTruthy(prior.values["corrected"]) {
			speaker := prior.values["speaker_entity_id"]
			source, _ := pyGet(prior, "speaker_source", "correction")
			copied := &pyObject{keys: slices.Clone(cue.keys), values: make(map[string]any, len(cue.values))}
			for key, value := range cue.values {
				copied.values[key] = value
			}
			copied.set("speaker_entity_id", speaker)
			copied.set("speaker_source", source)
			copied.set("corrected", true)
			cue = copied
		}
		merged = append(merged, cue)
	}
	return merged, nil
}

// keepOtherChapters is refresh_cues with --chapter-id: the file's cues of every other chapter are kept, and all of them sorted (stably)
// by where their chapter first appears in the manuscript, a cue of no chapter there last. A kept cue's chapterId that is a list or an
// object is errCuesShape, as the sidecar crashed on it.
func keepOtherChapters(cues []*pyObject, previous any, chapters map[string]bool, paragraphs []ruleParagraph) ([]*pyObject, error) {
	order := map[string]int{}
	for _, paragraph := range paragraphs {
		if _, seen := order[paragraph.chapterID]; !seen {
			order[paragraph.chapterID] = len(order)
		}
	}
	walked, _ := pyIter(previous) // mergeDialogueCues read them already: a list of objects
	all := []*pyObject{}
	for _, item := range walked {
		cue := item.(*pyObject)
		chapter, _ := cue.get("chapterId")
		if _, err := pyKey(chapter); err != nil {
			return nil, errCuesShape
		}
		if text, ok := chapter.(string); ok && chapters[text] {
			continue
		}
		all = append(all, cue)
	}
	all = append(all, cues...)
	place := func(cue *pyObject) int {
		chapter, _ := pyGet(cue, "chapterId", "")
		if text, ok := chapter.(string); ok {
			if at, ok := order[text]; ok {
				return at
			}
		}
		return len(order)
	}
	slices.SortStableFunc(all, func(a, b *pyObject) int { return place(a) - place(b) })
	return all, nil
}

// pyLineEnd is what Python's text mode wrote for a line end: write_json's Path.write_text turned every "\n" into os.linesep.
var pyLineEnd = func() string {
	if runtime.GOOS == "windows" {
		return "\r\n"
	}
	return "\n"
}()

// writePyDocument is manuscript_guide.py write_json: pyDumps and a line end, its folder made, written beside the file and renamed over
// it so a reader never sees half a file.
func writePyDocument(path string, document *pyObject) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	text := pyDumps(document) + "\n"
	if pyLineEnd != "\n" {
		text = strings.ReplaceAll(text, "\n", pyLineEnd)
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, []byte(text), 0o644); err != nil { //nolint:gosec // G306: the mode the sidecar wrote the file with; it is the narrator's own data
		return err
	}
	if err := os.Rename(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	return nil
}

// SpeakerChapters is the chapters an entry's names appear in, by chapter id in first-seen order, and whether its type speaks: the
// chapters whose cues change when the entry is filed under, or out of, a speaking type. An entry that is not there has none.
func (s *Service) SpeakerChapters(id string) (chapters []string, speaks bool, err error) {
	types, err := s.Types()
	if err != nil {
		return nil, false, err
	}
	entities, err := s.Entities()
	if err != nil {
		return nil, false, err
	}
	for _, entity := range entities {
		if text(entity, "id") != id {
			continue
		}
		for _, row := range types {
			if row.Name == text(entity, "category") {
				speaks = row.Speaks
			}
		}
		seen := map[string]bool{}
		add := func(occurrences any) {
			list, _ := occurrences.([]any)
			for _, raw := range list {
				occurrence, _ := raw.(map[string]any)
				if chapter := text(occurrence, "chapterId"); chapter != "" && !seen[chapter] {
					seen[chapter] = true
					chapters = append(chapters, chapter)
				}
			}
		}
		add(entity["occurrences"])
		aliases, _ := entity["aliases"].([]any)
		for _, raw := range aliases {
			if alias, ok := raw.(map[string]any); ok {
				add(alias["occurrences"])
			}
		}
		return chapters, speaks, nil
	}
	return nil, false, nil
}
