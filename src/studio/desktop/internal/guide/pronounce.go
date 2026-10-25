package guide

import (
	"encoding/json"
	"errors"
	"os"
	"slices"
	"strings"

	"desktop/internal/pronunciationport"
)

// This file is the narrator's Generate/Replace from a named source: manuscript_guide.py pronounce, which the sidecar ran until #2251
// moved it here. The sidecar is asked only for the pronunciation (`pronunciation --source`); the host reads the file, refuses, sets the
// value and writes the file. The file is read as load_json read it (pyLoadBible) and written as write_json wrote it (writePyDocument),
// so every byte the command does not change is written back as it was. tests/fixtures/guide-pronounce (frozen) pins both against the
// sidecar byte for byte (TestPronounceMatchesTheSidecar).

// errEntityNotFound is the sidecar's refusal for an id no entry has.
var errEntityNotFound = errors.New("Entity not found.") //nolint:staticcheck // the sidecar's own words, shown to the narrator

// errPronounceShape is the host's refusal where the sidecar's pronounce crashed on a value of the wrong type (a KeyError, TypeError or
// AttributeError, or a file that is not UTF-8): an entry with no id or name, a name that is not text, a pronunciation that is not an
// object. The sidecar's own refusals keep its words.
var errPronounceShape = errors.New("The Story Bible holds a value this pronunciation cannot be set in.") //nolint:staticcheck // shown to the narrator

// Pronounce sets the pronunciation of an entity's own name (aliasIndex nil) or one of its aliases from exactly the named source, marked
// chosen so a rebuild keeps it (mergeLocked), the narrator's own pronunciation it replaces kept as the alternate. A source the
// pronunciation port cannot ask is refused with its *port.NotSupportedError before anything is read. A locked entry, an id no entry has
// and an alias index out of range are refused before the source is asked, and a source with nothing for the name is refused in its
// own words; a refusal leaves the file as it was. It holds editMu from reading the file to writing it, the source's lookup included,
// so an edit made meanwhile is not lost under it.
func (s *Service) Pronounce(id string, aliasIndex *int, source string) error {
	if err := pronunciationport.CheckPronounce(source); err != nil {
		return err
	}
	if s.project == "" {
		return errNoProject
	}
	s.editMu.Lock()
	defer s.editMu.Unlock()
	err := pronounceFile(s.guidePath(), id, aliasIndex, func(name string) (*pyObject, error) { return s.sourcePronunciation(name, source) })
	s.held = nil
	return err
}

// sourcePronunciation asks the sidecar's `pronunciation --source` for name from that source alone: its value, or the source's reason
// it has none as the error. The name goes in a words file, exactly as the Story Bible holds it.
func (s *Service) sourcePronunciation(name, source string) (*pyObject, error) {
	if s.sourceLookup != nil {
		return s.sourceLookup(name, source)
	}
	path, remove, err := writeWordsFile([]string{name})
	if err != nil {
		return nil, err
	}
	defer remove()
	out, err := s.Run(append([]string{"pronunciation", "--source", source, "--words-file", path}, s.namedSourceArgs(source)...)...)
	if err != nil {
		return nil, err
	}
	return parseSourceAnswer(out)
}

// parseSourceAnswer reads the one line `pronunciation --source` prints for one word: the value, in the order Python wrote its keys,
// or {"miss": reason}, which is the error.
func parseSourceAnswer(out string) (*pyObject, error) {
	value, err := pyLoads(strings.TrimSpace(out))
	object, ok := value.(*pyObject)
	if err != nil || !ok {
		return nil, errPronunciationAnswer
	}
	if reason, missed := object.get("miss"); missed {
		text, ok := reason.(string)
		if !ok || len(object.keys) != 1 {
			return nil, errPronunciationAnswer
		}
		return nil, errors.New(text)
	}
	return object, nil
}

// pronounceFile is manuscript_guide.py pronounce over the Story Bible at path, lookup standing for pronounce_source: the refusals in the
// order the sidecar made them, then the lookup, then the value set and the file written.
func pronounceFile(path, id string, aliasIndex *int, lookup func(name string) (*pyObject, error)) error {
	var loaded any
	if raw, err := os.ReadFile(path); err == nil {
		if loaded, err = pyLoadBible(raw, errPronounceShape); err != nil {
			return err
		}
	}
	if !pyTruthy(loaded) {
		return errNoGuide
	}
	document, ok := loaded.(*pyObject)
	if !ok {
		return errPronounceShape // guide["entities"] on a list, a string or a number
	}
	holder, name, err := pronounceHolder(document, id, aliasIndex)
	if err != nil {
		return err
	}
	text, ok := name.(string)
	if !ok {
		return errPronounceShape // the sidecar handed it to the source, which crashed on it or made a value of it
	}
	fresh, err := lookup(text)
	if err != nil {
		return err
	}
	value := pyClone(fresh)
	value.set("chosen", true)
	prior, _ := holder.get("pronunciation")
	var stored *pyObject
	if pyTruthy(prior) {
		if stored, ok = prior.(*pyObject); !ok {
			return errPronounceShape // set_pronunciation's prior.get on a list, a string, a number or true
		}
	} else {
		stored = newPyObject()
	}
	holder.set("pronunciation", setPyPronunciation(stored, value))
	return writePyDocument(path, document)
}

// pronounceHolder is manuscript_guide.py _pronunciation_holder over the file as load_json read it: the entry (aliasIndex nil) or the
// alias whose pronunciation is set, and the name, whatever it holds. Where the sidecar crashed it is errPronounceShape.
func pronounceHolder(document *pyObject, id string, aliasIndex *int) (*pyObject, any, error) {
	entities, ok := document.get("entities")
	if !ok {
		return nil, nil, errPronounceShape
	}
	walked, err := pyIter(entities)
	if err != nil {
		return nil, nil, errPronounceShape
	}
	var entity *pyObject
	for _, item := range walked {
		candidate, ok := item.(*pyObject)
		if !ok {
			return nil, nil, errPronounceShape
		}
		found, ok := candidate.get("id")
		if !ok {
			return nil, nil, errPronounceShape
		}
		if pyEqual(found, id) {
			entity = candidate
			break
		}
	}
	if entity == nil {
		return nil, nil, errEntityNotFound
	}
	if locked, _ := entity.get("locked"); pyTruthy(locked) {
		return nil, nil, errEntityLocked
	}
	if aliasIndex == nil {
		name, ok := entity.get("canonical_name")
		if !ok {
			return nil, nil, errPronounceShape
		}
		return entity, name, nil
	}
	aliases, ok := entity.get("aliases")
	if !ok {
		aliases = []any{}
	}
	count, err := pyLen(aliases)
	if err != nil {
		return nil, nil, errPronounceShape
	}
	if *aliasIndex < 0 || *aliasIndex >= count {
		return nil, nil, errAliasRange
	}
	list, ok := aliases.([]any)
	if !ok {
		return nil, nil, errPronounceShape // a string's character or an object's key looked up by a number
	}
	alias, ok := list[*aliasIndex].(*pyObject)
	if !ok {
		return nil, nil, errPronounceShape
	}
	name, ok := alias.get("text")
	if !ok {
		return nil, nil, errPronounceShape
	}
	return alias, name, nil
}

// setPyPronunciation is manuscript_guide.py set_pronunciation over carry_pronunciation_work, on the objects as Python held them: next
// with prior's note, and as the alternate prior itself when it has an IPA and is of the other kind (the narrator's own or a source's),
// otherwise prior's alternate. Keys keep their places, and the alternate always goes last, as the sidecar wrote it.
func setPyPronunciation(prior, next *pyObject) *pyObject {
	value := pyClone(next)
	if note, _ := prior.get("note"); pyTruthy(note) {
		value.set("note", note)
	}
	alternate, _ := prior.get("alternate")
	value.remove("alternate")
	if ipa, _ := prior.get("ipa"); pyTruthy(ipa) && pyIsManual(prior) != pyIsManual(next) {
		value.set("alternate", pyCore(prior))
	} else if pyTruthy(alternate) {
		value.set("alternate", alternate)
	}
	return value
}

// pyIsManual is manuscript_guide.py _is_manual: the narrator typed it (source "manual", or the legacy "user").
func pyIsManual(value *pyObject) bool {
	source, _ := value.get("source")
	return source == ManualSource || source == legacyManualSource
}

// pyCore is manuscript_guide.py _pronunciation_core: the fields that are the pronunciation itself, in that order.
func pyCore(value *pyObject) *pyObject {
	core := newPyObject()
	for _, field := range []string{"ipa", "source", "confidence"} {
		if item, ok := value.get(field); ok {
			core.set(field, item)
		}
	}
	return core
}

// pyClone is dict(value): a new object with the same keys in the same order, the values shared.
func pyClone(value *pyObject) *pyObject {
	out := &pyObject{keys: slices.Clone(value.keys), values: make(map[string]any, len(value.values))}
	for key, item := range value.values {
		out.values[key] = item
	}
	return out
}

// remove is object.pop(key, None).
func (o *pyObject) remove(key string) {
	if _, ok := o.values[key]; !ok {
		return
	}
	delete(o.values, key)
	o.keys = slices.DeleteFunc(o.keys, func(k string) bool { return k == key })
}

// writeWordsFile writes words as the JSON list a `pronunciation --words-file` reads, in a temporary file, and returns its path and
// what removes it.
func writeWordsFile(words []string) (string, func(), error) {
	file, err := os.CreateTemp("", "guide-words-*.json")
	if err != nil {
		return "", nil, err
	}
	remove := func() { _ = os.Remove(file.Name()) }
	encoded, _ := json.Marshal(words) // a list of strings cannot fail to encode
	_, err = file.Write(encoded)
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		remove()
		return "", nil, err
	}
	return file.Name(), remove, nil
}
