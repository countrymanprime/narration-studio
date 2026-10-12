package guide

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"
)

// Type is one Story Bible type (SN-B95): a name an entry's category takes, the colour it is drawn in and whether its entries speak.
// The list lives in the Story Bible file as "types"; a file without one reads as DefaultTypes, so an old file reads as before.
type Type struct {
	Name   string `json:"name"`
	Colour string `json:"colour"`
	Speaks bool   `json:"speaks"`
}

// TypeColours are the colours a type can take: the six kind hues of styles.css (green --character, blue --place, violet --org,
// amber --lore, teal --item, rose --event). manuscript_guide.py TYPE_COLOURS holds the same list.
var TypeColours = []string{"green", "blue", "violet", "amber", "teal", "rose"}

// DefaultTypes are the types of a file without a list: the fixed categories of before, in the colours the app drew them in, and
// only Character speaking (manuscript_guide.py DEFAULT_TYPES; TestDefaultTypesMatchTheSidecar pins the two together).
func DefaultTypes() []Type {
	return []Type{
		{"Character", "green", true}, {"Place", "blue", false}, {"Organization", "violet", false},
		{"Lore", "amber", false}, {"Item", "teal", false}, {"Event", "rose", false},
	}
}

// maxTypeName is the longest type name, in characters; the sidecar checks the same.
const maxTypeName = 40

// Types is the Story Bible's types, in order. A missing file or one without a list reads as DefaultTypes; a list that is not one of
// rows with a name, a known colour and a speaks flag is refused.
func (s *Service) Types() ([]Type, error) {
	document, err := s.document()
	if err != nil {
		return nil, err
	}
	raw, present := document["types"]
	if !present || raw == nil {
		return DefaultTypes(), nil
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("the Story Bible types data is invalid")
	}
	var types []Type
	if err := json.Unmarshal(encoded, &types); err != nil || len(types) == 0 {
		return nil, fmt.Errorf("the Story Bible types data is invalid")
	}
	for _, row := range types {
		if strings.TrimSpace(row.Name) == "" || !slices.Contains(TypeColours, row.Colour) {
			return nil, fmt.Errorf("the Story Bible types data is invalid")
		}
	}
	return types, nil
}

// checkTypeName refuses a name the sidecar would, before a process starts: blank, more than one line, or longer than maxTypeName.
// The sidecar also refuses a taken name and the system categories (Needs Review, Draft).
func checkTypeName(name string) (string, error) {
	text := strings.TrimSpace(name)
	if text == "" || strings.ContainsAny(text, "\r\n\x00") || utf8.RuneCountInString(text) > maxTypeName {
		return "", fmt.Errorf("a type's name is one line of 1 to %d characters", maxTypeName)
	}
	return text, nil
}

// AddType adds a type at the end of the list, with the next colour by position, that does not speak.
func (s *Service) AddType(name string) error {
	text, err := checkTypeName(name)
	if err != nil {
		return err
	}
	_, err = s.Run("type-add", "--guide", s.guidePath(), "--name="+text)
	return err
}

// RenameType renames a type and moves every entry of it to the new name. An empty or taken name is refused.
func (s *Service) RenameType(name, to string) error {
	text, err := checkTypeName(to)
	if err != nil {
		return err
	}
	_, err = s.Run("type-rename", "--guide", s.guidePath(), "--name="+name, "--to="+text)
	return err
}

// SetTypeColour sets a type's colour, one of TypeColours; any other is refused before the sidecar starts.
func (s *Service) SetTypeColour(name, colour string) error {
	if !slices.Contains(TypeColours, colour) {
		return fmt.Errorf("a type's colour is one of %s", strings.Join(TypeColours, ", "))
	}
	_, err := s.Run("type-colour", "--guide", s.guidePath(), "--name="+name, "--colour", colour)
	return err
}

// SetTypeSpeaks sets whether a type's entries speak: they can have a speaker colour, and the next build resolves dialogue to them.
func (s *Service) SetTypeSpeaks(name string, speaks bool) error {
	value := "0"
	if speaks {
		value = "1"
	}
	_, err := s.Run("type-speaks", "--guide", s.guidePath(), "--name="+name, "--speaks", value)
	return err
}

// RemoveType removes a type. The sidecar refuses one an entry uses, and the last one.
func (s *Service) RemoveType(name string) error {
	_, err := s.Run("type-remove", "--guide", s.guidePath(), "--name="+name)
	return err
}
