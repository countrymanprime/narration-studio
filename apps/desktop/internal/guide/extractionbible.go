package guide

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction/apply"
)

// ExtractionBible lets the extraction apply step write the Story Bible through the commands the Service already has, so the lock rule
// (ADR 0007) and the sidecar's own checks hold for every write. It writes no file itself.
func (s *Service) ExtractionBible() apply.Bible { return extractionBible{s} }

type extractionBible struct{ s *Service }

func text(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

// Entries reads the Story Bible in the shape the apply step uses.
func (b extractionBible) Entries() ([]apply.Entry, error) {
	entities, err := b.s.Entities()
	if err != nil {
		return nil, err
	}
	out := make([]apply.Entry, 0, len(entities))
	for _, m := range entities {
		e := apply.Entry{ID: text(m, "id"), Name: text(m, "canonical_name"), Category: text(m, "category")}
		e.Locked, _ = m["locked"].(bool)
		if d, ok := m["description"].(map[string]any); ok {
			e.Description = text(d, "text")
		}
		aliases, _ := m["aliases"].([]any)
		for _, raw := range aliases {
			if a, ok := raw.(map[string]any); ok {
				e.Aliases = append(e.Aliases, text(a, "text"))
			}
		}
		if review, ok := m["review"].(map[string]any); ok {
			e.FlaggedEntry, _ = review["entry"].(bool)
			flagged, _ := review["aliases"].([]any)
			for _, raw := range flagged {
				if a, ok := raw.(string); ok {
					e.FlaggedAliases = append(e.FlaggedAliases, a)
				}
			}
		}
		properties, _ := m["properties"].([]any)
		for _, raw := range properties {
			if p, ok := raw.(map[string]any); ok {
				e.Properties = append(e.Properties, apply.Property{Key: text(p, "key"), Value: text(p, "value")})
			}
		}
		relations, _ := m["relationships"].([]any)
		for _, raw := range relations {
			if r, ok := raw.(map[string]any); ok {
				e.Relations = append(e.Relations, apply.Relation{To: text(r, "id"), Label: text(r, "label")})
			}
		}
		out = append(out, e)
	}
	return out, nil
}

// Cues reads the dialogue cues. A cue's quote_start and quote_end are compared with a suggestion's evidence as they are.
func (b extractionBible) Cues() ([]apply.Cue, error) {
	cues, err := b.s.DialogueCues()
	if err != nil {
		return nil, err
	}
	out := make([]apply.Cue, 0, len(cues))
	for _, c := range cues {
		cue := apply.Cue{ID: c.ID, ParagraphID: c.ParagraphID, Start: c.QuoteStart, End: c.QuoteEnd, Corrected: c.Corrected}
		if c.SpeakerEntityID != nil && *c.SpeakerEntityID != "unknown" {
			cue.SpeakerID = *c.SpeakerEntityID
		}
		out = append(out, cue)
	}
	return out, nil
}

func (b extractionBible) Create(name, category string, aliases []string, description string) (string, error) {
	return b.s.CreateDescribed(name, category, aliases, description)
}

func (b extractionBible) SetDescription(id, value string) error {
	return b.s.Edit(id, "description", value)
}

func (b extractionBible) SetAliases(id string, aliases []string) error {
	for _, a := range aliases {
		if strings.Contains(a, ";") {
			return fmt.Errorf("a name cannot contain a semicolon: %q", a)
		}
	}
	return b.s.Edit(id, "aliases", strings.Join(aliases, ";"))
}

func (b extractionBible) SetProperties(id string, properties []apply.Property) error {
	list := make([]Property, 0, len(properties))
	for _, p := range properties {
		list = append(list, Property{Key: p.Key, Value: p.Value})
	}
	encoded, err := json.Marshal(list)
	if err != nil {
		return err
	}
	return b.s.Edit(id, "properties", string(encoded))
}

func (b extractionBible) Relate(id, other, label string) error { return b.s.Relate(id, other, label) }
func (b extractionBible) Unrelate(id, other, label string) error {
	return b.s.Unrelate(id, other, label)
}
func (b extractionBible) Delete(id string) error { return b.s.Delete(id) }

func (b extractionBible) CorrectCue(cueID, speakerID string) error {
	return b.s.CorrectCue(cueID, speakerID)
}

// entry finds one entry and the position of a name in it (nil for the entry itself).
func (b extractionBible) entry(id, alias string) (apply.Entry, *int, error) {
	entries, err := b.Entries()
	if err != nil {
		return apply.Entry{}, nil, err
	}
	for _, e := range entries {
		if e.ID != id {
			continue
		}
		if alias == "" {
			return e, nil, nil
		}
		i := slices.Index(e.Aliases, alias)
		if i < 0 {
			return e, nil, fmt.Errorf("the entry has no name %q", alias)
		}
		return e, &i, nil
	}
	return apply.Entry{}, nil, fmt.Errorf("there is no entry %q", id)
}

func (b extractionBible) Flag(id, alias string) error {
	_, index, err := b.entry(id, alias)
	if err != nil {
		return err
	}
	return b.s.FlagReview(id, index)
}

// Unflag clears one flag. Clearing the entry's own flag keeps the flags of its names: mark-reviewed with no name clears them all, so they
// are put back.
func (b extractionBible) Unflag(id, alias string) error {
	e, index, err := b.entry(id, alias)
	if err != nil {
		return err
	}
	if alias != "" {
		return b.s.MarkReviewed(id, index)
	}
	if err := b.s.MarkReviewed(id, nil); err != nil {
		return err
	}
	for _, flagged := range e.FlaggedAliases {
		if err := b.Flag(id, flagged); err != nil {
			return err
		}
	}
	return nil
}
