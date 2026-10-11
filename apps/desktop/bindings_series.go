package main

// The Series tab of the Story Bible (ADR 0565, ADR 0567). The acoustic engine is benched, so this is reference data
// only: which characters a series' member projects share, their approved reference clips, and which book each clip came
// from. There is no per-book drift evidence.

import (
	"github.com/countrymanprime/narration-utils/shell/internal/character"
	"github.com/countrymanprime/narration-utils/shell/internal/guide"
	"github.com/countrymanprime/narration-utils/shell/internal/series"
)

// SeriesVoiceBible builds the current project's Series tab view: its series membership, and - only once the series has
// a second book with data to share - every member project's characters and approved reference clips, pooled by
// character id. A project outside any series, or in one with no other book yet, reads back with no character list at
// all: the honest empty state, never an error.
func (h *Host) SeriesVoiceBible() (string, error) {
	svc := h.services()
	if svc.config.projectFolder == "" {
		return "", errNoProject
	}
	var currentReferences func() ([]character.ApprovedReference, error)
	if svc.character != nil {
		currentReferences = svc.character.References
	}
	project := svc.config.projectFolder
	currentNames := func() (map[string]string, error) { return guide.ReadOnlyNames(project) }
	return encodeBinding(series.BuildVoiceBible(series.VoiceBibleConfig{
		SeriesStore:       h.series,
		CurrentProject:    project,
		CurrentReferences: currentReferences,
		CurrentNames:      currentNames,
	}))
}

// SeriesList lists every series the narrator has created, for managing series membership.
func (h *Host) SeriesList() (string, error) {
	return encodeBinding(h.series.List())
}

// SeriesSave creates a series (id empty) or updates one in place (an existing id), naming it and setting its member
// project paths. The narrator adds and removes books this way; there is no separate add/remove binding.
func (h *Host) SeriesSave(id, name string, memberProjectPaths []string) (string, error) {
	return encodeBinding(h.series.Save(series.Series{ID: id, Name: name, MemberProjectPaths: memberProjectPaths}))
}

// SeriesDelete removes a series by id. Deleting an id that is not present is not an error.
func (h *Host) SeriesDelete(id string) (string, error) {
	return encodeBinding(nil, h.series.Delete(id))
}
