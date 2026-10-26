package guide

import (
	"slices"
	"strings"
	"unicode/utf8"

	"desktop/internal/compare"
)

// This file is the extraction half of the Story Bible build (build.go): manuscript_guide.py build_entities and what it called
// (spacy_candidates after the model, classify, trait_notes, direct_description, assign_scene_indices, appearance_map,
// evidence_entries), which #2251 step 3 moved here and deleted. The sidecar only runs the language model, and its spans come here as
// they were (entitySpan). Without the model the names are the scan's (scanCandidates), not rule_candidates', since #2251.
// tests/fixtures/guide-build (frozen) pins a build with the model's spans byte for byte (TestBuildMatchesTheSidecar), and
// testdata/build-rules.json and testdata/build-cues.json pin the builds without it.

// entitySpan is one entity the language model found in a paragraph: spaCy's ent.start_char, ent.end_char and ent.label_, in code points.
type entitySpan struct {
	start, end int
	label      string
}

// spacyEntityLabels is SPACY_ENTITY_LABELS: the spaCy labels a build keeps.
var spacyEntityLabels = wordSet("PERSON", "ORG", "GPE", "LOC", "FAC")

// spacyCandidates is manuscript_guide.py spacy_candidates after spaCy ran: each kept span cleaned of filler, a single word dropped
// when it looks like a common word that two capitalised mid-sentence mentions do not back.
func spacyCandidates(paragraphs []ruleParagraph, spans [][]entitySpan) []ruleCandidate {
	stats := wordStatsOf(paragraphs)
	found := []ruleCandidate{}
	for index, paragraph := range paragraphs {
		for _, span := range spans[index] {
			if !spacyEntityLabels[span.label] {
				continue
			}
			name, start, ok := cleanEntityText(paragraph.text[span.start:span.end], span.start)
			if !ok {
				continue
			}
			text := string(name)
			if len(compare.PySplit(text)) == 1 && taggedCommonWord(text, stats) {
				continue
			}
			found = append(found, ruleCandidate{name: text, paragraph: index, start: start, end: start + len(name), label: span.label})
		}
	}
	return found
}

// taggedCommonWord is manuscript_guide.py is_common_word with spacy_tagged: a word spaCy tagged is a name when it is capitalised
// mid-sentence at least twice, and otherwise a common word when it is written in lower case somewhere or has a common suffix.
func taggedCommonWord(name string, stats wordStats) bool {
	if stats.midSentence[normalizeName(name)] >= minMidSentenceMentions {
		return false
	}
	return stats.lowercase[compare.PyLower(name)] || hasCommonSuffix(name)
}

// buildGroups is the grouping of build_entities: the language model's candidates by normalized name, with a name folded into a longer
// one that ends with it and starts with a title (Arelian into Captain Arelian), a longer name of one word counting when that word is
// a title. The rules' candidates come grouped already (scanCandidates), and keep their groups.
func buildGroups(candidates []ruleCandidate) *orderedGroups {
	g := &orderedGroups{groups: map[string][]ruleCandidate{}}
	for _, candidate := range candidates {
		if candidate.group != "" {
			g.add("\x00"+candidate.group, candidate) // \x00 is never a normalized name's, so these never fold
		} else if key := normalizeName(candidate.name); len(key) >= 2 && !ruleStopwords[candidate.name] {
			g.add(key, candidate)
		}
	}
	startsWithTitle := func(name string) bool {
		words := compare.PySplit(compare.PyLower(name))
		return len(words) > 0 && titleWords[strings.Trim(words[0], ".")]
	}
	for _, short := range slices.Clone(g.keys) {
		if _, ok := g.groups[short]; !ok || strings.HasPrefix(short, "\x00") {
			continue
		}
		for _, long := range slices.Clone(g.keys) {
			if long == short || strings.HasPrefix(long, "\x00") || !strings.HasSuffix(long, short) {
				continue
			}
			if startsWithTitle(g.groups[long][0].name) {
				g.groups[long] = append(g.groups[long], g.pop(short)...)
				break
			}
		}
	}
	return g
}

// sceneIndices is manuscript_guide.py scene_by_paragraph_id over assign_scene_indices: each paragraph's scene in its chapter, counted
// from 0, and -1 for a scene break, which starts the next scene and belongs to neither.
func sceneIndices(paragraphs []ruleParagraph) map[string]int {
	scenes := make(map[string]int, len(paragraphs))
	scene, chapter := 0, ""
	for index, paragraph := range paragraphs {
		if index == 0 || paragraph.chapterID != chapter {
			chapter, scene = paragraph.chapterID, 0
		}
		if isSceneBreak(paragraph.text) {
			scenes[paragraph.paragraphID] = -1
			scene++
			continue
		}
		scenes[paragraph.paragraphID] = scene
	}
	return scenes
}

// freshEntity is an entry a build made, before its pronunciations are known: the object as it is written, and the names whose
// pronunciations it waits for, in the order build_entities asked for them (each alias, then the name).
type freshEntity struct {
	object  *pyObject
	holders []*pyObject // the aliases, then the entity itself
	words   []string
}

// buildEntities is manuscript_guide.py build_entities for the candidates (the rules', or the language model's): one entry per group, in
// the order build_entities sorts them (by category, then by name in lower case), each without its pronunciations; and the same entries
// in the order it made them, which is the order it asked for their pronunciations.
func buildEntities(paragraphs []ruleParagraph, candidates []ruleCandidate) (sorted, made []freshEntity) {
	scenes := sceneIndices(paragraphs)
	groups := buildGroups(candidates)
	type built struct {
		entity   freshEntity
		category string
		lower    string
	}
	var entities []built
	for _, key := range groups.keys {
		occurrences := groups.groups[key]
		kind := category(occurrences, paragraphs)
		if kind == categoryNeedsReview && len(occurrences) < minNeedsReviewMentions {
			continue
		}
		byName := map[string][]ruleCandidate{}
		var names []string
		for _, occurrence := range occurrences {
			if _, ok := byName[occurrence.name]; !ok {
				names = append(names, occurrence.name)
			}
			byName[occurrence.name] = append(byName[occurrence.name], occurrence)
		}
		slices.SortFunc(names, func(a, b string) int {
			if n, m := utf8.RuneCountInString(a), utf8.RuneCountInString(b); n != m {
				return m - n
			}
			return strings.Compare(a, b) // UTF-8 byte order is code point order, as Python sorts str
		})
		canonical := names[0]
		evidence := evidenceEntries(paragraphs, byName[canonical])
		all := slices.Clone(evidence)
		aliases := make([]any, 0, len(names)-1)
		var holders []*pyObject
		for _, name := range names[1:] {
			occurrences := evidenceEntries(paragraphs, byName[name])
			all = append(all, occurrences...)
			alias := newPyObject("text", name, "pronunciation", nil, "occurrences", occurrences)
			aliases = append(aliases, alias)
			holders = append(holders, alias)
		}
		notes := []any{}
		if kind == categoryCharacter {
			notes = traitNotes(canonical, occurrences, paragraphs)
		}
		review := categoryNeedsReview == kind
		state := "generated"
		if review {
			state = "needs review"
		}
		entity := newPyObject(
			"id", entityID(canonical),
			"canonical_name", canonical,
			"aliases", aliases,
			"category", kind,
			"occurrences", evidence,
			"occurrence_count", len(occurrences),
			"pronunciation", nil,
			"description", buildDescription(canonical, occurrences, paragraphs),
			"personality_notes", notes,
			"context", "",
			"relationships", []any{},
			"properties", []any{},
			"locked", false,
			"manual", false,
			"review_state", state,
			"review", newPyObject("entry", review, "aliases", []any{}),
			"appearances", appearanceMap(all, scenes),
		)
		entities = append(entities, built{
			entity:   freshEntity{object: entity, holders: append(holders, entity), words: append(slices.Clone(names[1:]), canonical)},
			category: kind, lower: compare.PyLower(canonical),
		})
	}
	made = make([]freshEntity, len(entities))
	for i, entity := range entities {
		made[i] = entity.entity
	}
	slices.SortStableFunc(entities, func(a, b built) int {
		if c := strings.Compare(a.category, b.category); c != 0 {
			return c
		}
		return strings.Compare(a.lower, b.lower)
	})
	sorted = make([]freshEntity, len(entities))
	for i, entity := range entities {
		sorted[i] = entity.entity
	}
	return sorted, made
}

// evidenceEntries is manuscript_guide.py evidence_entries: each candidate as an occurrence, the text around it as its excerpt.
func evidenceEntries(paragraphs []ruleParagraph, items []ruleCandidate) []any {
	out := make([]any, len(items))
	for i, item := range items {
		paragraph := paragraphs[item.paragraph]
		out[i] = newPyObject("chapter", paragraph.chapter, "chapterId", paragraph.chapterID, "paragraph", item.paragraph,
			"paragraphId", paragraph.paragraphID, "excerpt", excerpt(paragraph.text, item.start, item.end))
	}
	return out
}

// appearanceMap is manuscript_guide.py appearance_map: the (chapter, scene) pairs the occurrences touch, once each, sorted by chapter
// id and then scene. An occurrence in a scene break touches none.
func appearanceMap(occurrences []any, scenes map[string]int) []any {
	type row struct {
		chapterID string
		chapter   any
		scene     int
	}
	seen := map[sceneKey]bool{}
	var rows []row
	for _, raw := range occurrences {
		item := raw.(*pyObject)
		paragraphID := item.values["paragraphId"].(string)
		scene, ok := scenes[paragraphID]
		if !ok || scene < 0 {
			continue
		}
		chapterID := item.values["chapterId"].(string)
		if key := (sceneKey{chapterID, scene}); !seen[key] {
			seen[key] = true
			rows = append(rows, row{chapterID, item.values["chapter"], scene})
		}
	}
	slices.SortStableFunc(rows, func(a, b row) int {
		if c := strings.Compare(a.chapterID, b.chapterID); c != 0 {
			return c
		}
		return a.scene - b.scene
	})
	out := make([]any, len(rows))
	for i, r := range rows {
		out[i] = newPyObject("chapterId", r.chapterID, "chapter", r.chapter, "sceneIndex", r.scene)
	}
	return out
}

// traitTerms is manuscript_guide.py TRAITS, the words trait_notes reads as a character's traits.
var traitTerms = wordSet("angry", "anxious", "arrogant", "brave", "calm", "careful", "cautious", "cheerful", "clever", "cold", "cruel", "curious",
	"determined", "fearful", "fierce", "gentle", "generous", "gruff", "honest", "kind", "loyal", "nervous", "patient", "proud", "quiet",
	"ruthless", "sad", "shy", "stern", "tired", "warm", "wise", "wary")

// maxTraitNotes is how many notes trait_notes keeps.
const maxTraitNotes = 5

// traitNotes is manuscript_guide.py trait_notes: "Described as brave." for each trait word in a sentence that names the character (its
// whole name or its last word, in lower case, anywhere in the sentence), once each, the first five, each with its sentence. A paragraph
// is read once: its sentences give the same notes every time.
func traitNotes(name string, occurrences []ruleCandidate, paragraphs []ruleParagraph) []any {
	tables := pythonUnicode()
	lowered := compare.PyLower(name)
	words := compare.PySplit(lowered)
	searchable := []string{lowered, words[len(words)-1]}
	notes := []any{}
	seen := map[string]bool{}
	read := map[int]bool{}
	for _, occurrence := range occurrences {
		if read[occurrence.paragraph] {
			continue
		}
		read[occurrence.paragraph] = true
		paragraph := paragraphs[occurrence.paragraph]
		for _, sentence := range splitSentences(tables, paragraph.text) {
			lowerSentence := compare.PyLower(string(sentence))
			if !slices.ContainsFunc(searchable, func(name string) bool { return strings.Contains(lowerSentence, name) }) {
				continue
			}
			var traits []string
			for _, word := range asciiWords([]rune(lowerSentence)) {
				if traitTerms[word] && !slices.Contains(traits, word) {
					traits = append(traits, word)
				}
			}
			slices.Sort(traits)
			for _, trait := range traits {
				note := "Described as " + trait + "."
				if seen[note] {
					continue
				}
				seen[note] = true
				notes = append(notes, newPyObject("text", note, "evidence", newPyObject("chapter", paragraph.chapter, "excerpt", string(stripRunes(sentence)))))
				if len(notes) == maxTraitNotes {
					return notes
				}
			}
		}
	}
	return notes
}

// buildDescription is manuscript_guide.py direct_description over a build's candidates, which carry their whole paragraph: the first
// "X is a ..." sentence of the paragraphs the name is found in (directDescription, create.go), else an empty description. A paragraph
// is read once, as it can only answer the same the second time.
func buildDescription(name string, occurrences []ruleCandidate, paragraphs []ruleParagraph) *pyObject {
	tables := pythonUnicode()
	words := strings.FieldsFunc(name, tables.isSpace)
	candidates := [][]literal{compileLiterals(tables, []rune(name)), compileLiterals(tables, []rune(words[len(words)-1]))}
	read := map[int]bool{}
	for _, occurrence := range occurrences {
		if read[occurrence.paragraph] {
			continue
		}
		read[occurrence.paragraph] = true
		paragraph := paragraphs[occurrence.paragraph]
		for _, sentence := range splitSentences(tables, paragraph.text) {
			for _, candidate := range candidates {
				if description, found := describedBy(tables, sentence, candidate); found {
					return newPyObject("text", "Explicitly described as "+string(stripRunes(description))+".",
						"evidence", newPyObject("chapter", paragraph.chapter, "excerpt", string(stripRunes(sentence))))
				}
			}
		}
	}
	return newPyObject("text", "", "evidence", newPyObject())
}
