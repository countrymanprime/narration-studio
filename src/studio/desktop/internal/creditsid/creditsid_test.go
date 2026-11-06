package creditsid

import "testing"

func TestIDKindTitleAgree(t *testing.T) {
	for _, kind := range Kinds {
		id := ID(kind)
		if !IsID(id) {
			t.Fatalf("%q is not a credits id", id)
		}
		if got, ok := Kind(id); !ok || got != kind {
			t.Fatalf("Kind(%q) = %q, %v; want %q", id, got, ok, kind)
		}
		if Title(kind) == "" {
			t.Fatalf("no title for %q", kind)
		}
	}
	if ID(Opening) != OpeningID || ID(Closing) != ClosingID {
		t.Fatal("constants and ID disagree")
	}
}

func TestRefusesWhatIsNotCredits(t *testing.T) {
	for _, id := range []string{"", "credits-middle", "chapter-1", "credits-"} {
		if IsID(id) {
			t.Errorf("IsID(%q) = true", id)
		}
		if _, ok := Kind(id); ok {
			t.Errorf("Kind(%q) ok", id)
		}
	}
	if Title("middle") != "" {
		t.Error("title for an unknown kind")
	}
}
