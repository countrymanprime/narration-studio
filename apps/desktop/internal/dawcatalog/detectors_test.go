package dawcatalog

import "testing"

// TestDefaultDetectorsWiresReaperToTheSharedLocator guards the rule that
// this package reuses apps/desktop/internal/daw's already-built locator
// rather than re-solving "where is reaper.exe" a second time.
// It cannot assert which function is wired (Go has no reflection-friendly
// function identity check worth relying on here), so it asserts the shape
// that matters: a detector is present for REAPER's ID, it is callable
// without panicking, and no other catalog entry gets a detector it has no
// real source for yet.
func TestDefaultDetectorsWiresReaperToTheSharedLocator(t *testing.T) {
	detectors := DefaultDetectors()

	detector, ok := detectors[REAPER.ID]
	if !ok {
		t.Fatalf("DefaultDetectors() has no entry for %q", REAPER.ID)
	}
	if detector == nil {
		t.Fatalf("DefaultDetectors()[%q] is nil", REAPER.ID)
	}

	// Calling it must never panic; on a machine without REAPER installed
	// (as CI is) it reports not-found, which Detect already turns into
	// Installed: false.
	result := Detect(REAPER, detector)
	if result.EntryID != REAPER.ID {
		t.Errorf("Detect(REAPER, DefaultDetectors()[reaper]).EntryID = %q, want %q", result.EntryID, REAPER.ID)
	}
}

func TestDefaultDetectorsHasNoEntryForACatalogEntryWithNoRealSource(t *testing.T) {
	detectors := DefaultDetectors()

	if _, ok := detectors["audacity"]; ok {
		t.Error(`DefaultDetectors() has an "audacity" entry, but Audacity is not in the catalog yet (it is deferred until its roadmap precondition is met)`)
	}
}
