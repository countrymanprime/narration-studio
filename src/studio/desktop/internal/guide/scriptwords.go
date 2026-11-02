package guide

import (
	"maps"
	"strings"
)

// ScriptWord is one word the Script page's own store kept before a word's pronunciation moved to its Story Bible name (#2595): its
// lower-cased key, the name an entry made for it takes (the text as first flagged), and its say-value and source (both empty when
// none was set).
type ScriptWord struct {
	Word   string
	Name   string
	Say    string
	Source string
}

// ScriptWordImport counts what an import did, for a log line that names no word.
type ScriptWordImport struct {
	// Filled is names that had no pronunciation and took the Script value.
	Filled int
	// Same is names that already said it that way (or kept it as their alternate or in their note), and say-less words already named.
	Same int
	// Alternates is names that kept their own value and took the Script value as their alternate.
	Alternates int
	// Notes is names that kept their own value and alternate and took the Script value in their note.
	Notes int
	// Created is Word entries made for words no name matched.
	Created int
	// Locked is words whose name is on a locked entry: nothing was changed, and the value is only in the Script page's backup.
	Locked int
}

// ImportScriptWords moves the Script page's words into the Story Bible, in one write (none when nothing changes), starting the Story
// Bible as a create does when there is none. Each word goes to the first entry in list order whose canonical name or any alias
// equals it ignoring case and surrounding space, as the Script page gives a name to an entry:
//
//   - a name with no IPA takes the value (setPronunciation: chosen, its note kept);
//   - a name that says it the same way, or keeps it as its alternate or in its note, is left alone;
//   - a name with another value keeps it and takes the Script value as its alternate when it has none and the two are of different
//     kinds (typed and from a source), else in its note as "Script page: <say> (<source>)";
//   - a locked entry is never changed.
//
// A word no name matches becomes an entry of the Word type (added to a types list that lacks it), made by hand as a create makes it,
// under an id no other name has (claimID), named with Name and pronounced with the Script value, or with the "not generated" value when it had none: no source is asked.
// Running it again changes nothing more.
func (s *Service) ImportScriptWords(words []ScriptWord) (ScriptWordImport, error) {
	var result ScriptWordImport
	if len(words) == 0 {
		return result, nil
	}
	err := s.changeInHost(true, func(document map[string]any) (bool, error) {
		result = ScriptWordImport{}
		entities, ok := document["entities"].([]any)
		if !ok {
			return false, errNoEntries
		}
		var search occurrenceSearch
		changed := false
		for _, word := range words {
			name := pythonStrip(word.Name)
			if name == "" {
				name = pythonStrip(word.Word)
			}
			entity, holder := matchScriptWord(entities, word.Word)
			if entity == nil && name == "" {
				continue
			}
			id := ""
			if entity == nil {
				// The same name in other ASCII punctuation is the entry's that has it; any other name gets an id of its own.
				id, entity, holder = claimID(entities, name)
			}
			if entity == nil {
				category, err := ensureWordType(document)
				if err != nil {
					return false, err
				}
				if search == nil {
					if search, _ = s.openSearch(); search == nil {
						search = func(string) ([]any, error) { return []any{}, nil }
					}
				}
				value := map[string]any{"ipa": "", "source": NotGenerated, "confidence": "unknown"}
				if say := pythonStrip(word.Say); say != "" {
					value = map[string]any{"ipa": say, "source": scriptSource(word.Source), "chosen": true}
				}
				values := make([]map[string]any, 0, 1)
				created, err := newEntry(id, name, category, nil, append(values, value), "", []any{}, search)
				if err != nil {
					return false, err
				}
				entities = append(entities, created)
				result.Created++
				changed = true
				continue
			}
			if truthy(entity["locked"]) {
				result.Locked++
				continue
			}
			switch fillScriptWord(holder, word) {
			case scriptFilled:
				result.Filled++
				changed = true
			case scriptAlternate:
				result.Alternates++
				changed = true
			case scriptNoted:
				result.Notes++
				changed = true
			default:
				result.Same++
			}
		}
		document["entities"] = entities
		return changed, nil
	})
	return result, err
}

// matchScriptWord is the entry and the name (the entry itself, or one of its aliases) a word goes to, or nil for none: the first entry
// in list order whose canonical name or any alias equals the word, which is the entry the Script page gives the name to (mentionsIn in
// script.selectors.ts).
func matchScriptWord(entities []any, word string) (map[string]any, map[string]any) {
	key := foldCase(pythonStrip(word))
	if key == "" {
		return nil, nil
	}
	for _, raw := range entities {
		entity, _ := raw.(map[string]any)
		if name, _ := entity["canonical_name"].(string); entity != nil && foldCase(pythonStrip(name)) == key {
			return entity, entity
		}
		aliases, _ := entity["aliases"].([]any)
		for _, item := range aliases {
			alias, _ := item.(map[string]any)
			if text, _ := alias["text"].(string); alias != nil && foldCase(pythonStrip(text)) == key {
				return entity, alias
			}
		}
	}
	return nil, nil
}

type scriptOutcome int

const (
	scriptSame scriptOutcome = iota
	scriptFilled
	scriptAlternate
	scriptNoted
)

// scriptSource is the Script value's source as the Story Bible keeps it: one saved with none was typed.
func scriptSource(source string) string {
	if source == "" {
		return ManualSource
	}
	return source
}

// fillScriptWord gives one name the Script value, as ImportScriptWords says.
func fillScriptWord(holder map[string]any, word ScriptWord) scriptOutcome {
	say := pythonStrip(word.Say)
	if say == "" {
		return scriptSame
	}
	source := scriptSource(word.Source)
	current := storedPronunciation(holder)
	ipa, _ := current["ipa"].(string)
	if pythonStrip(ipa) == "" {
		holder["pronunciation"] = setPronunciation(current, map[string]any{"ipa": say, "source": source, "chosen": true})
		return scriptFilled
	}
	if pythonStrip(ipa) == say {
		return scriptSame
	}
	alternate, _ := current["alternate"].(map[string]any)
	if kept, _ := alternate["ipa"].(string); pythonStrip(kept) == say {
		return scriptSame
	}
	next := maps.Clone(current)
	if !truthy(current["alternate"]) && isManual(current) != (source == ManualSource) {
		next["alternate"] = map[string]any{"ipa": say, "source": source}
		holder["pronunciation"] = next
		return scriptAlternate
	}
	line := "Script page: " + say + " (" + source + ")"
	note, _ := current["note"].(string)
	if strings.Contains(note, line) {
		return scriptSame
	}
	if note != "" {
		line = note + "\n" + line
	}
	next["note"] = line
	holder["pronunciation"] = next
	return scriptNoted
}
