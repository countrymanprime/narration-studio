package guide

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"desktop/internal/compare"
	"desktop/internal/settings"
)

// The Story Bible build's own tests: what the sidecar's build tests checked (test_manuscript_guide.py's build and extraction tests,
// test_bible_types.py, test_properties.py, test_review_flags.py, test_merge_undo.py, test_character_continuity.py and the rebuild
// tests of test_pronounce.py and test_pronunciation_depth.py), ported when the build moved into the host (#2251 step 3). Byte parity
// with the sidecar's build is TestBuildMatchesTheSidecar's.

// stubModel is a language model that tags every whole-word appearance of each literal (not next to an ASCII letter) with its label,
// as the sidecar tests' _stub_spacy did, or none that loads (labels nil). It pronounces each word "ipa:<word>".
type stubModel struct {
	labels    map[string]string
	unusable  bool
	asked     []string
	spansRuns int
}

func (m *stubModel) entities(ctx context.Context, _, _, log string, paragraphs []ruleParagraph, names func([][]entitySpan) []string) ([]*pyObject, error) {
	m.spansRuns++
	var spans [][]entitySpan
	if !m.unusable {
		spans = m.spansFor(paragraphs)
	}
	return m.pronunciations(ctx, names(spans), log)
}

// spansFor is every whole-word appearance of each literal in each paragraph, in order.
func (m *stubModel) spansFor(paragraphs []ruleParagraph) [][]entitySpan {
	spans := make([][]entitySpan, len(paragraphs))
	for i, paragraph := range paragraphs {
		text := paragraph.text
		spans[i] = []entitySpan{}
		for literal, label := range m.labels {
			word := []rune(literal)
			for at := 0; at+len(word) <= len(text); at++ {
				if string(text[at:at+len(word)]) != literal || (at > 0 && isLetter(text[at-1])) || (at+len(word) < len(text) && isLetter(text[at+len(word)])) {
					continue
				}
				spans[i] = append(spans[i], entitySpan{start: at, end: at + len(word), label: label})
			}
		}
		slices.SortStableFunc(spans[i], func(a, b entitySpan) int { return a.start - b.start })
	}
	return spans
}

func (m *stubModel) pronunciations(_ context.Context, words []string, _ string) ([]*pyObject, error) {
	m.asked = append(m.asked, words...)
	values := make([]*pyObject, len(words))
	for i, word := range words {
		values[i] = newPyObject("ipa", "ipa:"+word, "source", "cmu", "confidence", "medium")
	}
	return values, nil
}

// testChapter is one chapter of a test book: its id (also its title) and its paragraphs' texts.
type testChapter struct {
	id         string
	paragraphs []string
}

// bookProject is a project with a manuscript of the chapters (paragraph ids p1, p2, ... across the book) and, when previous is not
// empty, that Story Bible.
func bookProject(t *testing.T, previous string, chapters ...testChapter) *Service {
	t.Helper()
	project := t.TempDir()
	type paragraph struct {
		ID           string `json:"id"`
		ChapterID    string `json:"chapterId"`
		ChapterTitle string `json:"chapterTitle"`
		Text         string `json:"text"`
	}
	type chapter struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	document := struct {
		SchemaVersion int         `json:"schemaVersion"`
		DocumentID    string      `json:"documentId"`
		Chapters      []chapter   `json:"chapters"`
		Paragraphs    []paragraph `json:"paragraphs"`
	}{SchemaVersion: 1, DocumentID: "test"}
	for _, c := range chapters {
		document.Chapters = append(document.Chapters, chapter{c.id, c.id})
		for _, text := range c.paragraphs {
			document.Paragraphs = append(document.Paragraphs, paragraph{fmt.Sprintf("p%d", len(document.Paragraphs)+1), c.id, c.id, text})
		}
	}
	raw, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	s := New(project, "unused", "", settings.New(project, project), nil)
	for path, data := range map[string]string{s.manuscript(): string(raw), s.guidePath(): previous} {
		if data == "" {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return s
}

// book is bookProject with one chapter, c1.
func book(t *testing.T, previous string, paragraphs ...string) *Service {
	t.Helper()
	return bookProject(t, previous, testChapter{"c1", paragraphs})
}

// buildWith builds s's Story Bible with the model (the rules alone when it is nil) and gives the file and what the build reported.
func buildWith(t *testing.T, s *Service, model *stubModel) (map[string]any, *buildRun) {
	t.Helper()
	if model == nil {
		model = &stubModel{}
	}
	s.buildModel = model
	argument := "stub-model"
	if model.labels == nil && !model.unusable {
		argument = RulesOnly
	}
	run := &buildRun{}
	if _, _, err := s.build(context.Background(), run, argument, false); err != nil {
		t.Fatal(err)
	}
	return readJSONFile[map[string]any](t, s.guidePath()), run
}

func entitiesIn(document map[string]any) []map[string]any {
	list, _ := document["entities"].([]any)
	out := make([]map[string]any, len(list))
	for i, raw := range list {
		out[i] = raw.(map[string]any)
	}
	return out
}

func byName(document map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	for _, entity := range entitiesIn(document) {
		out[entity["canonical_name"].(string)] = entity
	}
	return out
}

func builtNames(document map[string]any) []string {
	var out []string
	for _, entity := range entitiesIn(document) {
		out = append(out, entity["canonical_name"].(string))
	}
	return out
}

// paragraphsOf is the book's paragraphs as the build reads them.
func paragraphsOf(t *testing.T, texts ...string) []ruleParagraph {
	t.Helper()
	paragraphs, err := ruleManuscript(book(t, "", texts...).manuscript())
	if err != nil {
		t.Fatal(err)
	}
	return paragraphs
}

func candidateNames(candidates []ruleCandidate) []string {
	out := []string{}
	for _, candidate := range candidates {
		out = append(out, candidate.name)
	}
	return out
}

// spacyNames is spacy_candidates' names for the texts with the stub's labels.
func spacyNames(t *testing.T, labels map[string]string, texts ...string) []string {
	t.Helper()
	paragraphs := paragraphsOf(t, texts...)
	return candidateNames(spacyCandidates(paragraphs, (&stubModel{labels: labels}).spansFor(paragraphs)))
}

var (
	commonWordParagraphs = []string{
		"Abandoned ships drifted past. Nobody wanted an abandoned hull.",
		"Adorable puppies barked. The adorable pair ran off.",
		"Afraid to speak, she waited. She was afraid of the dark.",
		"Active minds wander. An active mind is a happy mind.",
		"ACCEPTABLE terms were offered. The terms were acceptable to all.",
	}
	nameParagraphs = []string{
		"Captain Arelian said the Council of Ash would meet in Dawnspire.",
		"Arelian was a veteran navigator, brave and wary before the council arrived.",
		"Later they saw Dawnspire burning. The road to Dawnspire was long.",
		"Everyone knew Dawnspire well.",
	}
	hopeParagraphs = []string{"They loved Hope dearly.", "Ada stood near Hope and wept.", "Without hope there is nothing."}
)

func TestABuildWhoseModelFindsNothingDoesNotFallBackToTheRules(t *testing.T) {
	document, _ := buildWith(t, book(t, "", "Captain Arelian arrives."), &stubModel{labels: map[string]string{}})
	if got := builtNames(document); len(got) != 0 {
		t.Fatalf("entries %v, want none: an empty answer is the model's, not a reason to run the rules", got)
	}
}

func TestTheRulesOnlyChoiceAsksNoModelAndSaysItWasChosen(t *testing.T) {
	model := &stubModel{}
	document, run := buildWith(t, book(t, "", "Captain Arelian arrives."), model)
	if model.spansRuns != 0 {
		t.Fatalf("the model was asked %d times", model.spansRuns)
	}
	if !slices.Contains(run.said, rulesOnlyChosen) || slices.ContainsFunc(run.said, func(line string) bool { return strings.Contains(line, "unavailable") }) {
		t.Fatalf("log %q", run.said)
	}
	if got := builtNames(document); !slices.Equal(got, []string{"Captain Arelian"}) {
		t.Fatalf("entries %v", got)
	}
}

func TestAModelThatCannotBeLoadedBuildsWithTheRules(t *testing.T) {
	document, run := buildWith(t, book(t, "", "Captain Arelian arrives."), &stubModel{unusable: true})
	if got := builtNames(document); !slices.Equal(got, []string{"Captain Arelian"}) {
		t.Fatalf("entries %v", got)
	}
	if !slices.Contains(run.said, "Extracting candidates with spaCy model stub-model") || slices.Contains(run.said, rulesOnlyChosen) {
		t.Fatalf("log %q", run.said)
	}
}

func TestTheRulesStripArticlesAndKeepANameSeenThreeTimes(t *testing.T) {
	texts := []string{"A Black Halo appeared. About noon, it vanished.", "Black Halo appeared again.", "Black Halo appeared once more."}
	candidates := candidateNames(scanCandidates(paragraphsOf(t, texts...)))
	if !slices.Contains(candidates, "Black Halo") || slices.Contains(candidates, "About") {
		t.Fatalf("candidates %v", candidates)
	}
	document, _ := buildWith(t, book(t, "", texts...), nil)
	if got := builtNames(document); !slices.Equal(got, []string{"Black Halo"}) {
		t.Fatalf("entries %v", got)
	}
}

func TestTraitNotesQuoteTheirSentence(t *testing.T) {
	paragraphs := paragraphsOf(t, "Arelian was brave and wary.")
	notes := traitNotes("Arelian", []ruleCandidate{{name: "Arelian", start: 0, end: 7}}, paragraphs)
	var texts []string
	for _, note := range notes {
		texts = append(texts, note.(*pyObject).values["text"].(string))
	}
	if !slices.Equal(texts, []string{"Described as brave.", "Described as wary."}) {
		t.Fatalf("notes %v", texts)
	}
	if chapter := notes[0].(*pyObject).values["evidence"].(*pyObject).values["chapter"]; chapter != "c1" {
		t.Fatalf("evidence chapter %v", chapter)
	}
}

func TestABuildFindsNamesTheirEvidenceAndAnExplicitDescription(t *testing.T) {
	document, _ := buildWith(t, book(t, "", nameParagraphs[:2]...), &stubModel{unusable: true})
	arelian := byName(document)["Captain Arelian"]
	if arelian == nil || arelian["category"] != categoryCharacter {
		t.Fatalf("entries %v", builtNames(document))
	}
	if excerpt := arelian["occurrences"].([]any)[0].(map[string]any)["excerpt"]; excerpt == "" {
		t.Fatal("no excerpt")
	}
	if description := arelian["description"].(map[string]any)["text"]; description != "Explicitly described as veteran navigator." {
		t.Fatalf("description %q", description)
	}
}

// TestBuildWritesTheProjectsStoryBible runs Build against the sidecar's commands as a separate process (the test binary stands in for
// it): the Story Bible written where the project keeps it, the manuscript's hash, the vocabulary, the progress and the log.
func TestBuildWritesTheProjectsStoryBible(t *testing.T) {
	for _, mode := range []string{"build", "build-spacy"} {
		t.Run(mode, func(t *testing.T) {
			rig := newPreviewRig(t, mode)
			manuscript := `{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c1"}], "paragraphs": [{"id": "p1", "chapterId": "c1", "chapterTitle": "One", "text": "Captain Arelian said the Council of Ash would meet in Dawnspire. Ada nodded."}, {"id": "p2", "chapterId": "c1", "chapterTitle": "One", "text": "Then Ada left, and Ada slept."}]}`
			if err := os.MkdirAll(filepath.Dir(rig.service.manuscript()), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(rig.service.manuscript(), []byte(manuscript), 0o600); err != nil {
				t.Fatal(err)
			}
			dir := t.TempDir()
			progress, log := filepath.Join(dir, "progress.txt"), filepath.Join(dir, "log.txt")
			out, err := rig.service.Build(progress, log, "en_core_web_sm")
			if err != nil {
				t.Fatal(err)
			}
			document := readJSONFile[map[string]any](t, rig.service.guidePath())
			sum := sha256.Sum256([]byte(manuscript))
			if source := document["source"].(map[string]any); source["sha256"] != hex.EncodeToString(sum[:]) {
				t.Fatalf("source %v", source)
			}
			want := map[string][]string{
				"build":       {"Captain Arelian", "Ada", "Council of Ash"},
				"build-spacy": {"Ada"},
			}[mode]
			wantVocabulary := map[string][]string{"build": {"Captain Arelian", "Council of Ash"}, "build-spacy": {"Ada"}}[mode]
			if got := builtNames(document); !slices.Equal(got, want) {
				t.Fatalf("entries %v, want %v", got, want)
			}
			if out != fmt.Sprintf("BUILT|%d|%s", len(want), rig.service.guidePath()) {
				t.Fatalf("out %q", out)
			}
			var vocabulary []string
			for _, word := range document["vocabulary_candidates"].([]any) {
				vocabulary = append(vocabulary, word.(string))
			}
			if !slices.Equal(vocabulary, wantVocabulary) {
				t.Fatalf("vocabulary %v", vocabulary)
			}
			if pronunciation := byName(document)[want[0]]["pronunciation"].(map[string]any); pronunciation["ipa"] != "ipa:"+want[0] {
				t.Fatalf("pronunciation %v", pronunciation)
			}
			if line := strings.TrimSpace(readText(t, progress)); line != fmt.Sprintf("DONE|100|Built guide with %d entities", len(want)) {
				t.Fatalf("progress %q", line)
			}
			logged := readText(t, log)
			for _, message := range []string{"Reading canonical manuscript", "Loaded 2 paragraphs", "Extracting candidates with spaCy model en_core_web_sm", "Built Story Bible with"} {
				if !strings.Contains(logged, message) {
					t.Fatalf("log has no %q:\n%s", message, logged)
				}
			}
			if mode == "build" && !strings.Contains(logged, "WARNING: spaCy model unavailable (no model)") {
				t.Fatalf("the sidecar's warning is not in the build's log:\n%s", logged)
			}
			commands := readText(t, rig.log)
			// One process, as the sidecar's build was: the model's spans, then the pronunciations of the names the host made of them.
			if !strings.Contains(commands, "entities --manuscript "+rig.service.manuscript()+" --spacy-model en_core_web_sm --words-file ") ||
				!strings.Contains(commands, " --log "+log) || strings.Count(strings.TrimSpace(commands), "\n") != 0 {
				t.Fatalf("the sidecar was asked:\n%s", commands)
			}
		})
	}
}

func TestABuildWhoseModelFailsReportsTheSidecarsReason(t *testing.T) {
	rig := newPreviewRig(t, "build-fail")
	before := readText(t, rig.service.guidePath())
	manuscript := `{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c1"}], "paragraphs": [{"id": "p1", "chapterId": "c1", "chapterTitle": "One", "text": "Ada."}]}`
	if err := os.MkdirAll(filepath.Dir(rig.service.manuscript()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(rig.service.manuscript(), []byte(manuscript), 0o600); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	progress, log := filepath.Join(dir, "progress.txt"), filepath.Join(dir, "log.txt")
	_, err := rig.service.Build(progress, log, "en_core_web_sm")
	reason := "[E088] Text of length 1000001 exceeds maximum of 1000000."
	if err == nil || err.Error() != reason {
		t.Fatalf("error %v", err)
	}
	if line := strings.TrimSpace(readText(t, progress)); line != "ERROR|0|"+reason {
		t.Fatalf("progress %q", line)
	}
	if logged := readText(t, log); strings.Count(logged, "ERROR: ") != 1 {
		t.Fatalf("the reason is logged once, by the sidecar:\n%s", logged)
	}
	if after := readText(t, rig.service.guidePath()); after != before {
		t.Fatal("a failed build changed the Story Bible")
	}
}

func TestTheModelsAnswerMustMatchTheManuscript(t *testing.T) {
	paragraphs := paragraphsOf(t, "Ada.", "Wren.")
	for _, out := range []string{
		``, `{}`, `{"available": true}`, "{\"available\": true}\n{\"paragraphId\": \"p1\", \"entities\": []}",
		"{\"available\": true}\n{\"paragraphId\": \"p2\", \"entities\": []}\n{\"paragraphId\": \"p1\", \"entities\": []}",
		"{\"available\": true}\n{\"paragraphId\": \"p1\", \"entities\": [[0, 9, \"PERSON\"]]}\n{\"paragraphId\": \"p2\", \"entities\": []}",
		"{\"available\": true}\n{\"paragraphId\": \"p1\", \"entities\": [[2, 1, \"PERSON\"]]}\n{\"paragraphId\": \"p2\", \"entities\": []}",
	} {
		if _, _, err := parseEntitySpans(out, paragraphs); err == nil {
			t.Errorf("%q was taken", out)
		}
	}
	spans, available, err := parseEntitySpans("{\"available\": true}\n{\"paragraphId\": \"p1\", \"entities\": [[0, 3, \"PERSON\"]]}\n{\"paragraphId\": \"p2\", \"entities\": []}", paragraphs)
	if err != nil || !available || len(spans) != 2 || spans[0][0] != (entitySpan{0, 3, "PERSON"}) {
		t.Fatalf("%v %v %v", spans, available, err)
	}
	if _, available, err := parseEntitySpans(`{"available": false}`, paragraphs); err != nil || available {
		t.Fatalf("%v %v", available, err)
	}
	if _, err := parsePronunciationObjects("{\"ipa\": \"a\"}\n[1]", 2); err == nil {
		t.Fatal("a pronunciation that is not an object was taken")
	}
}

func TestCommonWordsNeverBecomeNames(t *testing.T) {
	commonLabels := map[string]string{"Abandoned": "PERSON", "Adorable": "PERSON", "Afraid": "PERSON", "Active": "PERSON", "ACCEPTABLE": "PERSON"}
	for name, test := range map[string]struct {
		got, want []string
	}{
		"the rules refuse sentence-initial common words":                        {candidateNames(scanCandidates(paragraphsOf(t, commonWordParagraphs...))), nil},
		"the model's tag does not make a common word a name":                    {spacyNames(t, commonLabels, commonWordParagraphs...), nil},
		"the rules refuse a common word capitalised mid-sentence twice":         {candidateNames(scanCandidates(paragraphsOf(t, hopeParagraphs...))), nil},
		"the rules refuse an adjective-looking word":                            {candidateNames(scanCandidates(paragraphsOf(t, "They fled Blazing near Hollowed at dusk.", "Ada left Blazing near Hollowed behind."))), nil},
		"a tag and two mid-sentence mentions make a common-looking word a name": {spacyNames(t, map[string]string{"Hope": "PERSON"}, hopeParagraphs...), []string{"Hope", "Hope"}},
		"a tag and one mid-sentence mention do not":                             {spacyNames(t, map[string]string{"Hope": "PERSON"}, "They loved Hope dearly.", "Without hope there is nothing."), nil},
		"a tagged suffix word with two mid-sentence mentions is a name":         {spacyNames(t, map[string]string{"Blazing": "GPE"}, "They fled Blazing at dusk.", "Ada left Blazing behind."), []string{"Blazing", "Blazing"}},
		"a tagged suffix word with one is not":                                  {spacyNames(t, map[string]string{"Blazing": "GPE"}, "They fled Blazing at dusk."), nil},
		"a tagged stopword is dropped":                                          {spacyNames(t, map[string]string{"They": "PERSON"}, "Ada saw them. They ran. They hid."), nil},
		"a tag made only of filler is dropped":                                  {spacyNames(t, map[string]string{"The": "ORG", "of the": "ORG"}, "The end of the road."), nil},
		"a tag loses its leading filler":                                        {spacyNames(t, map[string]string{"About S-Dawn": "GPE"}, "They talked About S-Dawn all night."), []string{"S-Dawn"}},
		"the rules drop a single word capitalised mid-sentence once":            {candidateNames(scanCandidates(paragraphsOf(t, "They sailed to Dawnspire.", "Dawnspire fell. Dawnspire burned."))), nil},
	} {
		if !slices.Equal(test.got, test.want) && (len(test.got) != 0 || len(test.want) != 0) {
			t.Errorf("%s: %v, want %v", name, test.got, test.want)
		}
	}
	commonBook, _ := buildWith(t, book(t, "", commonWordParagraphs...), nil)
	if got := builtNames(commonBook); len(got) != 0 {
		t.Errorf("common words built into %v", got)
	}
	taggedBook, _ := buildWith(t, book(t, "", commonWordParagraphs...), &stubModel{labels: commonLabels})
	if got := builtNames(taggedBook); len(got) != 0 {
		t.Errorf("tagged common words built into %v", got)
	}
}

func TestAModelTagLosesItsFillerAndKeepsItsOffsets(t *testing.T) {
	text := "They talked About S-Dawn all night."
	paragraphs := paragraphsOf(t, text)
	candidates := spacyCandidates(paragraphs, (&stubModel{labels: map[string]string{"About S-Dawn": "GPE"}}).spansFor(paragraphs))
	if len(candidates) != 1 || string([]rune(text)[candidates[0].start:candidates[0].end]) != "S-Dawn" || candidates[0].label != "GPE" {
		t.Fatalf("candidates %+v", candidates)
	}
}

func TestTheRulesStripFillerAndStopwordsFromNames(t *testing.T) {
	got := candidateNames(scanCandidates(paragraphsOf(t, "He asked About S-Dawn twice.", "Then Ada Voss arrived. With Ada Voss came rain.")))
	for _, name := range []string{"About S-Dawn", "Then Ada Voss", "With Ada Voss"} {
		if slices.Contains(got, name) {
			t.Fatalf("%q in %v", name, got)
		}
	}
	if ada := slices.DeleteFunc(slices.Clone(got), func(name string) bool { return !strings.HasPrefix(name, "Ada") }); !slices.Equal(ada, []string{"Ada Voss", "Ada Voss"}) {
		t.Fatalf("names %v", got)
	}
}

func TestALoneUnexplainedWordNeedsReview(t *testing.T) {
	document, _ := buildWith(t, book(t, "", "S-Dawn said nothing for a long while.", "They talked About S-Dawn all night.", "Nobody trusted S-Dawn, and S-Dawn looked away."), nil)
	entry := byName(document)["S-Dawn"]
	if entry == nil || entry["category"] != categoryNeedsReview || entry["review_state"] != "needs review" || byName(document)["About S-Dawn"] != nil {
		t.Fatalf("entries %v", builtNames(document))
	}
}

func TestClassifyReadsTheNameAndWhatIsNearOnlyForLongerNames(t *testing.T) {
	for name, want := range map[string]string{"Zyx": categoryNeedsReview, "Zyx Qor": categoryCharacter} {
		lowered := []rune(compare.PyLower(name + " said hello."))
		if got := classify(ruleCandidate{name: name, end: len([]rune(name))}, lowered); got != want {
			t.Errorf("%s: %s, want %s", name, got, want)
		}
	}
	for name, want := range map[string]string{"Captain Arelian": categoryCharacter, "Silver River": categoryPlace, "Council of Ash": categoryOrganization} {
		if got := classify(ruleCandidate{name: name, end: len(name)}, []rune(compare.PyLower(name))); got != want {
			t.Errorf("%s: %s, want %s", name, got, want)
		}
	}
	for label, want := range map[string]string{"PERSON": categoryCharacter, "GPE": categoryPlace, "LOC": categoryPlace, "FAC": categoryPlace, "ORG": categoryOrganization} {
		if got := classify(ruleCandidate{name: "Zyx", label: label}, nil); got != want {
			t.Errorf("%s: %s, want %s", label, got, want)
		}
	}
}

func TestANeedsReviewNameNeedsThreeMentions(t *testing.T) {
	two := []string{"Ada met Zyx Qor there.", "Later Ada left Zyx Qor alone."}
	if document, _ := buildWith(t, book(t, "", two...), nil); len(builtNames(document)) != 0 {
		t.Fatalf("two mentions built %v", builtNames(document))
	}
	document, _ := buildWith(t, book(t, "", append(two, "Ada forgot Zyx Qor entirely.")...), nil)
	entries := entitiesIn(document)
	if len(entries) != 1 || entries[0]["canonical_name"] != "Zyx Qor" || entries[0]["category"] != categoryNeedsReview || entries[0]["occurrence_count"] != 3.0 {
		t.Fatalf("entries %v", entries)
	}
}

func TestRealNamesSurviveWithTheirCategories(t *testing.T) {
	document, _ := buildWith(t, book(t, "", nameParagraphs...), nil)
	entries := byName(document)
	if got := builtNames(document); len(got) != 3 || entries["Captain Arelian"] == nil || entries["Council of Ash"] == nil || entries["Dawnspire"] == nil {
		t.Fatalf("entries %v", got)
	}
	if entries["Captain Arelian"]["category"] != categoryCharacter || entries["Council of Ash"]["category"] != categoryOrganization || entries["Dawnspire"]["occurrence_count"] != 4.0 {
		t.Fatalf("entries %v", entries)
	}
	if aliases := entries["Captain Arelian"]["aliases"].([]any); len(aliases) != 1 || aliases[0].(map[string]any)["text"] != "Arelian" {
		t.Fatalf("aliases %v", aliases)
	}
	labels := map[string]string{"Captain Arelian": "PERSON", "Arelian": "PERSON", "Council of Ash": "ORG", "Dawnspire": "GPE"}
	tagged, _ := buildWith(t, book(t, "", nameParagraphs...), &stubModel{labels: labels})
	got := map[string]any{}
	for name, entry := range byName(tagged) {
		got[name] = entry["category"]
	}
	if len(got) != 3 || got["Captain Arelian"] != categoryCharacter || got["Council of Ash"] != categoryOrganization || got["Dawnspire"] != categoryPlace {
		t.Fatalf("categories %v", got)
	}
}

func TestIsoformatAndThousandsAreWhatPythonPrints(t *testing.T) {
	for at, want := range map[time.Time]string{
		time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC):                    "2026-10-25T12:00:00+00:00",
		time.Date(2026, 10, 25, 12, 0, 0, 1000, time.UTC):                 "2026-10-25T12:00:00.000001+00:00",
		time.Date(2026, 10, 25, 12, 0, 0, 999999999, time.UTC):            "2026-10-25T12:00:00.999999+00:00",
		time.Date(2026, 10, 25, 14, 0, 0, 500, time.FixedZone("x", 7200)): "2026-10-25T12:00:00+00:00",
	} {
		if got := isoformat(at); got != want {
			t.Errorf("%v: %s, want %s", at, got, want)
		}
	}
	for n, want := range map[int]string{0: "0", 999: "999", 1000: "1,000", 1234567: "1,234,567", -1234: "-1,234"} {
		if got := thousands(n); got != want {
			t.Errorf("%d: %s, want %s", n, got, want)
		}
	}
	if got := asciiJSON("Zoë \"😀\"\n\x7f"); got != `"Zo\u00eb \"\ud83d\ude00\"\n\u007f"` {
		t.Errorf("asciiJSON %s", got)
	}
}

// TestCleaningComparesAsPythonsIgnoreCaseDoes pins what the language model's text can hold and the rules' cannot, checked against
// Python 3.12: the possessive's s and the filler words compare as re.IGNORECASE does (ſ is an s, İ an i), and $ matches before a final
// line break.
func TestCleaningComparesAsPythonsIgnoreCaseDoes(t *testing.T) {
	for in, want := range map[string]string{"Ada'ſ": "Ada", "Ada's\n": "Ada\n", "Ada'S": "Ada", "Ada’s": "Ada", "Adas": "Adas", "'s": ""} {
		if got := withoutPossessive(in); got != want {
			t.Errorf("%q: %q, want %q", in, got, want)
		}
	}
	for in, want := range map[string]string{"ſhe Ada": "Ada", "thİs Ada": "Ada", "About  The\tAda": "Ada", "Thea Ross": "Thea Ross"} {
		if got, _, ok := cleanEntityText([]rune(in), 0); !ok || string(got) != want {
			t.Errorf("%q: %q %v, want %q", in, string(got), ok, want)
		}
	}
}

// TestALongerNameOfOneTitleWordTakesTheShorterOne is build_entities' fold, which (unlike the rules' suggestions) asks only that the
// longer name's first word be a title, checked against the sidecar's build: Ord folds into Lord.
func TestALongerNameOfOneTitleWordTakesTheShorterOne(t *testing.T) {
	document, _ := buildWith(t, book(t, "", "We met Lord and Lord again. Then Ord came, and Ord left, and Ord sat."), &stubModel{labels: map[string]string{"Lord": "PERSON", "Ord": "PERSON"}})
	entries := entitiesIn(document)
	if len(entries) != 1 || entries[0]["canonical_name"] != "Lord" || entries[0]["occurrence_count"] != 5.0 || entries[0]["aliases"].([]any)[0].(map[string]any)["text"] != "Ord" {
		t.Fatalf("entries %v", entries)
	}
}
