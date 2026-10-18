package guide

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"
)

// The sidecar's own words for a refusal, shown to the narrator.
var (
	errEntityLocked = errors.New("This entity is locked. Unlock it before editing.")         //nolint:staticcheck // the sidecar's own words
	errAliasRange   = errors.New("Alias index out of range.")                                //nolint:staticcheck // the sidecar's own words
	errDeleteLocked = errors.New("Cannot delete a locked entity. Unlock it first.")          //nolint:staticcheck // the sidecar's own words
	errRelateSelf   = errors.New("An entity cannot have a relationship with itself.")        //nolint:staticcheck // the sidecar's own words
	errRelateLabel  = errors.New("A relationship needs a label.")                            //nolint:staticcheck // the sidecar's own words
	errCueNotFound  = errors.New("Cue not found.")                                           //nolint:staticcheck // the sidecar's own words
	errCannotSpeak  = errors.New("Only an entry whose type can speak has a speaker colour.") //nolint:staticcheck // the sidecar's own words
	errNoAlternate  = errors.New("There is no other pronunciation to switch to.")            //nolint:staticcheck // the sidecar's own words
)

// mutateInHost runs one of the sidecar's small Story Bible commands in the host: change gets the document (the held one when the file
// still holds its bytes, heldDocument) and says whether the file is to be written. A refusal leaves the file as it was; it also drops the
// held document, since change may have touched it before it refused, so the next command parses the unchanged file again.
func (s *Service) mutateInHost(change func(document map[string]any) (write bool, err error)) error {
	return s.changeInHost(false, change)
}

// changeInHost is mutateInHost; with start, a file that is not there or holds an empty object (errNoFile) is changed as emptyGuide
// instead of refused, and its folder made, as the sidecar's type commands start a Story Bible.
func (s *Service) changeInHost(start bool, change func(document map[string]any) (write bool, err error)) error {
	s.editMu.Lock()
	defer s.editMu.Unlock()
	document, err := s.documentForEdit()
	started := start && errors.Is(err, errNoFile)
	if started {
		document, err = emptyGuide(), nil
	}
	if err != nil {
		return err
	}
	write, err := change(document)
	if err != nil {
		s.held = nil
		return err
	}
	if !write {
		return nil
	}
	if started {
		if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
			return err
		}
	}
	written, err := writeDocument(s.guidePath(), document)
	if err != nil {
		s.held = nil
		return err
	}
	s.held = &heldDocument{document: document, raw: written}
	return nil
}

// emptyGuide is manuscript_guide.py empty_guide: a Story Bible with nothing in it yet, which reads as stale until a build fills source.
func emptyGuide() map[string]any {
	return map[string]any{
		"schema_version":        json.Number(strconv.Itoa(schemaVersion)),
		"source":                map[string]any{},
		"generated_at":          nil,
		"entities":              []any{},
		"vocabulary_candidates": []any{},
		"absorbed_names":        map[string]any{},
	}
}

// reviewTarget is manuscript_guide.py _review_target: the entry a review or colour change is for and the text of the alias it names
// (empty for the entry itself). A locked entry is refused.
func reviewTarget(document map[string]any, id string, aliasIndex *int) (map[string]any, string, error) {
	_, entity, err := findEntity(document, id)
	if err != nil {
		return nil, "", err
	}
	if truthy(entity["locked"]) {
		return nil, "", errEntityLocked
	}
	if aliasIndex == nil {
		return entity, "", nil
	}
	aliases, _ := entity["aliases"].([]any)
	if *aliasIndex < 0 || *aliasIndex >= len(aliases) {
		return nil, "", errAliasRange
	}
	alias, _ := aliases[*aliasIndex].(map[string]any)
	text, _ := alias["text"].(string)
	return entity, text, nil
}

// entityReview is manuscript_guide.py entity_review: the entry's review flags, entry for the entry itself and aliases for the alias texts
// still to look at, in order and once each. A file written before the flags existed has no review; its entry flag is review_state "needs
// review". A stored name the entry no longer has is dropped.
func entityReview(entity map[string]any) (bool, []string) {
	stored, ok := entity["review"].(map[string]any)
	if !ok {
		return entity["review_state"] == "needs review", []string{}
	}
	names := map[string]bool{}
	aliases, _ := entity["aliases"].([]any)
	for _, raw := range aliases {
		if alias, ok := raw.(map[string]any); ok {
			if text, ok := alias["text"].(string); ok {
				names[text] = true
			}
		}
	}
	flagged := []string{}
	list, _ := stored["aliases"].([]any)
	for _, raw := range list {
		if text, ok := raw.(string); ok && names[text] && !slices.Contains(flagged, text) {
			flagged = append(flagged, text)
		}
	}
	return truthy(stored["entry"]), flagged
}

// setReview is manuscript_guide.py set_review: it stores the flags, keeping only names the entry has, and keeps review_state (which the
// findings read) in step: a flagged entry needs review, and one with nothing left to look at is reviewed.
func setReview(entity map[string]any, entry bool, aliases []string) {
	list := make([]any, 0, len(aliases))
	for _, text := range aliases {
		list = append(list, text)
	}
	probe := make(map[string]any, len(entity))
	for key, value := range entity {
		probe[key] = value
	}
	probe["review"] = map[string]any{"entry": entry, "aliases": list}
	_, kept := entityReview(probe)
	keptList := make([]any, 0, len(kept))
	for _, text := range kept {
		keptList = append(keptList, text)
	}
	entity["review"] = map[string]any{"entry": entry, "aliases": keptList}
	if entry {
		entity["review_state"] = "needs review"
	} else if len(kept) == 0 && entity["review_state"] == "needs review" {
		entity["review_state"] = "reviewed"
	}
}

// markReviewed is manuscript_guide.py mark_reviewed.
func markReviewed(document map[string]any, id string, aliasIndex *int) (bool, error) {
	entity, alias, err := reviewTarget(document, id, aliasIndex)
	if err != nil {
		return false, err
	}
	entry, flagged := entityReview(entity)
	if aliasIndex == nil {
		setReview(entity, false, nil)
		entity["review_state"] = "reviewed"
		return true, nil
	}
	setReview(entity, entry, slices.DeleteFunc(flagged, func(text string) bool { return text == alias }))
	return true, nil
}

// flagReview is manuscript_guide.py review_flag: a flag that is already set changes nothing, and then the file is not written.
func flagReview(document map[string]any, id string, aliasIndex *int) (bool, error) {
	entity, alias, err := reviewTarget(document, id, aliasIndex)
	if err != nil {
		return false, err
	}
	entry, flagged := entityReview(entity)
	if aliasIndex == nil {
		if _, stored := entity["review"].(map[string]any); entry && stored {
			return false, nil
		}
		setReview(entity, true, flagged)
		return true, nil
	}
	if slices.Contains(flagged, alias) {
		return false, nil
	}
	setReview(entity, entry, append(flagged, alias))
	return true, nil
}

// speakerColor is manuscript_guide.py speaker_color, after the host's own check of the index (SetSpeakerColor).
func speakerColor(document map[string]any, id string, index int) (bool, error) {
	entity, _, err := reviewTarget(document, id, nil)
	if err != nil {
		return false, err
	}
	speaking, err := speakingTypes(document)
	if err != nil {
		return false, err
	}
	category, _ := entity["category"].(string)
	if !slices.Contains(speaking, category) {
		return false, errCannotSpeak
	}
	if index == 0 {
		delete(entity, "speaker_color")
	} else {
		entity["speaker_color"] = json.Number(strconv.Itoa(index))
	}
	return true, nil
}

// speakingTypes is manuscript_guide.py speaking_types: the names of the types guideTypes reads whose entries speak.
func speakingTypes(document map[string]any) ([]string, error) {
	types, err := guideTypes(document)
	if err != nil {
		return nil, err
	}
	speaking := []string{}
	for _, row := range types {
		if row["speaks"] == true {
			speaking = append(speaking, row["name"].(string))
		}
	}
	return speaking, nil
}

// relate is manuscript_guide.py relate: the label is trimmed, a relationship already there is not added twice, and the file is written
// either way. A locked entry is not refused, as the sidecar does not refuse it.
func relate(document map[string]any, id, other, label string) (bool, error) {
	if id == other {
		return false, errRelateSelf
	}
	_, entity, err := findEntity(document, id)
	if err != nil {
		return false, err
	}
	_, target, err := findEntity(document, other)
	if err != nil {
		return false, err
	}
	label = pythonStrip(label)
	if label == "" {
		return false, errRelateLabel
	}
	relationships, ok := entity["relationships"].([]any)
	if !ok {
		relationships = []any{}
	}
	for _, raw := range relationships {
		if rel, ok := raw.(map[string]any); ok && rel["id"] == other && rel["label"] == label {
			entity["relationships"] = relationships
			return true, nil
		}
	}
	entity["relationships"] = append(relationships, map[string]any{"id": other, "name": target["canonical_name"], "label": label})
	return true, nil
}

// unrelate is manuscript_guide.py unrelate: the label is matched as given, untrimmed.
func unrelate(document map[string]any, id, other, label string) (bool, error) {
	_, entity, err := findEntity(document, id)
	if err != nil {
		return false, err
	}
	entity["relationships"] = withoutRelationships(entity, func(rel map[string]any) bool { return rel["id"] == other && rel["label"] == label })
	return true, nil
}

// deleteEntity is manuscript_guide.py delete: the entry goes, and so does every other entry's relationship to it.
func deleteEntity(document map[string]any, id string) (bool, error) {
	index, entity, err := findEntity(document, id)
	if err != nil {
		return false, err
	}
	if truthy(entity["locked"]) {
		return false, errDeleteLocked
	}
	entities := document["entities"].([]any)
	document["entities"] = slices.Delete(slices.Clone(entities), index, index+1)
	for _, raw := range document["entities"].([]any) {
		if other, ok := raw.(map[string]any); ok {
			other["relationships"] = withoutRelationships(other, func(rel map[string]any) bool { return rel["id"] == id })
		}
	}
	return true, nil
}

// withoutRelationships is the entry's relationships without those drop matches; an entry without any gets an empty list, as the
// sidecar's comprehension over entity.get("relationships", []) gives it.
func withoutRelationships(entity map[string]any, drop func(map[string]any) bool) []any {
	relationships, _ := entity["relationships"].([]any)
	kept := []any{}
	for _, raw := range relationships {
		if rel, ok := raw.(map[string]any); ok && drop(rel) {
			continue
		}
		kept = append(kept, raw)
	}
	return kept
}

// correctCue is manuscript_guide.py correct_cue: the narrator's attribution, or none when the id is blank or "unknown" in any case.
func correctCue(document map[string]any, cueID, speaker string) (bool, error) {
	cues, _ := document["dialogue_cues"].([]any)
	for _, raw := range cues {
		cue, ok := raw.(map[string]any)
		if !ok || cue["id"] != cueID {
			continue
		}
		value := pythonStrip(speaker)
		if value == "" || strings.ToLower(value) == "unknown" {
			cue["speaker_entity_id"] = nil
		} else {
			cue["speaker_entity_id"] = value
		}
		cue["speaker_source"] = "correction"
		cue["corrected"] = true
		return true, nil
	}
	return false, errCueNotFound
}

// userPronunciation is manuscript_guide.py user_pronunciation: the narrator's typed text, trimmed, one line of 1 to
// maxUserPronunciation characters.
func userPronunciation(ipa string) (map[string]any, error) {
	text := pythonStrip(ipa)
	switch {
	case text == "":
		return nil, errors.New("Type a pronunciation first.") //nolint:staticcheck // the sidecar's own words
	case strings.ContainsAny(text, "\r\n"):
		return nil, errors.New("A pronunciation is one line.") //nolint:staticcheck // the sidecar's own words
	case utf8.RuneCountInString(text) > maxUserPronunciation:
		return nil, fmt.Errorf("A pronunciation is at most %d characters.", maxUserPronunciation) //nolint:staticcheck // the sidecar's own words
	}
	return map[string]any{"ipa": text, "source": ManualSource, "confidence": "narrator"}, nil
}

// pronunciationHolder is manuscript_guide.py _pronunciation_holder: the entry (aliasIndex nil) or the alias whose pronunciation an
// edit changes. A locked entry is refused.
func pronunciationHolder(document map[string]any, id string, aliasIndex *int) (map[string]any, error) {
	_, entity, err := findEntity(document, id)
	if err != nil {
		return nil, err
	}
	if truthy(entity["locked"]) {
		return nil, errEntityLocked
	}
	if aliasIndex == nil {
		return entity, nil
	}
	aliases, _ := entity["aliases"].([]any)
	if *aliasIndex < 0 || *aliasIndex >= len(aliases) {
		return nil, errAliasRange
	}
	alias, ok := aliases[*aliasIndex].(map[string]any)
	if !ok {
		return nil, errAliasRange
	}
	return alias, nil
}

// storedPronunciation is the holder's pronunciation, or nil when it has none (or one that is not an object).
func storedPronunciation(holder map[string]any) map[string]any {
	value, _ := holder["pronunciation"].(map[string]any)
	return value
}

// isManual is manuscript_guide.py _is_manual: the narrator typed it (source "manual", or the legacy "user").
func isManual(value map[string]any) bool {
	return value["source"] == ManualSource || value["source"] == legacyManualSource
}

// pronunciationCore is manuscript_guide.py _pronunciation_core: the fields that are the pronunciation itself.
func pronunciationCore(value map[string]any) map[string]any {
	core := map[string]any{}
	for _, field := range []string{"ipa", "source", "confidence"} {
		if item, present := value[field]; present {
			core[field] = item
		}
	}
	return core
}

// setPronunciation is manuscript_guide.py set_pronunciation over carry_pronunciation_work: next in use in place of prior, with prior's
// note. The alternate is the latest pronunciation of the other kind: prior itself when it is of the other kind and has an IPA,
// otherwise prior's alternate. A stored status, and any other field of prior, is not carried.
func setPronunciation(prior, next map[string]any) map[string]any {
	value := make(map[string]any, len(next)+2)
	for key, item := range next {
		value[key] = item
	}
	if truthy(prior["note"]) {
		value["note"] = prior["note"]
	}
	delete(value, "alternate")
	if truthy(prior["ipa"]) && isManual(prior) != isManual(next) {
		value["alternate"] = pronunciationCore(prior)
	} else if truthy(prior["alternate"]) {
		value["alternate"] = prior["alternate"]
	}
	return value
}

// pronounceUser is manuscript_guide.py pronounce_user after userPronunciation.
func pronounceUser(document map[string]any, id string, aliasIndex *int, value map[string]any) (bool, error) {
	holder, err := pronunciationHolder(document, id, aliasIndex)
	if err != nil {
		return false, err
	}
	next := maps.Clone(value)
	next["chosen"] = true
	holder["pronunciation"] = setPronunciation(storedPronunciation(holder), next)
	return true, nil
}

// useAlternate is manuscript_guide.py pronunciation_use_alternate. An alternate that is not an object is none.
func useAlternate(document map[string]any, id string, aliasIndex *int) (bool, error) {
	holder, err := pronunciationHolder(document, id, aliasIndex)
	if err != nil {
		return false, err
	}
	current := storedPronunciation(holder)
	alternate, ok := current["alternate"].(map[string]any)
	if !ok || len(alternate) == 0 {
		return false, errNoAlternate
	}
	next := pronunciationCore(alternate)
	next["chosen"] = true
	holder["pronunciation"] = setPronunciation(current, next)
	return true, nil
}
