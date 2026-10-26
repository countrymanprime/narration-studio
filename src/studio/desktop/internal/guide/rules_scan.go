package guide

import (
	"slices"
	"strings"
	"unicode"

	"desktop/internal/compare"
)

// This file is the scan's name finder: which capitalised runs of the manuscript the Story Bible scan (nameSuggestions) offers as
// names, grouped and ranked by the evidence for each, and the names a Story Bible build (build.go) reads through scanCandidates when
// it runs without a language model. It replaced the sidecar's rule_candidates and _grouped, which offered "I'm", "Mr" and
// "Because I" (#2251).
//
// English only. A name is a run of capitalised words, with lower-case particles inside it (de la, van der, of the); a run is cut at
// every pronoun, contraction, function word, interjection and all-caps word, and a leading honorific (Mr, Mrs., Lady) is kept as part
// of the spelling; a form of address (Mr, Sir, Ma'am) is never a name on its own, a rank alone (the Duchess) only with three mentions
// capitalised mid-sentence and never in lower case. A name is offered only on evidence: a single word needs an honorific, a speech
// verb beside it ("said Clara"), or two mentions capitalised mid-sentence (in more than one paragraph, or three in one), and is refused when the book writes it in lower case
// somewhere or it looks like a common word. A name of several words needs two mentions capitalised mid-sentence when the book writes
// every word of it in lower case somewhere (the White Rabbit), and an honorific, a speech verb, one mention mid-sentence or two
// mentions when it writes some of them so (Netherfield Park). Days, months and holidays
// are never names. A paragraph that is a chapter heading, or has no lower-case letter, is not read. Scripts other than Latin, and
// names that are not capitalised, are not found.

// scanHonorifics are the titles a name may start with, each mapped to the class the scan groups by: Mr. Bennet and Mrs. Bennet are
// two people, Mr Darcy and Mr. Darcy one.
var scanHonorifics = map[string]string{
	"mr": "mr", "mister": "mr", "mrs": "mrs", "ms": "ms", "miss": "miss", "mx": "mx", "dr": "dr", "doctor": "dr",
	"sir": "sir", "dame": "dame", "lady": "lady", "lord": "lord", "madam": "madam", "madame": "madam", "mme": "madam",
	"mlle": "mademoiselle", "mademoiselle": "mademoiselle", "monsieur": "monsieur", "ma'am": "madam", "ma’am": "madam",
	"captain": "captain", "capt": "captain", "commander": "commander", "colonel": "colonel", "col": "colonel", "general": "general",
	"gen": "general", "major": "major", "lieutenant": "lieutenant", "lt": "lieutenant", "sergeant": "sergeant", "sgt": "sergeant",
	"admiral": "admiral", "professor": "professor", "prof": "professor", "reverend": "reverend", "rev": "reverend",
	"father": "father", "mother": "mother", "sister": "sister", "brother": "brother", "king": "king", "queen": "queen",
	"prince": "prince", "princess": "princess", "duke": "duke", "duchess": "duchess", "earl": "earl", "count": "count",
	"countess": "countess", "baron": "baron", "baroness": "baroness", "saint": "saint", "st": "saint", "aunt": "aunt",
	"uncle": "uncle", "inspector": "inspector", "detective": "detective", "officer": "officer", "judge": "judge", "sire": "sire",
	"majesty": "majesty", "highness": "highness", "lordship": "lordship", "ladyship": "ladyship", "excellency": "excellency",
	"honour": "honour", "honor": "honour",
}

// scanAddresses are the honorifics that are only ever a form of address, never a character on their own: Mr, Sir, Ma'am, Your
// Majesty. A rank or a role alone (the Duchess, the Doctor) can be a character, so it is a name when the evidence for a single word
// holds for it.
var scanAddresses = wordSet("mr", "mister", "mrs", "ms", "miss", "mx", "dr", "sir", "madam", "madame", "mme", "mlle", "mademoiselle",
	"monsieur", "ma'am", "ma’am", "capt", "col", "gen", "lt", "sgt", "prof", "rev", "st", "sire", "majesty", "highness", "lordship",
	"ladyship", "excellency", "honour", "honor")

// scanAbbreviations are the honorifics written with a full stop that does not end a sentence ("Mr. Darcy").
var scanAbbreviations = wordSet("mr", "mrs", "ms", "mx", "dr", "st", "mme", "mlle", "capt", "col", "gen", "lt", "sgt", "prof", "rev")

// scanStopwords are the words that are never part of a name: pronouns, determiners, conjunctions, prepositions, auxiliaries,
// sentence adverbs and interjections, compared in lower case. A capitalised speech verb (Said) cuts a run too.
var scanStopwords = wordSet(
	"i", "me", "my", "mine", "myself", "we", "us", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "he", "him", "his",
	"himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "one",
	"a", "an", "the", "this", "that", "these", "those", "some", "any", "every", "each", "all", "both", "either", "neither", "no",
	"not", "none", "many", "much", "more", "most", "few", "other", "another", "such", "own", "same",
	"and", "but", "or", "nor", "for", "so", "yet", "because", "although", "though", "while", "whilst", "if", "unless", "until",
	"till", "since", "as", "when", "whenever", "where", "wherever", "why", "how", "what", "whatever", "which", "who", "whom", "whose",
	"whoever", "there", "here", "then", "now", "than", "after", "before", "about", "above", "across", "against", "along", "among",
	"around", "at", "behind", "below", "beneath", "beside", "besides", "between", "beyond", "by", "down", "during", "except", "from",
	"in", "inside", "into", "like", "near", "of", "off", "on", "onto", "out", "outside", "over", "past", "through", "throughout",
	"to", "toward", "towards", "under", "underneath", "up", "upon", "with", "within", "without", "via",
	"is", "are", "was", "were", "be", "been", "being", "am", "has", "have", "had", "having", "do", "does", "did", "done", "shall",
	"should", "would", "can", "could", "might", "must", "ought", "let", "lets",
	"however", "meanwhile", "suddenly", "perhaps", "maybe", "still", "also", "even", "just", "only", "once", "later", "soon",
	"finally", "eventually", "again", "always", "never", "sometimes", "often", "usually", "already", "almost", "instead",
	"otherwise", "therefore", "thus", "hence", "indeed", "anyway", "certainly", "surely", "really", "actually", "quite", "rather",
	"very", "too", "yesterday", "today", "tomorrow", "tonight", "nothing", "everything", "something", "anything",
	"everyone", "someone", "anyone", "nobody", "everybody", "somebody", "anybody", "nowhere", "somewhere", "everywhere",
	"o", "oh", "ah", "aha", "eh", "uh", "um", "hmm", "ha", "yes", "yeah", "yep", "nope", "okay", "ok", "hello", "hi", "hey", "please",
	"sorry", "thanks", "thank", "goodbye", "bye", "well", "wow", "alas", "dear", "good", "fine", "right", "sure", "first", "next",
	"last", "pray", "presently", "anyhow", "somehow", "chapter", "part", "book", "prologue", "epilogue", "interlude", "section", "act", "scene",
)

// scanSentenceAuxiliaries are words that are also names (Will Turner, May Welland), so they are cut only where they open a sentence.
var scanSentenceAuxiliaries = wordSet("will", "may")

// scanCalendar are capitalised words that are never Story Bible entries on their own: days, months, holidays, languages and
// nationalities, and New.
var scanCalendar = wordSet("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february",
	"march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "christmas", "easter",
	"halloween", "thanksgiving", "hanukkah", "ramadan", "diwali", "passover", "new", "god", "english", "french", "german", "spanish",
	"italian", "latin", "greek", "dutch", "russian", "chinese", "japanese", "american", "british", "irish", "scottish", "welsh",
	"european", "african", "asian")

// scanParticles are the lower-case words a name may hold between two capitalised words.
var scanParticles = wordSet("of", "the", "de", "la", "le", "les", "du", "des", "del", "della", "da", "di", "dos", "das", "van",
	"von", "der", "den", "ter", "ten", "zu", "y", "e", "bin", "ibn", "al", "el")

// scanContractions are the endings after an apostrophe that make a word a contraction: I'm, I'll, we're, I've, I'd, don't.
var scanContractions = []string{"m", "ll", "re", "ve", "d", "t"}

// scanSpeechVerbs are the verbs that, beside a name, say a person is speaking or acting: the cue rules' speechVerbs and a few more.
var scanSpeechVerbs = func() map[string]bool {
	words := wordSet("says", "asks", "replies", "screamed", "told", "tells", "wrote", "nodded", "shrugged", "sighed", "frowned",
		"grinned", "smiled", "laughed", "wept", "groaned", "growled", "hissed", "sobbed", "breathed", "insisted", "admitted",
		"agreed", "begged", "pleaded", "promised", "warned", "explained", "observed", "thought")
	for verb := range speechVerbs {
		words[verb] = true
	}
	return words
}()

const (
	scanMinRankMentions = 3  // mentions mid-sentence a rank alone needs to be a character
	scanMaxRunWords     = 6  // capitalised words a name may have
	scanMaxHeading      = 80 // characters a chapter heading paragraph may have
)

// scanWord is one word of a capitalised run: [start, end) in the paragraph, end before a possessive, and what the word is.
type scanWord struct {
	start, end int
	lower      string
	particle   bool // a lower-case particle between two capitalised words
	stop       bool // cuts the run
	honorific  string
	possessive bool // the word ended with 's or s', so the run ends after it
}

// scanMention is one name found in a paragraph: its spelling (honorific included) at [start, end), its core without the honorific,
// and the evidence it carries.
type scanMention struct {
	paragraph, start, end int
	spelling, core        string
	honorific             string // the honorific's class, "" for none
	midSentence, speech   bool
}

// scanGroup is the mentions the scan takes for one name, and its evidence.
type scanGroup struct {
	key      string
	mentions []scanMention
}

func (g *scanGroup) count(test func(scanMention) bool) int {
	n := 0
	for _, m := range g.mentions {
		if test(m) {
			n++
		}
	}
	return n
}

func (g *scanGroup) honorifics() int {
	return g.count(func(m scanMention) bool { return m.honorific != "" })
}
func (g *scanGroup) speech() int { return g.count(func(m scanMention) bool { return m.speech }) }
func (g *scanGroup) mid() int    { return g.count(func(m scanMention) bool { return m.midSentence }) }

// midAcross is how many mentions are capitalised mid-sentence, or 0 when they are all in one paragraph and fewer than
// scanMinRankMentions: Latitude or Longitude, twice in one paragraph, is not a name; Robert, three times, is.
func (g *scanGroup) midAcross() int {
	paragraphs := map[int]bool{}
	for _, m := range g.mentions {
		paragraphs[m.paragraph] = true
	}
	if mid := g.mid(); len(paragraphs) >= 2 || mid >= scanMinRankMentions {
		return mid
	}
	return 0
}

// score ranks a group: an honorific or a speech verb is stronger evidence than a capital mid-sentence, which is stronger than a mention.
func (g *scanGroup) score() int {
	return 3*g.honorifics() + 3*g.speech() + 2*g.mid() + len(g.mentions)
}

func scanIsUpper(r rune) bool { return unicode.IsUpper(r) }

func scanIsApostrophe(r rune) bool { return r == '\'' || r == '’' }

// scanWordEnd is where a word starting at i ends: letters, with a hyphen or an apostrophe between two letters.
func scanWordEnd(text []rune, i int) int {
	for i < len(text) {
		switch {
		case unicode.IsLetter(text[i]) || unicode.IsDigit(text[i]):
			i++
		case (text[i] == '-' || scanIsApostrophe(text[i])) && i+1 < len(text) && unicode.IsLetter(text[i+1]):
			i++
		default:
			return i
		}
	}
	return i
}

// isContraction is whether a word is a contraction: I'm, I'll, they're, don't. O'Brien and D'Arcy are not.
func isContraction(word []rune) bool {
	for i, r := range word {
		if !scanIsApostrophe(r) || i == 0 {
			continue
		}
		tail := strings.ToLower(string(word[i+1:]))
		if slices.Contains(scanContractions, tail) {
			return true
		}
	}
	return false
}

// inMarkedWord is whether a word ending at end runs on past an emphasis mark or a dash: the Un of _Un_important, the Soo of
// Soo—oop.
func inMarkedWord(text []rune, end int) bool {
	return end+1 < len(text) && strings.ContainsRune("_*—–", text[end]) && unicode.IsLower(text[end+1])
}

// isShouted is whether a word of two or more letters is all capitals: GET OUT, STOP, CHAPTER.
func isShouted(word []rune) bool {
	letters := 0
	for _, r := range word {
		if unicode.IsLetter(r) {
			if !unicode.IsUpper(r) {
				return false
			}
			letters++
		}
	}
	return letters >= 2
}

// scanStartsSentence is whether the word at index is capitalised because of where it is: at the start of the paragraph, after a
// sentence's end (not an honorific's or an initial's full stop), or just inside an opening quote or bracket.
func scanStartsSentence(text []rune, index int) bool {
	if index > 0 && strings.ContainsRune("“‘\"'([", text[index-1]) {
		return true
	}
	i := index
	for i > 0 && strings.ContainsRune(sentenceStartSkippable+"—–-", text[i-1]) {
		i--
	}
	if i == 0 {
		return true
	}
	if !strings.ContainsRune(sentenceEndCharacters, text[i-1]) {
		return false
	}
	if text[i-1] == '.' {
		start := i - 1
		for start > 0 && unicode.IsLetter(text[start-1]) {
			start--
		}
		word := strings.ToLower(string(text[start : i-1]))
		if scanAbbreviations[word] || (i-1-start == 1 && unicode.IsUpper(text[start])) {
			return false
		}
	}
	return true
}

// isHeading is whether a paragraph is a chapter heading or has no lower-case letter: CHAPTER ONE, Chapter 3: The Storm.
func isHeading(text []rune) bool {
	if !slices.ContainsFunc(text, unicode.IsLower) {
		return true
	}
	if len(text) > scanMaxHeading {
		return false
	}
	first := compare.PySplit(string(text))
	if len(first) == 0 {
		return true
	}
	word := strings.ToLower(strings.TrimRight(first[0], ".:"))
	return slices.Contains([]string{"chapter", "part", "book", "prologue", "epilogue", "interlude", "act", "section"}, word)
}

// scanRun reads the capitalised run starting at start: its words, the particles between them and the honorifics' full stops, and
// where it ends.
func scanRun(text []rune, start int) ([]scanWord, int) {
	var words []scanWord
	at := start
	capitals := 0
	for capitals < scanMaxRunWords && at < len(text) && scanIsUpper(text[at]) {
		end := scanWordEnd(text, at)
		word := scanWord{start: at, end: end}
		raw := text[at:end]
		// A possessive ends the run: Darcy's pride, the Hendersons' gate.
		if n := len(raw); n >= 3 && scanIsApostrophe(raw[n-2]) && (raw[n-1] == 's' || raw[n-1] == 'S') {
			word.end, word.possessive = end-2, true
		} else if end < len(text) && scanIsApostrophe(text[end]) && raw[n-1] == 's' {
			word.possessive = true
		}
		core := text[word.start:word.end]
		word.lower = strings.ToLower(string(core))
		switch {
		case isContraction(core) || scanStopwords[word.lower] || scanSpeechVerbs[word.lower] || isShouted(core) || inMarkedWord(text, end) ||
			(scanSentenceAuxiliaries[word.lower] && len(words) == 0 && scanStartsSentence(text, at)):
			word.stop = true
		case scanHonorifics[word.lower] != "":
			word.honorific = scanHonorifics[word.lower]
		}
		next := end
		if word.possessive && next < len(text) && scanIsApostrophe(text[next]) {
			next++
		}
		if scanAbbreviations[word.lower] && next < len(text) && text[next] == '.' {
			word.end, next = word.end+1, next+1
		}
		words = append(words, word)
		capitals++
		if word.possessive {
			return words, next
		}
		// The next capitalised word, after one run of spaces and any particles, each followed by spaces.
		gap := next
		for gap < len(text) && (text[gap] == ' ' || text[gap] == '\t' || text[gap] == ' ') {
			gap++
		}
		if gap == next || gap >= len(text) {
			return words, next
		}
		var particles []scanWord
		for gap < len(text) && unicode.IsLower(text[gap]) {
			end := scanWordEnd(text, gap)
			lower := string(text[gap:end])
			following := end
			for following < len(text) && text[following] == ' ' {
				following++
			}
			if !scanParticles[lower] || following == end || (len(particles) > 0 && particles[len(particles)-1].lower == lower) {
				return words, next
			}
			particles = append(particles, scanWord{start: gap, end: end, lower: lower, particle: true})
			gap = following
		}
		if gap >= len(text) || !scanIsUpper(text[gap]) {
			return words, next
		}
		words = append(words, particles...)
		at = gap
	}
	return words, at
}

// scanMentions are the names in a paragraph: each capitalised run cut at its stop words, a leading honorific kept with the name.
func scanMentions(index int, text []rune) []scanMention {
	if isHeading(text) {
		return nil
	}
	var out []scanMention
	for i := 0; i < len(text); {
		if !scanIsUpper(text[i]) || (i > 0 && (unicode.IsLetter(text[i-1]) || unicode.IsDigit(text[i-1]) || scanIsApostrophe(text[i-1]))) {
			i++
			continue
		}
		words, end := scanRun(text, i)
		runStartsSentence := scanStartsSentence(text, i)
		var segment []scanWord
		first := true
		flush := func() {
			if m, ok := scanMentionOf(index, text, segment, first && runStartsSentence); ok {
				out = append(out, m)
			}
			if len(segment) > 0 {
				first = false
			}
			segment = nil
		}
		for _, word := range words {
			repeated := len(segment) > 0 && !word.particle && segment[len(segment)-1].lower == word.lower // Élodie Élodie
			if repeated || word.stop || (word.honorific != "" && slices.ContainsFunc(segment, func(w scanWord) bool { return w.honorific == "" && !w.particle })) {
				flush()
				first = false
				if word.stop {
					continue
				}
			}
			segment = append(segment, word)
		}
		flush()
		i = max(end, i+1)
	}
	return out
}

// scanMentionOf is the mention a cut segment of a run makes, if any: particles trimmed from its ends, a name left after its honorific
// (the last one, where titles are stacked).
func scanMentionOf(index int, text []rune, segment []scanWord, startsSentence bool) (scanMention, bool) {
	for len(segment) > 0 && segment[0].particle {
		segment = segment[1:]
	}
	for len(segment) > 0 && segment[len(segment)-1].particle {
		segment = segment[:len(segment)-1]
	}
	honorific, core := "", 0
	for core < len(segment) && segment[core].honorific != "" {
		honorific = segment[core].honorific
		core++
	}
	if core > 1 && core < len(segment) {
		segment, core = segment[core-1:], 1 // the last of stacked titles: Lady Ivy, not Mrs. Lady Ivy
	}
	if core >= len(segment) {
		if len(segment) != 1 || scanAddresses[segment[0].lower] {
			return scanMention{}, false // a bare form of address: Mr, Sir, Ma'am
		}
		honorific, core = "", 0 // a rank alone, the Duchess, stands on the evidence for a single word
	}
	names := segment[core:]
	start, end := segment[0].start, segment[len(segment)-1].end
	if (len(names) == 1 && scanCalendar[names[0].lower]) || len([]rune(scanKey(string(text[names[0].start:end])))) < 2 {
		return scanMention{}, false // a day, a month, or a single letter
	}
	m := scanMention{
		paragraph: index, start: start, end: end,
		spelling:  string(text[start:end]),
		core:      string(text[names[0].start:end]),
		honorific: honorific, midSentence: !startsSentence,
	}
	m.speech = speechVerbNear(text, start, end)
	return m, true
}

// speechVerbNear is whether a speech verb is right after the name ("Clara said") or right before it ("said Clara").
func speechVerbNear(text []rune, start, end int) bool {
	after := end
	if after < len(text) && scanIsApostrophe(text[after]) { // the Hendersons' gate
		after++
	}
	if gap := spacesFrom(text, after); gap > after && gap < len(text) && unicode.IsLower(text[gap]) {
		if scanSpeechVerbs[string(text[gap:scanWordEnd(text, gap)])] {
			return true
		}
	}
	before := start
	for before > 0 && compare.IsPySpace(text[before-1]) {
		before--
	}
	if before == start {
		return false
	}
	from := before
	for from > 0 && unicode.IsLetter(text[from-1]) {
		from--
	}
	return from < before && scanSpeechVerbs[string(text[from:before])]
}

// scanKey is the grouping key of a name: its letters and digits in lower case, so Mr Darcy and Mr. Darcy are one.
func scanKey(name string) string {
	var out strings.Builder
	for _, r := range strings.ToLower(name) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			out.WriteRune(r)
		}
	}
	return out.String()
}

// scanGroups are the names the scan offers, strongest evidence first (the first mentioned first on a tie): each name's mentions
// grouped by its core and honorific, a bare mention joined to its one honorific (Darcy to Mr Darcy) and dropped when the name has
// several (Bennet beside Mr. and Mrs. Bennet), a first name joined to the one longer name it starts (Isabel to Isabel de la Cruz),
// then each kept only on its evidence.
func scanGroups(paragraphs []ruleParagraph) []*scanGroup {
	stats := wordStatsOf(paragraphs)
	var order []string
	byKey := map[string]*scanGroup{}
	for index, paragraph := range paragraphs {
		for _, m := range scanMentions(index, paragraph.text) {
			if m = withoutLeadingCommonWord(m, paragraph.text, stats); m.core == "" {
				continue
			}
			key := scanKey(m.core) + "|" + m.honorific
			if byKey[key] == nil {
				byKey[key] = &scanGroup{key: key}
				order = append(order, key)
			}
			byKey[key].mentions = append(byKey[key].mentions, m)
		}
	}
	coreOf := func(key string) string { return key[:strings.IndexByte(key, '|')] }
	classes := map[string][]string{}
	for _, key := range order {
		if !strings.HasSuffix(key, "|") {
			classes[coreOf(key)] = append(classes[coreOf(key)], key)
		}
	}
	join := func(into, from string) {
		byKey[into].mentions = append(byKey[into].mentions, byKey[from].mentions...)
		delete(byKey, from)
	}
	for _, key := range order {
		if group := byKey[key]; group == nil || !strings.HasSuffix(key, "|") {
			continue
		}
		switch titled := classes[coreOf(key)]; len(titled) {
		case 0:
		case 1:
			join(titled[0], key)
		default:
			delete(byKey, key)
		}
	}
	// A one-word name joins the one longer name whose first word it is, unless it carries an honorific the longer name does not.
	for _, key := range order {
		group := byKey[key]
		if group == nil || strings.Contains(group.mentions[0].core, " ") {
			continue
		}
		var into []string
		for _, other := range order {
			long := byKey[other]
			if long == nil || other == key || !strings.Contains(long.mentions[0].core, " ") {
				continue
			}
			if words := compare.PySplit(long.mentions[0].core); scanKey(words[0]) == coreOf(key) {
				into = append(into, other)
			}
		}
		if len(into) == 1 && (strings.HasSuffix(key, "|") || strings.HasSuffix(into[0], "|"+key[strings.IndexByte(key, '|')+1:])) {
			if scanAccepts(group, stats) {
				join(into[0], key)
			} else {
				delete(byKey, key) // Beautiful, beside Beautiful Soup, is not a name
			}
		}
	}
	var kept []*scanGroup
	for _, key := range order {
		if group := byKey[key]; group != nil && scanAccepts(group, stats) {
			kept = append(kept, group)
		}
	}
	// A plural of another name is a family, not an entry: the Hendersons beside Mrs Henderson.
	cores := map[string]bool{}
	for _, group := range kept {
		words := compare.PySplit(group.mentions[0].core)
		cores[scanKey(words[len(words)-1])] = true
	}
	kept = slices.DeleteFunc(kept, func(group *scanGroup) bool {
		core := coreOf(group.key)
		return !strings.Contains(group.mentions[0].core, " ") &&
			((strings.HasSuffix(core, "s") && cores[strings.TrimSuffix(core, "s")]) || (strings.HasSuffix(core, "es") && cores[strings.TrimSuffix(core, "es")]))
	})
	slices.SortStableFunc(kept, func(a, b *scanGroup) int { return b.score() - a.score() })
	return kept
}

// withoutLeadingCommonWord is m without a first word that is a common word by its suffix and written in lower case in the book:
// Running the Order of the Lamp is the Order of the Lamp. A mention with an honorific keeps its words; one left with only particles
// or nothing has an empty core.
func withoutLeadingCommonWord(m scanMention, text []rune, stats wordStats) scanMention {
	if m.honorific != "" {
		return m
	}
	words := compare.PySplit(m.core)
	if len(words) < 2 || !hasCommonSuffix(words[0]) || !stats.lowercase[compare.PyLower(words[0])] {
		return m
	}
	start := m.start + len([]rune(words[0]))
	for start < m.end && (compare.IsPySpace(text[start]) || unicode.IsLower(text[start])) {
		start++ // the space and any particles after the word
	}
	if start >= m.end {
		return scanMention{}
	}
	m.start, m.midSentence = start, true
	m.spelling, m.core = string(text[start:m.end]), string(text[start:m.end])
	return m
}

// scanAccepts is whether a group's evidence makes it a name.
func scanAccepts(group *scanGroup, stats wordStats) bool {
	honorific, speech, mid := group.honorifics(), group.speech(), group.mid()
	words := compare.PySplit(group.mentions[0].core)
	common := func(word string) bool {
		return stats.lowercase[compare.PyLower(withoutPossessive(word))] || scanCalendar[strings.ToLower(word)]
	}
	if len(words) > 1 {
		capitals := slices.DeleteFunc(slices.Clone(words), func(w string) bool { return scanParticles[w] })
		switch uncommon := slices.DeleteFunc(slices.Clone(capitals), common); {
		case len(uncommon) == 0:
			return group.midAcross() >= minMidSentenceMentions // the White Rabbit, capitalised mid-sentence again and again; not Good Morning
		case len(uncommon) == len(capitals):
			return true // Jane Bennet: no word of it is written in lower case
		}
		return honorific > 0 || speech > 0 || mid > 0 || len(group.mentions) >= 2
	}
	if scanHonorifics[strings.ToLower(words[0])] != "" {
		return !common(words[0]) && group.midAcross() >= scanMinRankMentions // a rank alone: the Duchess, not "the Doctor will see you"
	}
	if honorific > 0 {
		return true
	}
	if common(words[0]) || hasCommonSuffix(words[0]) {
		return false
	}
	return speech > 0 || group.midAcross() >= minMidSentenceMentions
}

// scanCandidates are the scan's names as the build reads them: every mention of every group scanGroups keeps, in reading order, each
// carrying its group so the build keeps the scan's merges.
func scanCandidates(paragraphs []ruleParagraph) []ruleCandidate {
	var out []ruleCandidate
	for _, group := range scanGroups(paragraphs) {
		for _, m := range group.mentions {
			out = append(out, ruleCandidate{name: m.spelling, paragraph: m.paragraph, start: m.start, end: m.end, group: group.key})
		}
	}
	slices.SortStableFunc(out, func(a, b ruleCandidate) int {
		if a.paragraph != b.paragraph {
			return a.paragraph - b.paragraph
		}
		return a.start - b.start
	})
	return out
}

// spellingsOf are a group's spellings, the name it is offered under first: the most used, on a tie the one with an honorific (Mr Darcy
// over Darcy), then the longer, then the lower code points; then the rest in that order. first is the first mention
// of each.
func spellingsOf(group *scanGroup) ([]string, map[string]scanMention) {
	counts := map[string]int{}
	first := map[string]scanMention{}
	var spellings []string
	for _, m := range group.mentions {
		if _, ok := first[m.spelling]; !ok {
			first[m.spelling] = m
			spellings = append(spellings, m.spelling)
		}
		counts[m.spelling]++
	}
	slices.SortStableFunc(spellings, func(a, b string) int {
		if counts[a] != counts[b] {
			return counts[b] - counts[a]
		}
		if ha, hb := first[a].honorific != "", first[b].honorific != ""; ha != hb {
			if ha {
				return -1
			}
			return 1
		}
		if n, m := len([]rune(a)), len([]rune(b)); n != m {
			return m - n
		}
		return strings.Compare(a, b)
	})
	return spellings, first
}
