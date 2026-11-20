package main

import (
	"strconv"

	"desktop/internal/extractionport/localmodel"
	"desktop/internal/guide"
	"desktop/internal/settings"
)

// The narrator's settings for the local model that suggests a speaker for the lines the rules leave unknown (#3743), all under
// ManuscriptGuide: speaker_fallback (off unless turned on), speaker_fallback_model (which model) and
// speaker_fallback_max_quotes (how many lines one run may put to it).

// defaultSpeakerFallbackQuotes is the per-run cap when the setting is unset or out of range. It is a starting value: no run on a
// real model has measured what a run costs.
const defaultSpeakerFallbackQuotes = 20

// speakerFallbackOn reports whether the narrator turned the local model on.
func speakerFallbackOn(store *settings.Store) bool {
	value, _ := store.Effective("ManuscriptGuide", "speaker_fallback", "false")
	return value == "true"
}

// speakerFallbackQuotes is how many unknown lines one run may put to the model.
func speakerFallbackQuotes(store *settings.Store) int {
	value, _ := store.Effective("ManuscriptGuide", "speaker_fallback_max_quotes", strconv.Itoa(defaultSpeakerFallbackQuotes))
	if n, err := strconv.Atoi(value); err == nil && n >= 1 && n <= 200 {
		return n
	}
	return defaultSpeakerFallbackQuotes
}

// speakerFallbackProvider answers, at each attribution run, the fallback that run uses: none while the setting is off or no
// model is there to ask, so with the setting off the model is never asked. model is nil on this build: no local model ships
// yet, and a test passes the deterministic fake.
func speakerFallbackProvider(store *settings.Store, model localmodel.Asker) func() guide.SpeakerFallback {
	return func() guide.SpeakerFallback {
		if model == nil || store == nil || !speakerFallbackOn(store) {
			return nil
		}
		return localModelSpeakerFallback(localmodel.Source{Ask: model, MaxQuotes: func() int { return speakerFallbackQuotes(store) }})
	}
}
