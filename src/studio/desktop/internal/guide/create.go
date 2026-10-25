package guide

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
)

// occurrenceSearch is manuscript_guide.py find_occurrences for one manuscript: where one name occurs in it, as the evidence items the
// Story Bible stores (chapter, chapterId, paragraph, paragraphId, excerpt), a decoded JSON list whose numbers are json.Number. A search
// that finds nothing answers an empty list.
type occurrenceSearch func(name string) ([]any, error)

// errNoEntries is the sidecar's KeyError for a Story Bible file that is an object without a list of entries.
var errNoEntries = errors.New("The Story Bible has no list of entries.") //nolint:staticcheck // shown to the narrator

// searchNarration is manuscript_guide.py load_manuscript followed by find_occurrences over it (narration and findOccurrences): the search
// over the manuscript at path, or the sidecar's reason it cannot be read.
func searchNarration(path string) (occurrenceSearch, error) {
	paragraphs, err := narration(path)
	if err != nil {
		return nil, err
	}
	return func(name string) ([]any, error) { return findOccurrences(paragraphs, name), nil }, nil
}

// openSearch is the search over the project's manuscript.
func (s *Service) openSearch() (occurrenceSearch, error) { return s.searchManuscript(s.manuscript()) }

// pronunciations asks the sidecar's `pronunciation` command for the automatic pronunciation of each word, in order (the value
// manuscript_guide.py pronunciation() makes: the narrator's default source first, then the rest). It is the one thing the sidecar is
// asked when the host creates an entry or adds an alias; the manuscript and the Story Bible stay with the host. A word nothing knows gets the "not generated" value; a lookup that fails
// (the sidecar missing, killed or crashed) is an error, so nothing is written with a name left without a pronunciation.
func (s *Service) pronunciations(words []string) ([]map[string]any, error) {
	if len(words) == 0 {
		return nil, nil
	}
	if s.pronunciationLookup != nil {
		return s.pronunciationLookup(words)
	}
	out, err := s.Run(s.lookupArgs(words)...)
	if err != nil {
		return nil, err
	}
	return parsePronunciations(out, len(words))
}

// lookupArgs is the `pronunciation` command for the words, with the narrator's preferred source when there is one and the Wiktextract
// index when it is installed.
func (s *Service) lookupArgs(words []string) []string {
	args := []string{"pronunciation"}
	for _, word := range words {
		// --word=... and not "--word", "...": argparse takes a word that starts with a dash only in this form.
		args = append(args, "--word="+word)
	}
	return append(args, s.automaticSourceArgs()...)
}

// parsePronunciations reads what the `pronunciation` command printed: one JSON object per word, in order.
func parsePronunciations(out string, want int) ([]map[string]any, error) {
	values := make([]map[string]any, 0, want)
	for _, line := range strings.Split(out, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		decoder := json.NewDecoder(strings.NewReader(line))
		decoder.UseNumber()
		var value map[string]any
		if err := decoder.Decode(&value); err != nil || value == nil {
			return nil, errors.New("the pronunciation lookup gave an answer that could not be read")
		}
		values = append(values, value)
	}
	if len(values) != want {
		return nil, fmt.Errorf("the pronunciation lookup answered %d of %d names", len(values), want)
	}
	return values, nil
}

// aliasNames is how `create` and the aliases edit read a list of names: split at ";", each trimmed, the blank ones dropped.
func aliasNames(text string) []string {
	var names []string
	for _, item := range strings.Split(text, ";") {
		if name := pythonStrip(item); name != "" {
			names = append(names, name)
		}
	}
	return names
}

// applyAliases is manuscript_guide.py apply_edit for the field "aliases": the entry's aliases become the names in value, in that order. A
// name the entry has already (whatever its case) keeps its alias as it is, pronunciation and occurrences included; a new one gets the
// automatic pronunciation (asked of the sidecar for all new names at once) and its occurrences in the manuscript. The occurrence count is
// recounted, and the review flags lose a name the entry no longer has. A locked entry is refused before anything is looked up.
func (s *Service) applyAliases(entity map[string]any, value string, search occurrenceSearch) error {
	if truthy(entity["locked"]) {
		return errEntityLocked
	}
	existing := map[string]map[string]any{}
	for _, raw := range listOf(entity["aliases"]) {
		if alias, ok := raw.(map[string]any); ok {
			text, _ := alias["text"].(string)
			existing[pythonLower(text)] = alias
		}
	}
	requested := aliasNames(value)
	var fresh []string
	for _, name := range requested {
		if existing[pythonLower(name)] == nil {
			fresh = append(fresh, name)
		}
	}
	values, err := s.pronunciations(fresh)
	if err != nil {
		return err
	}
	aliases := make([]any, 0, len(requested))
	next := 0
	for _, name := range requested {
		if alias := existing[pythonLower(name)]; alias != nil {
			aliases = append(aliases, alias)
			continue
		}
		occurrences, err := search(name)
		if err != nil {
			return err
		}
		aliases = append(aliases, map[string]any{"text": name, "pronunciation": values[next], "occurrences": nonNil(occurrences)})
		next++
	}
	entity["aliases"] = aliases
	entity["occurrence_count"] = occurrenceCount(entity)
	if _, has := entity["review"]; has {
		entry, flagged := entityReview(entity)
		kept := make([]any, 0, len(flagged))
		for _, text := range flagged {
			kept = append(kept, text)
		}
		entity["review"] = map[string]any{"entry": entry, "aliases": kept}
	}
	return nil
}

// nonNil is list, or an empty list for nil, so a Story Bible never holds a null where the sidecar wrote [].
func nonNil(list []any) []any {
	if list == nil {
		return []any{}
	}
	return list
}

// createInHost is manuscript_guide.py create: it adds an entry by hand, under one of the Story Bible's types or as a Draft, with the
// aliases, description and properties it is given, and answers the new id. Like the sidecar's create it starts a Story Bible when the
// file is not there yet (a manuscript import seeds character candidates before any build), refuses a name whose id an entry has already,
// and reads the manuscript for where each name occurs. It asks the sidecar only for the pronunciations.
func (s *Service) createInHost(name, category string, aliases []string, description string, properties []Property) (string, error) {
	var created string
	err := s.changeInHost(true, func(document map[string]any) (bool, error) {
		entities, ok := document["entities"].([]any)
		if !ok {
			return false, errNoEntries
		}
		category = pythonStrip(category)
		if category == "" {
			category = "Draft"
		}
		if category != "Draft" {
			names, err := documentTypeNames(document)
			if err != nil {
				return false, err
			}
			if !slices.Contains(names, category) {
				return false, fmt.Errorf("Unknown category: %s", category) //nolint:staticcheck // the sidecar's own words, shown to the narrator
			}
		}
		name = pythonStrip(name)
		if name == "" {
			return false, errors.New("Name is required.") //nolint:staticcheck // the sidecar's own words, shown to the narrator
		}
		parsed := []any{}
		if len(properties) > 0 {
			encoded, _ := json.Marshal(properties) // a slice of two strings cannot fail to encode
			var err error
			if parsed, err = parseProperties(string(encoded)); err != nil {
				return false, err
			}
		}
		id := entityID(name)
		if slices.ContainsFunc(entities, func(raw any) bool { return idOf(raw) == id }) {
			return false, errNameTaken
		}
		aliasList := aliasNames(strings.Join(aliases, ";"))
		search, err := s.openSearch()
		if err != nil {
			return false, err
		}
		values, err := s.pronunciations(append(slices.Clone(aliasList), name))
		if err != nil {
			return false, err
		}
		entityValue, err := newEntry(id, name, category, aliasList, values, description, parsed, search)
		if err != nil {
			return false, err
		}
		document["entities"] = append(slices.Clone(entities), entityValue)
		created = id
		return true, nil
	})
	return created, err
}

// newEntry is the entry create makes: values holds the pronunciation of each alias in order and then of the name.
func newEntry(id, name, category string, aliasList []string, values []map[string]any, description string, properties []any, search occurrenceSearch) (map[string]any, error) {
	canonical, err := search(name)
	if err != nil {
		return nil, err
	}
	canonical = nonNil(canonical)
	aliases := make([]any, 0, len(aliasList))
	for index, text := range aliasList {
		occurrences, err := search(text)
		if err != nil {
			return nil, err
		}
		aliases = append(aliases, map[string]any{"text": text, "pronunciation": values[index], "occurrences": nonNil(occurrences)})
	}
	described := map[string]any{"text": "", "evidence": map[string]any{}}
	if len(canonical) > 0 {
		described = directDescription(name, canonical)
	}
	if description != "" {
		// The same as an edit of the description right after the create, without a second process for it.
		described["text"] = description
	}
	entity := map[string]any{
		"id":                id,
		"canonical_name":    name,
		"aliases":           aliases,
		"category":          category,
		"occurrences":       canonical,
		"pronunciation":     values[len(aliasList)],
		"description":       described,
		"personality_notes": []any{},
		"relationships":     []any{},
		"properties":        properties,
		"locked":            false,
		"manual":            true,
		"review_state":      "reviewed",
		"review":            map[string]any{"entry": false, "aliases": []any{}},
		"appearances":       []any{},
	}
	entity["occurrence_count"] = occurrenceCount(entity)
	return entity, nil
}

// splitSentences is manuscript_guide.py SENTENCES.split, (?<=[.!?])\s+: the text cut at each run of white space that follows a . ! or ?.
func splitSentences(tables *pythonUnicodeTables, text []rune) [][]rune {
	var sentences [][]rune
	start := 0
	for at := 1; at < len(text); at++ {
		if !tables.isSpace(text[at]) || (text[at-1] != '.' && text[at-1] != '!' && text[at-1] != '?') {
			continue
		}
		end := at
		for end < len(text) && tables.isSpace(text[end]) {
			end++
		}
		sentences = append(sentences, text[start:at])
		start, at = end, end-1
	}
	return append(sentences, text[start:])
}

// The words direct_description looks for after a name, compiled like any other literal of a pattern run with re.IGNORECASE.
var describedWords = sync.OnceValue(func() map[string][]literal {
	words := map[string][]literal{}
	for _, word := range []string{"was", "is", "a", "n", "the"} {
		words[word] = compileLiterals(pythonUnicode(), []rune(word))
	}
	return words
})

// wordAt is whether text holds the literals at at.
func wordAt(tables *pythonUnicodeTables, text []rune, at int, word []literal) bool {
	return at+len(word) <= len(text) && matchesAt(tables, word, text, at)
}

// skipSpace is the index of the first character from at on that is not white space (\s*).
func skipSpace(tables *pythonUnicodeTables, text []rune, at int) int {
	for at < len(text) && tables.isSpace(text[at]) {
		at++
	}
	return at
}

// describedAfter is what follows a name in direct_description's pattern, from the end of the name:
// \s*(?:,\s*)?(?:was|is)\s+(?:an?|the)\s+([^,.!;]+) under re.IGNORECASE, and its group. Each step has one way to go on, so there is no
// search, except at the end: when white space is all that is left of the group's run, \s+ gives its last character back to the group.
func describedAfter(tables *pythonUnicodeTables, text []rune, at int) ([]rune, bool) {
	words := describedWords()
	at = skipSpace(tables, text, at)
	if at < len(text) && text[at] == ',' {
		at = skipSpace(tables, text, at+1)
	}
	switch {
	case wordAt(tables, text, at, words["was"]):
		at += 3
	case wordAt(tables, text, at, words["is"]):
		at += 2
	default:
		return nil, false
	}
	spaced := skipSpace(tables, text, at)
	if spaced == at {
		return nil, false
	}
	at = spaced
	switch {
	case wordAt(tables, text, at, words["a"]):
		at++
		if wordAt(tables, text, at, words["n"]) {
			at++
		}
	case wordAt(tables, text, at, words["the"]):
		at += 3
	default:
		return nil, false
	}
	next := skipSpace(tables, text, at)
	if next == at {
		return nil, false
	}
	end := next
	for end < len(text) && !strings.ContainsRune(",.!;", text[end]) {
		end++
	}
	if end > next {
		return text[next:end], true
	}
	if next-at >= 2 {
		return text[next-1 : next], true
	}
	return nil, false
}

// describedBy is re.search(r"\b" + re.escape(candidate) + r"\b\s*(?:,\s*)?(?:was|is)\s+(?:an?|the)\s+([^,.!;]+)", sentence, re.IGNORECASE)
// and its group 1: the leftmost place the candidate is followed by "is a ...".
func describedBy(tables *pythonUnicodeTables, sentence []rune, pattern []literal) ([]rune, bool) {
	for start := 0; start+len(pattern) <= len(sentence); start++ {
		if !atBoundary(tables, sentence, start) || !matchesAt(tables, pattern, sentence, start) {
			continue
		}
		end := start + len(pattern)
		if !atBoundary(tables, sentence, end) {
			continue
		}
		if group, ok := describedAfter(tables, sentence, end); ok {
			return group, true
		}
	}
	return nil, false
}

// directDescription is manuscript_guide.py direct_description: only an explicit appositive or copular description ("Wren is a tall
// girl"), never a guess, from the first occurrence whose excerpt has one; the name is tried whole and then by its last word. It reads
// the text by Python's tables (python-unicode.json), as the search that found the occurrences does.
func directDescription(name string, occurrences []any) map[string]any {
	tables := pythonUnicode()
	words := strings.FieldsFunc(name, tables.isSpace)
	candidates := [][]literal{compileLiterals(tables, []rune(name)), compileLiterals(tables, []rune(words[len(words)-1]))}
	for _, raw := range occurrences {
		occurrence, _ := raw.(map[string]any)
		source, ok := occurrence["text"].(string)
		if !ok {
			source, _ = getOr(occurrence, "excerpt", "").(string)
		}
		for _, sentence := range splitSentences(tables, []rune(source)) {
			for _, candidate := range candidates {
				if description, found := describedBy(tables, sentence, candidate); found {
					return map[string]any{
						"text":     "Explicitly described as " + string(stripRunes(description)) + ".",
						"evidence": map[string]any{"chapter": occurrence["chapter"], "excerpt": string(stripRunes(sentence))},
					}
				}
			}
		}
	}
	return map[string]any{"text": "", "evidence": map[string]any{}}
}
