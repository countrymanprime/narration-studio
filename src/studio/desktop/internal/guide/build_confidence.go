package guide

import (
	"strings"
	"unicode"

	"desktop/internal/compare"
)

// This file is the confidence rule for a Story Bible build nobody started by hand: the one a manuscript import is to start (#3092). It
// takes the scan's names (scanGroups, which never offers a pronoun, a contraction, an interjection, a word that only starts a sentence
// or a bare title) and files each under Character or Place only when the book gives evidence for that kind; every other name the scan
// keeps goes to Needs Review for the narrator to judge. The language model's spans, when it is installed, are one vote among the
// evidence and never enough on their own: on the benchmark's five books 57% of the characters a build from its labels showed were real.
// The benchmark (benchmark_test.go, docs/research/story-bible-build-benchmark.md) pins the figures this rule was tuned to.

// The rule's numbers.
const (
	confidentMinMentions    = 3    // mentions a name needs before it is filed under a kind; fewer is Needs Review at most
	confidentMinSpeech      = 2    // mentions beside a speech verb that make a name a character
	confidentPlaceShare     = 0.5  // share of mentions after a place preposition that makes a name a place
	confidentPersonCap      = 0.34 // a character may have at most this share of place-preposition mentions
	confidentModelShare     = 0.67 // share of the model's labels for a name that must agree before they count
	confidentModelMinimum   = 3    // the model's labels a name needs before they count
	confidentMinActs        = 2    // mentions followed by a verb ("Montmorency barked") that make a name a character
	confidentActsShare      = 0.1  // and the share of its mentions they must be
	confidentLooseShare     = 0.4  // share of mentions after a place preposition or "to" that makes a name that never acts a place
	confidentPlaceActsSlack = 0.1  // share of a place's mentions that may sit before a verb when most of them are after a place preposition
	confidentPlaceWordSlack = 0.2  // share of a place-word name's mentions that may sit beside a verb (Toad Hall was ...)
)

// confidenceReview is the label confidentCandidates gives a name it does not file under a kind; classify reads it as Needs Review.
const confidenceReview = "REVIEW"

// confidentPlaceWords end a name that is a place: Toad Hall, the Wild Wood, Lucas Lodge, Hampton Court, Magna Charta Island.
var confidentPlaceWords = wordSet("hall", "wood", "woods", "court", "lodge", "park", "house", "abbey", "church", "churchyard", "street",
	"lock", "bridge", "island", "castle", "river", "bank", "end", "weir", "pier", "square", "road", "lane", "green", "hill", "manor",
	"parsonage", "inn", "hotel", "station", "maze", "city", "town", "village", "kingdom", "country", "mountain", "mountains", "forest",
	"ocean", "sea", "lake", "valley", "cemetery", "arcade", "canal", "place", "row", "gardens", "palace", "tower", "point", "shire")

// confidentPlacePrepositions, right before a name (or before "the" and the name), say it is somewhere: at Kingston, in Hertfordshire,
// through the Wild Wood. "To" is left out: "said to Harris" is as common as "went to Marlow".
var confidentPlacePrepositions = wordSet("at", "in", "from", "near", "past", "through", "towards", "toward", "below", "above", "beyond",
	"outside", "reached", "reach", "leaving", "left", "round", "around", "opposite", "across")

// confidentPlaceHonorifics are the honorific classes that start a place as often as a person: St. Albans, St. James's.
var confidentPlaceHonorifics = wordSet("saint")

// confidenceEvidence is what the book says about one of the scan's names.
type confidenceEvidence struct {
	mentions, speech, acts, placeContext, toContext, person, model, modelPerson, modelPlace int
	placeWord                                                                               bool
}

// confidentCategory is the kind the evidence files a name under, or Needs Review, and why, in words a narrator reads.
func (e confidenceEvidence) confidentCategory() (string, string) {
	mentions := float64(max(e.mentions, 1))
	placeShare := float64(e.placeContext) / mentions
	looseShare := (float64(e.placeContext) + float64(e.toContext)) / mentions
	modelPerson := e.model >= confidentModelMinimum && float64(e.modelPerson) >= confidentModelShare*float64(e.model)
	modelPlace := e.model >= confidentModelMinimum && float64(e.modelPlace) >= confidentModelShare*float64(e.model)
	animate := e.speech + e.acts
	switch {
	case e.mentions < confidentMinMentions:
		return categoryNeedsReview, "named fewer than 3 times"
	case e.placeWord && e.person == 0 && float64(animate) <= confidentPlaceWordSlack*mentions:
		return categoryPlace, "its name ends with a word for a place"
	case !e.placeWord && placeShare < confidentPersonCap && (e.speech >= confidentMinSpeech || e.person > 0):
		return categoryCharacter, "it speaks or is given a title"
	case !e.placeWord && placeShare < confidentPersonCap && e.acts >= confidentMinActs && float64(e.acts) >= confidentActsShare*mentions:
		return categoryCharacter, "it does things: a verb follows its name"
	case !e.placeWord && looseShare == 0 && modelPerson && animate > 0:
		return categoryCharacter, "it speaks or acts and the language model reads it as a person"
	case e.speech == 0 && e.person == 0 && float64(e.acts) <= confidentPlaceActsSlack*mentions && placeShare >= confidentPlaceShare:
		return categoryPlace, "it is a place people are at, in or from"
	case animate == 0 && e.person == 0 && (looseShare >= confidentLooseShare || (modelPlace && looseShare > 0)):
		return categoryPlace, "it is a place people are at, in, from or go to"
	}
	return categoryNeedsReview, "the book does not show what it is"
}

// confidentCandidates are the scan's names as the build reads them (scanCandidates), each labelled with the kind the confidence rule
// files it under: PERSON, GPE, or confidenceReview. spans are the language model's, nil when it is not installed.
func confidentCandidates(paragraphs []ruleParagraph, spans [][]entitySpan) []ruleCandidate {
	candidates, _ := confidentBuild(paragraphs, spans)
	return candidates
}

// confidentBuild is confidentCandidates and the names the build leaves out: those named fewer than confidentMinMentions times, which
// buildEntities makes no entry for, each by its most used spelling, in the scan's order (the strongest evidence first).
func confidentBuild(paragraphs []ruleParagraph, spans [][]entitySpan) ([]ruleCandidate, []string) {
	labels := map[string]string{}
	leftOut := []string{}
	groups := scanGroupsAccepting(paragraphs, confidentAccepts(paragraphs))
	for _, group := range groups {
		kind, _ := confidenceOf(group, paragraphs, spans).confidentCategory()
		switch kind {
		case categoryCharacter:
			labels[group.key] = "PERSON"
		case categoryPlace:
			labels[group.key] = "GPE"
		default:
			labels[group.key] = confidenceReview
		}
		if len(group.mentions) < confidentMinMentions {
			spellings, _ := spellingsOf(group)
			leftOut = append(leftOut, spellings[0])
		}
	}
	candidates := candidatesOf(groups)
	for i := range candidates {
		candidates[i].label = labels[candidates[i].group]
	}
	return candidates, leftOut
}

// The evidence that makes a single word a name although the scan's test (scanAccepts) turns it down for being written in lower case
// somewhere in the book (the Hatter, the Otter) or for ending like a common word (Portly, Emily, Goring).
const (
	rescueMinMidSentence = 3 // capitalised mid-sentence at least this often, in more than one paragraph
	rescueMinSpeech      = 2 // and, for a word also written in lower case, beside a speech verb this often ("said the Hatter")
)

// confidentAccepts is scanAccepts, and also a single word the book capitalises mid-sentence again and again: one never written in
// lower case (Portly, Emily), or one that is (the Hatter, the Mouse) when a speech verb stands beside it in more than one mention.
func confidentAccepts(paragraphs []ruleParagraph) func(*scanGroup, wordStats) bool {
	return func(group *scanGroup, stats wordStats) bool {
		if scanAccepts(group, stats) {
			return true
		}
		words := compare.PySplit(group.mentions[0].core)
		if len(words) != 1 || group.honorifics() > 0 || scanHonorifics[strings.ToLower(words[0])] != "" || scanCalendar[strings.ToLower(words[0])] {
			return false
		}
		if group.midAcross() < rescueMinMidSentence {
			return false
		}
		if !stats.lowercase[compare.PyLower(withoutPossessive(words[0]))] {
			return true // Portly, Emily, Goring: the suffix alone turned it down
		}
		speech := 0
		for _, m := range group.mentions {
			if m.speech || speechAcrossThe(paragraphs[m.paragraph].text, m.start, m.end) {
				speech++
			}
		}
		return speech >= rescueMinSpeech
	}
}

// confidenceOf gathers the evidence for one of the scan's names.
func confidenceOf(group *scanGroup, paragraphs []ruleParagraph, spans [][]entitySpan) confidenceEvidence {
	e := confidenceEvidence{mentions: len(group.mentions)}
	words := compare.PySplit(compare.PyLower(group.mentions[0].core))
	e.placeWord = len(words) > 1 && confidentPlaceWords[strings.Trim(words[len(words)-1], ".,'’")]
	for _, m := range group.mentions {
		text := paragraphs[m.paragraph].text
		if m.honorific != "" && !confidentPlaceHonorifics[m.honorific] {
			e.person++
		}
		if m.speech || speechAcrossThe(text, m.start, m.end) {
			e.speech++
		}
		switch word := wordBefore(text, m.start, true); {
		case confidentPlacePrepositions[word]:
			e.placeContext++
		case word == "to":
			e.toContext++
		}
		if actsAfter(text, m.end) {
			e.acts++
		}
		if spans != nil {
			if label, ok := spanLabelAt(spans[m.paragraph], m.start, m.end); ok {
				e.model++
				switch label {
				case "PERSON":
					e.modelPerson++
				case "GPE", "LOC", "FAC":
					e.modelPlace++
				}
			}
		}
	}
	return e
}

// speechAcrossThe is a speech verb on either side of a name that is written after "the": "said the Hatter", "the Hatter said". The
// scan's own check (speechVerbNear) needs the verb right beside the name.
func speechAcrossThe(text []rune, start, end int) bool {
	word, from := previousWord(text, start)
	if word != "the" {
		return false
	}
	if verb, _ := previousWord(text, from); scanSpeechVerbs[verb] {
		return true
	}
	after := end
	for after < len(text) && (compare.IsPySpace(text[after]) || text[after] == ',') {
		after++
	}
	return after > end && after < len(text) && scanSpeechVerbs[string(text[after:scanWordEnd(text, after)])]
}

// confidentActionVerbs, right after a name, say it does something: the irregular past tenses and present forms a narrator's book
// uses most. A regular past tense (barked, rowed) is any lower-case word of four letters or more that ends in "ed".
var confidentActionVerbs = wordSet("went", "came", "got", "took", "made", "thought", "saw", "sat", "stood", "ran", "told", "gave", "felt",
	"kept", "found", "began", "put", "said", "says", "thinks", "knows", "knew", "wants", "likes", "goes", "comes", "gets", "takes", "makes",
	"sees", "sits", "stands", "runs", "tells", "gives", "feels", "keeps", "finds", "begins", "puts", "spoke", "speaks", "heard", "hears",
	"woke", "wakes", "slept", "sleeps", "ate", "eats", "drank", "drinks", "sang", "sings", "swam", "swims", "fell", "falls", "rose", "held",
	"holds", "brought", "brings", "caught", "bought", "taught", "fought", "meant", "means", "left", "leaves", "lay", "laid", "rang", "shook",
	"wrote", "writes", "drew", "grew", "threw", "flew", "wept", "slipped", "would", "could", "should", "will", "can", "must", "might")

// actsAfter is a verb right after a name: "Montmorency barked", "Harris said", "George would".
func actsAfter(text []rune, end int) bool {
	at := end
	if at < len(text) && scanIsApostrophe(text[at]) {
		return false // a possessive: Harris's boots
	}
	gap := spacesFrom(text, at)
	if gap == at || gap >= len(text) || !unicode.IsLower(text[gap]) {
		return false
	}
	word := string(text[gap:scanWordEnd(text, gap)])
	return confidentActionVerbs[word] || (len(word) >= 4 && strings.HasSuffix(word, "ed"))
}

// wordBefore is the word before text[start] in lower case, skipping spaces and, when skipThe, one "the": "at the Wild Wood" gives "at".
// Punctuation between them ends the search: "Kingston. At" is not "at Kingston".
func wordBefore(text []rune, start int, skipThe bool) string {
	word, from := previousWord(text, start)
	if skipThe && word == "the" {
		word, _ = previousWord(text, from)
	}
	return word
}

// previousWord is the word right before text[start], across spaces only, in lower case, and where it starts; "" when something else
// comes first.
func previousWord(text []rune, start int) (string, int) {
	at := start
	for at > 0 && compare.IsPySpace(text[at-1]) {
		at--
	}
	if at == start {
		return "", start
	}
	from := at
	for from > 0 && unicode.IsLetter(text[from-1]) {
		from--
	}
	return strings.ToLower(string(text[from:at])), from
}

// spanLabelAt is the label of the model's span that covers a mention, or that it covers.
func spanLabelAt(spans []entitySpan, start, end int) (string, bool) {
	for _, span := range spans {
		if span.start < end && start < span.end {
			return span.label, true
		}
	}
	return "", false
}
