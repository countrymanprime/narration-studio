package guide

import "errors"

// ScriptImportedSource is the source of a pronunciation the Script page kept before a word's pronunciation moved to its Story Bible
// name and the user dictionary (#2595), and the user dictionary's source id for the same values.
const ScriptImportedSource = "script_imported"

// ScriptWord is one word the Script page's own store kept: the word as flagged and how it is said.
type ScriptWord struct {
	Word string
	Say  string
}

// ScriptWordImport counts what an import did, for a log line that names no word.
type ScriptWordImport struct {
	// Filled is names that had no pronunciation and took the Script value.
	Filled int
	// Kept is names that had a pronunciation of their own and kept it.
	Kept int
	// Locked is words whose name is on a locked entry, which was not changed.
	Locked int
	// Unmatched is words no Story Bible name has.
	Unmatched int
}

// ImportScriptWords gives the Script page's values to the Story Bible names that have none, in one write (none when nothing changes).
// Each word goes to the first entry in list order whose canonical name or any alias equals it ignoring case and surrounding space, as
// the Script page gives a name to an entry. A name with no IPA takes the value as the narrator's chosen one from ScriptImportedSource
// (setPronunciation, its note kept); a name with a value keeps it; a locked entry is never changed; a word no name has, or with no
// value, changes nothing. No entry is made and no Story Bible is started: the Story Bible holds story elements only, and the caller
// keeps every value in the user dictionary. Running it again changes nothing more.
func (s *Service) ImportScriptWords(words []ScriptWord) (ScriptWordImport, error) {
	var result ScriptWordImport
	if len(words) == 0 {
		return result, nil
	}
	err := s.mutateInHost(func(document map[string]any) (bool, error) {
		result = ScriptWordImport{}
		entities, ok := document["entities"].([]any)
		if !ok {
			return false, errNoEntries
		}
		changed := false
		for _, word := range words {
			entity, holder := matchScriptWord(entities, word.Word)
			switch {
			case entity == nil:
				result.Unmatched++
			case truthy(entity["locked"]):
				result.Locked++
			case fillScriptWord(holder, word.Say):
				result.Filled++
				changed = true
			default:
				result.Kept++
			}
		}
		return changed, nil
	})
	if errors.Is(err, errNoFile) {
		return ScriptWordImport{Unmatched: len(words)}, nil
	}
	return result, err
}

// matchScriptWord is the entry and the name (the entry itself, or one of its aliases) a word goes to, or nil for none: the first entry
// in list order whose canonical name or any alias equals the word, which is the entry the Script page gives the name to (mentionsIn in
// script.selectors.ts).
func matchScriptWord(entities []any, word string) (map[string]any, map[string]any) {
	key := FoldName(word)
	if key == "" {
		return nil, nil
	}
	for _, raw := range entities {
		entity, _ := raw.(map[string]any)
		if name, _ := entity["canonical_name"].(string); entity != nil && FoldName(name) == key {
			return entity, entity
		}
		aliases, _ := entity["aliases"].([]any)
		for _, item := range aliases {
			alias, _ := item.(map[string]any)
			if text, _ := alias["text"].(string); alias != nil && FoldName(text) == key {
				return entity, alias
			}
		}
	}
	return nil, nil
}

// fillScriptWord gives one name with no IPA the Script value and reports whether it did.
func fillScriptWord(holder map[string]any, say string) bool {
	say = pythonStrip(say)
	current := storedPronunciation(holder)
	ipa, _ := current["ipa"].(string)
	if say == "" || pythonStrip(ipa) != "" {
		return false
	}
	holder["pronunciation"] = setPronunciation(current, map[string]any{"ipa": say, "source": ScriptImportedSource, "confidence": "narrator", "chosen": true})
	return true
}
