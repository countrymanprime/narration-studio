package main

import "github.com/countrymanprime/narration-utils/shell/internal/settings"

// coverageEngineFamilyWhisper is the only engine family a recording check can run: Moonshine is the Booth's live
// engine (ADR 0414), not a recording-check one.
const coverageEngineFamilyWhisper = "whisper"

// coverageEngine is one engine a recording check can run.
type coverageEngine struct {
	ID           string `json:"id"`
	Label        string `json:"label"`
	Family       string `json:"family"`
	InstallState string `json:"installState"`
}

// coverageEngines is CoverageEngines' answer: the engines in catalog order and the id a check would use now.
type coverageEngines struct {
	Engines []coverageEngine `json:"engines"`
	Default string           `json:"default"`
}

// CoverageEngines lists the engines a recording check can run: the approved Whisper models, in catalog order, each with
// its install state, and the id of the one a start that names none would use (SN-Q62, ADR 0841). It reads the catalog
// and the settings, not a project, so the Check recordings dialog can offer the list before one is open. A start
// may name any listed id in options["model"] (CoverageStart).
func (h *Host) CoverageEngines() (string, error) {
	registry := h.registry()
	if registry.whisper == nil {
		return "", registry.catalogUnavailable("Whisper")
	}
	engines := make([]coverageEngine, 0)
	for _, model := range registry.whisper.Models() {
		engines = append(engines, coverageEngine{ID: model.ID, Label: model.DisplayName, Family: coverageEngineFamilyWhisper, InstallState: registry.whisper.State(model)})
	}
	return encodeBinding(coverageEngines{Engines: engines, Default: coverageDefaultEngine(h.services().settings, engines)}, nil)
}

// coverageDefaultEngine is the model a start naming none would run: the cascade's first-pass model with the cascade on,
// else Transcript Compare's model_size. A configured model that is not approved falls back to the first listed
// engine so the default is always one of the list.
func coverageDefaultEngine(store *settings.Store, engines []coverageEngine) string {
	chosen := coverageFirstPassModelID(store, nil)
	for _, engine := range engines {
		if engine.ID == chosen {
			return chosen
		}
	}
	if len(engines) > 0 {
		return engines[0].ID
	}
	return ""
}
