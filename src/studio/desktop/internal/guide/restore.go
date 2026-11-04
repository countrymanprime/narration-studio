package guide

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"

	"desktop/internal/pronunciationport"
)

// NotGenerated is the source of the value a name gets when no source knows it (manuscript_guide.py pronunciation()).
const NotGenerated = "not generated"

// maxConfidence is the longest confidence a restored value may name; the stored ones are single words (medium, narrator, unknown).
const maxConfidence = 40

// PronunciationCore is a kept alternate: the fields that are the pronunciation itself (pronunciationCore).
type PronunciationCore struct {
	IPA        string `json:"ipa"`
	Source     string `json:"source"`
	Confidence string `json:"confidence,omitempty"`
}

// Pronunciation is a name's whole pronunciation object as the Story Bible stores it. An empty optional field is a key the object
// does not have.
type Pronunciation struct {
	IPA        string             `json:"ipa"`
	Source     string             `json:"source"`
	Confidence string             `json:"confidence,omitempty"`
	Chosen     bool               `json:"chosen,omitempty"`
	Note       string             `json:"note,omitempty"`
	Alternate  *PronunciationCore `json:"alternate,omitempty"`
}

// RestorePronunciation writes the entity's name's (aliasIndex nil) or one alias's whole pronunciation object exactly as given, a key
// the value lacks removed: the undo of a pronunciation edit, with the value the page read before it. A locked entry, an unknown id
// and an alias out of range are refused as the other pronunciation edits refuse them; the value is checked before the file is read.
// sources are the source ids the caller knows beyond the registry's (the keyed online one); the registry's ids and labels, manual,
// "not generated" and an empty source are always taken.
func (s *Service) RestorePronunciation(id string, aliasIndex *int, value Pronunciation, sources []string) error {
	if err := checkRestored(value.IPA, value.Source, value.Confidence, sources); err != nil {
		return err
	}
	if utf8.RuneCountInString(value.Note) > maxPronunciationNote {
		return fmt.Errorf("A pronunciation's note is at most %d characters.", maxPronunciationNote) //nolint:staticcheck // shown to the narrator
	}
	if value.Alternate != nil {
		if err := checkRestored(value.Alternate.IPA, value.Alternate.Source, value.Alternate.Confidence, sources); err != nil {
			return err
		}
	}
	return s.mutateInHost(func(document map[string]any) (bool, error) {
		holder, err := pronunciationHolder(document, id, aliasIndex)
		if err != nil {
			return false, err
		}
		holder["pronunciation"] = value.object()
		return true, nil
	})
}

// object is the value as the file stores it.
func (p Pronunciation) object() map[string]any {
	object := map[string]any{"ipa": p.IPA, "source": p.Source}
	if p.Confidence != "" {
		object["confidence"] = p.Confidence
	}
	if p.Chosen {
		object["chosen"] = true
	}
	if p.Note != "" {
		object["note"] = p.Note
	}
	if p.Alternate != nil {
		alternate := map[string]any{"ipa": p.Alternate.IPA, "source": p.Alternate.Source}
		if p.Alternate.Confidence != "" {
			alternate["confidence"] = p.Alternate.Confidence
		}
		object["alternate"] = alternate
	}
	return object
}

// checkRestored checks one restored pronunciation: its IPA one line of at most maxUserPronunciation characters (empty is a name with
// nothing generated), a source the Story Bible can hold, and a short one-line confidence.
func checkRestored(ipa, source, confidence string, sources []string) error {
	switch {
	case strings.ContainsAny(ipa, "\r\n"):
		return errors.New("A pronunciation is one line.") //nolint:staticcheck // the sidecar's own words
	case utf8.RuneCountInString(ipa) > maxUserPronunciation:
		return fmt.Errorf("A pronunciation is at most %d characters.", maxUserPronunciation) //nolint:staticcheck // the sidecar's own words
	case strings.ContainsAny(confidence, "\r\n") || utf8.RuneCountInString(confidence) > maxConfidence:
		return fmt.Errorf("a pronunciation's confidence is one word of at most %d characters", maxConfidence)
	case !restorableSource(source, sources):
		return errors.New("that pronunciation source is not one of yours")
	}
	return nil
}

// restorableSource reports whether a pronunciation's source is one the Story Bible holds: none, the narrator's own, "not generated", a
// registered source by its id or its label (an older file names it by its label), or one of the caller's.
func restorableSource(source string, sources []string) bool {
	if source == "" || source == ManualSource || source == NotGenerated || slices.Contains(sources, source) {
		return true
	}
	for _, entry := range pronunciationport.Sources.Entries() {
		if source == entry.Name || source == entry.Descriptor.Label {
			return true
		}
	}
	return false
}
