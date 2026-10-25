package scripttrack

import (
	"math/rand"
	"slices"
	"strings"
	"testing"

	"desktop/internal/compare"
)

// The rules the tracker must keep on any script and any heard words (the sidecar's
// test_script_tracker_properties.py), over seeded random input: a small vocabulary makes heard words hit the script
// often, where the alignment rules are exercised, and short random words cover the rest.

const runs = 3000

var vocabulary = []string{"the", "old", "lamp", "keeper", "climbed", "stairs", "lighthouse", "evening", "ships", "pass", "night", "sea"}

func word(rng *rand.Rand) string {
	if rng.Intn(2) == 0 {
		return vocabulary[rng.Intn(len(vocabulary))]
	}
	return randomFrom(rng, "abcd'", 1, 6)
}

func randomFrom(rng *rand.Rand, alphabet string, minLen, maxLen int) string {
	letters := []rune(alphabet)
	var sb strings.Builder
	for range minLen + rng.Intn(maxLen-minLen+1) {
		sb.WriteRune(letters[rng.Intn(len(letters))])
	}
	return sb.String()
}

func words(rng *rand.Rand, minLen, maxLen int) []string {
	out := []string{}
	for range minLen + rng.Intn(maxLen-minLen+1) {
		out = append(out, word(rng))
	}
	return out
}

// heardFromTheScript is a script, an anchor and words heard from somewhere in it, some misheard, so the alignment
// reaches its restart and skip branches.
func heardFromTheScript(rng *rand.Rand) ([]string, int, []string) {
	script := words(rng, 6, 40)
	anchor, offset := rng.Intn(len(script)+1), rng.Intn(len(script)+1)
	span := script[offset:min(len(script), offset+rng.Intn(13))]
	noise := word(rng)
	heard := []string{}
	for _, w := range span {
		if rng.Intn(2) == 0 {
			heard = append(heard, w)
		} else {
			heard = append(heard, noise)
		}
	}
	return script, anchor, heard
}

func TestAdvanceMovesForwardInsideTheScriptAndTwoStepsEqualOne(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	for range runs {
		heard, script, start := words(rng, 0, 14), words(rng, 0, 40), rng.Intn(61)
		result := Advance(heard, script, start)
		if result.Read < start || result.Read > max(start, len(script)) || result.Matched > len(heard) || (result.First == None) != (result.Matched == 0) {
			t.Fatalf("Advance(%q, %q, %d) = %+v", heard, script, start, result)
		}
		script2, start2, first := heardFromTheScript(rng)
		more := words(rng, 0, 14)
		whole, one := Advance(append(slices.Clone(first), more...), script2, start2), Advance(first, script2, start2)
		two := Advance(more, script2, one.Read)
		wantFirst := two.First
		if one.Matched > 0 {
			wantFirst = one.First
		}
		if whole.Read != two.Read || whole.Matched != one.Matched+two.Matched || whole.First != wantFirst {
			t.Fatalf("advancing %q then %q differs from once", first, more)
		}
	}
}

var scriptText = []string{"the", "old", "lamp", "keeper", "climbed", "stairs", "lighthouse", "evening", "ships", "pass", "night", "sea", "the", "lamp", "night"}

func TestLocateReportsOnlyKnownJumpsAndNamesTheAlignmentItChose(t *testing.T) {
	skip, restart := Locate(scriptText[6:11], scriptText, 0), Locate(scriptText[0:5], scriptText, 10)
	if skip.Jump != "skip" || skip.Skipped == nil || restart.Jump != "restart" {
		t.Fatalf("skip %+v, restart %+v", skip, restart)
	}
	rng := rand.New(rand.NewSource(2))
	for range runs {
		script, anchor, heard := heardFromTheScript(rng)
		location, near := Locate(heard, script, anchor), Advance(heard, script, anchor)
		chosen := Advance(heard, script, location.Start)
		switch {
		case location.Jump != "" && location.Jump != "restart" && location.Jump != "skip",
			location.Matched > len(heard), location.Read > max(anchor, len(script)),
			location.Jump == "" && (location.Skipped != nil || location.Read != near.Read || location.Matched != near.Matched),
			location.Jump == "restart" && location.Skipped != nil,
			location.Skipped != nil && (location.Jump != "skip" || location.Skipped.From != anchor || location.Skipped.To <= anchor),
			chosen.Read != location.Read || chosen.Matched != location.Matched || chosen.First != location.First,
			(location.Start == anchor) != (location.Jump == ""):
			t.Fatalf("Locate(%q, %q, %d) = %+v", heard, script, anchor, location)
		}
	}
}

func TestAlignAgreesWithAdvanceOnEveryHeardWord(t *testing.T) {
	rng := rand.New(rand.NewSource(3))
	for range runs {
		script, start, heard := heardFromTheScript(rng)
		matches, result := Align(heard, script, start), Advance(heard, script, start)
		matched := []int{}
		for _, m := range matches {
			if m != None {
				matched = append(matched, m)
			}
		}
		first, read := None, start
		if len(matched) > 0 {
			first, read = matched[0], matched[len(matched)-1]+1
		}
		if len(matches) != len(heard) || len(matched) != result.Matched || !slices.IsSorted(matched) || first != result.First || read != result.Read {
			t.Fatalf("Align(%q, %q, %d) = %v, Advance %+v", heard, script, start, matches, result)
		}
	}
}

func TestWordMatchingIsReflexiveSymmetricAndNeverFuzzyForShortWords(t *testing.T) {
	if WordsMatch("aabbbbb", "abbbbba") != WordsMatch("abbbbba", "aabbbbb") {
		t.Fatal("asymmetric on the pinned example")
	}
	rng := rand.New(rand.NewSource(4))
	for range runs {
		w := word(rng)
		short, other := randomFrom(rng, "abcdefg'", 0, 3), randomFrom(rng, "abcdefg'", 4, 8)
		left, right := randomFrom(rng, "abcdefgh'", 4, 9), randomFrom(rng, "abcdefgh'", 4, 9)
		if !WordsMatch(w, w) || WordsMatch(short, other) || WordsMatch(other, short) || WordsMatch(left, right) != WordsMatch(right, left) {
			t.Fatalf("%q %q %q %q %q", w, short, other, left, right)
		}
	}
}

func TestNormalizingAWordIsIdempotentAndLeavesOnlyWordCharacters(t *testing.T) {
	rng := rand.New(rand.NewSource(5))
	for range runs {
		once := NormalizeWord(randomFrom(rng, "aZ9_'.,-–ΣςİéßǅⅫ漢 \t😀", 0, 12))
		if NormalizeWord(once) != once {
			t.Fatalf("not idempotent: %q", once)
		}
		for _, r := range once {
			if r != '\'' && !compare.IsPyWord(r) {
				t.Fatalf("%q kept %q", once, r)
			}
		}
	}
}

func TestTheTrackerNeverLeavesTheScriptWhateverItHears(t *testing.T) {
	rng := rand.New(rand.NewSource(6))
	for range runs / 3 {
		script := words(rng, 6, 40)
		chunk := func() []string {
			offset := rng.Intn(len(script) + 1)
			return script[offset:min(len(script), offset+rng.Intn(9))]
		}
		follower, now := New(script), 0.0
		for range rng.Intn(26) {
			event := Event{Segment: float64(rng.Intn(3))}
			switch rng.Intn(4) {
			case 0:
				event.Type, event.Words = "partial", chunk()
			case 1:
				event.Type, event.Word = "word", word(rng)
				if heard := chunk(); rng.Intn(2) == 0 && len(heard) > 0 {
					event.Word = heard[0]
				}
			case 2:
				event.Type = "segment_end"
			default:
				event.Type = "noise"
			}
			now += rng.Float64() * 3
			for _, p := range append(follower.Feed(event, now), follower.Tick(now)...) {
				if p.Read < 0 || p.Read > len(script) || p.Committed < 0 || p.Committed > len(script) ||
					!slices.Contains([]string{"listening", "waiting", "done"}, p.Status) || !slices.Contains([]string{"", "restart", "skip"}, p.Jump) {
					t.Fatalf("%+v over %q", p, script)
				}
			}
		}
	}
}
