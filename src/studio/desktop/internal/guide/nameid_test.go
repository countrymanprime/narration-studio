package guide

import (
	"errors"
	"slices"
	"testing"
)

// Names that differ only in letters normalizeName drops (other scripts, emoji, accents, nothing but punctuation) share a derived id;
// each is still its own entry, and a name the entry at that id has is still refused.
func TestNamesThatShareADerivedIDAreEachTheirOwnEntry(t *testing.T) {
	s, _ := createService(t)
	var ids []string
	for _, name := range []string{"日本", "שלום", "🦊", "...", "Zoë", "Zo"} {
		id, err := s.CreateFull(name, "Character", nil, "", nil)
		if err != nil {
			t.Fatalf("create %q: %v", name, err)
		}
		if slices.Contains(ids, id) {
			t.Fatalf("create %q gave the id %s a name before it has", name, id)
		}
		ids = append(ids, id)
	}
	if ids[0] != entityID("日本") || ids[4] != entityID("Zoë") {
		t.Errorf("the first name of a derived id did not keep it: %v", ids)
	}
	for _, name := range []string{"日本", "שלום", "zoë", " ZO "} {
		if _, err := s.CreateFull(name, "Character", nil, "", nil); !errors.Is(err, errNameTaken) {
			t.Errorf("create of the existing %q = %v, want a refusal", name, err)
		}
	}
	if _, err := s.CreateFull("Mira", "Character", nil, "", nil); err != nil {
		t.Fatal(err)
	}
	// The sidecar's rule for a name in other ASCII punctuation stays: it is the same name.
	if _, err := s.CreateFull("MIRA!", "Character", nil, "", nil); !errors.Is(err, errNameTaken) {
		t.Errorf("create of MIRA! = %v, want a refusal", err)
	}
}
