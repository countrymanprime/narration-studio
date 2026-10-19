package guide

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"
	"sync"
)

// This file is manuscript_guide.py `create` and the alias branch of `edit`, in the host. Both need a pronunciation for every name they
// add, and that comes from the dictionaries and eSpeak, which stay in the sidecar: the host writes the file and asks the sidecar for
// the pronunciations alone (`pronunciation-lookup`, stateless, like `candidate`). The search for the names in the manuscript, the
// description a manuscript gives, the checks and the write are the host's.
//
// The pronunciations are looked up between two passes over the file, never while the host holds it: a lookup starts a process (a
// second or more when frozen and cold), and a Save must not wait for it. The first pass runs the command up to the point where it needs
// a pronunciation it does not have and stops there with the names (needPronunciations), having changed nothing. The host asks for them,
// and the second pass runs the whole command again on the file as it is then (another writer may have changed it meanwhile), with the
// answers in hand. A command that is refused never asks for a pronunciation.
//
// create.go and the parity test (create_test.go, testdata/create-parity.json, recorded by test_create_parity.py) replay the sidecar's
// `create` and `edit` with `aliases` over a stand-in for the lookup, so no Python starts in the Go job.

// defaultLookupTimeout bounds one pronunciation lookup. It starts a process like a preview does, and a cold frozen start is slow, so it is as
// long as previewTimeout.
const defaultLookupTimeout = previewTimeout

// maxLookupRounds is how many times a command is run again because the file changed while the pronunciations were looked up and
// it then needed names it had not asked for. The second pass nearly always finishes the command.
const maxLookupRounds = 3

// maxLookupArguments is how many bytes of names one sidecar process is given. Windows allows 32,767 characters on a command line, and a
// name is up to three bytes a character there, so a batch stays well inside it.
const maxLookupArguments = 8000

var (
	errNameRequired    = errors.New("Name is required.")                                                                    //nolint:staticcheck // the sidecar's own words
	errNameExists      = errors.New("An entity with this name already exists.")                                             //nolint:staticcheck // the sidecar's own words
	errNoEntryList     = errors.New("The Story Bible has no list of entries to add to.")                                    //nolint:staticcheck // shown to the narrator; the sidecar crashes here
	errLookupMoved     = errors.New("The Story Bible changed while its pronunciations were looked up. Try again.")          //nolint:staticcheck // shown to the narrator
	errLookupTimedOut  = errors.New("Looking up the pronunciations took too long. Nothing was changed.")                    //nolint:staticcheck // shown to the narrator
	errLookupUnreadble = errors.New("The pronunciation lookup gave an answer that could not be read. Nothing was changed.") //nolint:staticcheck // shown to the narrator
	errNameHasNUL      = errors.New("A name cannot hold a NUL character.")                                                  //nolint:staticcheck // shown to the narrator
)

// pronunciations are the answers of a lookup: the whole value pronunciation() gave, by the name it was asked for.
type pronunciations map[string]map[string]any

// needPronunciations is what a pass returns when it has no pronunciation for some names yet. It has changed nothing.
type needPronunciations struct{ names []string }

func (n *needPronunciations) Error() string {
	return "the pronunciations of " + strings.Join(n.names, ", ") + " are needed"
}

// pronouncer hands a pass the pronunciations it has and notes the names it lacks.
type pronouncer struct {
	known   pronunciations
	missing []string
}

// of is the pronunciation of name, copied so a pass can keep it; a name not looked up yet is noted and answers an empty one, which a
// pass that has a missing name never writes (need).
func (p *pronouncer) of(name string) map[string]any {
	if value, ok := p.known[name]; ok {
		copied, _ := deepCopy(value).(map[string]any)
		return copied
	}
	if !slices.Contains(p.missing, name) {
		p.missing = append(p.missing, name)
	}
	return map[string]any{}
}

// need is the error that asks for the names this pass lacked, or nil when it lacked none.
func (p *pronouncer) need() error {
	if len(p.missing) == 0 {
		return nil
	}
	return &needPronunciations{names: p.missing}
}

// withPronunciations runs pass until it gets what it needs: whenever it asks for pronunciations they are looked up (not under editMu) and
// it runs again with them. The names are looked up once, so a pass that needs a name again after a lookup has been told it.
func (s *Service) withPronunciations(pass func(known pronunciations) error) error {
	known := pronunciations{}
	for range maxLookupRounds {
		err := pass(known)
		var need *needPronunciations
		if !errors.As(err, &need) {
			return err
		}
		found, err := s.lookupNames(need.names)
		if err != nil {
			return err
		}
		maps.Copy(known, found)
	}
	return errLookupMoved
}

// lookupNames asks for the pronunciation of each name, once each.
func (s *Service) lookupNames(names []string) (pronunciations, error) {
	names = slices.Compact(slices.Sorted(slices.Values(names)))
	lookup := s.lookup
	if lookup == nil {
		lookup = s.sidecarPronunciations
	}
	values, err := lookup(names)
	if err != nil {
		return nil, err
	}
	if len(values) != len(names) {
		return nil, errLookupUnreadble
	}
	found := make(pronunciations, len(names))
	for index, name := range names {
		if values[index] == nil {
			return nil, errLookupUnreadble
		}
		found[name] = values[index]
	}
	return found, nil
}

// sidecarPronunciations is the lookup in the app: `pronunciation-lookup --name=... --name=...`, in as few processes as the command line
// allows. Each name goes as --name=VALUE, so a name that starts with "-" stays a value.
func (s *Service) sidecarPronunciations(names []string) ([]map[string]any, error) {
	var values []map[string]any
	for len(names) > 0 {
		size, count := 0, 0
		for count < len(names) && (count == 0 || size+len(names[count]) <= maxLookupArguments) {
			if strings.ContainsRune(names[count], 0) {
				return nil, errNameHasNUL
			}
			size += len(names[count]) + len("--name=")
			count++
		}
		batch, err := s.lookupBatch(names[:count])
		if err != nil {
			return nil, err
		}
		values = append(values, batch...)
		names = names[count:]
	}
	return values, nil
}

func (s *Service) lookupBatch(names []string) ([]map[string]any, error) {
	args := []string{"pronunciation-lookup"}
	for _, name := range names {
		args = append(args, "--name="+name)
	}
	args = append(args, s.defaultPronunciationSourceArgs()...)
	timeout := s.lookupTimeout
	if timeout == 0 {
		timeout = defaultLookupTimeout
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	out, err := s.runContext(ctx, args...)
	if ctx.Err() != nil {
		return nil, errLookupTimedOut
	}
	if err != nil {
		return nil, fmt.Errorf("the pronunciations could not be looked up: %w", err)
	}
	decoder := json.NewDecoder(strings.NewReader(out))
	decoder.UseNumber()
	var reply struct {
		Pronunciations []map[string]any `json:"pronunciations"`
	}
	if err := decoder.Decode(&reply); err != nil || len(reply.Pronunciations) != len(names) {
		return nil, errLookupUnreadble
	}
	return reply.Pronunciations, nil
}

// createRequest is what a create is asked for, with what its passes keep: the manuscript is read once, and so are the occurrences, which
// do not depend on the Story Bible.
type createRequest struct {
	name, category, aliases, description, properties string

	paragraphs  []textParagraph
	loaded      bool
	occurrences map[string][]any
}

func (r *createRequest) found(manuscriptPath, name string) ([]any, error) {
	if !r.loaded {
		paragraphs, err := narration(manuscriptPath)
		if err != nil {
			return nil, err
		}
		r.paragraphs, r.loaded, r.occurrences = paragraphs, true, map[string][]any{}
	}
	if found, ok := r.occurrences[name]; ok {
		return found, nil
	}
	r.occurrences[name] = findOccurrences(r.paragraphs, name)
	return r.occurrences[name], nil
}

// CreateFull creates an entry with its description and its properties. It is manuscript_guide.py create, in the host: the sidecar is
// asked only for the pronunciations of the name and each alias. A Story Bible that is not there, or holds an empty object, is started.
// Refusals come in the sidecar's order and with its words: the type, the name, the properties, an entry with the same id, then the
// manuscript. The aliases are split at ";" after joining, as the sidecar's command line does.
func (s *Service) CreateFull(name, category string, aliases []string, description string, properties []Property) (string, error) {
	if s.project == "" {
		return "", errNoProject
	}
	request := &createRequest{name: name, category: category, aliases: strings.Join(aliases, ";"), description: description}
	if len(properties) > 0 {
		encoded, _ := json.Marshal(properties) // a slice of two strings cannot fail to encode
		request.properties = string(encoded)
	}
	var created string
	err := s.withPronunciations(func(known pronunciations) error {
		return s.changeInHost(true, func(document map[string]any) (bool, error) {
			id, err := request.create(document, s.manuscript(), &pronouncer{known: known})
			created = id
			return err == nil, err
		})
	})
	if err != nil {
		return "", err
	}
	return created, nil
}

// create is the body of create: the entry is added to the document.
func (r *createRequest) create(document map[string]any, manuscriptPath string, pronounce *pronouncer) (string, error) {
	category := pythonStrip(r.category)
	if category == "" {
		category = "Draft"
	}
	if category != "Draft" {
		types, err := documentTypeNames(document)
		if err != nil {
			return "", err
		}
		if !slices.Contains(types, category) {
			return "", fmt.Errorf("Unknown category: %s", category) //nolint:staticcheck // the sidecar's own words, shown to the narrator
		}
	}
	name := pythonStrip(r.name)
	if name == "" {
		return "", errNameRequired
	}
	properties, err := parseProperties(r.properties)
	if err != nil {
		return "", err
	}
	entities, ok := document["entities"].([]any)
	if !ok {
		return "", errNoEntryList
	}
	id := entityID(name)
	if slices.ContainsFunc(entities, func(raw any) bool { return idOf(raw) == id }) {
		return "", errNameExists
	}
	aliasNames := splitAliases(r.aliases)
	canonical, err := r.found(manuscriptPath, name)
	if err != nil {
		return "", err
	}
	aliases := make([]any, 0, len(aliasNames))
	for _, aliasName := range aliasNames {
		occurrences, _ := r.found(manuscriptPath, aliasName) // the manuscript is loaded: found refused above or not at all
		aliases = append(aliases, map[string]any{"text": aliasName, "pronunciation": pronounce.of(aliasName), "occurrences": occurrences})
	}
	described := map[string]any{"text": "", "evidence": map[string]any{}}
	if len(canonical) > 0 {
		described = directDescription(name, canonical)
	}
	if r.description != "" {
		described["text"] = r.description
	}
	entity := map[string]any{
		"id":                id,
		"canonical_name":    name,
		"aliases":           aliases,
		"category":          category,
		"occurrences":       canonical,
		"pronunciation":     pronounce.of(name),
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
	if err := pronounce.need(); err != nil {
		return "", err
	}
	entity["occurrence_count"] = occurrenceCount(entity)
	document["entities"] = append(slices.Clone(entities), entity)
	return id, nil
}

// splitAliases is how create and an alias edit read the aliases: split at ";", each trimmed, the blank ones dropped.
func splitAliases(text string) []string {
	names := []string{}
	for item := range strings.SplitSeq(text, ";") {
		if item = pythonStrip(item); item != "" {
			names = append(names, item)
		}
	}
	return names
}

// aliasEdit is what an edit of the aliases needs besides the entry: the manuscript, read once, and the pronunciations.
type aliasEdit struct {
	paragraphs []textParagraph
	loaded     bool
	pronounce  *pronouncer
}

// load reads the manuscript, once.
func (a *aliasEdit) load(path string) error {
	if a.loaded {
		return nil
	}
	paragraphs, err := narration(path)
	if err != nil {
		return err
	}
	a.paragraphs, a.loaded = paragraphs, true
	return nil
}

// applyAliases is the "aliases" branch of apply_edit: the entry's aliases become the requested ones. One that is already there (in any
// case) is kept as it was, with its pronunciation and where it occurs; a new one gets a pronunciation and its occurrences in the
// manuscript. The count is made again, and so are the review flags, for an entry that has them.
func applyAliases(entity map[string]any, value string, edit *aliasEdit) {
	existing := map[string]map[string]any{}
	for _, raw := range listOf(entity["aliases"]) {
		if alias, ok := raw.(map[string]any); ok {
			if text, ok := alias["text"].(string); ok {
				existing[pythonLower(text)] = alias
			}
		}
	}
	aliases := []any{}
	for _, name := range splitAliases(value) {
		if alias, ok := existing[pythonLower(name)]; ok {
			aliases = append(aliases, alias)
			continue
		}
		aliases = append(aliases, map[string]any{"text": name, "pronunciation": edit.pronounce.of(name), "occurrences": findOccurrences(edit.paragraphs, name)})
	}
	entity["aliases"] = aliases
	entity["occurrence_count"] = occurrenceCount(entity)
	if _, has := entity["review"]; has {
		entry, flagged := entityReview(entity)
		names := make([]any, len(flagged))
		for index, text := range flagged {
			names[index] = text
		}
		entity["review"] = map[string]any{"entry": entry, "aliases": names}
	}
}

// directDescription is manuscript_guide.py direct_description: only an explicit appositive or copular description, never a guess. It
// looks in the sentences of each occurrence's text, for the name and then for its last word, for "<name> was|is a|an|the <what>" (a
// comma may follow the name), and answers "Explicitly described as <what>." with the sentence as its evidence. It reads the same way
// the regular expression does: what is a space, a word and the same letter are Python's (python-unicode.json).
func directDescription(name string, occurrences []any) map[string]any {
	tables := pythonUnicode()
	words := strings.FieldsFunc(name, func(r rune) bool { return tables.isSpace(r) })
	if len(words) == 0 {
		return map[string]any{"text": "", "evidence": map[string]any{}}
	}
	candidates := [][]literal{compileLiterals(tables, []rune(name)), compileLiterals(tables, []rune(words[len(words)-1]))}
	for _, raw := range occurrences {
		occurrence, _ := raw.(map[string]any)
		source, _ := getOr(occurrence, "text", getOr(occurrence, "excerpt", "")).(string)
		for _, sentence := range splitSentences(tables, []rune(source)) {
			for _, candidate := range candidates {
				if what, ok := describedAs(tables, sentence, candidate); ok {
					return map[string]any{
						"text":     "Explicitly described as " + pythonStrip(string(what)) + ".",
						"evidence": map[string]any{"chapter": occurrence["chapter"], "excerpt": pythonStrip(string(sentence))},
					}
				}
			}
		}
	}
	return map[string]any{"text": "", "evidence": map[string]any{}}
}

// splitSentences is SENTENCES.split, the pattern (?<=[.!?])\s+: the text is cut at a run of space that follows ".", "!" or "?".
func splitSentences(tables *pythonUnicodeTables, text []rune) [][]rune {
	var sentences [][]rune
	start := 0
	for at := 0; at < len(text); {
		if at > 0 && tables.isSpace(text[at]) && strings.ContainsRune(".!?", text[at-1]) {
			end := at
			for end < len(text) && tables.isSpace(text[end]) {
				end++
			}
			sentences = append(sentences, text[start:at])
			start, at = end, end
			continue
		}
		at++
	}
	return append(sentences, text[start:])
}

var (
	verbLiterals = sync.OnceValue(func() [][]literal {
		tables := pythonUnicode()
		return [][]literal{compileLiterals(tables, []rune("was")), compileLiterals(tables, []rune("is"))}
	})
	articleLiterals = sync.OnceValue(func() [][]literal {
		tables := pythonUnicode()
		return [][]literal{compileLiterals(tables, []rune("an")), compileLiterals(tables, []rune("a")), compileLiterals(tables, []rune("the"))}
	})
)

// describedAs searches the sentence, from its start, for the first place the candidate name stands as a whole word followed by
// \s*(?:,\s*)?(?:was|is)\s+(?:an?|the)\s+([^,.!;]+), and answers the text of the last group.
func describedAs(tables *pythonUnicodeTables, sentence []rune, name []literal) ([]rune, bool) {
	for at := 0; at+len(name) <= len(sentence); at++ {
		if !matchesAt(tables, name, sentence, at) {
			continue
		}
		end := at + len(name)
		if !atBoundary(tables, sentence, at) || !atBoundary(tables, sentence, end) {
			continue
		}
		if what, ok := describedTail(tables, sentence, end); ok {
			return what, true
		}
	}
	return nil, false
}

func skipSpace(tables *pythonUnicodeTables, text []rune, at int) int {
	for at < len(text) && tables.isSpace(text[at]) {
		at++
	}
	return at
}

func literalsAt(tables *pythonUnicodeTables, pattern []literal, text []rune, at int) bool {
	return at+len(pattern) <= len(text) && matchesAt(tables, pattern, text, at)
}

// describedTail matches what follows the name. Each step is greedy and, where the regular expression could backtrack, the only
// alternative that can succeed is tried: a space given back by \s* or \s+ never starts the next element, except the one \s+ gives
// to the last group when the group would otherwise be empty.
func describedTail(tables *pythonUnicodeTables, text []rune, at int) ([]rune, bool) {
	at = skipSpace(tables, text, at)
	if at < len(text) && text[at] == ',' {
		at = skipSpace(tables, text, at+1)
	}
	for _, verb := range verbLiterals() {
		if !literalsAt(tables, verb, text, at) {
			continue
		}
		gap := at + len(verb)
		first := skipSpace(tables, text, gap)
		if first == gap {
			continue
		}
		for _, article := range articleLiterals() {
			if !literalsAt(tables, article, text, first) {
				continue
			}
			spaceFrom := first + len(article)
			groupFrom := skipSpace(tables, text, spaceFrom)
			if groupFrom == spaceFrom {
				continue
			}
			end := groupFrom
			for end < len(text) && !strings.ContainsRune(",.!;", text[end]) {
				end++
			}
			if end > groupFrom {
				return text[groupFrom:end], true
			}
			if groupFrom-spaceFrom >= 2 { // \s+ gives one space back, and the group is that space
				return text[groupFrom-1 : groupFrom], true
			}
		}
	}
	return nil, false
}
