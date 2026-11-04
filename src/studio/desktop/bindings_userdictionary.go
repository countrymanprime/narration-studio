package main

import (
	"encoding/base64"
	"fmt"
	"strings"

	"desktop/internal/guide"
	"desktop/internal/pronunciationport"
	"desktop/internal/userdictionary"
)

// The project's user dictionary (#2595) and the pronunciation candidates a word has: each dictionary source's answer with its source,
// then the narrator's own saved values. A Story Bible name takes the candidate the narrator picks, through GuidePronunciationRestore.

// UserDictionarySave sets the narrator's own value for word (source user_dictionary), replacing an earlier one, and returns the word's
// entry. A Script value the migration imported is kept beside it.
func (h *Host) UserDictionarySave(word, say string) (string, error) {
	return encodeBinding(h.userDictionary().Save(word, say))
}

// UserDictionaryRemove removes the word's one record with this source (user_dictionary or script_imported) and say-value, and returns
// the word's entry; its records are empty when that was its last.
func (h *Host) UserDictionaryRemove(word, source, say string) (string, error) {
	return encodeBinding(h.userDictionary().Remove(word, source, say))
}

// userDictionary builds the store over one services() snapshot, so a project switch in the middle of a call never mixes two projects.
func (h *Host) userDictionary() *userdictionary.Service {
	return userdictionary.New(userdictionary.Config{Project: h.services().config.projectFolder, Reporter: h.persist})
}

// PronunciationCandidateRow is one source's way to say a word.
type PronunciationCandidateRow struct {
	SourceID string `json:"sourceId"`
	Label    string `json:"label"`
	Say      string `json:"say"`
}

// PronunciationMissRow is a source asked that had nothing, and why.
type PronunciationMissRow struct {
	SourceID string `json:"sourceId"`
	Label    string `json:"label"`
	Reason   string `json:"reason"`
}

// PronunciationCandidateSet is what PronunciationCandidates answers.
type PronunciationCandidateSet struct {
	Candidates []PronunciationCandidateRow `json:"candidates"`
	Misses     []PronunciationMissRow      `json:"misses"`
}

// PronunciationCandidates is every way the project's sources say word, each with its source: every available lookup or generated
// source that needs no network, in the order PronunciationSources lists them, asked as PronunciationCandidate asks one, then one
// candidate for each of the word's user dictionary records. The keyed online source is never asked here: a word goes to it only when
// the narrator picks it for that word (PronunciationCandidate). A source with nothing is a miss with its reason, never an error.
func (h *Host) PronunciationCandidates(word string) (string, error) {
	set := PronunciationCandidateSet{Candidates: []PronunciationCandidateRow{}, Misses: []PronunciationMissRow{}}
	for _, source := range h.pronunciationSourceList().Sources {
		if !source.Available || source.Needs == pronunciationNeedsNetwork || isUserDictionarySource(source.ID) ||
			(source.Kind != pronunciationport.KindLookup && source.Kind != pronunciationport.KindGenerated) {
			continue
		}
		answer := h.pronunciationCandidate(word, source.ID)
		if answer.OK {
			set.Candidates = append(set.Candidates, PronunciationCandidateRow{SourceID: source.ID, Label: source.Label, Say: answer.Say})
		} else {
			set.Misses = append(set.Misses, PronunciationMissRow{SourceID: source.ID, Label: source.Label, Reason: answer.Reason})
		}
	}
	records, err := h.userDictionary().Records(word)
	if err != nil {
		set.Misses = append(set.Misses, PronunciationMissRow{SourceID: userdictionary.SourceUser, Label: userdictionary.LabelUser, Reason: sentence(err.Error())})
	}
	for _, record := range records {
		set.Candidates = append(set.Candidates, PronunciationCandidateRow{SourceID: record.Source, Label: userdictionary.Label(record.Source), Say: record.Say})
	}
	return encodeBinding(set, nil)
}

// isUserDictionarySource reports whether a source id is one of the user dictionary's.
func isUserDictionarySource(id string) bool {
	return userdictionary.Label(id) != ""
}

// userDictionarySources are the user dictionary's two sources as PronunciationSources lists them.
func userDictionarySources() []PronunciationSource {
	return []PronunciationSource{
		{ID: userdictionary.SourceUser, Label: userdictionary.LabelUser, Kind: pronunciationport.KindLookup, Available: true},
		{ID: userdictionary.SourceScript, Label: userdictionary.LabelScript, Kind: pronunciationport.KindLookup, Available: true},
	}
}

// userDictionaryCandidate is the word's latest record of source, or a miss.
func (h *Host) userDictionaryCandidate(word, source string) guide.Candidate {
	records, err := h.userDictionary().Records(word)
	if err != nil {
		return guide.Candidate{Reason: sentence(err.Error())}
	}
	for index := len(records) - 1; index >= 0; index-- {
		if records[index].Source == source {
			return guide.Candidate{OK: true, Say: records[index].Say}
		}
	}
	return guide.Candidate{Reason: userdictionary.Label(source) + " has nothing for “" + strings.TrimSpace(word) + "”."}
}

// PronunciationPreview speaks text said as ipa in the preview voice, changing nothing: a candidate heard before the narrator picks it.
// It answers as GuidePreview does: {status:"ready", audioBase64, mimeType}, or asset_required while the preview voice is not installed.
func (h *Host) PronunciationPreview(text, ipa string) (string, error) {
	svc := h.services()
	voices := h.registry().tts
	if svc.guide == nil || voices == nil {
		return "", fmt.Errorf("the pronunciation preview is unavailable")
	}
	voiceID, _ := svc.settings.Effective("Piper", "tts_voice_id", "en_US-ljspeech-high")
	voice, knownVoice := voices.Voice(voiceID)
	if !knownVoice {
		return "", fmt.Errorf("the selected preview voice is not in the approved catalog")
	}
	model, _, err := voices.Paths(voiceID)
	if err != nil {
		return encodeBinding(voiceAssetRequired(voice, voices.State(voice), voices.InstallDir(voice.ID)), nil)
	}
	audio, err := svc.guide.PreviewText(text, ipa, guide.PreviewVoice{ID: voiceID, Model: model, Provider: voice.Provider, Version: voice.Version})
	return encodeBinding(map[string]any{"status": "ready", "audioBase64": base64.StdEncoding.EncodeToString(audio), "mimeType": "audio/wav"}, err)
}
