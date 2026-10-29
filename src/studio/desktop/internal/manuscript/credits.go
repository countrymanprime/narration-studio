package manuscript

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// The opening and closing credits are chapters like any other (owner rule): the chapter list holds them, opening first and closing last,
// each marked isCredits so a screen that cannot show something for them (their text is a template, they have no speakers) can say so.
// They are not in manuscript.json: a provider the host wires in supplies what only the project knows (the template's word count and the
// row's status on the project manifest), and every other field (recorded fraction, recorded length) comes from the same measurements a
// chapter gets, keyed by the credits id.

// Credits ids are the ones the recording check, the chapter-track map and the teleprompter already use.
const (
	OpeningCreditsID = "credits-opening"
	ClosingCreditsID = "credits-closing"
)

// CreditsChapter is one credits file as the provider reports it.
type CreditsChapter struct {
	Kind   string // "opening" or "closing"
	Words  int
	Status string
	// Text is the rendered template: the credits' one paragraph, for the books that need a line to attach a word to (the edit log, the passage map).
	Text string
}

// CreditsLine is a credits file's one paragraph as the edit log and the passage map see it.
type CreditsLine struct {
	ChapterID string
	ID        string
	Text      string
}

// CreditsBook is what the books built from the manuscript add for the credits: their chapter ids and one line each (`<chapter id>-p0`, the
// id the alignment gives the same paragraph).
func (s *Service) CreditsBook() (chapterIDs []string, lines []CreditsLine) {
	for _, c := range s.creditsChapters() {
		id := OpeningCreditsID
		if c.Kind == "closing" {
			id = ClosingCreditsID
		}
		chapterIDs = append(chapterIDs, id)
		lines = append(lines, CreditsLine{ChapterID: id, ID: id + "-p0", Text: c.Text})
	}
	return chapterIDs, lines
}

// CreditsProvider lists the credits files the project has a template for. Empty when there is none, or the project has no manuscript.
type CreditsProvider func() []CreditsChapter

// SetCredits says where the credits entries of the chapter list come from; nil means none.
func (s *Service) SetCredits(fn CreditsProvider) { s.credits.Store(&fn) }

// CreditsStatusWriter stores a credits file's status (on the project manifest, not in the manuscript's notes, so a re-import keeps it).
type CreditsStatusWriter func(kind, status string) error

// SetCreditsStatusWriter says where a credits entry's status is written; without one, setting it is refused.
func (s *Service) SetCreditsStatusWriter(fn CreditsStatusWriter) { s.creditsStatus.Store(&fn) }

// setCreditsStatus answers SetChapterStatus for a credits id: the write, then the entry as the list shows it.
func (s *Service) setCreditsStatus(chapterID, status string) (map[string]any, error) {
	kind := strings.TrimPrefix(chapterID, "credits-")
	fn := s.creditsStatus.Load()
	if fn == nil || *fn == nil {
		return nil, fmt.Errorf("the credits status cannot be set here")
	}
	if err := (*fn)(kind, status); err != nil {
		return nil, err
	}
	list, err := s.ChaptersUnmeasured()
	if err != nil {
		return nil, err
	}
	for _, chapter := range list {
		if text(chapter, "id") == chapterID {
			return chapter, nil
		}
	}
	return nil, fmt.Errorf("unknown manuscript chapter")
}

func (s *Service) creditsChapters() []CreditsChapter {
	if fn := s.credits.Load(); fn != nil && *fn != nil {
		return (*fn)()
	}
	return nil
}

// IsCredits reports whether a chapter payload (one entry of Chapters) is a credits file.
func IsCredits(chapter map[string]any) bool { v, _ := chapter["isCredits"].(bool); return v }

// IsCreditsID reports whether a chapter id names a credits file.
func IsCreditsID(id string) bool { return id == OpeningCreditsID || id == ClosingCreditsID }

var ownCreditsTitle = regexp.MustCompile(`(?i)^(opening|intro)\s+credits$`)

// ownsOpeningCredits is true when the manuscript imported its own opening-credits chapter (an `opening` chapter titled "Opening Credits" or
// "Intro Credits"): that chapter stands in for the opening entry. Front matter that is not the credits (a copyright page) does not.
func ownsOpeningCredits(chapters []map[string]any) bool {
	for _, chapter := range chapters {
		if text(chapter, "contentKind") != "opening" {
			continue
		}
		title := strings.TrimSpace(strings.Map(func(r rune) rune {
			if unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsSpace(r) {
				return r
			}
			return -1
		}, text(chapter, "title")))
		if ownCreditsTitle.MatchString(title) {
			return true
		}
	}
	return false
}

// creditsTitle is the name each credits file is listed under.
func creditsTitle(kind string) string {
	if kind == "opening" {
		return "Opening credits"
	}
	return "Closing credits"
}

// withCredits puts the credits around the manuscript's chapters. index is -2 for both: below any real chapter's, so a file called
// "Chapter 04.wav" can never be paired with one by its number, while the list order says where each sits.
func (s *Service) withCredits(data map[string]any, chapters []map[string]any, measure bool, lengths map[string]RecordedLength, fractions map[string]float64) []map[string]any {
	provided := s.creditsChapters()
	if len(provided) == 0 {
		return chapters
	}
	ownsOpening := ownsOpeningCredits(objects(data["chapters"]))
	entry := func(c CreditsChapter) map[string]any {
		id := OpeningCreditsID
		if c.Kind == "closing" {
			id = ClosingCreditsID
		}
		status := c.Status
		if !validChapterStatus(status) {
			status = "not_started"
		}
		payload := map[string]any{"id": id, "title": creditsTitle(c.Kind), "index": -2, "wordCount": c.Words, "contentKind": "narration", "status": status, "isCredits": true, "paragraphIds": []map[string]any{}}
		if fraction, ok := fractions[id]; ok {
			payload["recordedFraction"] = fraction
		}
		if length, ok := lengths[id]; ok {
			if length.Unavailable != "" {
				payload["recordedUnavailable"] = string(length.Unavailable)
			} else {
				payload["recordedSeconds"] = length.Seconds
			}
		}
		return payload
	}
	var opening, closing []map[string]any
	for _, c := range provided {
		switch c.Kind {
		case "opening":
			if !ownsOpening {
				opening = append(opening, entry(c))
			}
		case "closing":
			closing = append(closing, entry(c))
		}
	}
	result := make([]map[string]any, 0, len(chapters)+2)
	result = append(result, opening...)
	result = append(result, chapters...)
	return append(result, closing...)
}
