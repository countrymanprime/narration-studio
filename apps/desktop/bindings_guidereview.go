package main

import "fmt"

// A Story Bible entry's review flags and its speaker colour (SNB-3b, SNB-4b). They live in their own file so bindings.go stays as it is;
// each is one sidecar call on the entry, refused on a locked entry like every edit (ADR 0007), and returns nothing.

// GuideMarkReviewed clears the review flags of the entry and every name (aliasIndex nil), or of one name; the entry is reviewed when
// nothing is left to look at.
func (h *Host) GuideMarkReviewed(id string, aliasIndex *int) (string, error) {
	service := h.services().guide
	if service == nil {
		return "", fmt.Errorf("the Story Bible is unavailable")
	}
	return encodeBinding(nil, service.MarkReviewed(id, aliasIndex))
}

// GuideFlagReview flags the entry (aliasIndex nil), or one name, as needing review: the undo of GuideMarkReviewed, and the call that
// flags an entry an accepted automatic suggestion changed.
func (h *Host) GuideFlagReview(id string, aliasIndex *int) (string, error) {
	service := h.services().guide
	if service == nil {
		return "", fmt.Errorf("the Story Bible is unavailable")
	}
	return encodeBinding(nil, service.FlagReview(id, aliasIndex))
}

// GuideSetSpeakerColor sets a character's speaker colour, 1 to 7 (--speaker-N, ADR 0367), which wins over the stable pick; nil or 0
// puts it back to automatic. A category that cannot speak is refused.
func (h *Host) GuideSetSpeakerColor(id string, index *int) (string, error) {
	service := h.services().guide
	if service == nil {
		return "", fmt.Errorf("the Story Bible is unavailable")
	}
	return encodeBinding(nil, service.SetSpeakerColor(id, index))
}
