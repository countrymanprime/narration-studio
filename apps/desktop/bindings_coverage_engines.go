package main

import (
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
)

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

// coverageRunDefaults is what a start naming no option would do, so the Check recordings dialog can show it and send
// back the narrator's changes to it (ADR 0864).
type coverageRunDefaults struct {
	Recheck        bool    `json:"recheck"`
	RecheckModel   string  `json:"recheckModel"`
	RecheckBelow   float64 `json:"recheckBelow"`
	Workers        int     `json:"workers"`
	ChunkSeconds   int     `json:"chunkSeconds"`
	OverlapSeconds int     `json:"overlapSeconds"`
}

// coverageEngines is CoverageEngines' answer: the engines in catalog order, the id a check would use now and what else
// a check would do.
type coverageEngines struct {
	Engines  []coverageEngine    `json:"engines"`
	Default  string              `json:"default"`
	Defaults coverageRunDefaults `json:"defaults"`
}

// CoverageEngines lists the engines a recording check can run: the approved Whisper models, in catalog order, each with
// its install state, the id of the one a start that names none would use (SN-Q62, ADR 0841) and, in defaults, the rest
// of what such a start would do: the second pass, the passages it takes and how a long item is cut up (ADR 0864). It
// reads the catalog and the settings, not a project, so the Check recordings dialog can offer the list before one is
// open. A start may name any listed id in options["model"] (CoverageStart).
func (h *Host) CoverageEngines() (string, error) {
	registry := h.registry()
	if registry.whisper == nil {
		return "", registry.catalogUnavailable("Whisper")
	}
	engines := make([]coverageEngine, 0)
	for _, model := range registry.whisper.Models() {
		engines = append(engines, coverageEngine{ID: model.ID, Label: model.DisplayName, Family: coverageEngineFamilyWhisper, InstallState: registry.whisper.State(model)})
	}
	store := h.services().settings
	return encodeBinding(coverageEngines{Engines: engines, Default: coverageDefaultEngine(store, engines), Defaults: coverageDefaults(store, engines)}, nil)
}

// coverageDefaultEngine is the model a start naming none would run: the cascade's first-pass model with the cascade on,
// else Transcript Compare's model_size. A configured model that is not approved falls back to the first listed
// engine so the default is always one of the list.
func coverageDefaultEngine(store *settings.Store, engines []coverageEngine) string {
	chosen := ""
	if choices, err := resolveCoverageChoices(store, nil); err == nil {
		chosen = choices.FirstPass
	}
	return listedOrFirst(engines, chosen)
}

// coverageDefaults is what a start naming no option would do. The second pass is on when the cascade is, and its model
// is always one of the listed engines, like the default.
func coverageDefaults(store *settings.Store, engines []coverageEngine) coverageRunDefaults {
	all := coverageSettings(store)
	return coverageRunDefaults{
		Recheck:        all.Cascade.Enabled,
		RecheckModel:   listedOrFirst(engines, all.Cascade.RecheckModel),
		RecheckBelow:   all.Cascade.UnsureBelow,
		Workers:        all.Parallel.Workers,
		ChunkSeconds:   all.Parallel.ChunkSeconds,
		OverlapSeconds: all.Parallel.OverlapSeconds,
	}
}

// listedOrFirst is id when an engine has it, else the first listed engine's id, else "".
func listedOrFirst(engines []coverageEngine, id string) string {
	for _, engine := range engines {
		if engine.ID == id {
			return id
		}
	}
	if len(engines) > 0 {
		return engines[0].ID
	}
	return ""
}
