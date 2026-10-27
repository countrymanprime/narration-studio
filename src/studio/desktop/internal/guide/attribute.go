package guide

import "context"

// CueSpeaker is one dialogue cue's machine-suggested speaker, as it stood before an attribution run changed it. It is what
// RestoreSpeakers puts back.
type CueSpeaker struct {
	CueID           string  `json:"cueId"`
	SpeakerEntityID *string `json:"speakerEntityId"`
	SpeakerSource   string  `json:"speakerSource"`
}

// SpeakerAttribution is what one attribution run did to the quoted lines.
type SpeakerAttribution struct {
	// Cues is every quoted line after the run; Attributed is how many of them have a speaker.
	Cues       int `json:"cues"`
	Attributed int `json:"attributed"`
	// Filled lines had no speaker and now have a suggested one; Changed lines had a suggested speaker and now have another (or none).
	Filled  int `json:"filled"`
	Changed int `json:"changed"`
	// KeptConfirmed lines are ones the narrator confirmed or edited; the run does not touch them.
	KeptConfirmed int `json:"keptConfirmed"`
	// Previous holds the earlier suggestion of every Filled and Changed line, for RestoreSpeakers.
	Previous []CueSpeaker `json:"previous"`
}

// AttributeSpeakers finds who speaks each quoted line, whenever the narrator asks, first run or re-run. It is RefreshCues over every
// chapter plus a report of what moved: a line the narrator confirmed or edited (corrected) keeps its speaker, and only unconfirmed lines
// are filled or changed. The file is written once, at the end, so a run that fails writes nothing and loses no confirmed work.
func (s *Service) AttributeSpeakers(ctx context.Context) (SpeakerAttribution, error) {
	before, err := s.DialogueCues()
	if err != nil {
		return SpeakerAttribution{}, err
	}
	counts, err := s.RefreshCues(ctx)
	if err != nil {
		return SpeakerAttribution{}, err
	}
	after, err := s.DialogueCues()
	if err != nil {
		return SpeakerAttribution{}, err
	}
	was := make(map[string]DialogueCue, len(before))
	for _, cue := range before {
		was[cue.ID] = cue
	}
	result := SpeakerAttribution{Cues: counts.Cues, Attributed: counts.Attributed, Previous: []CueSpeaker{}}
	for _, cue := range after {
		if cue.Corrected || cue.SpeakerSource == "correction" {
			result.KeptConfirmed++
			continue
		}
		prior, existed := was[cue.ID]
		if existed && sameSpeaker(prior.SpeakerEntityID, cue.SpeakerEntityID) {
			continue
		}
		if cue.SpeakerEntityID == nil && (!existed || prior.SpeakerEntityID == nil) {
			continue
		}
		if existed && prior.SpeakerEntityID != nil {
			result.Changed++
		} else {
			result.Filled++
		}
		previous := CueSpeaker{CueID: cue.ID, SpeakerSource: "unknown"}
		if existed {
			previous.SpeakerEntityID, previous.SpeakerSource = prior.SpeakerEntityID, prior.SpeakerSource
		}
		result.Previous = append(result.Previous, previous)
	}
	return result, nil
}

func sameSpeaker(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// RestoreSpeakers undoes an attribution run: each cue goes back to the suggestion it had, unless the narrator has confirmed or edited it
// since, which is never overwritten. It returns how many lines were restored.
func (s *Service) RestoreSpeakers(previous []CueSpeaker) (int, error) {
	restored := 0
	err := s.mutateInHost(func(document map[string]any) (bool, error) {
		cues, _ := document["dialogue_cues"].([]any)
		byID := make(map[string]CueSpeaker, len(previous))
		for _, row := range previous {
			byID[row.CueID] = row
		}
		for _, raw := range cues {
			cue, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			id, _ := cue["id"].(string)
			row, ok := byID[id]
			if !ok || truthy(cue["corrected"]) || cue["speaker_source"] == "correction" {
				continue
			}
			if row.SpeakerEntityID == nil {
				cue["speaker_entity_id"] = nil
			} else {
				cue["speaker_entity_id"] = *row.SpeakerEntityID
			}
			cue["speaker_source"] = row.SpeakerSource
			restored++
		}
		return restored > 0, nil
	})
	return restored, err
}
