// Package soundalike scores how alike a script's words and the words a recogniser heard are, by letters and by sound,
// so a misread's confidence can say how likely it is a real misread rather than the recogniser mishearing a near
// match ("MBA" heard as "NBA": one letter of three, and M and N sound alike; issue #2251 item 27). The score is a
// weighted edit distance over the letters: a letter swapped for one that sounds like it (M and N, B and P, D and T,
// a vowel for a vowel), a vowel or a doubled letter added or dropped, and two letters turned around each cost less
// than another change. It is an ordering for a narrator to sort and judge by, calibrated on
// tests/fixtures/sound-alike/cases.json, not a probability.
package soundalike

import (
	"math"
	"strings"
	"unicode"
)

// maxLetters bounds a comparison: longer texts are compared on their first maxLetters letters, so a run of a whole
// paragraph costs a bounded amount of work.
const maxLetters = 512

const (
	alikeCost     = 0.5  // a letter for one that sounds like it
	weakCost      = 0.5  // a vowel, h, w or y added or dropped
	doubledCost   = 0.25 // a letter added or dropped beside the same letter ("lory", "lorry")
	turnedCost    = 0.5  // two neighbouring letters turned around ("centre", "center")
	differentCost = 1.0
)

// soundGroups are letters a listener, or a recogniser, takes for one another. A letter can be in more than one (c is
// k before a, o and u, and s before e and i).
var soundGroups = []string{"aeiouy", "mn", "bp", "dt", "ckgq", "csz", "fv", "jg"}

// rewrites spell a sound one way before the letters are compared.
var rewrites = strings.NewReplacer("ph", "f", "ck", "k")

// words are a text's words in lower case, each its letters and digits only; a word with neither is dropped.
func words(text string) []string {
	var out []string
	for _, field := range strings.Fields(strings.ToLower(text)) {
		kept := strings.Map(func(r rune) rune {
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				return r
			}
			return -1
		}, field)
		if kept != "" {
			out = append(out, kept)
		}
	}
	return out
}

// differing drops the words the two texts start and end with alike, so "the quick brown fox" against "the quick brown
// socks" compares "fox" with "socks": the words that were heard differently.
func differing(a, b []string) ([]string, []string) {
	for len(a) > 0 && len(b) > 0 && a[0] == b[0] {
		a, b = a[1:], b[1:]
	}
	for len(a) > 0 && len(b) > 0 && a[len(a)-1] == b[len(b)-1] {
		a, b = a[:len(a)-1], b[:len(b)-1]
	}
	return a, b
}

func letters(text []string) []rune {
	out := []rune(rewrites.Replace(strings.Join(text, "")))
	if len(out) > maxLetters {
		out = out[:maxLetters]
	}
	return out
}

func soundsAlike(a, b rune) bool {
	for _, group := range soundGroups {
		if strings.ContainsRune(group, a) && strings.ContainsRune(group, b) {
			return true
		}
	}
	return false
}

func substitution(a, b rune) float64 {
	switch {
	case a == b:
		return 0
	case soundsAlike(a, b):
		return alikeCost
	}
	return differentCost
}

// indel is the cost of adding or dropping word[i]: less for a weak letter, least beside the same letter.
func indel(word []rune, i int) float64 {
	r := word[i]
	if (i > 0 && word[i-1] == r) || (i+1 < len(word) && word[i+1] == r) {
		return doubledCost
	}
	if strings.ContainsRune("aeiouyhw", r) {
		return weakCost
	}
	return differentCost
}

// distance is the weighted Damerau-Levenshtein distance between a and b.
func distance(a, b []rune) float64 {
	rows := make([][]float64, len(a)+1)
	for i := range rows {
		rows[i] = make([]float64, len(b)+1)
	}
	for i := 1; i <= len(a); i++ {
		rows[i][0] = rows[i-1][0] + indel(a, i-1)
	}
	for j := 1; j <= len(b); j++ {
		rows[0][j] = rows[0][j-1] + indel(b, j-1)
	}
	for i := 1; i <= len(a); i++ {
		for j := 1; j <= len(b); j++ {
			best := min(rows[i-1][j]+indel(a, i-1), rows[i][j-1]+indel(b, j-1), rows[i-1][j-1]+substitution(a[i-1], b[j-1]))
			if i > 1 && j > 1 && a[i-1] == b[j-2] && a[i-2] == b[j-1] && a[i-1] != a[i-2] {
				best = min(best, rows[i-2][j-2]+turnedCost)
			}
			rows[i][j] = best
		}
	}
	return rows[len(a)][len(b)]
}

// Similarity is 1 for the same letters (case, spacing and punctuation are not sounds), 0 for nothing alike, and 0
// when either side has no letters to compare. Words both texts start or end with are left out, so it scores the words
// heard differently. It is symmetric.
func Similarity(script, heard string) float64 {
	scriptWords, heardWords := words(script), words(heard)
	if len(scriptWords) == 0 || len(heardWords) == 0 {
		return 0
	}
	a, b := letters(scriptWords), letters(heardWords)
	if string(a) == string(b) {
		return 1
	}
	a, b = differingLetters(scriptWords, heardWords)
	if len(a) == 0 || len(b) == 0 {
		// One side says only words the other has: a word added or dropped, nothing alike to compare.
		return 0
	}
	longest := float64(max(len(a), len(b)))
	return max(0, 1-distance(a, b)/longest)
}

// MisreadConfidence is how likely "heard" for "script" is a real misread rather than a near match misheard: 1 minus
// their similarity, 0 to 1, to two decimals (a finer figure would claim a precision the weights do not have).
func MisreadConfidence(script, heard string) float64 { return round(1 - Similarity(script, heard)) }

func round(value float64) float64 { return math.Round(value*100) / 100 }

// Combine scales another score for the same misread (a timing signal, say) by its MisreadConfidence; with none it is
// the MisreadConfidence alone.
func Combine(score *float64, script, heard string) float64 {
	confidence := MisreadConfidence(script, heard)
	if score == nil {
		return confidence
	}
	return round(*score * confidence)
}

// Reason says how a misread's confidence was scored, for a finding's confidence reason.
func Reason(script, heard string) string {
	return "Scored by how alike “" + script + "” and “" + heard + "” are in letters and sound: a near match (M for N, a vowel for a vowel) is " +
		"more likely the recogniser mishearing a correct read than a misread. An ordering to sort and judge by, not a probability."
}

func differingLetters(a, b []string) ([]rune, []rune) {
	a, b = differing(a, b)
	return letters(a), letters(b)
}
