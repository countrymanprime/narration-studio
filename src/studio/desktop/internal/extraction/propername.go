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
	words := strings.Fields(name)
	if len(words) == 0 {
		return false
	}
	letters := false
	for _, r := range name {
		if unicode.IsLetter(r) {
			letters = true
			break
		}
	}
	if !letters {
		return false
	}
	// A leading article does not make a name lower case: the Hatter, the Caterpillar, a Dr. Vance. What follows it is judged.
	for len(words) > 1 && leadingArticles[strings.ToLower(words[0])] {
		words = words[1:]
	}
	first := []rune(words[0])[0]
	if unicode.IsLower(first) && !(len(words) > 1 && surnameParticles[strings.ToLower(words[0])]) {
		return false
	}
	for _, word := range words {
		if !notNameWords[strings.ToLower(strings.Trim(word, ".,;:!?\"'“”‘’()[]"))] {
			return true
		}
	}
	return false
}

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
	"mr", "mrs", "ms", "miss", "sir", "madam", "ma'am", "dr", "lord", "lady",
)

func wordSet(words ...string) map[string]bool {
	set := make(map[string]bool, len(words))
	for _, w := range words {
		set[w] = true
	}
	return set
}
