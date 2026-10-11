package main

import (
	"errors"
	"fmt"
	"runtime"
	"strings"
	"unicode/utf8"

	"github.com/countrymanprime/narration-utils/shell/internal/guide"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
	"github.com/countrymanprime/narration-utils/shell/internal/pronunciationonline"
	"github.com/countrymanprime/narration-utils/shell/internal/pronunciationport"
)

// The narrator's pronunciation sources and one source's candidate for one word (SNB-2b, ADR 0792 decision 1, ADR 0405). Both
// bindings take a word and a source id and nothing else: no path, no passage, no project id, and no batch form. The sources
// come from three places that each know theirs - the port registry (the sidecar's sources), the online service (the keyed
// Merriam-Webster one) and the Story Bible setting (the default) - and this file only joins them.

// Kinds a source reports. generated and lookup are the port registry's; manual is the narrator's own entry.
const (
	pronunciationKindManual = "manual"
	// pronunciationNeedsNetwork and pronunciationNeedsLocalDictionary are the `needs` values on the wire.
	pronunciationNeedsNetwork         = "network"
	pronunciationNeedsLocalDictionary = "localDictionary"
	// maxPronunciationCandidateWord is the longest word a candidate is asked for, the sidecar's own limit.
	maxPronunciationCandidateWord = 80
)

// PronunciationSource is one source the narrator can pick for a name, and whether it can answer now.
type PronunciationSource struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Kind  string `json:"kind"`
	// Needs is what the source needs before it can answer: network or localDictionary. Absent for one that needs nothing.
	Needs     string `json:"needs,omitempty"`
	Available bool   `json:"available"`
	// Reason is one sentence saying why the source is not available; absent when it is.
	Reason string `json:"reason,omitempty"`
}

// PronunciationSourceList is the sources in the order they are offered (the registry's, the keyed online one when a key is
// stored, then manual last) and the one taken first for a name that has nothing yet.
type PronunciationSourceList struct {
	Sources []PronunciationSource `json:"sources"`
	Default string                `json:"default"`
}

// PronunciationSources lists the sources and the default. The default is the narrator's setting when that source is available,
// otherwise the first available source in registry order (ADR 0405); never an unavailable one, and never manual.
func (h *Host) PronunciationSources() (string, error) {
	return encodeBinding(h.pronunciationSourceList(), nil)
}

func (h *Host) pronunciationSourceList() PronunciationSourceList {
	list := PronunciationSourceList{Sources: []PronunciationSource{}}
	_, dictionaryErr := h.wiktextractInstalled()
	for _, facts := range pronunciationport.SourceFacts(runtime.GOOS) {
		source := PronunciationSource{ID: facts.ID, Label: facts.Label, Kind: facts.Kind, Available: true}
		if facts.NeedsLocalDictionary {
			source.Needs = pronunciationNeedsLocalDictionary
			if dictionaryErr != nil {
				source.Available, source.Reason = false, facts.Label+" is not installed yet: install it in Settings first."
			}
		}
		if facts.NeedsNetwork {
			source.Needs = pronunciationNeedsNetwork
		}
		list.Sources = append(list.Sources, source)
	}
	if status, err := h.pronunciationOnline.KeyStatus(); err == nil && status.Present {
		list.Sources = append(list.Sources, PronunciationSource{ID: status.Source, Label: status.Label, Kind: pronunciationport.KindLookup, Needs: pronunciationNeedsNetwork, Available: true})
	}
	list.Sources = append(list.Sources, PronunciationSource{ID: guide.ManualSource, Label: "Entered by me", Kind: pronunciationKindManual, Available: true})
	list.Default = h.pronunciationDefault(list.Sources)
	return list
}

// pronunciationDefault is the narrator's setting when it names an available source, else the first available one that is not manual.
func (h *Host) pronunciationDefault(sources []PronunciationSource) string {
	wanted := ""
	if settings := h.services().settings; settings != nil {
		wanted, _ = settings.Effective("ManuscriptGuide", "default_pronunciation_source", "")
	}
	first := ""
	for _, source := range sources {
		if !source.Available || source.Kind == pronunciationKindManual {
			continue
		}
		if source.ID == wanted {
			return wanted
		}
		if first == "" {
			first = source.ID
		}
	}
	return first
}

// wiktextractInstalled is the path of the installed Wiktextract index, or why there is none.
func (h *Host) wiktextractInstalled() (string, error) {
	manager, err := h.wiktextractManagerFor()
	if err != nil {
		return "", err
	}
	source, ok := manager.Default()
	if !ok {
		return "", errors.New("no Wiktextract pronunciation source is catalogued")
	}
	return manager.Installed(source.ID)
}

// PronunciationCandidate asks one source how it would say word, changing nothing. Every outcome is a result: a source that is not
// registered, not available or has nothing for the word, manual, and a word that is empty or too long are {ok:false, reason}
// with a sentence, never a thrown error. The online source is asked only here, for the one word, on the narrator's key.
func (h *Host) PronunciationCandidate(word, source string) (string, error) {
	return encodeBinding(h.pronunciationCandidate(word, source), nil)
}

func (h *Host) pronunciationCandidate(word, source string) guide.Candidate {
	word = strings.TrimSpace(word)
	miss := func(reason string) guide.Candidate { return guide.Candidate{Reason: reason} }
	switch {
	case source == guide.ManualSource:
		return miss("Type it in.")
	case word == "":
		return miss("Type a word or name to look up.")
	case utf8.RuneCountInString(word) > maxPronunciationCandidateWord:
		return miss(fmt.Sprintf("A word or name can be at most %d characters.", maxPronunciationCandidateWord))
	}
	var chosen *PronunciationSource
	for _, candidate := range h.pronunciationSourceList().Sources {
		if candidate.ID == source {
			chosen = &candidate
			break
		}
	}
	switch {
	case chosen == nil:
		return miss("That source is not available.")
	case !chosen.Available:
		return miss(chosen.Reason)
	case chosen.Needs == pronunciationNeedsNetwork:
		return h.onlineCandidate(word, chosen.Label)
	}
	service := h.services().guide
	if service == nil {
		return miss("The Story Bible is unavailable.")
	}
	answer, err := service.Candidate(word, source)
	switch {
	case errors.Is(err, port.ErrNotSupported):
		return miss("That source is not available.")
	case err != nil:
		return miss(chosen.Label + " could not answer for “" + word + "”.")
	}
	return answer
}

// onlineCandidate is the keyed online source's answer for word: the single word the narrator asked for goes to the service, which
// checks it and sends it with the key and nothing else. Its errors are fixed sentences that hold neither the word nor the key.
func (h *Host) onlineCandidate(word, label string) guide.Candidate {
	result, err := h.pronunciationOnline.Lookup(h.lookupContext(), word)
	switch {
	case err != nil && isPronunciationOnlineSentence(err):
		return guide.Candidate{Reason: sentence(err.Error())}
	case err != nil:
		return guide.Candidate{Reason: label + " could not answer."}
	case !result.Found || len(result.Pronunciations) == 0:
		return guide.Candidate{Reason: label + " has nothing for “" + word + "”."}
	}
	return guide.Candidate{OK: true, Say: result.Pronunciations[0].Spelling}
}

// isPronunciationOnlineSentence reports whether err is one of the online service's own fixed sentences.
func isPronunciationOnlineSentence(err error) bool {
	for _, known := range []error{
		pronunciationonline.ErrNoKey, pronunciationonline.ErrNotAWord, pronunciationonline.ErrKeyRefused,
		pronunciationonline.ErrRateLimited, pronunciationonline.ErrUnreachable, pronunciationonline.ErrUnavailable,
	} {
		if errors.Is(err, known) {
			return true
		}
	}
	return false
}

// sentence capitalizes text and ends it with a full stop.
func sentence(text string) string {
	if text == "" {
		return text
	}
	text = strings.ToUpper(text[:1]) + text[1:]
	if !strings.HasSuffix(text, ".") {
		text += "."
	}
	return text
}
