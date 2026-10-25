package guide

import (
	"errors"
	"math/big"
	"slices"
	"strings"

	"desktop/internal/compare"
)

// This file is the second half of the Story Bible build (build.go): manuscript_guide.py guide_types, file_under_types, merge_locked
// (with carry_pronunciation_work, entity_name_keys, entity_review, entity_properties and entity_occurrence_count), vocabulary_candidates
// and is_vocabulary_worthy, which #2251 step 3 moved here and deleted. The previous file is read as load_json read it (pyLoadBible), so
// every entry a build keeps is written back as it was. Where the sidecar crashed on a value of the wrong type (a KeyError, TypeError
// or AttributeError) this refuses with errBuildShape; where it refused, it refuses in its words. Two places hung on the order Python's
// set gave, which changes with the process's hash seed: the names a rebuilt entry tries in turn for a saved entry's id, and the order of
// two vocabulary candidates that differ only in case. Here the first is the name and then each alias in order, and the second is code
// point order; tests/fixtures/guide-build marks the cases where Python's own answer depended on it (ambiguous).

// errBuildShape is the host's refusal where the sidecar's build crashed on a value of the wrong type in the previous Story Bible.
var errBuildShape = errors.New("The Story Bible holds a value the build cannot read.") //nolint:staticcheck // shown to the narrator

// systemCategoryNames are manuscript_guide.py SYSTEM_CATEGORIES.
var systemCategoryNames = wordSet("Needs Review", "Draft")

// defaultTypeRows is manuscript_guide.py DEFAULT_TYPES as guide_types copies it: name, colour, speaks and builtin, Character alone
// speaking.
func defaultTypeRows() []*pyObject {
	rows := make([]*pyObject, len(defaultTypeNames))
	for i, name := range defaultTypeNames {
		rows[i] = newPyObject("name", name, "colour", typeColours[i], "speaks", name == categoryCharacter, "builtin", name)
	}
	return rows
}

// defaultTypeNames are the names of DEFAULT_TYPES, in order, each with the colour of typeColours at its index.
var defaultTypeNames = []string{"Character", "Place", "Organization", "Lore", "Item", "Event"}

// buildTypes is manuscript_guide.py guide_types(previous or {}): the stored rows, each copied with only its name, colour, speaks and
// builtin, or the default rows for a file without types. A list that is not a non-empty list of rows with a name, a palette colour and
// a speaks flag is errStoryBibleTypes, the sidecar's own words.
func buildTypes(previous any) ([]*pyObject, error) {
	if !pyTruthy(previous) {
		return defaultTypeRows(), nil
	}
	document, ok := previous.(*pyObject)
	if !ok {
		return nil, errBuildShape // guide.get on a list, a string or a number
	}
	stored, _ := document.get("types")
	if stored == nil {
		return defaultTypeRows(), nil
	}
	list, ok := stored.([]any)
	if !ok || len(list) == 0 {
		return nil, errStoryBibleTypes
	}
	seen := map[string]bool{}
	rows := make([]*pyObject, 0, len(list))
	for _, item := range list {
		row, ok := item.(*pyObject)
		if !ok {
			return nil, errStoryBibleTypes
		}
		name, isText := row.values["name"].(string)
		colour, _ := row.values["colour"].(string)
		_, isBool := row.values["speaks"].(bool)
		if !isText || compare.PyStrip(name) == "" || seen[foldCase(name)] || !slices.Contains(typeColours, colour) || !isBool {
			return nil, errStoryBibleTypes
		}
		seen[foldCase(name)] = true
		copied := newPyObject()
		for _, key := range []string{"name", "colour", "speaks", "builtin"} {
			if value, ok := row.values[key]; ok {
				copied.set(key, value)
			}
		}
		rows = append(rows, copied)
	}
	return rows, nil
}

// fileUnderTypes is manuscript_guide.py file_under_types: a fresh entry whose category's type was renamed takes the new name, and one
// whose type was removed becomes Needs Review, flagged, so a rebuild never brings back a type the narrator took away. A builtin that is
// a list or an object is errBuildShape, as the sidecar crashed on it.
func fileUnderTypes(entities []freshEntity, types []*pyObject) error {
	names := map[string]bool{}
	renamed := map[string]string{}
	for _, row := range types {
		names[row.values["name"].(string)] = true
	}
	for _, row := range types {
		builtin := row.values["builtin"]
		if !pyTruthy(builtin) {
			continue
		}
		key, err := buildKey(builtin)
		if err != nil {
			return errBuildShape
		}
		renamed[key] = row.values["name"].(string)
	}
	for _, fresh := range entities {
		entity := fresh.object
		category := entity.values["category"].(string)
		if systemCategoryNames[category] {
			continue
		}
		if target, ok := renamed["S"+category]; ok {
			entity.set("category", target)
			continue
		}
		if names[category] {
			continue
		}
		entity.set("category", categoryNeedsReview)
		entity.set("review_state", "needs review")
		review := copyObject(entity.values["review"].(*pyObject))
		review.set("entry", true)
		entity.set("review", review)
	}
	return nil
}

// copyObject is dict(object): the same keys in the same order, holding the same values.
func copyObject(object *pyObject) *pyObject {
	out := &pyObject{keys: slices.Clone(object.keys), values: make(map[string]any, len(object.values))}
	for key, value := range object.values {
		out.values[key] = value
	}
	return out
}

// pyDict is a Python dict keyed by pyKey: its keys in the order they were first set, the key value set first, and the last value.
type pyDict struct {
	keys   []string
	first  map[string]any
	values map[string]*pyObject
}

func (d *pyDict) set(key string, keyValue any, value *pyObject) {
	if _, ok := d.values[key]; !ok {
		d.keys = append(d.keys, key)
		d.first[key] = keyValue
	}
	d.values[key] = value
}

// buildNameKeys is manuscript_guide.py entity_name_keys: the entry's normalized name and alias texts, without the empty one, the name
// first and then the aliases in order. A name or an alias text that is not text, or aliases that are not a list of objects, are
// errBuildShape.
func buildNameKeys(entity *pyObject) ([]string, error) {
	name, _ := pyGet(entity, "canonical_name", "")
	text, ok := name.(string)
	if !ok {
		return nil, errBuildShape
	}
	keys := []string{normalizeName(text)}
	aliases, _ := pyGet(entity, "aliases", []any{})
	if pyTruthy(aliases) {
		walked, err := pyIter(aliases)
		if err != nil {
			return nil, errBuildShape
		}
		for _, alias := range walked {
			value, err := pyGet(alias, "text", "")
			text, ok := value.(string)
			if err != nil || !ok {
				return nil, errBuildShape
			}
			keys = append(keys, normalizeName(text))
		}
	}
	out := []string{}
	for _, key := range keys {
		if key != "" && !slices.Contains(out, key) {
			out = append(out, key)
		}
	}
	return out, nil
}

// pyLen is len(value) for a list, a string (its code points) or an object (its keys); anything else is errBuildShape.
func pyLen(value any) (int, error) {
	switch v := value.(type) {
	case []any:
		return len(v), nil
	case string:
		return len([]rune(v)), nil
	case *pyObject:
		return len(v.keys), nil
	}
	return 0, errBuildShape
}

// lowerText is value.lower() for text; anything else is errBuildShape.
func lowerText(value any) (string, error) {
	text, ok := value.(string)
	if !ok {
		return "", errBuildShape
	}
	return compare.PyLower(text), nil
}

// aliasObjects is `for alias in entity.get("aliases", [])` where each alias is indexed or asked for a key: the aliases, each an object,
// or errBuildShape where the sidecar crashed (no list, or an alias that is not an object).
func aliasObjects(entity *pyObject) ([]*pyObject, error) {
	value, _ := pyGet(entity, "aliases", []any{})
	walked, err := pyIter(value)
	if err != nil {
		return nil, errBuildShape
	}
	out := make([]*pyObject, len(walked))
	for i, item := range walked {
		alias, ok := item.(*pyObject)
		if !ok {
			return nil, errBuildShape
		}
		out[i] = alias
	}
	return out, nil
}

// occurrenceCountOf is manuscript_guide.py entity_occurrence_count: the entry's own occurrences and each alias's.
func occurrenceCountOf(entity *pyObject) (int, error) {
	own, _ := pyGet(entity, "occurrences", []any{})
	count, err := pyLen(own)
	if err != nil {
		return 0, err
	}
	aliases, err := aliasObjects(entity)
	if err != nil {
		return 0, err
	}
	for _, alias := range aliases {
		occurrences, _ := pyGet(alias, "occurrences", []any{})
		n, err := pyLen(occurrences)
		if err != nil {
			return 0, err
		}
		count += n
	}
	return count, nil
}

// reviewOf is manuscript_guide.py entity_review: the entry flag and the alias texts still flagged that the entry has, once each.
func reviewOf(entity *pyObject) (*pyObject, error) {
	stored, ok := entity.values["review"].(*pyObject)
	if !ok {
		state, _ := entity.get("review_state")
		return newPyObject("entry", pyEqual(state, "needs review"), "aliases", []any{}), nil
	}
	names := map[string]bool{}
	aliases, err := aliasObjects(entity)
	if err != nil {
		return nil, err
	}
	for _, alias := range aliases {
		text, ok := alias.get("text")
		if !ok {
			return nil, errBuildShape
		}
		if key, ok := text.(string); ok {
			names[key] = true
		} else if _, err := buildKey(text); err != nil {
			return nil, errBuildShape
		}
	}
	flagged := []any{}
	if list, _ := stored.get("aliases"); pyTruthy(list) {
		walked, err := pyIter(list)
		if err != nil {
			return nil, errBuildShape
		}
		for _, item := range walked {
			if text, ok := item.(string); ok && names[text] && !slices.Contains(flagged, any(text)) {
				flagged = append(flagged, text)
			}
		}
	}
	entry, _ := stored.get("entry")
	return newPyObject("entry", pyTruthy(entry), "aliases", flagged), nil
}

// carryPronunciation is manuscript_guide.py carry_pronunciation_work: fresh, with the narrator's note and alternate from prior, the
// pronunciation it replaces.
func carryPronunciation(prior *pyObject, fresh *pyObject) *pyObject {
	value := copyObject(fresh)
	if note, _ := prior.get("note"); pyTruthy(note) {
		value.set("note", note)
	}
	if alternate, _ := prior.get("alternate"); pyTruthy(alternate) {
		if _, has := value.values["alternate"]; !has {
			value.set("alternate", alternate)
		}
	}
	return value
}

// pronunciationOrEmpty is `holder.get("pronunciation") or {}` for a fresh entry or alias, whose pronunciation is an object.
func pronunciationOrEmpty(holder *pyObject) *pyObject {
	if value, ok := holder.values["pronunciation"].(*pyObject); ok && len(value.keys) > 0 {
		return value
	}
	return newPyObject()
}

// keptPronunciation is the rebuild's choice for one name: the saved pronunciation when the narrator chose it, else the fresh one with
// the narrator's note and alternate. nil when nothing was saved. A saved value that is not an object is errBuildShape.
func keptPronunciation(saved any, fresh *pyObject) (*pyObject, error) {
	if !pyTruthy(saved) {
		return nil, nil
	}
	prior, ok := saved.(*pyObject)
	if !ok {
		return nil, errBuildShape // .get on a string, a list, a number or true
	}
	if chosen, _ := prior.get("chosen"); pyTruthy(chosen) {
		return prior, nil
	}
	return carryPronunciation(prior, pronunciationOrEmpty(fresh)), nil
}

// mergeLocked is manuscript_guide.py merge_locked: the fresh entries, each taking back the saved entry it shares a name with (its id, the
// narrator's fields, aliases and pronunciation choices), a locked or hand-made one kept as it was instead; the locked and hand-made
// entries no fresh one found; and a fresh entry whose name a merge absorbed folded into its target as aliases.
func mergeLocked(generated []freshEntity, old any) ([]any, error) {
	fresh := make([]*pyObject, len(generated))
	for i, entity := range generated {
		fresh[i] = entity.object
	}
	if !pyTruthy(old) {
		return objectsOf(fresh), nil
	}
	document := old.(*pyObject) // buildTypes refused anything else
	entitiesValue, _ := pyGet(document, "entities", []any{})
	walked, err := pyIter(entitiesValue)
	if err != nil {
		return nil, errBuildShape
	}
	previous := &pyDict{first: map[string]any{}, values: map[string]*pyObject{}}
	for _, item := range walked {
		entity, ok := item.(*pyObject)
		if !ok {
			return nil, errBuildShape
		}
		id, ok := entity.get("id")
		if !ok {
			return nil, errBuildShape
		}
		key, err := buildKey(id)
		if err != nil {
			return nil, errBuildShape
		}
		previous.set(key, id, entity)
	}
	absorbed, _ := pyGet(document, "absorbed_names", newPyObject())
	byNameKey := map[string]string{}
	for _, key := range previous.keys {
		names, err := buildNameKeys(previous.values[key])
		if err != nil {
			return nil, err
		}
		for _, name := range names {
			if _, taken := byNameKey[name]; !taken {
				byNameKey[name] = key
			}
		}
	}

	// A fresh entry whose name a merge absorbed folds into its target (an entry of the file, or another fresh one).
	var redirectKeys []string
	redirected := map[string][]*pyObject{}
	standalone := make([]*pyObject, 0, len(fresh))
	for _, entity := range fresh {
		names, ok := absorbed.(*pyObject)
		if !ok {
			return nil, errBuildShape // .get on a list, a string or a number
		}
		target := names.values[normalizeName(entity.values["canonical_name"].(string))]
		if pyTruthy(target) && !pyEqual(target, entity.values["id"]) {
			key, err := buildKey(target)
			if err != nil {
				return nil, errBuildShape // `target_id in previous`
			}
			_, known := previous.values[key]
			if !known {
				known = slices.ContainsFunc(fresh, func(e *pyObject) bool { return pyEqual(e.values["id"], target) })
			}
			if known {
				if _, ok := redirected[key]; !ok {
					redirectKeys = append(redirectKeys, key)
				}
				redirected[key] = append(redirected[key], entity)
				continue
			}
		}
		standalone = append(standalone, entity)
	}

	merged := []*pyObject{}
	seen := map[string]bool{}
	claimed := map[string]bool{}
	for _, entity := range standalone {
		idKey, _ := buildKey(entity.values["id"])
		prior := previous.values[idKey]
		if prior != nil {
			claimed[idKey] = true
		} else {
			names, _ := buildNameKeys(entity)
			for _, name := range names {
				if key, ok := byNameKey[name]; ok && previous.first[key] != nil && !claimed[key] {
					prior, idKey = previous.values[key], key
					claimed[key] = true
					entity.set("id", previous.first[key]) // the saved id, though the spelling the build picked moved
					break
				}
			}
		}
		if prior != nil {
			locked, _ := prior.get("locked")
			manual, _ := prior.get("manual")
			if pyTruthy(locked) || pyTruthy(manual) {
				merged = append(merged, prior)
				seen[idKey] = true
				continue
			}
			if err := takeBack(entity, prior); err != nil {
				return nil, err
			}
		}
		merged = append(merged, entity)
		seen[idKey] = true
	}
	for _, key := range previous.keys {
		prior := previous.values[key]
		locked, _ := prior.get("locked")
		manual, _ := prior.get("manual")
		if (pyTruthy(locked) || pyTruthy(manual)) && !seen[key] {
			merged = append(merged, prior)
			seen[key] = true
		}
	}
	if len(redirectKeys) > 0 {
		if err := foldAbsorbed(merged, redirectKeys, redirected); err != nil {
			return nil, err
		}
	}
	return objectsOf(merged), nil
}

// takeBack is the part of merge_locked that gives a fresh entry what is the narrator's in the saved one it matched: the description,
// notes and context where the build found none, the relationships, properties, review flags and speaker colour, the pronunciations they
// chose (or the note and alternate of those they did not), and every alias the build did not find again.
func takeBack(entity, prior *pyObject) error {
	for _, field := range []string{"description", "personality_notes", "context"} {
		if value, _ := prior.get(field); pyTruthy(value) && !pyTruthy(entity.values[field]) {
			entity.set(field, value)
		}
	}
	relationships, ok := prior.get("relationships")
	if !ok {
		relationships = []any{}
	}
	entity.set("relationships", relationships)
	if properties, ok := prior.values["properties"].([]any); ok {
		entity.set("properties", properties)
	} else {
		entity.set("properties", []any{})
	}
	if review, ok := prior.values["review"].(*pyObject); ok {
		entity.set("review", review)
	}
	if color, _ := prior.get("speaker_color"); pyTruthy(color) {
		entity.set("speaker_color", color)
	}
	saved, _ := prior.get("pronunciation")
	kept, err := keptPronunciation(saved, entity)
	if err != nil {
		return err
	}
	if kept != nil {
		entity.set("pronunciation", kept)
	}
	priorAliasesValue, ok := prior.get("aliases")
	if !ok {
		priorAliasesValue = []any{}
	}
	priorAliases, err := pyIter(priorAliasesValue)
	if err != nil {
		return errBuildShape
	}
	byText := map[string]*pyObject{}
	for _, item := range priorAliases {
		alias, ok := item.(*pyObject)
		if !ok {
			continue
		}
		text, ok := alias.get("text")
		if !ok {
			return errBuildShape
		}
		lower, err := lowerText(text)
		if err != nil {
			return err
		}
		byText[lower] = alias
	}
	aliases := entity.values["aliases"].([]any)
	texts := map[string]bool{}
	for _, item := range aliases {
		alias := item.(*pyObject)
		lower := compare.PyLower(alias.values["text"].(string))
		texts[lower] = true
		priorAlias := byText[lower]
		if priorAlias == nil {
			continue
		}
		saved, _ := priorAlias.get("pronunciation")
		kept, err := keptPronunciation(saved, alias)
		if err != nil {
			return err
		}
		if kept != nil {
			alias.set("pronunciation", kept)
		}
	}
	for _, item := range priorAliases {
		alias, ok := item.(*pyObject)
		if !ok {
			return errBuildShape // alias["text"] on a string
		}
		lower, _ := lowerText(alias.values["text"]) // read above
		if !texts[lower] {
			aliases = append(aliases, alias)
			texts[lower] = true
		}
	}
	entity.set("aliases", aliases)
	count, err := occurrenceCountOf(entity)
	if err != nil {
		return err
	}
	entity.set("occurrence_count", count)
	review, err := reviewOf(entity)
	if err != nil {
		return err
	}
	entity.set("review", review)
	return nil
}

// foldAbsorbed is the end of merge_locked: each fresh entry a merge absorbed becomes aliases of its target, its name first and then its
// own aliases, each name the target does not already have.
func foldAbsorbed(merged []*pyObject, keys []string, redirected map[string][]*pyObject) error {
	byID := map[string]*pyObject{}
	for _, entity := range merged {
		key, _ := buildKey(entity.values["id"])
		byID[key] = entity
	}
	for _, key := range keys {
		target := byID[key]
		if target == nil {
			continue
		}
		aliases, err := aliasObjects(target)
		if err != nil {
			return err
		}
		existing := map[string]bool{}
		for _, alias := range aliases {
			text, ok := alias.get("text")
			if !ok {
				return errBuildShape
			}
			lower, err := lowerText(text)
			if err != nil {
				return err
			}
			existing[lower] = true
		}
		name, ok := target.get("canonical_name")
		if !ok {
			return errBuildShape
		}
		lower, err := lowerText(name)
		if err != nil {
			return err
		}
		existing[lower] = true
		for _, entity := range redirected[key] {
			pronunciation, ok := entity.get("pronunciation")
			if !ok {
				pronunciation = newPyObject()
			}
			candidates := []*pyObject{newPyObject("text", entity.values["canonical_name"], "pronunciation", pronunciation, "occurrences", entity.values["occurrences"])}
			for _, alias := range entity.values["aliases"].([]any) {
				candidates = append(candidates, alias.(*pyObject))
			}
			for _, candidate := range candidates {
				lower := compare.PyLower(candidate.values["text"].(string))
				if existing[lower] {
					continue
				}
				value, has := target.get("aliases")
				if !has {
					value = []any{}
				}
				list, ok := value.([]any)
				if !ok {
					return errBuildShape // .append on a string or an object
				}
				target.set("aliases", append(list, candidate))
				existing[lower] = true
			}
		}
		count, err := occurrenceCountOf(target)
		if err != nil {
			return err
		}
		target.set("occurrence_count", count)
	}
	return nil
}

func objectsOf(entities []*pyObject) []any {
	out := make([]any, len(entities))
	for i, entity := range entities {
		out[i] = entity
	}
	return out
}

// vocabularyWorthyEntity is manuscript_guide.py is_vocabulary_worthy: Needs Review entries stay out, locked and hand-made ones are in,
// a name of more than one word is in, and a lone word needs three occurrences.
func vocabularyWorthyEntity(entity *pyObject) (bool, error) {
	if category, _ := entity.get("category"); pyEqual(category, categoryNeedsReview) {
		return false, nil
	}
	locked, _ := entity.get("locked")
	manual, _ := entity.get("manual")
	if pyTruthy(locked) || pyTruthy(manual) {
		return true, nil
	}
	name, _ := pyGet(entity, "canonical_name", "")
	text, ok := name.(string)
	if !ok {
		return false, errBuildShape
	}
	if len(compare.PySplit(text)) > 1 {
		return true, nil
	}
	count, _ := entity.get("occurrence_count")
	if count == nil {
		n, err := occurrenceCountOf(entity)
		if err != nil {
			return false, err
		}
		return n >= minSingleWordVocabularyOccurrences, nil
	}
	if n, ok := count.(int); ok {
		return n >= minSingleWordVocabularyOccurrences, nil
	}
	value, ok := pyNumber(count)
	if !ok {
		return false, errBuildShape // a comparison of text, a list or an object with an int
	}
	return value != nil && value.Cmp(pyNumberOfInt(minSingleWordVocabularyOccurrences)) >= 0, nil
}

// vocabularyFromEntities is manuscript_guide.py vocabulary_candidates: the names and alias texts of every entry worth offering,
// stripped, once each, sorted by str.casefold, and by code point where two fold the same.
func vocabularyFromEntities(entities []any) ([]any, error) {
	var values []any
	for _, raw := range entities {
		entity := raw.(*pyObject)
		worthy, err := vocabularyWorthyEntity(entity)
		if err != nil {
			return nil, err
		}
		if !worthy {
			continue
		}
		name, _ := pyGet(entity, "canonical_name", "")
		values = append(values, name)
		aliases, err := aliasObjects(entity)
		if err != nil {
			return nil, err
		}
		for _, alias := range aliases {
			text, _ := pyGet(alias, "text", "")
			values = append(values, text)
		}
	}
	set := map[string]bool{}
	var words []string
	for _, value := range values {
		if !pyTruthy(value) {
			continue
		}
		text, ok := value.(string)
		if !ok {
			return nil, errBuildShape // .strip() on a number, a list or an object
		}
		if stripped := compare.PyStrip(text); stripped != "" && !set[stripped] {
			set[stripped] = true
			words = append(words, stripped)
		}
	}
	folded := make(map[string]string, len(words))
	for _, word := range words {
		folded[word] = foldCase(word)
	}
	slices.SortFunc(words, func(a, b string) int {
		if c := strings.Compare(folded[a], folded[b]); c != 0 {
			return c
		}
		return strings.Compare(a, b)
	})
	return objectsOfStrings(words), nil
}

func objectsOfStrings(words []string) []any {
	out := make([]any, len(words))
	for i, word := range words {
		out[i] = word
	}
	return out
}

// pyNumberOfInt is n as pyNumber gives a number, to compare with one.
func pyNumberOfInt(n int) *big.Float { return big.NewFloat(float64(n)) }

// buildKey is pyKey for the values of one Story Bible file, where json.loads gives every NaN as the same object, so a dict or a set
// finds one NaN by another (by identity), though NaN == NaN is false.
func buildKey(value any) (string, error) {
	if f, ok := value.(pyFloat); ok && f != f {
		return "NaN", nil
	}
	return pyKey(value)
}
