package apply

import (
	"errors"
	"fmt"
	"slices"
	"strings"
)

// FakeBible is an in-memory Bible that keeps the Story Bible's rules the apply step relies on: a locked entry refuses every write, a
// name is owned by one entry, and property keys are unique whatever their case. Tests use it in place of the sidecar.
type FakeBible struct {
	Entities []Entry
	CueList  []Cue
	next     int
}

var errLocked = errors.New("this entity is locked, unlock it before editing")

func (f *FakeBible) Entries() ([]Entry, error) {
	out := make([]Entry, len(f.Entities))
	for i, e := range f.Entities {
		e.Aliases = slices.Clone(e.Aliases)
		e.FlaggedAliases = slices.Clone(e.FlaggedAliases)
		e.Properties = slices.Clone(e.Properties)
		e.Relations = slices.Clone(e.Relations)
		out[i] = e
	}
	return out, nil
}

func (f *FakeBible) Cues() ([]Cue, error) { return slices.Clone(f.CueList), nil }

func (f *FakeBible) editable(id string) (*Entry, error) {
	i := slices.IndexFunc(f.Entities, func(e Entry) bool { return e.ID == id })
	if i < 0 {
		return nil, fmt.Errorf("no entity %q", id)
	}
	if f.Entities[i].Locked {
		return nil, errLocked
	}
	return &f.Entities[i], nil
}

func (f *FakeBible) Create(name, category string, aliases []string, description string) (string, error) {
	if _, taken := owner(f.Entities, name); taken {
		return "", errors.New("an entity with this name already exists")
	}
	f.next++
	id := fmt.Sprintf("e%d", f.next)
	f.Entities = append(f.Entities, Entry{ID: id, Name: name, Category: category, Description: description, Aliases: slices.Clone(aliases)})
	return id, nil
}

func (f *FakeBible) SetDescription(id, text string) error {
	e, err := f.editable(id)
	if err != nil {
		return err
	}
	e.Description = text
	return nil
}

func (f *FakeBible) SetAliases(id string, aliases []string) error {
	e, err := f.editable(id)
	if err != nil {
		return err
	}
	e.Aliases = slices.Clone(aliases)
	e.FlaggedAliases = slices.DeleteFunc(e.FlaggedAliases, func(a string) bool { return !slices.Contains(aliases, a) })
	return nil
}

func (f *FakeBible) SetProperties(id string, properties []Property) error {
	e, err := f.editable(id)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, p := range properties {
		if seen[strings.ToLower(p.Key)] {
			return fmt.Errorf("there are two properties named %q", p.Key)
		}
		seen[strings.ToLower(p.Key)] = true
	}
	e.Properties = slices.Clone(properties)
	return nil
}

func (f *FakeBible) Relate(id, other, label string) error {
	e, err := f.editable(id)
	if err != nil {
		return err
	}
	if !slices.Contains(e.Relations, Relation{To: other, Label: label}) {
		e.Relations = append(e.Relations, Relation{To: other, Label: label})
	}
	return nil
}

func (f *FakeBible) Unrelate(id, other, label string) error {
	e, err := f.editable(id)
	if err != nil {
		return err
	}
	e.Relations = slices.DeleteFunc(e.Relations, func(r Relation) bool { return r.To == other && r.Label == label })
	return nil
}

func (f *FakeBible) Delete(id string) error {
	f.Entities = slices.DeleteFunc(f.Entities, func(e Entry) bool { return e.ID == id })
	for i := range f.Entities {
		f.Entities[i].Relations = slices.DeleteFunc(f.Entities[i].Relations, func(r Relation) bool { return r.To == id })
	}
	return nil
}

func (f *FakeBible) Flag(id, alias string) error {
	e, err := f.editable(id)
	if err != nil {
		return err
	}
	switch {
	case alias == "":
		e.FlaggedEntry = true
	case !slices.Contains(e.FlaggedAliases, alias):
		e.FlaggedAliases = append(e.FlaggedAliases, alias)
	}
	return nil
}

func (f *FakeBible) Unflag(id, alias string) error {
	e, err := f.editable(id)
	if err != nil {
		return err
	}
	if alias == "" {
		e.FlaggedEntry = false
	} else {
		e.FlaggedAliases = slices.DeleteFunc(e.FlaggedAliases, func(a string) bool { return a == alias })
	}
	return nil
}

func (f *FakeBible) CorrectCue(cueID, speakerID string) error {
	i := slices.IndexFunc(f.CueList, func(c Cue) bool { return c.ID == cueID })
	if i < 0 {
		return fmt.Errorf("no cue %q", cueID)
	}
	f.CueList[i].SpeakerID, f.CueList[i].Corrected = speakerID, speakerID != ""
	return nil
}
