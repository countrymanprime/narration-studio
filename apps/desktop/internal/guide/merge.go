package guide

import (
	"crypto/rand"
	"crypto/sha1" //nolint:gosec // G505: the entry id is a name's SHA-1 prefix, not a secret; manuscript_guide.py entity_id writes the same ids
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
)

// maxMergeUndo is manuscript_guide.py MAX_MERGE_UNDO: how many merges the file can take back, newest kept.
const maxMergeUndo = 10

// The sidecar's own words for a refusal, shown to the narrator.
var (
	errMergeSelf     = errors.New("Cannot merge an entity into itself.")            //nolint:staticcheck // the sidecar's own words
	errMergeLocked   = errors.New("Cannot merge a locked entity. Unlock it first.") //nolint:staticcheck // the sidecar's own words
	errMergeGone     = errors.New("That merge can no longer be undone.")            //nolint:staticcheck // the sidecar's own words
	errAliasNotFound = errors.New("Alias not found.")                               //nolint:staticcheck // the sidecar's own words
	errNameTaken     = errors.New("An entity with this name already exists.")       //nolint:staticcheck // the sidecar's own words
)

// normalizeName is manuscript_guide.py normalize_name: lower-cased (as Python does it), then everything outside a-z and 0-9 dropped.
func normalizeName(name string) string {
	var out strings.Builder
	for _, r := range pythonLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			out.WriteRune(r)
		}
	}
	return out.String()
}

// entityID is manuscript_guide.py entity_id: "entity-" and the first 12 hex digits of the SHA-1 of the normalized name.
func entityID(name string) string {
	sum := sha1.Sum([]byte(normalizeName(name))) //nolint:gosec // G401: an identifier, not a security measure
	return "entity-" + hex.EncodeToString(sum[:])[:12]
}

// newUndoID is os.urandom(8).hex(): 16 lowercase hexadecimal characters.
func newUndoID() string {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic(err) // crypto/rand does not fail on the platforms the app runs on
	}
	return hex.EncodeToString(raw[:])
}

// undoID is the id a merge stores its undo under; a test sets undoIDs to get a known one.
func (s *Service) undoID() string {
	if s.undoIDs != nil {
		return s.undoIDs()
	}
	return newUndoID()
}

// listOf is value as a list, or an empty one: what entity.get(key, []) is for a field that is a list or missing.
func listOf(value any) []any {
	list, _ := value.([]any)
	return list
}

// getOr is Python's dict.get(key, fallback): the fallback only when the key is missing, not when it holds null.
func getOr(m map[string]any, key string, fallback any) any {
	if value, ok := m[key]; ok {
		return value
	}
	return fallback
}

// numberOf is a decoded JSON number as a float, for ordering; anything else is zero.
func numberOf(value any) float64 {
	if number, ok := value.(json.Number); ok {
		f, _ := number.Float64()
		return f
	}
	return 0
}

// occurrenceCount is manuscript_guide.py entity_occurrence_count: the entry's own occurrences and every alias's.
func occurrenceCount(entity map[string]any) json.Number {
	count := len(listOf(entity["occurrences"]))
	for _, raw := range listOf(entity["aliases"]) {
		if alias, ok := raw.(map[string]any); ok {
			count += len(listOf(alias["occurrences"]))
		}
	}
	return json.Number(strconv.Itoa(count))
}

// sameValue is Python's == on two decoded values, as far as a Story Bible needs it (strings, lists, objects).
func sameValue(a, b any) bool { return pythonJSON(a) == pythonJSON(b) }

// dedupeEvidence is merge's dedupe_evidence: one item per chapter, paragraph and excerpt, the first kept, ordered by paragraph.
func dedupeEvidence(evidence []any) []any {
	seen := map[string]bool{}
	result := []any{}
	for _, raw := range evidence {
		if item, ok := raw.(map[string]any); ok {
			key := pythonJSON([]any{getOr(item, "chapter", ""), getOr(item, "paragraph", json.Number("-1")), getOr(item, "excerpt", "")})
			if seen[key] {
				continue
			}
			seen[key] = true
		}
		result = append(result, raw)
	}
	paragraph := func(raw any) float64 {
		item, _ := raw.(map[string]any)
		return numberOf(item["paragraph"])
	}
	slices.SortStableFunc(result, func(a, b any) int {
		switch pa, pb := paragraph(a), paragraph(b); {
		case pa < pb:
			return -1
		case pa > pb:
			return 1
		}
		return 0
	})
	return result
}

// mergeAppearances is manuscript_guide.py merge_appearances: one appearance per chapter and scene, the first kept, ordered by chapter
// and scene.
func mergeAppearances(groups ...[]any) []any {
	type position struct {
		chapter string
		scene   float64
	}
	at := func(raw any) position {
		item, _ := raw.(map[string]any)
		chapter, _ := item["chapterId"].(string)
		return position{chapter, numberOf(item["sceneIndex"])}
	}
	seen := map[position]bool{}
	merged := []any{}
	for _, group := range groups {
		for _, item := range group {
			if key := at(item); !seen[key] {
				seen[key] = true
				merged = append(merged, item)
			}
		}
	}
	slices.SortStableFunc(merged, func(a, b any) int {
		pa, pb := at(a), at(b)
		switch {
		case pa.chapter < pb.chapter:
			return -1
		case pa.chapter > pb.chapter:
			return 1
		case pa.scene < pb.scene:
			return -1
		case pa.scene > pb.scene:
			return 1
		}
		return 0
	})
	return merged
}

// propertyKey is the casefolded key of a property, and whether it has one.
func propertyKey(raw any) (string, bool) {
	item, ok := raw.(map[string]any)
	if !ok {
		return "", false
	}
	key, ok := item["key"].(string)
	return foldCase(key), ok
}

// mergeProperties is merge's property step: the target's own, then the source's whose key (compared as casefold) the target lacks.
func mergeProperties(target, source map[string]any) []any {
	own := listOf(target["properties"])
	keys := map[string]bool{}
	for _, raw := range own {
		if key, ok := propertyKey(raw); ok {
			keys[key] = true
		}
	}
	merged := slices.Clone(own)
	for _, raw := range listOf(source["properties"]) {
		if key, ok := propertyKey(raw); !ok || !keys[key] {
			merged = append(merged, raw)
		}
	}
	if merged == nil {
		merged = []any{}
	}
	return merged
}

// mergeEntities is manuscript_guide.py merge: the source's name, aliases and pronunciations become aliases of the target, their
// evidence, appearances, relationships, description, notes, properties, review flags and speaker colour are folded in, every other entry's
// relationships to the source are pointed at the target, and the source goes. The names it absorbed are recorded so the next build does
// not bring it back, and what the merge changed is stored in the file under the id newUndoID makes, as unmergeEntities reads it. The target may be locked;
// the source may not.
func mergeEntities(document map[string]any, sourceID, targetID string, newUndoID func() string) (bool, error) {
	if sourceID == targetID {
		return false, errMergeSelf
	}
	sourceIndex, source, err := findEntity(document, sourceID)
	if err != nil {
		return false, err
	}
	targetIndex, target, err := findEntity(document, targetID)
	if err != nil {
		return false, err
	}
	if truthy(source["locked"]) {
		return false, errMergeLocked
	}

	// What the merge is about to change, before it changes anything (_merge_snapshot); the undo keeps only what it did change.
	entities := listOf(document["entities"])
	_, hadAbsorbedNames := document["absorbed_names"]
	type neighbour struct {
		id     string
		name   any
		before any
	}
	var neighbours []neighbour
	for index, raw := range entities {
		if other, ok := raw.(map[string]any); ok && index != sourceIndex && index != targetIndex {
			id, _ := other["id"].(string)
			neighbours = append(neighbours, neighbour{id, getOr(other, "canonical_name", other["id"]), deepCopy(getOr(other, "relationships", []any{}))})
		}
	}
	savedSource, savedTarget := deepCopy(source), deepCopy(target)
	absorbedBefore := map[string]any{}

	// The source's own name becomes an alias of the target, carrying its pronunciation and evidence; its aliases merge in the same way,
	// each keeping its own occurrences.
	aliases := listOf(target["aliases"])
	if aliases == nil {
		aliases = []any{}
	}
	existing := map[string]map[string]any{}
	canonical, _ := target["canonical_name"].(string)
	existing[pythonLower(canonical)] = nil
	for _, raw := range aliases {
		if alias, ok := raw.(map[string]any); ok {
			text, _ := alias["text"].(string)
			existing[pythonLower(text)] = alias
		}
	}
	candidates := []map[string]any{{
		"text": source["canonical_name"], "pronunciation": getOr(source, "pronunciation", map[string]any{}), "occurrences": getOr(source, "occurrences", []any{}),
	}}
	for _, raw := range listOf(source["aliases"]) {
		if alias, ok := raw.(map[string]any); ok {
			candidates = append(candidates, alias)
		}
	}
	for _, candidate := range candidates {
		text, _ := candidate["text"].(string)
		key := pythonLower(text)
		found, known := existing[key]
		switch {
		case found != nil:
			joined := append(slices.Clone(listOf(found["occurrences"])), listOf(candidate["occurrences"])...)
			found["occurrences"] = dedupeEvidence(joined)
		case !known:
			alias := map[string]any{
				"text": candidate["text"], "pronunciation": getOr(candidate, "pronunciation", map[string]any{}), "occurrences": getOr(candidate, "occurrences", []any{}),
			}
			aliases = append(aliases, alias)
			existing[key] = alias
		}
	}
	target["aliases"] = aliases
	target["occurrence_count"] = occurrenceCount(target)
	target["appearances"] = mergeAppearances(listOf(target["appearances"]), listOf(source["appearances"]))

	seenRelationships := map[string]bool{}
	merged := []any{}
	for _, raw := range append(slices.Clone(listOf(target["relationships"])), listOf(source["relationships"])...) {
		rel, _ := raw.(map[string]any)
		if rel["id"] == sourceID || rel["id"] == targetID {
			continue
		}
		key := pythonJSON([]any{rel["id"], rel["label"]})
		if seenRelationships[key] {
			continue
		}
		seenRelationships[key] = true
		merged = append(merged, raw)
	}
	target["relationships"] = merged

	text := func(entity map[string]any) any {
		description, _ := entity["description"].(map[string]any)
		return description["text"]
	}
	if !truthy(text(target)) && truthy(text(source)) {
		target["description"] = source["description"]
	}
	if !truthy(target["personality_notes"]) && truthy(source["personality_notes"]) {
		target["personality_notes"] = source["personality_notes"]
	}
	target["properties"] = mergeProperties(target, source)
	// Flagged if either was, with the name flags of both that the target now has; the target's colour, else the source's.
	targetEntry, targetFlags := entityReview(target)
	sourceEntry, sourceFlags := entityReview(source)
	setReview(target, targetEntry || sourceEntry, append(slices.Clone(targetFlags), sourceFlags...))
	if !truthy(target["speaker_color"]) && truthy(source["speaker_color"]) {
		target["speaker_color"] = source["speaker_color"]
	}

	for index, raw := range entities {
		other, ok := raw.(map[string]any)
		if !ok || index == sourceIndex || index == targetIndex {
			continue
		}
		remapped := []any{}
		seen := map[string]bool{}
		for _, item := range listOf(other["relationships"]) {
			rel, _ := item.(map[string]any)
			ref := rel["id"]
			if rel["id"] == sourceID {
				ref = targetID
			}
			if sameValue(ref, other["id"]) {
				continue
			}
			name := rel["name"]
			if ref == targetID {
				name = target["canonical_name"]
			}
			key := pythonJSON([]any{ref, rel["label"]})
			if seen[key] {
				continue
			}
			seen[key] = true
			remapped = append(remapped, map[string]any{"id": ref, "name": name, "label": rel["label"]})
		}
		other["relationships"] = remapped
	}

	kept := make([]any, 0, len(entities))
	for _, raw := range entities {
		if entity, ok := raw.(map[string]any); !ok || entity["id"] != sourceID {
			kept = append(kept, raw)
		}
	}
	document["entities"] = kept

	// The names absorbed are recorded, so the next build does not bring the source back as an entry of its own (merge_locked's redirect).
	absorbed, ok := document["absorbed_names"].(map[string]any)
	if !ok {
		absorbed = map[string]any{}
		document["absorbed_names"] = absorbed
	}
	names := []string{}
	if name, ok := source["canonical_name"].(string); ok {
		names = append(names, name)
	}
	for _, raw := range listOf(source["aliases"]) {
		if alias, ok := raw.(map[string]any); ok {
			name, _ := alias["text"].(string)
			names = append(names, name)
		}
	}
	for _, name := range names {
		key := normalizeName(name)
		if _, recorded := absorbedBefore[key]; !recorded {
			absorbedBefore[key] = getOr(absorbed, key, nil)
		}
		absorbed[key] = targetID
	}

	// The undo (_record_merge_undo): each entry it would overwrite is stored with a fingerprint of how the merge left it.
	byID := map[string]map[string]any{}
	for _, raw := range kept {
		if entity, ok := raw.(map[string]any); ok {
			id, _ := entity["id"].(string)
			byID[id] = entity
		}
	}
	changed := []any{}
	for _, saved := range neighbours {
		after := getOr(byID[saved.id], "relationships", []any{})
		if !sameValue(after, saved.before) {
			changed = append(changed, map[string]any{"id": saved.id, "name": saved.name, "before": saved.before, "after": fingerprint(after)})
		}
	}
	records := append(slices.Clone(listOf(document["merge_undo"])), map[string]any{
		"id":                 newUndoID(),
		"source_index":       json.Number(strconv.Itoa(sourceIndex)),
		"source":             savedSource,
		"target":             savedTarget,
		"target_after":       fingerprint(target),
		"relationships":      changed,
		"had_absorbed_names": hadAbsorbedNames,
		"absorbed_names":     absorbedBefore,
	})
	document["merge_undo"] = records[max(0, len(records)-maxMergeUndo):]
	return true, nil
}

// unmergeEntities is manuscript_guide.py unmerge: the merge stored under undoID taken back, with both entries as they were, the source
// in its place, every relationship the merge pointed elsewhere and every absorbed name it set. It refuses, writing nothing, when the
// target or a re-pointed entry changed since (by fingerprint), when an entry has the source's id again, or when the file no longer holds
// the merge (taken back already, a rebuild since, or more than maxMergeUndo newer merges).
func unmergeEntities(document map[string]any, undoID string) (bool, error) {
	records := listOf(document["merge_undo"])
	recordIndex := slices.IndexFunc(records, func(raw any) bool {
		record, _ := raw.(map[string]any)
		return record["id"] == undoID
	})
	if recordIndex < 0 {
		return false, errMergeGone
	}
	record, _ := records[recordIndex].(map[string]any)
	source, _ := record["source"].(map[string]any)
	savedTarget, _ := record["target"].(map[string]any)
	entities := listOf(document["entities"])
	targetIndex := slices.IndexFunc(entities, func(raw any) bool { return idOf(raw) == savedTarget["id"] })
	if targetIndex < 0 {
		return false, fmt.Errorf("%v is no longer in the Story Bible, so the merge cannot be undone.", savedTarget["canonical_name"]) //nolint:staticcheck // the sidecar's own words
	}
	if fingerprint(entities[targetIndex]) != record["target_after"] {
		return false, fmt.Errorf("%v changed after the merge, so it cannot be undone.", savedTarget["canonical_name"]) //nolint:staticcheck // the sidecar's own words
	}
	if slices.ContainsFunc(entities, func(raw any) bool { return idOf(raw) == source["id"] }) {
		return false, fmt.Errorf("An entry named %v is in the Story Bible again, so the merge cannot be undone.", source["canonical_name"]) //nolint:staticcheck // the sidecar's own words
	}
	byID := map[string]map[string]any{}
	for _, raw := range entities {
		if entity, ok := raw.(map[string]any); ok {
			id, _ := entity["id"].(string)
			byID[id] = entity
		}
	}
	saved := listOf(record["relationships"])
	for _, raw := range saved {
		item, _ := raw.(map[string]any)
		id, _ := item["id"].(string)
		other, found := byID[id]
		if !found || fingerprint(getOr(other, "relationships", []any{})) != item["after"] {
			return false, fmt.Errorf("%v's relationships changed after the merge, so it cannot be undone.", item["name"]) //nolint:staticcheck // the sidecar's own words
		}
	}

	entities[targetIndex] = savedTarget
	place := min(int(numberOf(record["source_index"])), len(entities))
	entities = slices.Insert(entities, place, any(source))
	document["entities"] = entities
	for _, raw := range saved {
		item, _ := raw.(map[string]any)
		id, _ := item["id"].(string)
		byID[id]["relationships"] = item["before"]
	}
	absorbed, ok := document["absorbed_names"].(map[string]any)
	if !ok {
		absorbed = map[string]any{}
		document["absorbed_names"] = absorbed
	}
	if names, ok := record["absorbed_names"].(map[string]any); ok {
		for key, value := range names {
			if value == nil {
				delete(absorbed, key)
			} else {
				absorbed[key] = value
			}
		}
	}
	if len(absorbed) == 0 && !truthy(record["had_absorbed_names"]) {
		delete(document, "absorbed_names")
	}
	remaining := slices.Delete(slices.Clone(records), recordIndex, recordIndex+1)
	if len(remaining) == 0 {
		delete(document, "merge_undo")
	} else {
		document["merge_undo"] = remaining
	}
	return true, nil
}

// splitAlias is manuscript_guide.py split, the inverse of a merge: one of the entry's aliases becomes an entry of its own again, with
// that alias's evidence and pronunciation, in the same type, and without the absorbed-name record that would make the next build fold
// it straight back. It answers the new entry's id.
func splitAlias(document map[string]any, id, aliasText string) (string, error) {
	_, entity, err := findEntity(document, id)
	if err != nil {
		return "", err
	}
	if truthy(entity["locked"]) {
		return "", errEntityLocked
	}
	wanted := pythonLower(pythonStrip(aliasText))
	aliases := listOf(entity["aliases"])
	match := slices.IndexFunc(aliases, func(raw any) bool {
		alias, _ := raw.(map[string]any)
		text, _ := alias["text"].(string)
		return pythonLower(text) == wanted
	})
	if match < 0 {
		return "", errAliasNotFound
	}
	entry, flagged := entityReview(entity)
	alias, _ := aliases[match].(map[string]any)
	entity["aliases"] = slices.Delete(slices.Clone(aliases), match, match+1)
	text, _ := alias["text"].(string)
	newID := entityID(text)
	entities := listOf(document["entities"])
	if slices.ContainsFunc(entities, func(raw any) bool { return idOf(raw) == newID }) {
		return "", errNameTaken
	}
	needsReview := slices.Contains(flagged, text)
	state := "reviewed"
	if needsReview {
		state = "needs review"
	}
	created := map[string]any{
		"id":                newID,
		"canonical_name":    alias["text"],
		"aliases":           []any{},
		"category":          getOr(entity, "category", "Needs Review"),
		"occurrences":       getOr(alias, "occurrences", []any{}),
		"pronunciation":     getOr(alias, "pronunciation", map[string]any{}),
		"description":       map[string]any{"text": "", "evidence": map[string]any{}},
		"personality_notes": []any{},
		"context":           "",
		"relationships":     []any{},
		"properties":        []any{},
		"locked":            false,
		"manual":            false,
		"review_state":      state,
		// A name that needed review gives its flag back to the entry it becomes.
		"review":      map[string]any{"entry": needsReview, "aliases": []any{}},
		"appearances": []any{},
	}
	setReview(entity, entry, flagged)
	created["occurrence_count"] = occurrenceCount(created)
	entity["occurrence_count"] = occurrenceCount(entity)
	document["entities"] = append(slices.Clone(entities), created)
	if absorbed, ok := document["absorbed_names"].(map[string]any); ok {
		delete(absorbed, normalizeName(text))
	} else {
		document["absorbed_names"] = map[string]any{}
	}
	return newID, nil
}

func idOf(raw any) any {
	entity, _ := raw.(map[string]any)
	return entity["id"]
}
