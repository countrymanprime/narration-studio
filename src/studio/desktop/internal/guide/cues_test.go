package guide

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/process"
	"desktop/internal/settings"
)

// The dialogue cues' own tests, ported from the sidecar's test_character_cues.py and test_bible_types.py when the cue code moved into
// the host (#2251 step 3); TestRefreshCuesMatchesTheSidecar pins the whole command against what the sidecar did.

// speakerIndex is a character index of the names: each normalized name mapped to the id entityID gives it.
func speakerIndex(names ...string) map[string]any {
	index := map[string]any{}
	for _, name := range names {
		index[normalizeName(name)] = entityID(name)
	}
	return index
}

// cueRows are paragraphs as (chapterId, paragraphId, text) rows.
func cueRows(rows ...[3]string) []ruleParagraph {
	paragraphs := make([]ruleParagraph, 0, len(rows))
	for _, row := range rows {
		paragraphs = append(paragraphs, ruleParagraph{chapterID: row[0], paragraphID: row[1], text: []rune(row[2])})
	}
	return paragraphs
}

func extracted(t *testing.T, paragraphs []ruleParagraph, index map[string]any, nearby bool) []*pyObject {
	t.Helper()
	cues, err := dialogueCues(context.Background(), paragraphs, index, nearby)
	if err != nil {
		t.Fatal(err)
	}
	return cues
}

// attribution is each cue's speaker and its source.
func attribution(cues []*pyObject) [][2]any {
	out := make([][2]any, len(cues))
	for i, cue := range cues {
		out[i] = [2]any{cue.values["speaker_entity_id"], cue.values["speaker_source"]}
	}
	return out
}

func sameAttribution(t *testing.T, got []*pyObject, want ...[2]any) {
	t.Helper()
	if fmt.Sprint(attribution(got)) != fmt.Sprint(want) {
		t.Fatalf("got %v, want %v", attribution(got), want)
	}
}

func TestATagAfterOrBeforeTheQuoteAttributesTheCue(t *testing.T) {
	ada := entityID("Ada")
	for _, text := range []string{`"I will not go," Ada said.`, `Ada said, "I will not go."`} {
		cues := cuesFromText([]rune(text), speakerIndex("Ada"), "", "")
		sameAttribution(t, cues, [2]any{ada, "tag"})
		if text[0] == '"' && cues[0].values["quote_text"] != "I will not go," {
			t.Fatalf("quote %q", cues[0].values["quote_text"])
		}
		if evidence := cues[0].values["evidence"].(*pyObject); evidence.values["excerpt"] != text || evidence.values["tag"] == "" {
			t.Fatalf("evidence %v", evidence.values)
		}
	}
}

func TestAnAliasInTheTagResolvesToTheSameEntity(t *testing.T) {
	index := map[string]any{normalizeName("Captain Arelian"): entityID("Captain Arelian"), normalizeName("Arelian"): entityID("Captain Arelian")}
	sameAttribution(t, cuesFromText([]rune(`"Hold the line," Arelian shouted.`), index, "", ""), [2]any{entityID("Captain Arelian"), "tag"})
}

// Precision over recall: a quote with no tag, or a tag naming no entry, is unknown, never guessed at.
func TestAQuoteWithNoTagOrAnUnknownNameIsUnknown(t *testing.T) {
	for _, text := range []string{`"Where did everyone go?"`, `"Wait," Someone said.`, `"Perhaps," came the reply from across the room.`} {
		cues := cuesFromText([]rune(text), speakerIndex("Ada"), "", "")
		sameAttribution(t, cues, [2]any{nil, "unknown"})
		if tag := cues[0].values["evidence"].(*pyObject).values["tag"]; tag != "" {
			t.Fatalf("%s: tag %q", text, tag)
		}
	}
}

func TestOverlappingSpeakersInOneParagraphAreEachAttributedByTheirOwnTag(t *testing.T) {
	ada, ben := entityID("Ada"), entityID("Ben")
	sameAttribution(t, cuesFromText([]rune(`"I will not go," Ada said. "Nor will I," Ben replied.`), speakerIndex("Ada", "Ben"), "", ""),
		[2]any{ada, "tag"}, [2]any{ben, "tag"})
	sameAttribution(t, extracted(t, cueRows([3]string{"c1", "p1", `"Yours?" Ada asked. "No, yours," Ben answered. "Neither," Ada said.`}), speakerIndex("Ada", "Ben"), false),
		[2]any{ada, "tag"}, [2]any{ben, "tag"}, [2]any{ada, "tag"})
}

func TestTwoPersonContinuationAlternatesWithinAScene(t *testing.T) {
	ada, ben := entityID("Ada"), entityID("Ben")
	exchange := [][3]string{{"c1", "p1", `"I will not go," Ada said.`}, {"c1", "p2", `"Then stay," Ben replied.`}}
	sameAttribution(t, extracted(t, cueRows(append(slices.Clone(exchange), [3]string{"c1", "p3", `"Fine."`})...), speakerIndex("Ada", "Ben"), false),
		[2]any{ada, "tag"}, [2]any{ben, "tag"}, [2]any{ada, "continuation"})
	// Not across a scene break, nor with three or more speakers.
	cues := extracted(t, cueRows(append(slices.Clone(exchange), [3]string{"c1", "p3", "***"}, [3]string{"c1", "p4", `"Fine."`})...), speakerIndex("Ada", "Ben"), false)
	sameAttribution(t, cues[2:], [2]any{nil, "unknown"})
	three := cueRows(append(slices.Clone(exchange), [3]string{"c1", "p3", `"Three," Cora added.`}, [3]string{"c1", "p4", `"Four."`})...)
	sameAttribution(t, extracted(t, three, speakerIndex("Ada", "Ben", "Cora"), false)[3:], [2]any{nil, "unknown"})
}

func TestCueIDsAreStableAndDistinct(t *testing.T) {
	rows := cueRows([3]string{"c1", "p1", `"I will not go," Ada said.`})
	if first, second := extracted(t, rows, speakerIndex("Ada"), false), extracted(t, rows, speakerIndex("Ada"), false); first[0].values["id"] != second[0].values["id"] {
		t.Fatal("a rebuild of unchanged text gave the cue another id")
	}
	cues := cuesFromText([]rune(`"No," Ada said. "No," Ben said.`), speakerIndex("Ada", "Ben"), "", "")
	if cues[0].values["id"] == cues[1].values["id"] {
		t.Fatal("two identical quotes got the same id")
	}
}

func TestAParagraphWithoutQuotesHasNoCues(t *testing.T) {
	if cues := extracted(t, cueRows([3]string{"c1", "p1", "Ada walked across the room and said nothing."}), speakerIndex("Ada"), true); len(cues) != 0 {
		t.Fatalf("got %d cues", len(cues))
	}
}

// A correction survives a rebuild as a locked entry does: matched by the cue's id, so a changed paragraph does not carry it.
func TestACorrectionSurvivesOnlyOnItsOwnCue(t *testing.T) {
	ada := entityID("Ada")
	fresh := extracted(t, cueRows([3]string{"c1", "p1", `"Wait," Someone said.`}), speakerIndex("Ada"), false)
	corrected := newPyObject("id", fresh[0].values["id"], "speaker_entity_id", ada, "speaker_source", "correction", "corrected", true)
	stale := newPyObject("id", "cue-stale", "speaker_entity_id", ada, "speaker_source", "correction", "corrected", true)
	merged, err := mergeDialogueCues(fresh, []any{stale, corrected})
	if err != nil {
		t.Fatal(err)
	}
	if merged[0].values["speaker_entity_id"] != ada || merged[0].values["corrected"] != true || fresh[0].values["corrected"] != false {
		t.Fatalf("merged %v", merged[0].values)
	}
	if merged, _ := mergeDialogueCues(fresh, []any{stale}); merged[0].values["speaker_entity_id"] != nil {
		t.Fatal("a stale correction was carried onto another quote")
	}
}

// The suggested speakers (B3): a speaking entry's name near the quote, after a tag and continuation. Only an entry whose type speaks is a
// speaker; a Needs Review name never is (owner, 2026-10-24).
func TestANearbySpeakingNameSuggestsTheSpeaker(t *testing.T) {
	entities := []any{
		newPyObject("id", "ada", "canonical_name", "Ada", "category", "Character", "aliases", []any{}),
		newPyObject("id", "ben", "canonical_name", "Ben", "category", "Character", "aliases", []any{newPyObject("text", "Ben Hale")}),
		newPyObject("id", "wren", "canonical_name", "Wren", "category", "Needs Review", "aliases", []any{}),
		newPyObject("id", "spire", "canonical_name", "Dawnspire", "category", "Place", "aliases", []any{}),
	}
	index, err := cueSpeakerIndex(entities, map[string]bool{"Character": true})
	if err != nil {
		t.Fatal(err)
	}
	speakers := func(texts ...string) []*pyObject {
		rows := make([][3]string, len(texts))
		for i, text := range texts {
			rows[i] = [3]string{"c1", fmt.Sprintf("p%d", i), text}
		}
		return extracted(t, cueRows(rows...), index, true)
	}
	unknown := [2]any{nil, "unknown"}
	for _, text := range []string{`"Hello," Wren said.`, `"Hello." Wren waved from the door.`, `"Burn," Dawnspire said.`, `"Look." Dawnspire burned on the hill.`,
		`"Late." ` + strings.Repeat("x", 70) + " Ada", `"Perhaps," came the reply from across the room.`} {
		sameAttribution(t, speakers(text), unknown)
	}
	sameAttribution(t, speakers(`"Over here." Ada waved from the door.`), [2]any{"ada", "proximity"})
	sameAttribution(t, speakers(`Ben Hale turned to the window. "It is late."`), [2]any{"ben", "proximity"})
	sameAttribution(t, speakers(`Ben looked up. "Late." Ada shrugged.`), [2]any{"ada", "proximity"})
	sameAttribution(t, speakers(`"One." "Two," Ada said.`), unknown, [2]any{"ada", "tag"})
	sameAttribution(t, speakers(`"Go," Ada said.`, `"No," Ben said.`, `"Yes." Ben frowned.`), [2]any{"ada", "tag"}, [2]any{"ben", "tag"}, [2]any{"ada", "continuation"})
	sameAttribution(t, speakers(`"Hi." Ada nodded.`, `"Hello."`), [2]any{"ada", "proximity"}, unknown)
}

// The Story Bible's types decide who speaks: with a list, only its speaking types; without one, Character.
func TestTheCuesFollowTheCanSpeakFlag(t *testing.T) {
	entities := []any{newPyObject("id", "e-wren", "canonical_name", "Wren", "category", "Character"), newPyObject("id", "e-town", "canonical_name", "Dawnspire", "category", "Place")}
	types := []any{newPyObject("name", "Character", "colour", "green", "speaks", false), newPyObject("name", "Place", "colour", "blue", "speaks", true)}
	speaking, err := (&ruleBibleFile{document: newPyObject("types", types)}).speakingTypes()
	if err != nil || fmt.Sprint(speaking) != "map[Place:true]" {
		t.Fatalf("speaking %v, %v", speaking, err)
	}
	index, _ := cueSpeakerIndex(entities, speaking)
	if fmt.Sprint(index) != "map[dawnspire:e-town]" {
		t.Fatalf("index %v", index)
	}
	defaults, _ := (&ruleBibleFile{document: newPyObject()}).speakingTypes()
	if index, _ := cueSpeakerIndex(entities, defaults); fmt.Sprint(index) != "map[wren:e-wren]" {
		t.Fatalf("without a list, Character speaks: %v", index)
	}
	sameAttribution(t, cuesFromText([]rune(`"Come in," Dawnspire said. "No," Wren said.`), index, "", ""), [2]any{"e-town", "tag"}, [2]any{nil, "unknown"})
}

// cueProject is a Service over a project whose manuscript has the paragraphs, with the Story Bible document written (none when nil).
func cueProject(t *testing.T, document any, rows ...[3]string) *Service {
	t.Helper()
	root := t.TempDir()
	s := New(root, "", "", nil, nil)
	chapters, paragraphs := []map[string]any{}, []map[string]any{}
	seen := map[string]bool{}
	for i, row := range rows {
		if !seen[row[0]] {
			seen[row[0]] = true
			chapters = append(chapters, map[string]any{"id": row[0], "title": row[0]})
		}
		paragraphs = append(paragraphs, map[string]any{"id": row[1], "index": i, "chapterId": row[0], "chapterTitle": row[0], "text": row[2]})
	}
	manuscript, _ := json.Marshal(map[string]any{"schemaVersion": 1, "documentId": "d", "chapters": chapters, "paragraphs": paragraphs})
	if err := os.MkdirAll(filepath.Dir(s.manuscript()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(s.manuscript(), manuscript, 0o600); err != nil {
		t.Fatal(err)
	}
	if document != nil {
		raw, _ := json.Marshal(document)
		if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(s.guidePath(), raw, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return s
}

func refreshed(t *testing.T, s *Service, want CueCounts, chapters ...string) map[string]any {
	t.Helper()
	got, err := s.RefreshCues(context.Background(), chapters...)
	if err != nil || got != want {
		t.Fatalf("RefreshCues = %+v, %v; want %+v", got, err, want)
	}
	raw, err := os.ReadFile(s.guidePath())
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(s.guidePath() + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("the temporary file was left: %v", err)
	}
	return document
}

var cueAda = map[string]any{"id": "entity-ada", "canonical_name": "Ada", "category": "Character", "aliases": []any{}}

func firstCue(document map[string]any) map[string]any {
	return document["dialogue_cues"].([]any)[0].(map[string]any)
}

func TestRefreshCuesStartsAStoryBibleWhenThereIsNone(t *testing.T) {
	document := refreshed(t, cueProject(t, nil, [3]string{"c1", "p1", `"Hello," Ada said.`}), CueCounts{Cues: 1})
	if cue := firstCue(document); cue["speaker_entity_id"] != nil || len(document["entities"].([]any)) != 0 || len(document["source"].(map[string]any)) != 0 {
		t.Fatalf("an empty Story Bible stays stale until a build fills source: %v", document)
	}
}

func TestRefreshCuesAttributesAgainstTheEntriesAlreadyFiled(t *testing.T) {
	document := refreshed(t, cueProject(t, map[string]any{"entities": []any{cueAda}}, [3]string{"c1", "p1", `"Hello," Ada said.`}), CueCounts{Cues: 1, Attributed: 1})
	if cue := firstCue(document); cue["speaker_entity_id"] != "entity-ada" || cue["speaker_source"] != "tag" {
		t.Fatalf("cue %v", cue)
	}
}

func TestRefreshCuesKeepsEveryOtherKeyOfTheStoryBible(t *testing.T) {
	stored := map[string]any{"entities": []any{cueAda}, "types": []any{map[string]any{"name": "Character", "colour": "green", "speaks": true}},
		"absorbed_names": map[string]any{"x": "y"}, "extra": 1.0}
	document := refreshed(t, cueProject(t, stored, [3]string{"c1", "p1", "No dialogue here."}), CueCounts{})
	for key, want := range stored {
		if fmt.Sprint(document[key]) != fmt.Sprint(want) {
			t.Fatalf("%s: %v, want %v", key, document[key], want)
		}
	}
	if cues := document["dialogue_cues"].([]any); len(cues) != 0 {
		t.Fatalf("cues %v", cues)
	}
}

func TestRefreshCuesKeepsACorrection(t *testing.T) {
	rows := [3]string{"c1", "p1", `"Wait," Someone said.`}
	fresh := cuesFromText([]rune(rows[2]), map[string]any{}, "c1", "p1")
	corrected := map[string]any{"id": fresh[0].values["id"], "speaker_entity_id": "entity-ada", "speaker_source": "correction", "corrected": true}
	document := refreshed(t, cueProject(t, map[string]any{"entities": []any{cueAda}, "dialogue_cues": []any{corrected}}, rows), CueCounts{Cues: 1, Attributed: 1})
	if cue := firstCue(document); cue["speaker_entity_id"] != "entity-ada" || cue["corrected"] != true || cue["quote_text"] != "Wait," {
		t.Fatalf("cue %v", cue)
	}
}

func TestRefreshCuesUsesTheStoryBiblesSpeakingTypes(t *testing.T) {
	crow := map[string]any{"id": "entity-crow", "canonical_name": "Crow", "category": "Creature", "aliases": []any{}}
	types := []any{map[string]any{"name": "Character", "colour": "green", "speaks": true}, map[string]any{"name": "Creature", "colour": "blue", "speaks": true}}
	document := refreshed(t, cueProject(t, map[string]any{"entities": []any{crow}, "types": types}, [3]string{"c1", "p1", `"Caw," Crow said.`}), CueCounts{Cues: 1, Attributed: 1})
	if firstCue(document)["speaker_entity_id"] != "entity-crow" {
		t.Fatalf("cue %v", firstCue(document))
	}
}

func TestAChapterRefreshLeavesTheOtherChaptersCuesAlone(t *testing.T) {
	stale := map[string]any{"id": "cue-stale", "chapterId": "c2", "paragraphId": "p2", "speaker_entity_id": nil, "corrected": false}
	s := cueProject(t, map[string]any{"entities": []any{cueAda}, "dialogue_cues": []any{stale}}, [3]string{"c1", "p1", `"One," Ada said.`}, [3]string{"c2", "p2", `"Two," Ada said.`})
	cues := refreshed(t, s, CueCounts{Cues: 2, Attributed: 1}, "c1")["dialogue_cues"].([]any)
	if first, second := cues[0].(map[string]any), cues[1].(map[string]any); first["chapterId"] != "c1" || first["speaker_entity_id"] != "entity-ada" || second["id"] != "cue-stale" {
		t.Fatalf("cues stay in manuscript order, the other chapter's as they were: %v", cues)
	}
}

func TestACorrectionAfterARefreshFindsTheCueItWrote(t *testing.T) {
	s := cueProject(t, map[string]any{"entities": []any{cueAda}}, [3]string{"c1", "p1", `"Hello," Ada said.`})
	if err := s.CorrectCue("cue-missing", "entity-ada"); err == nil {
		t.Fatal("a correction of a cue the file lacks must be refused")
	}
	id := cuesFromText([]rune(`"Hello," Ada said.`), nil, "c1", "p1")[0].values["id"].(string)
	refreshed(t, s, CueCounts{Cues: 1, Attributed: 1})
	if err := s.CorrectCue(id, "unknown"); err != nil {
		t.Fatalf("the host edit read a stale Story Bible: %v", err)
	}
	if document := refreshed(t, s, CueCounts{Cues: 1}); firstCue(document)["corrected"] != true {
		t.Fatalf("the correction did not survive the next refresh: %v", firstCue(document))
	}
}

func TestRefreshCuesRefusesWhatItCannotRead(t *testing.T) {
	for name, c := range map[string]struct {
		document any
		want     error
	}{
		"bad types":   {map[string]any{"types": []any{}}, errStoryBibleTypes},
		"cue no id":   {map[string]any{"dialogue_cues": []any{map[string]any{"chapterId": "c1"}}}, errCuesShape},
		"entity text": {map[string]any{"entities": []any{"Ada"}}, errCuesShape},
		"list":        {[]any{1}, errCuesShape},
	} {
		s := cueProject(t, c.document, [3]string{"c1", "p1", `"Hello," Ada said.`})
		before, _ := os.ReadFile(s.guidePath())
		if _, err := s.RefreshCues(context.Background()); !errors.Is(err, c.want) {
			t.Fatalf("%s: %v, want %v", name, err, c.want)
		}
		if after, _ := os.ReadFile(s.guidePath()); string(after) != string(before) {
			t.Fatalf("%s: a refusal rewrote the Story Bible", name)
		}
	}
	s := cueProject(t, nil)
	if err := os.Remove(s.manuscript()); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RefreshCues(context.Background()); !errors.Is(err, errNoManuscript) {
		t.Fatalf("no manuscript: %v", err)
	}
}

func TestRefreshCuesStopsWhenCancelled(t *testing.T) {
	s := cueProject(t, nil, [3]string{"c1", "p1", `"Hello," Ada said.`})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.RefreshCues(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	if _, err := os.Stat(s.guidePath()); !os.IsNotExist(err) {
		t.Fatal("a cancelled refresh wrote the Story Bible")
	}
}

func TestRefreshCuesNeedsAProject(t *testing.T) {
	root := t.TempDir()
	s := New("", "unused", "", settings.New(root, root), process.NewSupervisor())
	if _, err := s.RefreshCues(context.Background()); err == nil || !strings.Contains(err.Error(), "import a manuscript first") {
		t.Fatalf("got %v", err)
	}
}

// testdata/cues-golden.json is what a refresh writes for a short book, before and after Ada is filed: the host's DialogueCues reads it
// back (TestCuesMatchTheGolden). The sidecar's test_character_cues.py wrote it until the cues moved here; this writes the same bytes.
func TestTheCuesGolden(t *testing.T) {
	rows := [][3]string{{"c1", "p1", `"Hello," Ada said. "Who are you?"`}, {"c1", "p2", "No dialogue."}}
	cases := []map[string]any{}
	for _, entities := range [][]any{{}, {cueAda}} {
		s := cueProject(t, map[string]any{"entities": entities}, rows...)
		counts, err := s.RefreshCues(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := os.ReadFile(s.guidePath())
		var document map[string]any
		if err := json.Unmarshal(raw, &document); err != nil {
			t.Fatal(err)
		}
		cases = append(cases, map[string]any{"line": fmt.Sprintf("CUES|%d|%d", counts.Cues, counts.Attributed), "dialogue_cues": document["dialogue_cues"]})
	}
	contractfile.CheckIn(t, "testdata", "cues-golden", map[string]any{"cases": cases})
}

// What a refresh printed and wrote (testdata/cues-golden.json) reads back through DialogueCues with the same counts.
func TestCuesMatchTheGolden(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "cues-golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden struct {
		Cases []struct {
			Line         string          `json:"line"`
			DialogueCues json.RawMessage `json:"dialogue_cues"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &golden); err != nil || len(golden.Cases) < 2 {
		t.Fatalf("golden: %v, %d cases", err, len(golden.Cases))
	}
	for _, c := range golden.Cases {
		s := New(t.TempDir(), "", "", nil, nil)
		if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(s.guidePath(), []byte(`{"entities":[],"dialogue_cues":`+string(c.DialogueCues)+`}`), 0o600); err != nil {
			t.Fatal(err)
		}
		cues, err := s.DialogueCues()
		if err != nil {
			t.Fatal(err)
		}
		attributed := 0
		for _, cue := range cues {
			if cue.SpeakerEntityID != nil {
				attributed++
			}
		}
		if line := fmt.Sprintf("CUES|%d|%d", len(cues), attributed); line != c.Line {
			t.Fatalf("%q, but the file holds %s", c.Line, line)
		}
	}
}

func TestSpeakerChaptersAreWhereTheEntrysNamesAppear(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", nil, nil)
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	document := `{"types":[{"name":"Character","colour":"green","speaks":true},{"name":"Place","colour":"blue","speaks":false}],"entities":[
		{"id":"ada","canonical_name":"Ada","category":"Character","occurrences":[{"chapterId":"c2"},{"chapterId":"c1"},{"chapterId":"c2"}],
		 "aliases":[{"text":"Lady Ada","occurrences":[{"chapterId":"c3"},{"chapterId":""}]}]},
		{"id":"spire","canonical_name":"Spire","category":"Place","occurrences":[{"chapterId":"c1"}]}]}`
	if err := os.WriteFile(s.guidePath(), []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string]struct {
		chapters []string
		speaks   bool
	}{"ada": {[]string{"c2", "c1", "c3"}, true}, "spire": {[]string{"c1"}, false}, "gone": {nil, false}} {
		chapters, speaks, err := s.SpeakerChapters(id)
		if err != nil || !slices.Equal(chapters, want.chapters) || speaks != want.speaks {
			t.Fatalf("%s: %v %v %v", id, chapters, speaks, err)
		}
	}
}

// A build writes the new entries and keeps the old cues; Build then finds the cues against them, and fails when the manuscript is gone.
func TestBuildFindsTheCuesAgainstTheNewEntries(t *testing.T) {
	rig := newPreviewRig(t, "build")
	manuscript := `{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c1"}], "paragraphs": [{"id": "p1", "chapterId": "c1", "chapterTitle": "One", "text": "\"Hello,\" Captain Ada said."}]}`
	if err := os.MkdirAll(filepath.Dir(rig.service.manuscript()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(rig.service.manuscript(), []byte(manuscript), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := rig.service.Build(filepath.Join(t.TempDir(), "progress"), filepath.Join(t.TempDir(), "log"), RulesOnly); err != nil {
		t.Fatal(err)
	}
	cues, err := rig.service.DialogueCues()
	if err != nil || len(cues) != 1 || cues[0].SpeakerEntityID == nil || *cues[0].SpeakerEntityID != entityID("Captain Ada") {
		t.Fatalf("cues %+v, %v", cues, err)
	}
	if err := os.Remove(rig.service.manuscript()); err != nil {
		t.Fatal(err)
	}
	if _, err := rig.service.Build(filepath.Join(t.TempDir(), "progress"), filepath.Join(t.TempDir(), "log"), RulesOnly); !errors.Is(err, errNoManuscript) {
		t.Fatalf("a build with no manuscript: %v", err)
	}
}
