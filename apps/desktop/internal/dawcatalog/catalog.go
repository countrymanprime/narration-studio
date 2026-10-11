// Package dawcatalog holds the hardcoded catalog of digital audio
// workstations this suite can use, and reports on demand whether each one
// appears to be installed.
//
// See the "The DAW catalog and "Get it" flow" section of
// docs/architecture/daw-integration.md. This package never downloads,
// verifies, or executes a DAW installer, and never fetches its catalog from
// anywhere — every entry below is a Go literal, one per DAW, never fetched or
// user-editable, so the destination of every "Get it" click is checked in
// code review. It answers only
// "is a supported DAW installed" as a fact for a narrator with none; it does
// not decide *how* to launch one (that stays
// apps/desktop/internal/daw's concern, ADR 0092, reused here rather than
// duplicated — see DefaultDetectors in detectors.go).
package dawcatalog

// Entry is one DAW this suite can use: its display copy and its official,
// hardcoded download-page URL. Every field is fixed in Go, never loaded
// from a file a narrator or a remote source could edit: the URL is hardcoded
// per DAW and server-side, never derived from user input or a remote response.
type Entry struct {
	// ID crosses process boundaries (the DawCatalogOpenDownloadPage
	// binding looks a DAW up by ID, never by a UI-supplied URL) and must be
	// stable and unique within Catalog.
	ID string
	// Name is the DAW's own name, shown to the narrator as-is.
	Name string
	// Publisher is the DAW's publisher, shown so the narrator can verify
	// they are being sent to the real vendor.
	Publisher string
	// LicenseNote is one neutral line about how the DAW is licensed. It
	// stays factual and does not try to explain or sell the vendor's licensing
	// terms — the vendor's own download page does that.
	LicenseNote string
	// DownloadURL is the DAW publisher's own official download page.
	// Opening it is the only thing this feature ever does with it; the
	// app never fetches it itself (see the package doc).
	DownloadURL string
}

// REAPER is the only catalog entry today. Audacity has no entry yet
// (docs/architecture/daw-integration.md) and is deliberately not listed here
// as "coming soon".
var REAPER = Entry{
	ID:          "reaper",
	Name:        "REAPER",
	Publisher:   "Cockos Incorporated",
	LicenseNote: "A fully-functional evaluation license from the publisher's own site; see their page for terms.",
	DownloadURL: "https://www.reaper.fm/download.php",
}

// Catalog lists every DAW this suite can use today, in display order.
var Catalog = []Entry{REAPER}

// Lookup finds the catalog entry with the given ID. The
// DawCatalogOpenDownloadPage binding uses this, never a UI-supplied URL, to
// resolve which page to open server-side: the id, not a URL, crosses the Wails
// boundary, so nothing UI-supplied can pick an arbitrary destination (see the
// package doc).
func Lookup(id string) (Entry, bool) {
	for _, entry := range Catalog {
		if entry.ID == id {
			return entry, true
		}
	}
	return Entry{}, false
}
