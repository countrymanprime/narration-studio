package guide

import (
	"fmt"
	"strings"
	"testing"
)

func TestConfidentCategory(t *testing.T) {
	for _, test := range []struct {
		name string
		e    confidenceEvidence
		want string
	}{
		{"named twice, however it is named", confidenceEvidence{mentions: 2, speech: 2, person: 2}, categoryNeedsReview},
		{"speaks twice", confidenceEvidence{mentions: 10, speech: 2}, categoryCharacter},
		{"speaks once", confidenceEvidence{mentions: 10, speech: 1}, categoryNeedsReview},
		{"given a title", confidenceEvidence{mentions: 5, person: 1}, categoryCharacter},
		{"a verb follows it", confidenceEvidence{mentions: 20, acts: 2}, categoryCharacter},
		{"a verb follows it in too few of many mentions", confidenceEvidence{mentions: 40, acts: 2}, categoryNeedsReview},
		{"speaks but is mostly somewhere people are", confidenceEvidence{mentions: 10, speech: 3, placeContext: 5}, categoryNeedsReview},
		{"a place word ends its name", confidenceEvidence{mentions: 30, placeWord: true, acts: 2}, categoryPlace},
		{"a place word, but it keeps acting", confidenceEvidence{mentions: 10, placeWord: true, speech: 2, acts: 2}, categoryNeedsReview},
		{"people are at it, in it or from it", confidenceEvidence{mentions: 10, placeContext: 5}, categoryPlace},
		{"people go to it", confidenceEvidence{mentions: 10, placeContext: 2, toContext: 2}, categoryPlace},
		{"people go to it, and it acts", confidenceEvidence{mentions: 10, placeContext: 2, toContext: 2, acts: 1}, categoryNeedsReview},
		{"the model alone says person", confidenceEvidence{mentions: 10, model: 10, modelPerson: 10}, categoryNeedsReview},
		{"the model says person and it acts once", confidenceEvidence{mentions: 10, model: 10, modelPerson: 10, acts: 1}, categoryCharacter},
		{"the model says person, it acts once, but people go to it", confidenceEvidence{mentions: 10, model: 10, modelPerson: 10, acts: 1, toContext: 1}, categoryNeedsReview},
		{"the model says place and people go to it", confidenceEvidence{mentions: 10, model: 6, modelPlace: 6, toContext: 1}, categoryPlace},
		{"the model is split", confidenceEvidence{mentions: 10, model: 6, modelPlace: 3, modelPerson: 3, toContext: 1}, categoryNeedsReview},
		{"nothing shows what it is", confidenceEvidence{mentions: 50}, categoryNeedsReview},
	} {
		if got, why := test.e.confidentCategory(); got != test.want || why == "" {
			t.Errorf("%s: %s (%q), want %s", test.name, got, why, test.want)
		}
	}
}

func TestSpeechAcrossThe(t *testing.T) {
	for _, test := range []struct {
		text, name string
		want       bool
	}{
		{"“Come back!” said the Hatter.", "Hatter", true},
		{"The Hatter said nothing.", "Hatter", true},
		{"and then the Hatter, cried out", "Hatter", true},
		{"and then the Hatter, before she", "Hatter", false},
		{"they walked to the Hatter quietly.", "Hatter", false},
		{"said Hatter", "Hatter", false}, // no "the": the scan's own check counts this one
	} {
		text := []rune(test.text)
		start := strings.Index(test.text, test.name)
		start = len([]rune(test.text[:start]))
		if got := speechAcrossThe(text, start, start+len([]rune(test.name))); got != test.want {
			t.Errorf("%q: %v, want %v", test.text, got, test.want)
		}
	}
}

func TestActsAfter(t *testing.T) {
	for _, test := range []struct {
		text, name string
		want       bool
	}{
		{"Montmorency barked at the kettle.", "Montmorency", true},
		{"George would not get up.", "George", true},
		{"Harris’s boots were wet.", "Harris", false},
		{"Harris's boots were wet.", "Harris", false},
		{"Kingston bridge was crowded.", "Kingston", false},
		{"we passed Marlow, and rowed on", "Marlow", false},
		{"Alice thought it over.", "Alice", true},
	} {
		start := len([]rune(test.text[:strings.Index(test.text, test.name)]))
		if got := actsAfter([]rune(test.text), start+len([]rune(test.name))); got != test.want {
			t.Errorf("%q: %v, want %v", test.text, got, test.want)
		}
	}
}

func TestWordBefore(t *testing.T) {
	for _, test := range []struct {
		text, name, want string
	}{
		{"they lost their way in the Wild Wood", "Wild", "in"},
		{"they lost their way in Wild Wood", "Wild", "in"},
		{"we went home. Kingston was quiet", "Kingston", ""},
		{"we rowed past Marlow", "Marlow", "past"},
		{"Marlow was quiet", "Marlow", ""},
	} {
		start := len([]rune(test.text[:strings.LastIndex(test.text, test.name)]))
		if got := wordBefore([]rune(test.text), start, true); got != test.want {
			t.Errorf("%q: %q, want %q", test.text, got, test.want)
		}
	}
}

// bookOf makes paragraphs from lines, one chapter.
func bookOf(lines ...string) []ruleParagraph {
	out := make([]ruleParagraph, len(lines))
	for i, line := range lines {
		out[i] = ruleParagraph{chapter: "Chapter 1", chapterID: "c-1", paragraphID: fmt.Sprintf("p%d", i+1), text: []rune(line)}
	}
	return out
}

func confidentNames(paragraphs []ruleParagraph) map[string]string {
	sorted, _ := buildEntities(paragraphs, confidentCandidates(paragraphs, nil))
	out := map[string]string{}
	for _, entry := range sorted {
		for _, name := range entryNames(entry) {
			out[name] = entry.object.values["category"].(string)
		}
	}
	return out
}

// The class the owner found: a word that only looks like a name because it is capitalised. However often it comes, with or without
// a speech verb beside it, the import's build never makes an entry of it, not even one for review.
func TestConfidentBuildNeverOffersFunctionWords(t *testing.T) {
	var lines []string
	for range 12 {
		lines = append(lines,
			"“I’m tired,” said Clara. “I'm going home.” I’m not sure she was.",
			"Oh, dear. Oh! However it began, Because I said so, it ended.",
			"“We’ll see,” cried Mr. “You’ll see,” said Sir. Well, said Ma’am.",
			"Hullo! Ahem. Bother! Hooray, said Clara, and Yes, said the Major.",
			"Then Monday came, and Christmas, and Clara said I’ll stay.",
		)
	}
	names := confidentNames(bookOf(lines...))
	for _, junk := range []string{"I", "I’m", "I'm", "I’ll", "We’ll", "You’ll", "Oh", "However", "Because I", "Because", "Mr", "Sir", "Ma’am", "Well",
		"Hullo", "Ahem", "Bother", "Hooray", "Yes", "Then", "Monday", "Christmas"} {
		if category, ok := names[junk]; ok {
			t.Errorf("%q became a %s entry", junk, category)
		}
	}
	if names["Clara"] != categoryCharacter {
		t.Errorf("Clara: %q, want Character (names: %v)", names["Clara"], names)
	}
	// The same over the five books: no entry or alias of any kind is a word the scan cuts a name at.
	for _, book := range benchmarkBooks {
		paragraphs := benchmarkParagraphs(t, book)
		for name := range confidentNames(paragraphs) {
			for _, word := range strings.Fields(name) {
				lower := strings.ToLower(strings.Trim(word, ".,;:!?\"'“”‘’"))
				if scanParticles[lower] {
					continue // Queen of Hearts, Pride of the Thames
				}
				if scanStopwords[lower] || isContraction([]rune(strings.Trim(word, ".,;:!?\"“”‘’"))) {
					t.Errorf("%s: %q holds %q", book, name, word)
				}
			}
		}
	}
}

// A single word the scan turns down because the book also writes it in lower case is a character once a speech verb is beside it in
// more than one mention: the Hatter. Without one, it stays out: the River.
func TestConfidentBuildKeepsTheHatterNotTheRiver(t *testing.T) {
	lines := []string{"The hatter's shop was shut, and the river was high."}
	for range 4 {
		lines = append(lines, "“Tea?” said the Hatter. Then Alice looked at the River, and the Hatter sighed.")
	}
	names := confidentNames(bookOf(lines...))
	if names["Hatter"] != categoryCharacter {
		t.Errorf("Hatter: %q, want Character (names: %v)", names["Hatter"], names)
	}
	if category, ok := names["River"]; ok {
		t.Errorf("River became a %s entry", category)
	}
	if names["Alice"] != categoryCharacter {
		t.Errorf("Alice: %q, want Character", names["Alice"])
	}
}

// Without the import's build the scan is what it was: confidentAccepts changes only the build that passes it.
func TestScanGroupsAreTheScansOwn(t *testing.T) {
	lines := []string{"The hatter's shop was shut."}
	for range 4 {
		lines = append(lines, "“Tea?” said the Hatter, and the Hatter sighed.")
	}
	for _, group := range scanGroups(bookOf(lines...)) {
		if group.mentions[0].core == "Hatter" {
			t.Errorf("the scan kept Hatter, which it writes in lower case too")
		}
	}
}
