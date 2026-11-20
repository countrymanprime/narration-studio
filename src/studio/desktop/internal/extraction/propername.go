package extraction

import (
	"strings"
	"unicode"
)

// ProperName reports whether name can be the name of a Story Bible entry: a character, place, group or thing that is called something.
// A source that labels spans (GLiNER does, zero-shot) also labels "she", "map" and "concrete" as characters and items (#3661); none of
// them is a name. A name has a letter, starts with a capital (or a letter with no case, as in Chinese) unless its first word is a
// particle of a surname (de la Cruz, van der Berg), and is not only pronouns, articles and other words that begin a sentence.
func ProperName(name string) bool {
	words := strings.Fields(strings.Map(dropFormat, name))
	if len(words) == 0 {
		return false
	}
	// A leading article does not make a name lower case: the Hatter, the Caterpillar, a Dr. Vance. What follows it is judged.
	for len(words) > 1 && leadingArticles[strings.ToLower(trimEdges(words[0]))] {
		words = words[1:]
	}
	first := []rune(trimEdges(words[0]))
	if len(first) == 0 {
		return false
	}
	if hasLowerCase(first[0]) && !particleBeforeAName(words) {
		return false
	}
	// Something in it must be the name itself: a word with a capital (or no case) that is not a pronoun, an article or another word
	// that opens a sentence. "ten men", "al dente", "His mother" and "She said" have none; "de la Cruz" and "Mr Darcy" do. A word after
	// a title is the name whatever it is (Dr. No, Lord No).
	for i, word := range words {
		if isNameWord(word) || (i > 0 && titles[strings.ToLower(trimEdges(words[i-1]))] && startsUpper(word)) {
			return true
		}
	}
	return false
}

// dropFormat removes the characters that have no width (zero-width spaces and joiners, bidirectional marks, soft hyphens, a byte order
// mark): they are invisible in the manuscript and must not change what a name is.
func dropFormat(r rune) rune {
	if unicode.Is(unicode.Cf, r) {
		return -1
	}
	return r
}

// edgePunctuation is what may wrap a name or trail after it in running text: quotes, brackets, dashes, an ellipsis, Spanish marks and
// the marks of emphasis (Markdown's * and _).
const edgePunctuation = ".,;:!?\"'“”‘’()[]«»„‹›「」『』*_—–-…¿¡"

func trimEdges(word string) string { return strings.Trim(word, edgePunctuation) }

// hasLowerCase reports whether r is a lower-case letter in a script that has capitals. Georgian's letters are lower case to Unicode (they
// have a capital form) but are written without capitals, like Chinese.
func hasLowerCase(r rune) bool {
	return unicode.IsLower(r) && (r < 0x10D0 || r > 0x10FF)
}

func startsUpper(word string) bool {
	r := []rune(trimEdges(word))
	return len(r) > 0 && unicode.IsLetter(r[0]) && !hasLowerCase(r[0])
}

// particleBeforeAName reports whether the first word is a surname particle that something follows: de la Cruz, van der Berg, al-Rashid.
func particleBeforeAName(words []string) bool {
	particle := strings.ToLower(trimEdges(words[0]))
	hyphenated := false
	if cut := strings.IndexByte(particle, '-'); cut > 0 {
		particle, hyphenated = particle[:cut], true
	}
	return surnameParticles[particle] && (len(words) > 1 || hyphenated)
}

// apostrophes are the characters written for an apostrophe.
var apostropheReplacer = strings.NewReplacer("’", "'", "ʼ", "'", "‛", "'", "′", "'", "＇", "'", "`", "'")

// contractionSuffixes are what follows the apostrophe in I'm, She's, We'll, They're, I've, He'd and Don't.
var contractionSuffixes = map[string]bool{"s": true, "m": true, "ll": true, "re": true, "ve": true, "d": true, "t": true}

// isNameWord reports whether word can be the name, or a part of it: it begins with a capital or with a letter that has no case, and
// is not a pronoun, article or other word that is no name (also with a contraction cut off: I'm, She's, We'll, Don't, Let's). A name
// with an apostrophe inside (O'Neill, Do'Urden, A'isha) is not a contraction: only the endings above are.
func isNameWord(word string) bool {
	trimmed := trimEdges(word)
	// A particle joined by a hyphen (al-Rashid, van-der-Berg) is judged by the name after it.
	if cut := strings.IndexByte(trimmed, '-'); cut > 0 && cut < len(trimmed)-1 && !startsUpper(trimmed) && surnameParticles[strings.ToLower(trimmed[:cut])] {
		return isNameWord(trimmed[cut+1:])
	}
	if !startsUpper(trimmed) {
		return false
	}
	lower := apostropheReplacer.Replace(strings.ToLower(trimmed))
	if notNameWords[lower] {
		return false
	}
	if cut := strings.IndexByte(lower, '\''); cut > 0 && contractionSuffixes[lower[cut+1:]] {
		base := lower[:cut]
		if lower[cut+1:] == "t" {
			base = strings.TrimSuffix(base, "n")
		}
		if notNameWords[base] || contractionBases[base] {
			return false
		}
	}
	return true
}

// contractionBases are the words a contraction is made of besides the stoplist: ca(n't), wo(n't), sha(n't), ai(n't), let's, that's.
var contractionBases = wordSet("ca", "wo", "sha", "ai", "let", "should", "must", "need", "ought")

// titles are the words a title is made of: what follows one is a name.
var titles = wordSet("mr", "mrs", "ms", "miss", "dr", "sir", "madam", "lord", "lady", "captain", "professor", "doctor")

// leadingArticles are the words a group or a character may be introduced by, written in lower case in running text.
var leadingArticles = map[string]bool{"the": true, "a": true, "an": true}

// surnameParticles are the words a surname may begin with in lower case.
var surnameParticles = map[string]bool{
	"de": true, "del": true, "della": true, "di": true, "da": true, "du": true, "la": true, "le": true, "van": true, "von": true,
	"der": true, "den": true, "ten": true, "ter": true, "al": true, "el": true, "bin": true, "ibn": true, "ap": true, "af": true,
	"dos": true, "das": true, "mac": true,
}

// notNameWords are the words that are never a name on their own, however they are written: pronouns, articles, determiners,
// conjunctions, prepositions and the other words a sentence starts with. A name made only of them (She, The, Of the) is no name;
// one with a word besides them (The Order, Mr Darcy) is judged by that word.
var notNameWords = wordSet(
	"i", "me", "my", "mine", "myself", "we", "us", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves",
	"he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs",
	"themselves", "one", "someone", "somebody", "anyone", "anybody", "everyone", "everybody", "nobody", "something", "anything",
	"everything", "nothing", "who", "whom", "whose", "which", "what", "that", "this", "these", "those", "there", "here",
	"the", "a", "an", "and", "or", "but", "nor", "so", "yet", "for", "of", "to", "in", "on", "at", "by", "with", "from", "as", "if",
	"then", "than", "when", "while", "where", "why", "how", "because", "though", "although", "however", "also", "not", "no", "yes",
	"all", "any", "some", "each", "every", "both", "either", "neither", "many", "much", "more", "most", "other", "another", "such",
	"is", "was", "are", "were", "be", "been", "am", "do", "did", "does", "have", "had", "has", "would", "could",
	"mr", "mrs", "ms", "miss", "sir", "madam", "ma'am", "y'all", "dr", "lord", "lady",
)

func wordSet(words ...string) map[string]bool {
	set := make(map[string]bool, len(words))
	for _, w := range words {
		set[w] = true
	}
	return set
}
