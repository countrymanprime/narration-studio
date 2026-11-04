// Package creditsid is the one owner of what names the opening and closing credits: their chapter id, their kind and the title each is
// listed under. The credits are chapters like any other (owner rule), so the manuscript's chapter list, the recording check, the chapter
// regions and the teleprompter all name them; each asks here instead of spelling "credits-opening" or "Opening credits" itself.
// It is a leaf package (no imports) because the manuscript package imports the coverage package, so neither can own it for the other.
package creditsid

// The two credits kinds, as the credits templates, the project manifest's CreditsStatus keys and the UI's contentKind spell them.
const (
	Opening = "opening"
	Closing = "closing"
)

// Kinds lists the credits kinds in chapter-list order: opening first, closing last.
var Kinds = [...]string{Opening, Closing}

// The chapter ids the recording check, the chapter-track map and the teleprompter use for the credits.
const (
	OpeningID = "credits-" + Opening
	ClosingID = "credits-" + Closing
)

// ID is the chapter id of a credits kind. An unknown kind gets the id it would have, which IsID and Kind then refuse.
func ID(kind string) string { return "credits-" + kind }

// IsID reports whether a chapter id names a credits file.
func IsID(id string) bool { return id == OpeningID || id == ClosingID }

// Kind reports the credits kind a chapter id names, and whether it names one at all.
func Kind(id string) (kind string, ok bool) {
	switch id {
	case OpeningID:
		return Opening, true
	case ClosingID:
		return Closing, true
	default:
		return "", false
	}
}

// Title is the name a credits kind is listed under (never read aloud); empty for a kind that is not a credits kind.
func Title(kind string) string {
	switch kind {
	case Opening:
		return "Opening credits"
	case Closing:
		return "Closing credits"
	default:
		return ""
	}
}
