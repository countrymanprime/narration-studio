package extraction

import "testing"

// nameCase is a span a labelling source offered, and whether it is the name of a character, place, group or thing.
type nameCase struct {
	name  string
	label string
	valid bool
}

// spans is a fixture built from the issue's own examples (#3661) and the false positives GLiNER's documentation names: the lower-case
// words and pronouns a zero-shot labeller calls characters and objects, next to real names. It is not model output and not the owner's text.
var spans = []nameCase{
	{"she", "Character", false}, {"map", "Item", false}, {"concrete", "Item", false},
	{"She", "Character", false}, {"he", "Character", false}, {"He", "Character", false}, {"her", "Character", false},
	{"they", "Character", false}, {"I", "Character", false}, {"we", "Character", false}, {"it", "Item", false}, {"someone", "Character", false},
	{"nothing", "Item", false}, {"the hedgehog", "Character", false}, {"a flashlight", "Item", false}, {"grey mare", "Item", false}, {"the door", "Item", false},
	{"the water", "Item", false}, {"the van", "Item", false}, {"his mother", "Character", false},
	{"the old man", "Character", false}, {"the city", "Place", false}, {"the road", "Place", false}, {"the others", "Organization", false},
	{"The", "Character", false}, {"Mr", "Character", false}, {"Sir", "Character", false}, {"Of the", "Place", false}, {"...", "Item", false},
	{"However", "Character", false}, {"ten men", "Organization", false}, {"al dente", "Item", false}, {"the van door", "Item", false},
	{"de la", "Character", false}, {"His mother", "Character", false}, {"She said", "Character", false}, {"I'm", "Character", false}, {"She's", "Character", false},
	{"We'll", "Character", false}, {"It's", "Item", false}, {"Because", "Character", false},
	{"Mara", "Character", true}, {"Mara Voss", "Character", true}, {"Dr. Vance", "Character", true}, {"Mr Darcy", "Character", true},
	{"Captain Arelian", "Character", true}, {"O'Neill", "Character", true}, {"St. Clair", "Character", true}, {"de la Cruz", "Character", true},
	{"van der Berg", "Character", true}, {"王芳", "Character", true}, {"Harbor Street", "Place", true}, {"Mount Rook", "Place", true},
	{"Dawnspire", "Place", true}, {"Council of Ash", "Organization", true}, {"The Order of Dawn", "Organization", true}, {"the Order of Dawn", "Organization", true}, {"the Pigeon", "Character", true}, {"the Hatter", "Character", true}, {"the Caterpillar", "Character", true},
	{"Lord Voldemort", "Character", true}, {"Will", "Character", true}, {"Will Graham", "Character", true}, {"Excalibur", "Item", true}, {"The Maltese Falcon", "Item", true},

	// The qa-breaker's names (#3661): real names the rule first lost, and junk it first kept.
	{"Do'Urden", "Character", true}, {"A'isha", "Character", true}, {"Be’lakor", "Character", true}, {"M'Baku", "Character", true}, {"El-ahrairah", "Character", true}, {"Da-eun", "Character", true},
	{"Dr. No", "Character", true}, {"Lord No", "Character", true}, {"Dr Who", "Character", true},
	{"al-Rashid", "Character", true}, {"van-der-Berg", "Character", true}, {"Harun al-Rashid", "Character", true},
	{"ნინო", "Character", true}, {"ნინო ჭავჭავაძე", "Character", true}, {"თბილისი", "Place", true},
	{"\u200bMara", "Character", true}, {"\ufeffMara Voss", "Character", true}, {"S\u00adhe", "Character", false}, {"Some\u00adthing", "Item", false},
	{"«Mara»", "Character", true}, {"—Mara", "Character", true}, {"*Mara*", "Character", true}, {"「王芳」", "Character", true}, {"_Mara_", "Character", true},
	{"Don't", "Character", false}, {"Can't", "Character", false}, {"Wasn't", "Character", false}, {"Couldn't", "Character", false}, {"Let's", "Character", false},
	{"Ma’am", "Character", false}, {"Iʼm", "Character", false}, {"I\u2032m", "Character", false}, {"She—", "Character", false}, {"I…", "Character", false}, {"The—", "Character", false},
}

func TestProperNameKeepsNamesAndDropsWordsThatOnlyLookLikeThem(t *testing.T) {
	for _, c := range spans {
		if got := ProperName(c.name); got != c.valid {
			t.Errorf("ProperName(%q) = %v, want %v (labelled %s)", c.name, got, c.valid, c.label)
		}
	}
}

// TestPrecisionOnASyntheticFixtureOfSpans prints what the rules did to the fixture (written beside the rule, not model output, not the owner's text): before, every span became an entry; after, only names do.
func TestPrecisionOnASyntheticFixtureOfSpans(t *testing.T) {
	var before, valid, kept, keptValid int
	for _, c := range spans {
		before++
		if c.valid {
			valid++
		}
		if ProperName(c.name) {
			kept++
			if c.valid {
				keptValid++
			}
		}
	}
	t.Logf("before: %d spans became entries, %d of them names (precision %.0f%%); after: %d entries, %d names (precision %.0f%%, recall %.0f%%)",
		before, valid, 100*float64(valid)/float64(before), kept, keptValid, 100*float64(keptValid)/float64(kept), 100*float64(keptValid)/float64(valid))
	if keptValid != kept {
		t.Fatalf("%d of the %d entries kept are not names", kept-keptValid, kept)
	}
	if keptValid != valid {
		t.Errorf("%d of the %d names were dropped", valid-keptValid, valid)
	}
}
