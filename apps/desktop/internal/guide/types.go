package guide

import (
	"encoding/json"
	"errors"
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

// errTypeName is the sidecar's refusal of a name that is blank, more than one line or longer than maxTypeName.
var errTypeName = fmt.Errorf("A type's name is one line of 1 to %d characters.", maxTypeName) //nolint:staticcheck // the sidecar's own words, shown to the narrator

// guideTypes is manuscript_guide.py guide_types: the types in order as rows of the file ({name, colour, speaks, builtin}, any other key
// dropped, as the sidecar drops it on the next type edit), or DefaultTypes for a file without a list, each the builtin it is named for. A
// stored list that is not rows of a name, a palette colour and a speaks flag, or that repeats a name in any case, is refused.
func guideTypes(document map[string]any) ([]map[string]any, error) {
	stored, present := document["types"]
	if !present || stored == nil {
		types := []map[string]any{}
		for _, row := range DefaultTypes() {
			types = append(types, map[string]any{"name": row.Name, "colour": row.Colour, "speaks": row.Speaks, "builtin": row.Name})
		}
		return types, nil
	}
	invalid := errors.New("The Story Bible types are invalid.") //nolint:staticcheck // the sidecar's own words, shown to the narrator
	rows, ok := stored.([]any)
	if !ok || len(rows) == 0 {
		return nil, invalid
	}
	types := make([]map[string]any, 0, len(rows))
	seen := map[string]bool{}
	for _, raw := range rows {
		row, ok := raw.(map[string]any)
		if !ok {
			return nil, invalid
		}
		name, nameOK := row["name"].(string)
		colour, _ := row["colour"].(string)
		_, speaksOK := row["speaks"].(bool)
		if !nameOK || pythonStrip(name) == "" || seen[foldCase(name)] || !slices.Contains(TypeColours, colour) || !speaksOK {
			return nil, invalid
		}
		seen[foldCase(name)] = true
		kept := map[string]any{}
		for _, key := range []string{"name", "colour", "speaks", "builtin"} {
			if value, present := row[key]; present {
				kept[key] = value
			}
		}
		types = append(types, kept)
	}
	return types, nil
}

// typeName is manuscript_guide.py _type_name: the name trimmed, one line of 1 to maxTypeName characters, and not a system category.
func typeName(value string) (string, error) {
	name := pythonStrip(value)
	if name == "" || strings.ContainsAny(name, "\r\n\x00") || utf8.RuneCountInString(name) > maxTypeName {
		return "", errTypeName
	}
	if slices.Contains(systemCategories, name) {
		return "", fmt.Errorf("%s is kept for the Story Bible's own use; give the type another name.", name) //nolint:staticcheck // the sidecar's own words, shown to the narrator
	}
	return name, nil
}

// typeRow is manuscript_guide.py _type_row: the index of the type with exactly this name.
func typeRow(types []map[string]any, name string) (int, error) {
	for index, row := range types {
		if row["name"] == name {
			return index, nil
		}
	}
	return 0, fmt.Errorf("There is no type named %s.", pythonRepr(name)) //nolint:staticcheck // the sidecar's own words, shown to the narrator
}

// refuseTaken is manuscript_guide.py _refuse_taken: a type other than the one at keep (-1 for none) has the name in some case.
func refuseTaken(types []map[string]any, name string, keep int) error {
	for index, row := range types {
		if index != keep && foldCase(row["name"].(string)) == foldCase(name) {
			return fmt.Errorf("There is a type named %s already; give the type a new name.", pythonRepr(name)) //nolint:staticcheck // the sidecar's own words, shown to the narrator
		}
	}
	return nil
}

// typesInHost is manuscript_guide.py _edit_types: change gets the document and its types (guideTypes) and returns the types to store,
// and the whole list is written back. A Story Bible that is not there yet, or holds an empty object, is started, as create starts one,
// so Settings can shape the types before the first build. A refused change writes nothing. Unlike the sidecar, a file that is there but
// is not a JSON object is refused rather than written over, so a damaged Story Bible is kept to recover from.
func (s *Service) typesInHost(change func(document map[string]any, types []map[string]any) ([]map[string]any, error)) error {
	return s.changeInHost(true, func(document map[string]any) (bool, error) {
		types, err := guideTypes(document)
		if err != nil {
			return false, err
		}
		if types, err = change(document, types); err != nil {
			return false, err
		}
		rows := make([]any, len(types))
		for index, row := range types {
			rows[index] = row
		}
		document["types"] = rows
		return true, nil
	})
}

// AddType is manuscript_guide.py type_add: a type at the end of the list, with the next colour by position, that does not speak.
func (s *Service) AddType(name string) error {
	text, err := typeName(name)
	if err != nil {
		return err
	}
	return s.typesInHost(func(_ map[string]any, types []map[string]any) ([]map[string]any, error) {
		if err := refuseTaken(types, text, -1); err != nil {
			return nil, err
		}
		return append(types, map[string]any{"name": text, "colour": TypeColours[len(types)%len(TypeColours)], "speaks": false}), nil
	})
}

// RenameType is manuscript_guide.py type_rename: the type takes the new name and so does every entry of it, a locked one too, since a
// lock keeps the narrator's entry as they wrote it and the type is the same type under its new name.
func (s *Service) RenameType(name, to string) error {
	text, err := typeName(to)
	if err != nil {
		return err
	}
	return s.typesInHost(func(document map[string]any, types []map[string]any) ([]map[string]any, error) {
		index, err := typeRow(types, name)
		if err != nil {
			return nil, err
		}
		if err := refuseTaken(types, text, index); err != nil {
			return nil, err
		}
		entities, _ := document["entities"].([]any)
		for _, raw := range entities {
			if entity, ok := raw.(map[string]any); ok && entity["category"] == name {
				entity["category"] = text
			}
		}
		types[index]["name"] = text
		return types, nil
	})
}

// SetTypeColour is manuscript_guide.py type_colour: the colour is one of TypeColours.
func (s *Service) SetTypeColour(name, colour string) error {
	if !slices.Contains(TypeColours, colour) {
		return fmt.Errorf("A type's colour is one of %s.", strings.Join(TypeColours, ", ")) //nolint:staticcheck // the sidecar's own words, shown to the narrator
	}
	return s.typesInHost(func(_ map[string]any, types []map[string]any) ([]map[string]any, error) {
		index, err := typeRow(types, name)
		if err != nil {
			return nil, err
		}
		types[index]["colour"] = colour
		return types, nil
	})
}

// SetTypeSpeaks is manuscript_guide.py type_speaks: whether the type's entries can have a speaker colour and are what the next build
// resolves dialogue to. A speaker colour already on an entry is kept, unused while its type is silent.
func (s *Service) SetTypeSpeaks(name string, speaks bool) error {
	return s.typesInHost(func(_ map[string]any, types []map[string]any) ([]map[string]any, error) {
		index, err := typeRow(types, name)
		if err != nil {
			return nil, err
		}
		types[index]["speaks"] = speaks
		return types, nil
	})
}

// RemoveType is manuscript_guide.py type_remove: a type no entry uses goes; the last type stays, so an entry always has one to be given.
func (s *Service) RemoveType(name string) error {
	return s.typesInHost(func(document map[string]any, types []map[string]any) ([]map[string]any, error) {
		index, err := typeRow(types, name)
		if err != nil {
			return nil, err
		}
		entities, _ := document["entities"].([]any)
		for _, raw := range entities {
			if entity, ok := raw.(map[string]any); ok && entity["category"] == name {
				return nil, fmt.Errorf("%s is in use; give its entries another type first.", name) //nolint:staticcheck // the sidecar's own words, shown to the narrator
			}
		}
		if len(types) < 2 {
			return nil, errors.New("The last type cannot be removed.") //nolint:staticcheck // the sidecar's own words, shown to the narrator
		}
		return slices.Delete(types, index, index+1), nil
	})
}
