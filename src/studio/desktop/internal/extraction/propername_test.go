package extraction

import "testing"

// nameCase is a span a labelling source offered, and whether it is the name of a character, place, group or thing.
type nameCase struct {
	name  string
	label string
	valid bool
}

// spans is what GLiNER's zero-shot labels gave on a modern novel with the owner's kind of prose (#3661): the lower-case words and
// pronouns it called characters and objects, next to the names it got right. The first block is the owner's own examples.
var spans = []nameCase{
	{"she", "Character", false}, {"map", "Item", false}, {"concrete", "Item", false},
	{"She", "Character", false}, {"he", "Character", false}, {"He", "Character", false}, {"her", "Character", false},
	{"they", "Character", false}, {"I", "Character", false}, {"we", "Character", false}, {"it", "Item", false}, {"someone", "Character", false},
	{"nothing", "Item", false}, {"the hedgehog", "Character", false}, {"grey mare", "Item", false}, {"the door", "Item", false},
	{"the water", "Item", false}, {"a flashlight", "Item", false}, {"the van", "Item", false}, {"his mother", "Character", false},
	{"the old man", "Character", false}, {"the city", "Place", false}, {"the road", "Place", false}, {"the others", "Organization", false},
	{"The", "Character", false}, {"Mr", "Character", false}, {"Sir", "Character", false}, {"Of the", "Place", false}, {"...", "Item", false},
	{"However", "Character", false}, {"Because", "Character", false},
	{"Mara", "Character", true}, {"Mara Voss", "Character", true}, {"Dr. Vance", "Character", true}, {"Mr Darcy", "Character", true},
	{"Captain Arelian", "Character", true}, {"O'Neill", "Character", true}, {"St. Clair", "Character", true}, {"de la Cruz", "Character", true},
	{"van der Berg", "Character", true}, {"王芳", "Character", true}, {"Harbor Street", "Place", true}, {"Mount Rook", "Place", true},
	{"Dawnspire", "Place", true}, {"Council of Ash", "Organization", true}, {"The Order of Dawn", "Organization", true},
	{"Lord Voldemort", "Character", true}, {"Excalibur", "Item", true}, {"The Maltese Falcon", "Item", true},
}

func TestProperNameKeepsNamesAndDropsWordsThatOnlyLookLikeThem(t *testing.T) {
	for _, c := range spans {
		if got := ProperName(c.name); got != c.valid {
			t.Errorf("ProperName(%q) = %v, want %v (labelled %s)", c.name, got, c.valid, c.label)
		}
	}
}

// TestPrecisionOnTheOwnersStyleOfSpans prints what the rules did to the fixture: before, every span became an entry; after, only names do.
func TestPrecisionOnTheOwnersStyleOfSpans(t *testing.T) {
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
