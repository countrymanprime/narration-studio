package main

import "fmt"

// The Story Bible types (SN-B95): the narrator's list of types, each with a colour and a Can speak flag. They live in their own file so
// bindings.go stays as it is. GuideTypes reads the list (the defaults for a file without one); every other call is one sidecar call
// that writes the whole list and returns nothing, and the UI reads the list again.

// GuideTypes returns the Story Bible's types in order: {name, colour, speaks}. A Story Bible without a list, or none yet, has the
// default types: the fixed categories, their colours, and only Character speaking.
func (h *Host) GuideTypes() (string, error) {
	service := h.services().guide
	if service == nil {
		return "", fmt.Errorf("the Story Bible is unavailable")
	}
	types, err := service.Types()
	return encodeBinding(types, err)
}

// GuideTypeAdd adds a type at the end, with the next colour, that does not speak. An empty, taken or reserved name is refused.
func (h *Host) GuideTypeAdd(name string) (string, error) {
	service := h.services().guide
	if service == nil {
		return "", fmt.Errorf("the Story Bible is unavailable")
	}
	return encodeBinding(nil, service.AddType(name))
}

// GuideTypeRename renames a type and moves every entry of it. An empty, taken or reserved name is refused.
func (h *Host) GuideTypeRename(name, to string) (string, error) {
	service := h.services().guide
	if service == nil {
		return "", fmt.Errorf("the Story Bible is unavailable")
	}
	return encodeBinding(nil, service.RenameType(name, to))
}

// GuideTypeSetColour sets a type's colour: green, blue, violet, amber, teal or rose.
func (h *Host) GuideTypeSetColour(name, colour string) (string, error) {
	service := h.services().guide
	if service == nil {
		return "", fmt.Errorf("the Story Bible is unavailable")
	}
	return encodeBinding(nil, service.SetTypeColour(name, colour))
}

// GuideTypeSetSpeaks sets whether a type's entries speak: they can have a speaker colour, and the next build attributes dialogue to them.
func (h *Host) GuideTypeSetSpeaks(name string, speaks bool) (string, error) {
	service := h.services().guide
	if service == nil {
		return "", fmt.Errorf("the Story Bible is unavailable")
	}
	return encodeBinding(nil, service.SetTypeSpeaks(name, speaks))
}

// GuideTypeRemove removes a type no entry uses; the last type is kept.
func (h *Host) GuideTypeRemove(name string) (string, error) {
	service := h.services().guide
	if service == nil {
		return "", fmt.Errorf("the Story Bible is unavailable")
	}
	return encodeBinding(nil, service.RemoveType(name))
}
