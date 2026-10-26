package guide

import (
	"testing"
)

// cueEvalCorpus is the labelled-quote evaluation's corpus (docs/research/character-continuity-cue-extraction-eval/RESULTS.md, which
// says where it came from and why each paragraph is there): an original, synthetic manuscript, each paragraph's quotes labelled in
// reading order with the true speaker's name, or "unknown" where a careful reader could not tell either. Its run_eval.py ran the
// sidecar's extract_dialogue_cues until the cues moved into the host (#2251 step 3); this test runs the host's.
var cueEvalCorpus = []struct {
	chapter, paragraph, text string
	speakers                 []string
}{
	{"c1", "p1", "Mira crossed the room. \"You are late again,\" Mira said.", []string{"Mira"}},
	{"c1", "p2", "\"The tide held me up,\" Toby replied, dripping onto the floorboards.", []string{"Toby"}},
	{"c1", "p3", "\"That is what you said last week.\"", []string{"Mira"}},
	{"c1", "p4", "\"Was it,\" Toby said, not quite a question.", []string{"Toby"}},
	{"c1", "p5", "\"It was.\" Mira folded her arms.", []string{"Mira"}},
	{"c1", "p6", "\"Fine. I will be early tomorrow,\" Toby answered.", []string{"Toby"}},
	{"c1", "p7", "\"See that you are.\"", []string{"Mira"}},
	{"c1", "p8", "Toby laughed. \"You always get the last word,\" Toby said.", []string{"Toby"}},
	{"c1", "p9", "\"Someone has to,\" she said.", []string{"Mira"}},
	{"c1", "p10", "\"Fair enough.\"", []string{"Toby"}},
	{"c1", "p11", "* * *", []string{}},
	{"c1", "p12", "Elena arrived breathless. \"Did I miss something?\" Elena asked.", []string{"Elena"}},
	{"c1", "p13", "\"Only the usual,\" Mira said.", []string{"Mira"}},
	{"c1", "p14", "\"The usual being?\"", []string{"unknown"}},
	{"c1", "p15", "\"Nothing,\" Toby said quickly.", []string{"Toby"}},
	{"c1", "p16", "\"That did not sound like nothing.\"", []string{"unknown"}},
	{"c1", "p17", "\"It never does,\" Elena said, grinning.", []string{"Elena"}},
	{"c2", "p18", "Captain Arelian gave the order before dawn. Dawn Mercer double-checked the charts.", []string{}},
	{"c2", "p19", "\"Hold the line,\" Arelian shouted over the wind.", []string{"Captain Arelian"}},
	{"c2", "p20", "\"Holding,\" Dawn Mercer answered, voice steady.", []string{"Dawn Mercer"}},
	{"c2", "p21", "\"Good,\" Arelian said.", []string{"Captain Arelian"}},
	{"c2", "p22", "\"For how long?\"", []string{"Dawn Mercer"}},
	{"c2", "p23", "\"As long as it takes,\" Arelian replied.", []string{"Captain Arelian"}},
	{"c2", "p24", "\"That is not an answer.\"", []string{"Dawn Mercer"}},
	{"c2", "p25", "\"It rarely is,\" Arelian said, and said nothing more.", []string{"Captain Arelian"}},
	{"c2", "p25b", "- - -", []string{}},
	{"c2", "p26", "\"Fresh bread, hot bread,\" the merchant called from his stall.", []string{"unknown"}},
	{"c2", "p27", "Dawn Mercer bought two loaves without breaking stride. \"Keep the change,\" Dawn Mercer said.", []string{"Dawn Mercer"}},
	{"c3", "p28", "\"Perhaps,\" came a voice from the dark, \"you should not have come at all.\"", []string{"unknown", "unknown"}},
	{"c3", "p29", "Mira walked the length of the corridor twice before she found the door.", []string{}},
	{"c3", "p30", "\"Elena?\" Mira called out.", []string{"Mira"}},
	{"c3", "p31", "\"Here,\" Elena answered from behind a stack of crates.", []string{"Elena"}},
	{"c3", "p32", "\"You scared me half to death.\"", []string{"Mira"}},
	{"c3", "p33", "\"That was not my intention,\" Elena said, though she was smiling.", []string{"Elena"}},
}

// TestTheLabelledQuoteEvaluation is the evaluation RESULTS.md reports: the tag and continuation rules (no proximity) over the corpus, with
// Arelian an alias of Captain Arelian. Run it with -v to see each quote's row.
func TestTheLabelledQuoteEvaluation(t *testing.T) {
	characters := []string{"Mira", "Toby", "Elena", "Captain Arelian", "Dawn Mercer"}
	index := speakerIndex(characters...)
	index[normalizeName("Arelian")] = entityID("Captain Arelian")
	names := map[any]string{}
	for _, name := range characters {
		names[entityID(name)] = name
	}
	rows := make([][3]string, len(cueEvalCorpus))
	for i, row := range cueEvalCorpus {
		rows[i] = [3]string{row.chapter, row.paragraph, row.text}
	}
	byParagraph := map[string][]string{}
	sources := map[string][]any{}
	for _, cue := range extracted(t, cueRows(rows...), index, false) {
		paragraph := cue.values["paragraphId"].(string)
		name := "unknown"
		if speaker := cue.values["speaker_entity_id"]; speaker != nil {
			name = names[speaker]
		}
		byParagraph[paragraph] = append(byParagraph[paragraph], name)
		sources[paragraph] = append(sources[paragraph], cue.values["speaker_source"])
	}
	var total, determinable, attempted, correct, wrong, missed, leftUnknown int
	for _, row := range cueEvalCorpus {
		got := byParagraph[row.paragraph]
		if len(got) != len(row.speakers) {
			t.Fatalf("%s: %d quotes labelled, %d found", row.paragraph, len(row.speakers), len(got))
		}
		for i, want := range row.speakers {
			total++
			t.Logf("%s: want %s, got %s (%v)", row.paragraph, want, got[i], sources[row.paragraph][i])
			switch {
			case want == "unknown" && got[i] == "unknown":
				leftUnknown++
			case want == "unknown":
				wrong++
				attempted++
			case got[i] == "unknown":
				determinable++
				missed++
			default:
				determinable++
				attempted++
				if got[i] == want {
					correct++
				} else {
					wrong++
				}
			}
		}
	}
	got := [7]int{total, determinable, attempted, correct, wrong, missed, leftUnknown}
	if want := [7]int{31, 26, 27, 26, 1, 0, 4}; got != want {
		t.Fatalf("total, determinable, attempted, correct, wrong, missed, left unknown = %v, want %v (RESULTS.md)", got, want)
	}
}
