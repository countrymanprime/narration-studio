package main

import (
	"desktop/internal/credits"
	"desktop/internal/creditsid"
	"desktop/internal/manuscript"
	"desktop/internal/project"
	"desktop/internal/settings"
)

// creditsChapters is the manuscript service's credits provider (manuscript.CreditsProvider): the opening and closing credits as the
// chapter list lists them. A kind with no template in the library is left out, as every page already draws nothing for it. The
// word count is the rendered template's, the status the one on the project manifest (CreditsStatuses).
//
// The provider is bound to the project its service was configured for, like the recorded-length and recorded-through providers:
// configureLocked captures folder and store, so a read still running after a switch answers that project's rows, never the new
// project's. It calls nothing that takes a services() snapshot.
func (h *Host) creditsChaptersOf(folder string, store *settings.Store) []manuscript.CreditsChapter {
	if h.creditTemplates == nil {
		return nil
	}
	templates, err := h.creditTemplates.List()
	if err != nil {
		return nil
	}
	statuses := map[string]string{}
	if folder != "" {
		if manifest, ok, err := project.Load(h.persist, folder); err == nil && ok && manifest != nil && manifest.CreditsStatus != nil {
			statuses = manifest.CreditsStatus
		}
	}
	tokens := h.creditTokensOf(folder, store)
	listed := []manuscript.CreditsChapter{}
	for _, kind := range creditsid.Kinds {
		for _, template := range templates {
			if template.Kind == kind {
				rendered := credits.Render(template.Body, tokens)
				listed = append(listed, manuscript.CreditsChapter{Kind: kind, Words: rendered.Words, Status: statuses[kind], Text: rendered.Text})
				break
			}
		}
	}
	return listed
}
