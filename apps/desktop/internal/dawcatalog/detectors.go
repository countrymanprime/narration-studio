package dawcatalog

import "github.com/countrymanprime/narration-utils/shell/internal/daw"

// DefaultDetectors returns the production Detector for every catalog entry
// this package can auto-detect today. REAPER is wired directly to
// apps/desktop/internal/daw.LocateReaperExecutable — the registry/file-
// association locator already built and verified (ADR 0092) — rather than
// this package growing a second registry/path lookup. daw.LocateReaperExecutable's signature already matches
// Detector exactly, so no adapter is needed.
//
// A catalog entry with no working detector yet (there are none today; a
// future Audacity entry would start this way) is simply absent from the
// returned map, and Detect/DetectAll already treat a missing entry as "not
// detected" rather than panicking.
func DefaultDetectors() map[string]Detector {
	return map[string]Detector{
		REAPER.ID: daw.LocateReaperExecutable,
	}
}
