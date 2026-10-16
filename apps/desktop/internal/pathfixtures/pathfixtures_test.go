package pathfixtures

import "testing"

// Every class the definition of done names has at least one place fixture or one text fixture, so a class cannot be dropped
// from the set without this test saying so.
func TestEveryClassHasAFixture(t *testing.T) {
	covered := map[Class]bool{}
	for _, text := range Texts() {
		covered[text.Class] = true
	}
	for _, b := range builders() {
		covered[b.class] = true
	}
	for _, class := range []Class{
		OutsideStartingFolder, NestedDeep, Spaces, UnicodeAccented, UnicodeCJK, UnicodeEmoji, UnicodeRTL, LongOver260, LongPathPrefix,
		UNC, CaseDiffers, TrailingDotSpace, Junction, ReadOnlyFile, ReadOnlyFolder, Missing, FileForFolder, FolderForFile, Empty,
		Relative, DotDot, ForwardSlashes,
	} {
		if !covered[class] {
			t.Errorf("no fixture for the class %q", class)
		}
	}
}

func TestFixtureNamesAreUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, name := range PlaceNames() {
		if seen["place "+name] {
			t.Errorf("duplicate place fixture %q", name)
		}
		seen["place "+name] = true
	}
	for _, text := range Texts() {
		if seen["text "+text.Name] {
			t.Errorf("duplicate text fixture %q", text.Name)
		}
		seen["text "+text.Name] = true
	}
	for _, name := range Names() {
		if seen["name "+name.Name] {
			t.Errorf("duplicate name fixture %q", name.Name)
		}
		seen["name "+name.Name] = true
	}
}
