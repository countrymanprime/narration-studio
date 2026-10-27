package main

import (
	"context"

	"desktop/internal/guide"
)

// The narrator's "Attribute speakers" button (owner question #20): find who speaks the quoted lines now, first time or again. A line the
// narrator confirmed or edited is never changed (guide.Service.AttributeSpeakers); the result says how many lines moved so the page can
// report it, and carries what undo needs.

// GuideCueSpeaker is one line's earlier suggested speaker, as GuideAttributeSpeakers returned it and GuideRestoreSpeakers takes it back.
type GuideCueSpeaker struct {
	CueID           string  `json:"cueId"`
	SpeakerEntityID *string `json:"speakerEntityId"`
	SpeakerSource   string  `json:"speakerSource"`
}

// GuideAttributeSpeakers attributes every unconfirmed quoted line and returns {cues, attributed, filled, changed, keptConfirmed,
// previous}. It runs under the same deadline as a refresh after an import, and a failure writes nothing.
func (h *Host) GuideAttributeSpeakers() (string, error) {
	service := h.services().guide
	if service == nil {
		return "", errNoProject
	}
	ctx, cancel := context.WithTimeout(context.Background(), cueRefreshTimeout)
	defer cancel()
	return encodeBinding(service.AttributeSpeakers(ctx))
}

// GuideRestoreSpeakers undoes an attribution run: it puts each listed line back to its earlier suggestion unless the narrator has
// confirmed or edited it since. It returns the number of lines restored.
func (h *Host) GuideRestoreSpeakers(previous []GuideCueSpeaker) (string, error) {
	service := h.services().guide
	if service == nil {
		return "", errNoProject
	}
	rows := make([]guide.CueSpeaker, len(previous))
	for i, row := range previous {
		rows[i] = guide.CueSpeaker(row)
	}
	return encodeBinding(service.RestoreSpeakers(rows))
}
