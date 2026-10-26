package guide

import (
	"context"
	"encoding/json"
	"os"
	"slices"
	"strings"
	"testing"

	"desktop/internal/contractfile"
)

// The rebuild merge's tests (build_merge.go): the types, the narrator's work a rebuild keeps, and the previous files it refuses.

// pyValue is the JSON text as json.loads reads it, for a value a test builds.
func pyValue(t *testing.T, text string) any {
	t.Helper()
	value, err := pyLoads(text)
	if err != nil {
		t.Fatalf("%v: %s", err, text)
	}
	return value
}

func TestTheVocabularyLeavesOutNeedsReviewAndThinlyEvidencedLoneWords(t *testing.T) {
	entities := pyValue(t, `[
		{"canonical_name": "Captain Arelian", "category": "Character", "occurrence_count": 1, "aliases": [{"text": "Arelian", "occurrences": []}], "locked": false, "manual": false},
		{"canonical_name": "Halo", "category": "Character", "occurrence_count": 2, "aliases": [], "locked": false, "manual": false},
		{"canonical_name": "Dawnspire", "category": "Place", "occurrence_count": 3, "aliases": [], "locked": false, "manual": false},
		{"canonical_name": "Vex", "category": "Character", "occurrence_count": 1, "aliases": [], "locked": true, "manual": false},
		{"canonical_name": "Nyx", "category": "Draft", "occurrence_count": 0, "aliases": [], "locked": false, "manual": true},
		{"canonical_name": "Black Halo", "category": "Needs Review", "occurrence_count": 9, "aliases": [], "locked": false, "manual": false},
		{"canonical_name": "Mystery", "category": "Needs Review", "occurrence_count": 5, "aliases": [], "locked": false, "manual": false},
		{"canonical_name": " ada ", "category": "Place", "occurrence_count": 3, "aliases": [{"text": "ADA"}, {"text": "Ada"}, {"text": "  "}], "locked": false, "manual": false}
	]`).([]any)
	got, err := vocabularyFromEntities(entities)
	if err != nil {
		t.Fatal(err)
	}
	if want := []any{"ADA", "Ada", "ada", "Arelian", "Captain Arelian", "Dawnspire", "Nyx", "Vex"}; !slices.Equal(got, want) {
		t.Fatalf("vocabulary %v, want %v", got, want)
	}
}

// merged is merge_locked of the fresh entries (each a JSON object) over the previous Story Bible (JSON text), as the file has them.
func merged(t *testing.T, fresh []string, previous string) []map[string]any {
	t.Helper()
	generated := make([]freshEntity, len(fresh))
	for i, text := range fresh {
		generated[i] = freshEntity{object: pyValue(t, text).(*pyObject)}
	}
	old, err := pyLoadBible([]byte(previous), errBuildShape)
	if err != nil {
		t.Fatal(err)
	}
	out, err := mergeLocked(generated, old)
	if err != nil {
		t.Fatal(err)
	}
	var decoded []map[string]any
	if err := json.Unmarshal([]byte(pyDumps(out)), &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

// generatedEntry is a fresh entry as a build makes it, with its fields as JSON.
func generatedEntry(name string, fields ...string) string {
	entry := map[string]string{
		"id": jsonText(entityID(name)), "canonical_name": jsonText(name), "aliases": "[]", "category": `"Character"`, "occurrences": "[]",
		"occurrence_count": "0", "pronunciation": `{"ipa": "fresh", "source": "CMU dictionary", "confidence": "medium"}`,
		"description": `{"text": "", "evidence": {}}`, "personality_notes": "[]", "context": `""`, "relationships": "[]", "properties": "[]",
		"locked": "false", "manual": "false", "review_state": `"generated"`, "review": `{"entry": false, "aliases": []}`,
	}
	order := []string{"id", "canonical_name", "aliases", "category", "occurrences", "occurrence_count", "pronunciation", "description",
		"personality_notes", "context", "relationships", "properties", "locked", "manual", "review_state", "review"}
	for i := 0; i+1 < len(fields); i += 2 {
		if _, ok := entry[fields[i]]; !ok {
			order = append(order, fields[i])
		}
		entry[fields[i]] = fields[i+1]
	}
	parts := []string{}
	for _, key := range order {
		if value, ok := entry[key]; ok && value != "" {
			parts = append(parts, jsonText(key)+": "+value)
		}
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

func bibleOf(entries ...string) string {
	return `{"entities": [` + strings.Join(entries, ", ") + `]}`
}

func TestALockedOrHandMadeEntrySurvivesARebuildAsItWas(t *testing.T) {
	locked := generatedEntry("Arelian", "pronunciation", `{"ipa": "ah-RELL-ee-in"}`, "locked", "true", "description", `{"text": "Hand written.", "evidence": {}}`)
	vex := generatedEntry("Vex", "locked", "true", "occurrence_count", "1")
	nyx := generatedEntry("Nyx", "category", `"Lore"`, "manual", "true")
	got := merged(t, []string{generatedEntry("Arelian"), generatedEntry("Captain Arelian")}, bibleOf(locked, vex, nyx))
	byID := map[string]map[string]any{}
	for _, entry := range got {
		byID[entry["id"].(string)] = entry
	}
	for _, text := range []string{locked, vex, nyx} {
		var want map[string]any
		_ = json.Unmarshal([]byte(text), &want)
		if !jsonEqual(byID[want["id"].(string)], want) {
			t.Errorf("%s: %v, want it as it was", want["canonical_name"], byID[want["id"].(string)])
		}
	}
	if byID[entityID("Captain Arelian")] == nil || len(got) != 4 {
		t.Fatalf("entries %v", got)
	}
}

func jsonEqual(a, b any) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return string(x) == string(y)
}

func TestTheTypesOfAFileWithoutThemAreTheDefaults(t *testing.T) {
	rows, err := buildTypes(nil)
	if err != nil {
		t.Fatal(err)
	}
	var ui []map[string]any
	for _, row := range rows {
		ui = append(ui, map[string]any{"name": row.values["name"], "colour": row.values["colour"], "speaks": row.values["speaks"]})
		if row.values["builtin"] != row.values["name"] {
			t.Errorf("row %v: its builtin is its name", row.values)
		}
	}
	// The host's DefaultTypes reads this file (types_test.go), so the two lists cannot drift.
	contractfile.Check(t, "guide-types-default-sidecar", ui)
	speaking := slices.DeleteFunc(slices.Clone(rows), func(row *pyObject) bool { return !row.values["speaks"].(bool) })
	if len(speaking) != 1 || speaking[0].values["name"] != categoryCharacter {
		t.Fatalf("speaking %v", speaking)
	}
}

func TestARebuildKeepsTheStoredTypes(t *testing.T) {
	types := `[{"name": "Character", "colour": "green", "speaks": true, "builtin": "Character"}, {"name": "Place", "colour": "rose", "speaks": false, "builtin": "Place"}]`
	s := book(t, `{"schema_version": 2, "entities": [], "types": `+types+`}`, "Wren said hello.")
	buildWith(t, s, nil)
	written := readJSONFile[map[string]any](t, s.guidePath())
	var want any
	_ = json.Unmarshal([]byte(types), &want)
	if !jsonEqual(written["types"], want) {
		t.Fatalf("types %v", written["types"])
	}
}

func TestAMalformedTypeListIsRefusedNotGuessed(t *testing.T) {
	for _, bad := range []string{`{"types": "Character"}`, `{"types": [{"name": "", "colour": "green", "speaks": true}]}`,
		`{"types": [{"name": "A", "colour": "pink", "speaks": false}]}`, `{"types": []}`, `{"types": [{"name": "A", "colour": "green", "speaks": 1}]}`,
		`{"types": [{"name": "a", "colour": "green", "speaks": true}, {"name": "A", "colour": "blue", "speaks": true}]}`} {
		if _, err := buildTypes(pyValue(t, bad)); err != errStoryBibleTypes {
			t.Errorf("%s: %v", bad, err)
		}
	}
}

func TestARebuildFilesNewEntriesUnderTheRenamedType(t *testing.T) {
	types, err := buildTypes(pyValue(t, `{"types": [{"name": "Person", "colour": "green", "speaks": true, "builtin": "Character"}, {"name": "Group", "colour": "violet", "speaks": false, "builtin": "Organization"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	fresh := []freshEntity{{object: pyValue(t, generatedEntry("Wren")).(*pyObject)}, {object: pyValue(t, generatedEntry("Dawnspire", "category", `"Place"`)).(*pyObject)},
		{object: pyValue(t, generatedEntry("Mist", "category", `"Needs Review"`)).(*pyObject)}}
	if err := fileUnderTypes(fresh, types); err != nil {
		t.Fatal(err)
	}
	if got := fresh[0].object.values["category"]; got != "Person" {
		t.Fatalf("Wren filed under %v", got)
	}
	place := fresh[1].object.values
	if place["category"] != categoryNeedsReview || place["review_state"] != "needs review" || place["review"].(*pyObject).values["entry"] != true {
		t.Fatalf("Dawnspire %v", pyDumps(fresh[1].object))
	}
	if fresh[2].object.values["category"] != categoryNeedsReview || fresh[2].object.values["review"].(*pyObject).values["entry"] != false {
		t.Fatalf("Mist %v", pyDumps(fresh[2].object))
	}
	if _, err := buildTypes(pyValue(t, `{"types": [{"name": "A", "colour": "green", "speaks": true, "builtin": ["Character"]}]}`)); err != nil {
		t.Fatal(err)
	}
	unhashable, _ := buildTypes(pyValue(t, `{"types": [{"name": "A", "colour": "green", "speaks": true, "builtin": ["Character"]}]}`))
	if err := fileUnderTypes(fresh, unhashable); err != errBuildShape {
		t.Fatalf("a builtin that is a list: %v", err)
	}
}

const propertyPairs = `[{"key": "Codename", "value": "Wren"}, {"key": "Abilities", "value": "Flight, sleight of hand"}, {"key": "Dossier", "value": "Sealed."}]`

func TestARebuildKeepsTheNarratorsProperties(t *testing.T) {
	document, _ := buildWith(t, book(t, "", "Captain Arelian said the Council of Ash would meet in Dawnspire.", "Captain Arelian said the Council of Ash would meet in Dawnspire.", "Captain Arelian said the Council of Ash would meet in Dawnspire."), nil)
	for _, entry := range entitiesIn(document) {
		if !jsonEqual(entry["properties"], []any{}) {
			t.Fatalf("a built entry's properties %v", entry["properties"])
		}
	}
	var pairs any
	_ = json.Unmarshal([]byte(propertyPairs), &pairs)
	if got := merged(t, []string{generatedEntry("Alice")}, bibleOf(generatedEntry("Alice", "properties", propertyPairs, "review_state", `"reviewed"`))); !jsonEqual(got[0]["properties"], pairs) {
		t.Fatalf("properties %v", got[0]["properties"])
	}
	got := merged(t, []string{generatedEntry("Vex")}, bibleOf(generatedEntry("Vex", "locked", "true", "properties", propertyPairs), generatedEntry("Nyx", "manual", "true", "properties", `[{"key": "Codename", "value": "Wren"}]`)))
	if len(got) != 2 || !jsonEqual(got[0]["properties"], pairs) || len(got[1]["properties"].([]any)) != 1 {
		t.Fatalf("entries %v", got)
	}
	for _, missing := range []string{"", `"not a list"`} {
		if got := merged(t, []string{generatedEntry("Alice")}, bibleOf(generatedEntry("Alice", "properties", missing))); !jsonEqual(got[0]["properties"], []any{}) {
			t.Fatalf("over %q: properties %v", missing, got[0]["properties"])
		}
	}
}

func TestTheReviewFlagsAsABuildReadsAndKeepsThem(t *testing.T) {
	entry := func(fields ...string) *pyObject {
		return pyValue(t, generatedEntry("Wren", append([]string{"aliases", `[{"text": "Sparrow", "pronunciation": {}, "occurrences": []}]`, "review", ""}, fields...)...)).(*pyObject)
	}
	for state, want := range map[string]bool{"needs review": true, "generated": false} {
		review, err := reviewOf(entry("review_state", jsonText(state)))
		if err != nil || pyDumps(review) != pyDumps(newPyObject("entry", want, "aliases", []any{})) {
			t.Errorf("%s: %v %v", state, review, err)
		}
	}
	review, err := reviewOf(entry("review_state", `"needs review"`, "review", `{"entry": false, "aliases": ["Sparrow", "Gone", 3, "Sparrow"]}`))
	if err != nil || pyDumps(review) != pyDumps(newPyObject("entry", false, "aliases", []any{"Sparrow"})) {
		t.Fatalf("%v %v", review, err)
	}
	document, _ := buildWith(t, book(t, "", nameParagraphs...), nil)
	for _, value := range entitiesIn(document) {
		if !jsonEqual(value["review"], map[string]any{"entry": value["review_state"] == "needs review", "aliases": []any{}}) {
			t.Fatalf("%v", value)
		}
	}
	aliases := `[{"text": "Sparrow", "pronunciation": {}, "occurrences": []}]`
	got := merged(t, []string{generatedEntry("Wren", "aliases", aliases, "review_state", `"needs review"`, "review", `{"entry": true, "aliases": []}`)},
		bibleOf(generatedEntry("Wren", "aliases", aliases, "review", `{"entry": false, "aliases": ["Sparrow"]}`, "speaker_color", "4")))
	if !jsonEqual(got[0]["review"], map[string]any{"entry": false, "aliases": []any{"Sparrow"}}) || got[0]["speaker_color"] != 4.0 {
		t.Fatalf("%v", got[0])
	}
}

func TestARebuildDropsTheMergeUndoAndKeepsTheAbsorbedNames(t *testing.T) {
	previous := `{"schema_version": 2, "source": {}, "entities": [
		{"id": "nicholas", "canonical_name": "Nicholas", "aliases": [{"text": "Nico", "pronunciation": {}, "occurrences": []}], "category": "Character", "occurrences": [], "relationships": []},
		{"id": "wren", "canonical_name": "Wren", "aliases": [], "category": "Character", "occurrences": [], "relationships": []}],
		"absorbed_names": {"nicky": "nicholas", "nico": "nicholas"},
		"merge_undo": [{"id": "0123456789abcdef", "source_index": 1, "source": {"id": "nico"}, "target": {"id": "nicholas"}}]}`
	s := book(t, previous, "Nicholas met Wren by the river.")
	buildWith(t, s, nil)
	written := readJSONFile[map[string]any](t, s.guidePath())
	if _, has := written["merge_undo"]; has || !jsonEqual(written["absorbed_names"], map[string]any{"nicky": "nicholas", "nico": "nicholas"}) {
		t.Fatalf("%v", written)
	}
}

func TestAnEntryKeepsItsIDWhenItsNameGainsATitle(t *testing.T) {
	first := testChapter{"c1", []string{"Ada saw Arelian arrive. Then Arelian sat down, and Arelian said nothing."}}
	s := bookProject(t, "", first)
	document, _ := buildWith(t, s, nil)
	arelian := byName(document)["Arelian"]
	if arelian == nil {
		t.Fatalf("entries %v", builtNames(document))
	}
	// The narrator's work on it, which the rebuild must carry with the id.
	raw := strings.Replace(readText(t, s.guidePath()), `"context": ""`, `"context": "A veteran navigator."`, 1)
	rebuilt := bookProject(t, raw, first, testChapter{"c2", []string{"Captain Arelian gave the order."}})
	again, _ := buildWith(t, rebuilt, nil)
	var found []map[string]any
	for _, entry := range entitiesIn(again) {
		if strings.Contains(entry["canonical_name"].(string), "Arelian") {
			found = append(found, entry)
		}
	}
	if len(found) != 1 || found[0]["canonical_name"] != "Captain Arelian" || found[0]["id"] != arelian["id"] || found[0]["context"] != "A veteran navigator." {
		t.Fatalf("entries %v", found)
	}
}

func TestTwoSavedEntriesAreNeverCollapsedIntoOne(t *testing.T) {
	previous := bibleOf(`{"id": "entity-aaa", "canonical_name": "Ada", "aliases": [], "category": "Character", "occurrences": [], "occurrence_count": 1, "locked": false, "manual": false}`,
		`{"id": "entity-bbb", "canonical_name": "Zeph", "aliases": [], "category": "Character", "occurrences": [], "occurrence_count": 1, "locked": false, "manual": false}`)
	document, _ := buildWith(t, book(t, previous, "They saw Ada arrive. Then Ada waved, and Ada smiled.", "They saw Zeph arrive. Then Zeph waved, and Zeph smiled."), nil)
	ids := map[string]any{}
	for name, entry := range byName(document) {
		ids[name] = entry["id"]
	}
	if ids["Ada"] != "entity-aaa" || ids["Zeph"] != "entity-bbb" {
		t.Fatalf("ids %v", ids)
	}
}

func TestASplitEntryDoesNotComeBackOnTheNextRebuild(t *testing.T) {
	robert := `"aliases": [], "category": "Character", "occurrences": [], "occurrence_count": 0, "locked": false`
	previous := `{"entities": [{"id": ` + jsonText(entityID("Captain Arelian")) + `, "canonical_name": "Captain Arelian", ` + robert + `}, {"id": ` + jsonText(entityID("Robert")) + `, "canonical_name": "Robert", ` + robert + `}], "absorbed_names": {}}`
	document, _ := buildWith(t, book(t, previous, "They heard Robert speak. Then Robert paused, and Robert spoke again."), nil)
	entries := byName(document)
	if entries["Robert"] == nil || len(entries["Robert"]["aliases"].([]any)) != 0 || entries["Captain Arelian"] != nil {
		t.Fatalf("entries %v", entitiesIn(document))
	}
}

func TestAnEntryRecordsTheChaptersAndScenesItAppearsIn(t *testing.T) {
	scenes := sceneIndices(paragraphsOf(t, "Ada arrived.", "* * *", "Ada left."))
	if scenes["p1"] != 0 || scenes["p2"] != -1 || scenes["p3"] != 1 {
		t.Fatalf("scenes %v", scenes)
	}
	s := bookProject(t, "", testChapter{"c1", []string{"Ada Voss arrived. Ada Voss looked around.", "***", "Ada Voss left. Ada Voss was gone."}},
		testChapter{"c2", []string{"Ada Voss returned. Ada Voss smiled."}})
	document, _ := buildWith(t, s, nil)
	want := []any{map[string]any{"chapterId": "c1", "chapter": "c1", "sceneIndex": 0.0}, map[string]any{"chapterId": "c1", "chapter": "c1", "sceneIndex": 1.0},
		map[string]any{"chapterId": "c2", "chapter": "c2", "sceneIndex": 0.0}}
	if got := byName(document)["Ada Voss"]["appearances"]; !jsonEqual(got, want) {
		t.Fatalf("appearances %v", got)
	}
}

func TestARebuildKeepsTheNarratorsPronunciationWork(t *testing.T) {
	pronunciation := func(entries []map[string]any) any { return entries[0]["pronunciation"] }
	fresh := map[string]any{"ipa": "fresh", "source": "CMU dictionary", "confidence": "medium"}
	for name, test := range map[string]struct {
		prior string
		want  any
	}{
		"a chosen one is kept":               {`{"ipa": "chosen one", "source": "eSpeak NG", "confidence": "low", "chosen": true}`, map[string]any{"ipa": "chosen one", "source": "eSpeak NG", "confidence": "low", "chosen": true}},
		"an unchosen one is replaced":        {`{"ipa": "stale", "source": "CMU dictionary", "confidence": "medium"}`, fresh},
		"a status is dropped, the note kept": {`{"ipa": "fresh", "source": "cmu", "confidence": "medium", "status": "query_sent", "note": "Asked."}`, map[string]any{"ipa": "fresh", "source": "CMU dictionary", "confidence": "medium", "note": "Asked."}},
		"the narrator's own and its alternate are kept": {`{"ipa": "mine", "source": "user", "confidence": "narrator", "chosen": true, "alternate": {"ipa": "old", "source": "CMU dictionary", "confidence": "medium"}}`,
			map[string]any{"ipa": "mine", "source": "manual", "confidence": "narrator", "chosen": true, "alternate": map[string]any{"ipa": "old", "source": "CMU dictionary", "confidence": "medium"}}},
		"an alternate is carried to the fresh one": {`{"ipa": "x", "alternate": {"ipa": "y"}}`, map[string]any{"ipa": "fresh", "source": "CMU dictionary", "confidence": "medium", "alternate": map[string]any{"ipa": "y"}}},
	} {
		if got := pronunciation(merged(t, []string{generatedEntry("Wren")}, bibleOf(generatedEntry("Wren", "pronunciation", test.prior)))); !jsonEqual(got, test.want) {
			t.Errorf("%s: %v, want %v", name, got, test.want)
		}
	}
	freshAliases := `[{"text": "the Sparrow", "pronunciation": {"ipa": "fresh", "source": "CMU dictionary", "confidence": "medium"}, "occurrences": []},
		{"text": "Wrennie", "pronunciation": {"ipa": "fresh2", "source": "CMU dictionary", "confidence": "medium"}, "occurrences": []}]`
	priorAliases := `[{"text": "The Sparrow", "pronunciation": {"ipa": "mine", "source": "manual", "confidence": "narrator", "chosen": true}, "occurrences": []},
		{"text": "Wrennie", "pronunciation": {"ipa": "fresh2", "source": "CMU dictionary", "confidence": "medium", "status": "author_confirmed"}, "occurrences": []},
		{"text": "Typed In", "pronunciation": {}, "occurrences": []}]`
	got := merged(t, []string{generatedEntry("Wren", "aliases", freshAliases)}, bibleOf(generatedEntry("Wren", "aliases", priorAliases)))
	aliases := got[0]["aliases"].([]any)
	if len(aliases) != 3 || aliases[2].(map[string]any)["text"] != "Typed In" || got[0]["occurrence_count"] != 0.0 {
		t.Fatalf("aliases %v", aliases)
	}
	if !jsonEqual(aliases[0].(map[string]any)["pronunciation"], map[string]any{"ipa": "mine", "source": "manual", "confidence": "narrator", "chosen": true}) {
		t.Fatalf("the chosen alias pronunciation %v", aliases[0])
	}
	if _, has := aliases[1].(map[string]any)["pronunciation"].(map[string]any)["status"]; has {
		t.Fatalf("a status was carried: %v", aliases[1])
	}
}

func TestAnAbsorbedNameFoldsIntoItsMergeTarget(t *testing.T) {
	previous := `{"entities": [` + generatedEntry("Nicholas", "id", `"nicholas"`) + `], "absorbed_names": {"nico": "nicholas", "wren": "gone"}}`
	got := merged(t, []string{generatedEntry("Nico", "aliases", `[{"text": "Nicky", "pronunciation": {}, "occurrences": []}]`), generatedEntry("Nicholas"), generatedEntry("Wren")}, previous)
	if len(got) != 2 || got[0]["id"] != "nicholas" || got[1]["canonical_name"] != "Wren" {
		t.Fatalf("entries %v", got)
	}
	var texts []any
	for _, alias := range got[0]["aliases"].([]any) {
		texts = append(texts, alias.(map[string]any)["text"])
	}
	if !slices.Equal(texts, []any{"Nico", "Nicky"}) {
		t.Fatalf("aliases %v", texts)
	}
}

// TestPreviousFilesTheBuildCannotReadAreRefused pins errBuildShape where the sidecar crashed on a value of the wrong type; the frozen
// cases hold many more.
func TestPreviousFilesTheBuildCannotReadAreRefused(t *testing.T) {
	for _, previous := range []string{`[1]`, `5`, `{"entities": null}`, `{"entities": [5]}`, `{"entities": [{"canonical_name": "Wren"}]}`,
		`{"entities": [{"id": ["x"]}]}`, `{"entities": [{"id": "x", "canonical_name": null}]}`, `{"entities": [], "absorbed_names": []}`} {
		s := book(t, previous, "Captain Wren said nothing.")
		s.buildModel = &stubModel{}
		before := readText(t, s.guidePath())
		if _, _, err := s.build(context.Background(), &buildRun{}, RulesOnly, false); err != errBuildShape {
			t.Errorf("%s: %v", previous, err)
		}
		if readText(t, s.guidePath()) != before {
			t.Errorf("%s: the file changed", previous)
		}
	}
	for _, previous := range []string{`{`, `0`, `""`, `[]`, "\ufeff{}", `null`} {
		s := book(t, previous, "Captain Wren said nothing.")
		if document, _ := buildWith(t, s, nil); !slices.Equal(builtNames(document), []string{"Captain Wren"}) {
			t.Errorf("%s: %v", previous, builtNames(document))
		}
	}
}

// TestAnEditDuringTheModelRunIsMerged: the saved file is read again once the model work is done, so an edit made meanwhile is kept.
func TestAnEditDuringTheModelRunIsMerged(t *testing.T) {
	s := book(t, bibleOf(generatedEntry("Captain Wren")), "Captain Wren said nothing.")
	s.buildModel = &editingModel{stubModel: stubModel{}, edit: func() {
		if err := os.WriteFile(s.guidePath(), []byte(bibleOf(generatedEntry("Captain Wren", "context", `"Edited meanwhile."`))), 0o600); err != nil {
			t.Fatal(err)
		}
	}}
	if _, _, err := s.build(context.Background(), &buildRun{}, RulesOnly, false); err != nil {
		t.Fatal(err)
	}
	if got := byName(readJSONFile[map[string]any](t, s.guidePath()))["Captain Wren"]["context"]; got != "Edited meanwhile." {
		t.Fatalf("context %v", got)
	}
}

type editingModel struct {
	stubModel
	edit func()
}

func (m *editingModel) pronunciations(ctx context.Context, words []string, log string) ([]*pyObject, error) {
	m.edit()
	return m.stubModel.pronunciations(ctx, words, log)
}
