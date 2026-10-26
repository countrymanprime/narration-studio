package guide

import (
	"context"
	"crypto/sha1" //nolint:gosec // G505: a cue id is a SHA-1 prefix, not a secret; manuscript_guide.py cue_id writes the same ids
	"encoding/hex"
	"errors"
	"math/big"
	"os"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"desktop/internal/compare"
)

// This file is the Story Bible's rules source (SN-X32), run in the host: extraction_rules.py suggest, which #2251 step 3 moved here
// and deleted. RuleSuggestions reads the manuscript and the Story Bible and gives one JSON line per suggestion, in the bytes the
// sidecar printed them, in the extraction port's raw shape plus source and rule. It writes nothing and proposes only what the Story
// Bible does not already say:
//
//   - an entry for a name the rules accept that no entry answers to, or that one answers to only as Needs Review;
//   - an alias for a spelling the rules group with a known entry that the entry does not list;
//   - a speaker for a dialogue cue a speech tag resolves to an entry of a speaking type, unless the Story Bible already has that
//     cue with that speaker or the narrator corrected it.
//
// A locked entry gets no suggestion, nor does a name a merge absorbed. Each quote is a slice of the paragraph it names; each
// confidence is ruleConfidence's. Which names are offered, and in what order, is the scan's own name finder (rules_scan.go), tuned
// in #2251 after the sidecar's rules offered "I'm", "Mr" and "Because I". tests/fixtures/guide-rules (frozen) pins every other answer
// against the sidecar's (TestRuleSuggestionsMatchTheSidecar): the speaker lines and the files it refused or failed on; where the
// sidecar crashed on a value of the wrong type, this refuses with errStoryBibleShape or errManuscriptItems.

// Rule names a suggestion's rule, and RuleConfidence says what each is worth.
const (
	RuleNewName         = "new-name"
	RuleNeedsReviewName = "needs-review-name"
	RuleKnownSpelling   = "known-spelling"
	RuleSpeechTag       = "speech-tag"
)

// RuleConfidence is extraction_rules.py RULE_CONFIDENCE: a rule's confidence, or nil where nothing measured supports a number. Every
// row is provisional until SN-X8 calibrates the sources on a gold set (docs/research/studio-next-extraction-calibration-protocol.md).
//   - new-name: the rules count mentions; no precision for them has been measured (the GLiNER spike records counts only).
//   - needs-review-name: the rules could not settle what the name is.
//   - known-spelling: a title-prefixed form such as Captain Arelian for Arelian; the grouping is conservative but unmeasured.
//   - speech-tag: the labelled-quote evaluation of these cue rules measured a precision of 0.963 (26 of 27;
//     docs/research/character-continuity-cue-extraction-eval/RESULTS.md), and its one miss was a continuation, which this rule
//     does not emit.
var RuleConfidence = map[string]*float64{RuleNewName: nil, RuleNeedsReviewName: nil, RuleKnownSpelling: nil, RuleSpeechTag: ptr(0.96)}

func ptr(f float64) *float64 { return &f }

// NoScore is the note a suggestion carries when its rule gives no confidence.
const NoScore = "The rules give no score for this."

// The sidecar's own words for a Story Bible it refused, and the host's for one it crashed on.
var (
	errStoryBibleUnreadable = errors.New("The Story Bible could not be read.")                   //nolint:staticcheck // the sidecar's own words
	errStoryBibleTypes      = errors.New("The Story Bible types are invalid.")                   //nolint:staticcheck // the sidecar's own words
	errStoryBibleShape      = errors.New("The Story Bible holds a value the rules cannot read.") //nolint:staticcheck // shown to the narrator
)

// ruleParagraph is one of load_manuscript's paragraphs, its text by code point.
type ruleParagraph struct {
	chapter                any // chapterTitle, as the file holds it
	chapterID, paragraphID string
	text                   []rune
	lowered                []rune // str.lower of text, made when classify first needs it
}

// RuleSuggestions is `suggest --source rules --manuscript M --guide G` as the sidecar ran it: its stdout lines, or the error it
// exited with. A missing Story Bible is an empty one; one that cannot be read is an error, so a damaged file never looks like a
// book with nothing in it. It returns ctx.Err() once ctx is cancelled.
func RuleSuggestions(ctx context.Context, manuscriptPath, guidePath string) ([]string, error) {
	paragraphs, err := ruleManuscript(manuscriptPath)
	if err != nil {
		return nil, err
	}
	bible, err := ruleBible(guidePath)
	if err != nil {
		return nil, err
	}
	names, err := nameSuggestions(ctx, paragraphs, bible)
	if err != nil {
		return nil, err
	}
	speakers, err := speakerSuggestions(ctx, paragraphs, bible)
	if err != nil {
		return nil, err
	}
	lines := make([]string, 0, len(names)+len(speakers))
	for _, suggestion := range append(names, speakers...) {
		lines = append(lines, suggestion.line())
	}
	return lines, nil
}

// ruleManuscript is manuscript_guide.py load_manuscript over narration_common.manuscript.load_file, as Python reads the file:
// json.loads (NaN taken), the same refusals in the same words, and errManuscriptItems where Python crashed (a chapter that is not an
// object, a narrated chapter with no id or a list for one, a narrated paragraph with no chapterTitle). narration does the same for
// the host's other Story Bible commands with encoding/json, which differs from this only on those crashes and NaN.
func ruleManuscript(path string) ([]ruleParagraph, error) {
	paragraphs, _, err := readRuleManuscript(path)
	return paragraphs, err
}

// readRuleManuscript is ruleManuscript, also giving the bytes it read.
func readRuleManuscript(path string) ([]ruleParagraph, []byte, error) {
	if info, err := os.Stat(path); err != nil || !info.Mode().IsRegular() {
		return nil, nil, errNoManuscript
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, errManuscriptRead
	}
	paragraphs, err := parseRuleManuscript(raw)
	return paragraphs, raw, err
}

// parseRuleManuscript is load_manuscript over the manuscript file's bytes.
func parseRuleManuscript(raw []byte) ([]ruleParagraph, error) {
	if !utf8.Valid(raw) {
		return nil, errManuscriptRead
	}
	data, err := pyLoads(universalNewlines(string(raw)))
	if err != nil {
		return nil, errManuscriptRead
	}
	document, ok := data.(*pyObject)
	if !ok {
		return nil, errManuscriptSchema
	}
	if version, _ := document.get("schemaVersion"); !pyEqual(version, pyInt{big.NewInt(1)}) {
		return nil, errManuscriptSchema
	}
	documentID, _ := document.get("documentId")
	chaptersValue, _ := document.get("chapters")
	paragraphsValue, _ := document.get("paragraphs")
	_, hasID := documentID.(string)
	chapters, hasChapters := chaptersValue.([]any)
	items, hasParagraphs := paragraphsValue.([]any)
	if !hasID || !hasChapters || !hasParagraphs {
		return nil, errManuscriptShape
	}
	chapterIDs := map[string]bool{}
	for _, item := range chapters {
		if chapter, ok := item.(*pyObject); ok {
			if id, ok := chapter.values["id"].(string); ok {
				chapterIDs[id] = true
			}
		}
	}
	seen := map[string]bool{}
	for _, item := range items {
		paragraph, ok := item.(*pyObject)
		if !ok {
			return nil, errManuscriptItems
		}
		id, hasID := paragraph.values["id"].(string)
		chapterID, hasChapter := paragraph.values["chapterId"].(string)
		_, hasText := paragraph.values["text"].(string)
		if !hasID || seen[id] || !hasChapter || !chapterIDs[chapterID] || !hasText {
			return nil, errManuscriptItems
		}
		seen[id] = true
	}
	narrated := map[string]bool{}
	for _, item := range chapters {
		chapter, ok := item.(*pyObject)
		if !ok {
			return nil, errManuscriptItems // chapter.get on a str
		}
		if kind, has := chapter.get("contentKind"); has && kind != "narration" {
			continue
		}
		id, has := chapter.get("id")
		if !has {
			return nil, errManuscriptItems // chapter["id"]
		}
		if _, err := pyKey(id); err != nil {
			return nil, errManuscriptItems // a list in a set
		}
		if id, ok := id.(string); ok {
			narrated[id] = true
		}
	}
	paragraphs := []ruleParagraph{}
	for _, item := range items {
		paragraph := item.(*pyObject)
		chapterID := paragraph.values["chapterId"].(string)
		if !narrated[chapterID] {
			continue
		}
		title, has := paragraph.get("chapterTitle")
		if !has {
			return nil, errManuscriptItems // item["chapterTitle"]
		}
		paragraphs = append(paragraphs, ruleParagraph{chapter: title, chapterID: chapterID, paragraphID: paragraph.values["id"].(string), text: []rune(paragraph.values["text"].(string))})
	}
	if len(paragraphs) == 0 {
		return nil, errNoNarration
	}
	return paragraphs, nil
}

// universalNewlines is what Path.read_text does to line ends: \r\n and \r read as \n. Inside JSON that only changes whitespace
// between values, or a raw line break in a string, which json.loads refuses either way.
func universalNewlines(text string) string {
	if !strings.Contains(text, "\r") {
		return text
	}
	return strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n")
}

// bibleEntry is one Story Bible entry as the rules read it.
type bibleEntry struct {
	object *pyObject
	id     any
	name   string          // canonical_name, "" when absent
	keys   map[string]bool // entity_name_keys
}

// ruleBibleFile is the Story Bible as the rules read it: an empty one when the file is missing.
type ruleBibleFile struct {
	document *pyObject
	entries  []*bibleEntry
}

// ruleBible reads the Story Bible as suggest did: missing is empty; a file json.loads cannot read, or a value that is not an object,
// is errStoryBibleUnreadable. load_json's reshaping of a plain-text alias into an object is done here, as is its walk over the
// entries, which crashed on an entry that is not an object.
func ruleBible(path string) (*ruleBibleFile, error) {
	if _, err := os.Stat(path); err != nil {
		return &ruleBibleFile{document: &pyObject{values: map[string]any{}}}, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, errStoryBibleUnreadable
	}
	if !utf8.Valid(raw) {
		return nil, errStoryBibleShape // read_text's UnicodeDecodeError, which load_json does not catch
	}
	data, err := pyLoads(universalNewlines(string(raw)))
	if err != nil {
		return nil, errStoryBibleUnreadable
	}
	document, ok := data.(*pyObject)
	if !ok {
		return nil, errStoryBibleUnreadable
	}
	entities, err := pyGet(document, "entities", []any{})
	if err != nil {
		return nil, errStoryBibleShape
	}
	walked, err := pyIter(entities)
	if err != nil {
		return nil, errStoryBibleShape
	}
	for _, item := range walked {
		entity, ok := item.(*pyObject)
		if !ok {
			return nil, errStoryBibleShape
		}
		aliases, _ := entity.get("aliases")
		if list, ok := aliases.([]any); ok {
			for i, alias := range list {
				if _, ok := alias.(*pyObject); !ok {
					list[i] = &pyObject{keys: []string{"text", "pronunciation", "occurrences"},
						values: map[string]any{"text": alias, "pronunciation": &pyObject{values: map[string]any{}}, "occurrences": []any{}}}
				}
			}
		}
		if pyTruthy(aliases) {
			if _, err := pyIter(aliases); err != nil {
				return nil, errStoryBibleShape
			}
		}
	}
	return &ruleBibleFile{document: document}, nil
}

// field is document.get(key) or fallback when it is absent or falsy: Python's `document.get(key) or fallback`.
func (b *ruleBibleFile) field(key string, fallback any) any {
	if value, ok := b.document.get(key); ok && pyTruthy(value) {
		return value
	}
	return fallback
}

// entities is `story_bible.get("entities") or []`, read once: each entry's id and names, or errStoryBibleShape where _by_name
// crashed (an id that is a list or an object, a name or an alias that is not text).
func (b *ruleBibleFile) entities() ([]*bibleEntry, error) {
	if b.entries != nil {
		return b.entries, nil
	}
	walked, err := pyIter(b.field("entities", []any{}))
	if err != nil {
		return nil, errStoryBibleShape
	}
	entries := make([]*bibleEntry, 0, len(walked))
	for _, item := range walked {
		object, ok := item.(*pyObject)
		if !ok {
			return nil, errStoryBibleShape // ruleBible refused this already: load_json walked the same entries
		}
		entry := &bibleEntry{object: object, keys: map[string]bool{}}
		entry.id, _ = object.get("id")
		if _, err := pyKey(entry.id); err != nil {
			return nil, errStoryBibleShape
		}
		entries = append(entries, entry)
	}
	for _, entry := range entries {
		name, err := pyGet(entry.object, "canonical_name", "")
		text, ok := name.(string)
		if err != nil || !ok {
			return nil, errStoryBibleShape
		}
		entry.name = text
		entry.keys[normalizeName(text)] = true
		aliases, _ := pyGet(entry.object, "aliases", []any{})
		if pyTruthy(aliases) {
			walked, err := pyIter(aliases)
			if err != nil {
				return nil, errStoryBibleShape
			}
			for _, alias := range walked {
				value, err := pyGet(alias, "text", "")
				text, ok := value.(string)
				if err != nil || !ok {
					return nil, errStoryBibleShape
				}
				entry.keys[normalizeName(text)] = true
			}
		}
		delete(entry.keys, "")
	}
	b.entries = entries
	return entries, nil
}

// byName is extraction_rules.py _by_name: every normalized name an entry answers to, and each name a merge absorbed into one,
// mapped to that entry (the first to claim a name keeps it).
func (b *ruleBibleFile) byName() (map[string]*bibleEntry, error) {
	entries, err := b.entities()
	if err != nil {
		return nil, err
	}
	byID := map[string]*bibleEntry{}
	for _, entry := range entries {
		key, _ := pyKey(entry.id)
		byID[key] = entry
	}
	index := map[string]*bibleEntry{}
	for _, entry := range entries {
		for key := range entry.keys {
			if _, taken := index[key]; !taken {
				index[key] = entry
			}
		}
	}
	absorbed, ok := b.field("absorbed_names", &pyObject{values: map[string]any{}}).(*pyObject)
	if !ok {
		return nil, errStoryBibleShape // .items() on a list or text
	}
	for _, name := range absorbed.keys {
		target, err := pyKey(absorbed.values[name])
		if err != nil {
			return nil, errStoryBibleShape
		}
		if entry, ok := byID[target]; ok {
			if key := normalizeName(name); index[key] == nil {
				index[key] = entry
			}
		}
	}
	return index, nil
}

// ruleSuggestion is one line of the output.
type ruleSuggestion struct {
	rule, chapterID, paragraphID, quote string
	payload                             [][2]string // the payload's fields in order, each a key and its value already in JSON
}

// line is json.dumps(raw, ensure_ascii=False) of extraction_rules.py _raw: the keys in its order, ", " and ": " between them.
func (s ruleSuggestion) line() string {
	var out strings.Builder
	out.WriteString(`{"source": "rules", "rule": `)
	writePythonString(&out, s.rule)
	out.WriteString(`, "payload": {`)
	for i, field := range s.payload {
		if i > 0 {
			out.WriteString(", ")
		}
		writePythonString(&out, field[0])
		out.WriteString(": ")
		out.WriteString(field[1])
	}
	out.WriteString(`}, "confidence": `)
	confidence := RuleConfidence[s.rule]
	if confidence == nil {
		out.WriteString("null")
	} else {
		out.WriteString(pythonFloat(*confidence))
	}
	out.WriteString(`, "quotes": [{"paragraphId": `)
	writePythonString(&out, s.paragraphID)
	out.WriteString(`, "text": `)
	writePythonString(&out, s.quote)
	out.WriteString(`}], "chapterId": `)
	writePythonString(&out, s.chapterID)
	if confidence == nil {
		out.WriteString(`, "note": `)
		writePythonString(&out, NoScore)
	}
	out.WriteByte('}')
	return out.String()
}

func jsonText(text string) string {
	var out strings.Builder
	writePythonString(&out, text)
	return out.String()
}

func jsonList(items []string) string {
	quoted := make([]string, len(items))
	for i, item := range items {
		quoted[i] = jsonText(item)
	}
	return "[" + strings.Join(quoted, ", ") + "]"
}

// orderedGroups is the dict build_entities groups names into: keys in insertion order, a key removed when its candidates fold into another.
type orderedGroups struct {
	keys   []string
	groups map[string][]ruleCandidate
}

func (g *orderedGroups) add(key string, candidate ruleCandidate) {
	if _, ok := g.groups[key]; !ok {
		g.keys = append(g.keys, key)
	}
	g.groups[key] = append(g.groups[key], candidate)
}

func (g *orderedGroups) pop(key string) []ruleCandidate {
	group := g.groups[key]
	delete(g.groups, key)
	g.keys = slices.DeleteFunc(g.keys, func(k string) bool { return k == key })
	return group
}

// category is extraction_rules.py _category: the category most of a name's mentions classify as (the first to reach that count on
// a tie), Needs Review only when none is anything else.
func category(occurrences []ruleCandidate, paragraphs []ruleParagraph) string {
	var order []string
	votes := map[string]int{}
	for _, occurrence := range occurrences {
		paragraph := &paragraphs[occurrence.paragraph]
		if paragraph.lowered == nil {
			paragraph.lowered = []rune(compare.PyLower(string(paragraph.text)))
		}
		name := classify(occurrence, paragraph.lowered)
		if _, ok := votes[name]; !ok {
			order = append(order, name)
		}
		votes[name]++
	}
	best, count := categoryNeedsReview, 0
	for _, name := range order {
		if name != categoryNeedsReview && votes[name] > count {
			best, count = name, votes[name]
		}
	}
	return best
}

// nameSuggestions is extraction_rules.py name_suggestions over the scan's own name finder (scanGroups): entry and alias suggestions,
// the name with the strongest evidence first.
func nameSuggestions(ctx context.Context, paragraphs []ruleParagraph, bible *ruleBibleFile) ([]ruleSuggestion, error) {
	known, err := bible.byName()
	if err != nil {
		return nil, err
	}
	groups := scanGroups(paragraphs)
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	cores := map[string]int{}
	for _, group := range groups {
		cores[normalizeName(group.mentions[0].core)]++
	}
	out := []ruleSuggestion{}
	for _, group := range groups {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		occurrences := make([]ruleCandidate, len(group.mentions))
		for i, m := range group.mentions {
			occurrences[i] = ruleCandidate{name: m.spelling, paragraph: m.paragraph, start: m.start, end: m.end}
		}
		kind := category(occurrences, paragraphs)
		spellings, mentions := spellingsOf(group)
		first := map[string]ruleCandidate{}
		for spelling, m := range mentions {
			first[spelling] = ruleCandidate{name: spelling, paragraph: m.paragraph, start: m.start, end: m.end}
		}
		var entry *bibleEntry
		for _, spelling := range spellings {
			if found, ok := known[normalizeName(spelling)]; ok {
				entry = found
				break
			}
		}
		if core := normalizeName(group.mentions[0].core); entry == nil && cores[core] == 1 {
			entry = known[core] // the Story Bible's Darcy is the book's Mr. Darcy
		}
		if entry != nil {
			if locked, _ := entry.object.get("locked"); pyTruthy(locked) {
				continue
			}
		}
		suggestion := func(rule string, at ruleCandidate, payload [][2]string) ruleSuggestion {
			paragraph := paragraphs[at.paragraph]
			return ruleSuggestion{rule: rule, chapterID: paragraph.chapterID, paragraphID: paragraph.paragraphID,
				quote: sentenceAround(paragraph.text, at.start, at.end), payload: payload}
		}
		if category, _ := entryCategory(entry); entry == nil || category == categoryNeedsReview {
			name, rule, typ := spellings[0], RuleNewName, kind
			if entry != nil {
				rule = RuleNeedsReviewName
			}
			if kind == categoryNeedsReview {
				typ = ""
			}
			out = append(out, suggestion(rule, first[name], [][2]string{
				{"kind", `"entry"`}, {"name", jsonText(name)}, {"type", jsonText(typ)}, {"aliases", jsonList(spellings[1:])},
				{"description", `""`}, {"appearsIn", "[]"},
			}))
			continue
		}
		for _, spelling := range spellings {
			key := normalizeName(spelling)
			if other, ok := known[key]; entry.keys[key] || (ok && other != entry) {
				continue
			}
			out = append(out, suggestion(RuleKnownSpelling, first[spelling], [][2]string{
				{"kind", `"alias"`}, {"entry", jsonText(entry.name)}, {"alias", jsonText(spelling)},
			}))
		}
	}
	return out, nil
}

// entryCategory is entity.get("category") when it is text.
func entryCategory(entry *bibleEntry) (string, bool) {
	if entry == nil {
		return "", false
	}
	value, _ := entry.object.get("category")
	text, ok := value.(string)
	return text, ok
}

// speakingTypes is manuscript_guide.py speaking_types over guide_types: the names of the types whose entries speak, Character
// alone for a file with no types, and errStoryBibleTypes for a list guide_types refuses.
func (b *ruleBibleFile) speakingTypes() (map[string]bool, error) {
	stored, ok := b.document.get("types")
	if !ok || stored == nil {
		return map[string]bool{categoryCharacter: true}, nil
	}
	rows, ok := stored.([]any)
	if !ok || len(rows) == 0 {
		return nil, errStoryBibleTypes
	}
	seen := map[string]bool{}
	speaking := map[string]bool{}
	for _, item := range rows {
		row, ok := item.(*pyObject)
		if !ok {
			return nil, errStoryBibleTypes
		}
		name, isText := row.values["name"].(string)
		colour, _ := row.get("colour")
		colourText, _ := colour.(string)
		speaks, isBool := row.values["speaks"].(bool)
		if !isText || compare.PyStrip(name) == "" || seen[foldCase(name)] || !slices.Contains(typeColours, colourText) || !isBool {
			return nil, errStoryBibleTypes
		}
		seen[foldCase(name)] = true
		if speaks {
			speaking[name] = true
		}
	}
	return speaking, nil
}

// typeColours is manuscript_guide.py TYPE_COLOURS.
var typeColours = []string{"green", "blue", "violet", "amber", "teal", "rose"}

// characterIndex is manuscript_guide.py character_name_index: every normalized name of an entry of a speaking type, mapped to its
// id (the first entry to claim a name keeps it). A category that is a list or an object crashed the sidecar, as did a speaking entry
// with no id.
func characterIndex(entries []*bibleEntry, speaking map[string]bool) (map[string]any, error) {
	index := map[string]any{}
	for _, entry := range entries {
		value, _ := entry.object.get("category")
		if _, err := pyKey(value); err != nil {
			return nil, errStoryBibleShape
		}
		if text, ok := value.(string); !ok || !speaking[text] {
			continue
		}
		id, ok := entry.object.get("id")
		if !ok && len(entry.keys) > 0 {
			return nil, errStoryBibleShape // entity["id"], read once per name
		}
		for key := range entry.keys {
			if _, taken := index[key]; !taken {
				index[key] = id
			}
		}
	}
	return index, nil
}

// storedCues is `{cue.get("id"): cue for cue in story_bible.get("dialogue_cues") or []}`: the last cue with an id keeps it.
func (b *ruleBibleFile) storedCues() (map[string]*pyObject, error) {
	walked, err := pyIter(b.field("dialogue_cues", []any{}))
	if err != nil {
		return nil, errStoryBibleShape
	}
	cues := map[string]*pyObject{}
	for _, item := range walked {
		cue, ok := item.(*pyObject)
		if !ok {
			return nil, errStoryBibleShape
		}
		id, _ := cue.get("id")
		key, err := pyKey(id)
		if err != nil {
			return nil, errStoryBibleShape
		}
		cues[key] = cue
	}
	return cues, nil
}

// cueID is manuscript_guide.py cue_id.
func cueID(paragraphID string, start int, quote string) string {
	sum := sha1.Sum([]byte(paragraphID + ":" + strconv.Itoa(start) + ":" + quote)) //nolint:gosec // G401: an identifier
	return "cue-" + hex.EncodeToString(sum[:])[:12]
}

// speakerOf is the speaker findSpeechTag gives a quote.
func speakerOf(text []rune, start, end int, index map[string]any) any {
	speaker, _ := findSpeechTag(text, start, end, index)
	return speaker
}

// taggedSpan is extraction_rules.py _tagged_span: the quote with the speech tag that names speaker beside it, as a slice of text.
func taggedSpan(text []rune, start, end int, speaker any, index map[string]any) (string, bool) {
	names := func(tag speechTag) bool {
		id, ok := index[normalizeName(tag.name)]
		return speechVerbs[strings.ToLower(tag.verb)] && ok && pyEqual(id, speaker)
	}
	if tag, ok := tagAfter(pySlice(text, end, end+tagWindow)); ok && names(tag) {
		return compare.PyStrip(string(text[start : end+tag.end])), true
	}
	base := max(0, start-tagWindow)
	if tag, ok := tagBefore(text[base:start]); ok && names(tag) {
		return compare.PyStrip(string(text[base+tag.start : end])), true
	}
	return "", false
}

// speakerSuggestions is extraction_rules.py speaker_suggestions: a speaker for each quote a speech tag resolves to an entry of a
// speaking type, that the Story Bible does not already attribute that way. A Needs Review name is never one.
func speakerSuggestions(ctx context.Context, paragraphs []ruleParagraph, bible *ruleBibleFile) ([]ruleSuggestion, error) {
	entries, err := bible.entities()
	if err != nil {
		return nil, err
	}
	names := map[string]string{}
	for _, entry := range entries {
		key, _ := pyKey(entry.id)
		names[key] = entry.name
	}
	speaking, err := bible.speakingTypes()
	if err != nil {
		return nil, err
	}
	characters, err := characterIndex(entries, speaking)
	if err != nil {
		return nil, err
	}
	stored, err := bible.storedCues()
	if err != nil {
		return nil, err
	}
	out := []ruleSuggestion{}
	for _, paragraph := range paragraphs {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		text := paragraph.text
		for _, quote := range finditer(text, quoteAt) {
			start, end := quote[0], quote[1]
			speaker := speakerOf(text, start, end, characters)
			if speaker == nil {
				continue // continuation and proximity are not speech tags, so they never reach a suggestion
			}
			if previous := stored["S"+cueID(paragraph.paragraphID, start, string(text[start+1:end-1]))]; previous != nil && pyTruthy(previous) {
				corrected, _ := previous.get("corrected")
				was, _ := previous.get("speaker_entity_id")
				if pyTruthy(corrected) || pyEqual(was, speaker) {
					continue
				}
			}
			span, ok := taggedSpan(text, start, end, speaker, characters)
			if !ok {
				continue
			}
			key, err := pyKey(speaker)
			if err != nil {
				return nil, errStoryBibleShape
			}
			out = append(out, ruleSuggestion{rule: RuleSpeechTag, chapterID: paragraph.chapterID, paragraphID: paragraph.paragraphID, quote: span,
				payload: [][2]string{{"kind", `"speaker"`}, {"quote", jsonText(string(text[start:end]))}, {"speaker", jsonText(names[key])}}})
		}
	}
	return out, nil
}
