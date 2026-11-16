package chaptermatch

import (
	"reflect"
	"runtime"
	"testing"

	"golang.org/x/text/transform"
)

var labelCorpus = []string{
	"Chapter 12: The Mad Tea-Party", "Ch6", "06 - Chapter 6", "Chapter the Sixth", "Sixth Chapter", "Chapter 6 (pickups)", "Chapter 6 v2",
	"Intro", "End Credits", "Part II, Chapter IV", "", "   ", "épilogue", "Épilogue", "Chapitre 12 : Épilogue", "Café au lait 3", "naïve résumé",
}

// A plain-ASCII label has nothing to fold, so skipping the accent transform must give what folding first gives, and an accented one still folds.
func TestLabelTokensOfAnASCIILabelAreWhatFoldingFirstGives(t *testing.T) {
	for _, label := range labelCorpus {
		folded, _, err := transform.String(accentFolder(), label)
		if err != nil {
			t.Fatal(err)
		}
		gotTokens, gotMarker := LabelTokens(label)
		wantTokens, wantMarker := LabelTokens(folded)
		if !reflect.DeepEqual(gotTokens, wantTokens) || gotMarker != wantMarker {
			t.Fatalf("%q: %v %v, want %v %v", label, gotTokens, gotMarker, wantTokens, wantMarker)
		}
	}
	if tokens, _ := LabelTokens("Épilogue"); !reflect.DeepEqual(tokens, []string{"epilogue"}) {
		t.Fatalf("an accented label no longer folds: %v", tokens)
	}
}

// The transform chain allocated about 9 KB per call (#3560): chapter sync tokenizes every title and track name once per pair, so that was most of
// its cost. Bytes allocated per call is the work done, which a slow runner does not change.
func TestLabelTokensOfAnASCIILabelDoNotBuildTheAccentTransform(t *testing.T) {
	const calls = 500
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	for range calls {
		LabelTokens("Chapter 12: The Mad Tea-Party")
	}
	runtime.ReadMemStats(&after)
	if perCall := (after.TotalAlloc - before.TotalAlloc) / calls; perCall > 4096 {
		t.Fatalf("an ASCII label allocated %d bytes per call, want under 4096", perCall)
	}
}
