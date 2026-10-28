package main

import (
	"desktop/internal/credits"
	"desktop/internal/manuscript"
	"desktop/internal/project"
)

// creditsChapters is the manuscript service's credits provider (manuscript.CreditsProvider): the opening and closing credits as the
// chapter list lists them. A kind with no template in the library is left out, as every page already draws nothing for it. The
// word count is the rendered template's, the status the one on the project manifest (CreditsStatuses).
func (h *Host) creditsChapters() []manuscript.CreditsChapter {
	if h.creditTemplates == nil {
		return nil
	}
	templates, err := h.creditTemplates.List()
	if err != nil {
		return nil
	}
	statuses := map[string]string{}
	if folder := h.services().config.projectFolder; folder != "" {
		if manifest, ok, err := project.Load(h.persist, folder); err == nil && ok && manifest != nil && manifest.CreditsStatus != nil {
			statuses = manifest.CreditsStatus
		}
	}
	tokens := h.creditTokens()
	listed := []manuscript.CreditsChapter{}
	for _, kind := range []string{"opening", "closing"} {
		for _, template := range templates {
			if template.Kind == kind {
				listed = append(listed, manuscript.CreditsChapter{Kind: kind, Words: credits.Render(template.Body, tokens).Words, Status: statuses[kind]})
				break
			}
		}
	}
	return listed
}
