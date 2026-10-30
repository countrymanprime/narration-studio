package stages

import "testing"

func TestTheCreditsAreChaptersOfTheListButNotAssessed(t *testing.T) {
	payloads := []map[string]any{
		{"id": "credits-opening", "title": "Opening credits", "contentKind": "narration", "isCredits": true, "status": "not_started"},
		{"id": "c-1", "title": "One", "contentKind": "narration", "status": "recording"},
		{"id": "r-1", "title": "Notes", "contentKind": "reference"},
		{"id": "credits-closing", "title": "Closing credits", "contentKind": "narration", "isCredits": true},
	}
	got := narrationChapters("doc", payloads)
	if len(got) != 1 || got[0].ChapterID != "c-1" || got[0].Status != Stage("recording") {
		t.Fatalf("narrationChapters = %+v, want only c-1", got)
	}
}
