package main

import (
	"desktop/internal/guide"
)

// GuidePronunciationAlternate is a pronunciation's kept alternate as GuidePronunciationRestore takes it: ipa, source and, when it has one,
// confidence.
type GuidePronunciationAlternate struct {
	IPA        string `json:"ipa"`
	Source     string `json:"source"`
	Confidence string `json:"confidence,omitempty"`
}

// GuidePronunciationValue is a name's whole pronunciation object as GuideEntities returned it and GuidePronunciationRestore takes it back.
// An empty confidence or note, chosen false and a nil alternate are keys the object does not have.
type GuidePronunciationValue struct {
	IPA        string                       `json:"ipa"`
	Source     string                       `json:"source"`
	Confidence string                       `json:"confidence,omitempty"`
	Chosen     bool                         `json:"chosen,omitempty"`
	Note       string                       `json:"note,omitempty"`
	Alternate  *GuidePronunciationAlternate `json:"alternate,omitempty"`
}

// GuidePronunciationRestore writes the entity's name's (aliasIndex null) or one alias's whole pronunciation object exactly as given, a
// key the value lacks removed: the undo of a pronunciation edit. It returns the object as written. A locked entry, an unknown id and an
// alias out of range are refused as the other pronunciation edits refuse them; an IPA or note over its limit, or a source that is not
// a registered one, manual, "not generated" or none, is refused before the file is read.
func (h *Host) GuidePronunciationRestore(id string, aliasIndex *int, value GuidePronunciationValue) (string, error) {
	service := h.services().guide
	if service == nil {
		return "", errNoProject
	}
	restored := guide.Pronunciation{IPA: value.IPA, Source: value.Source, Confidence: value.Confidence, Chosen: value.Chosen, Note: value.Note}
	if value.Alternate != nil {
		alternate := guide.PronunciationCore(*value.Alternate)
		restored.Alternate = &alternate
	}
	if err := service.RestorePronunciation(id, aliasIndex, restored, h.onlinePronunciationSources()); err != nil {
		return "", err
	}
	return encodeBinding(value, nil)
}

// onlinePronunciationSources are the keyed online source's id and label, whether or not a key is saved now: a value it gave earlier
// can be restored after the key is removed.
func (h *Host) onlinePronunciationSources() []string {
	if h.pronunciationOnline == nil {
		return nil
	}
	status, err := h.pronunciationOnline.KeyStatus()
	if err != nil {
		return nil
	}
	return []string{status.Source, status.Label}
}
