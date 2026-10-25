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

	"desktop/internal/brand"
	"desktop/internal/compare"
	"desktop/internal/contractfile"
	"desktop/internal/settings"
)

// The build's goldens: the contract file of its entries, the Alice build's hash, and the guide-cues builds, each held to the bytes the
// sidecar's build wrote.

// contractParagraphs are test_contract_goldens.py's paragraphs, which had no ids: make_candidate gave each its legacy ids.
var contractParagraphs = []string{
	"Captain Arelian said the Council of Ash would meet in Dawnspire.",
	"Arelian was a veteran navigator, brave and wary before the council arrived.",
	"Later they saw Dawnspire burning. The road to Dawnspire was long.",
	"Everyone knew Dawnspire well.",
}

// TestTheBuiltEntriesMatchTheContractFile writes guide-entities-sidecar.json, which the sidecar's build wrote before (its rules-only
// entries for these paragraphs, with the pronunciations its dictionaries gave): the host reads it back (contract_test.go) and the UI's
// schema validates it.
func TestTheBuiltEntriesMatchTheContractFile(t *testing.T) {
	paragraphs := make([]ruleParagraph, len(contractParagraphs))
	for i, text := range contractParagraphs {
		paragraphs[i] = ruleParagraph{chapter: "Chapter 1", chapterID: fmt.Sprintf("legacy-chapter-%d", i), paragraphID: fmt.Sprintf("legacy-paragraph-%d", i), text: []rune(text)}
	}
	sorted, made := buildEntities(paragraphs, ruleCandidates(paragraphs))
	said := map[string]*pyObject{
		"Council of Ash": newPyObject("ipa", "k aʊ n s ʌ l ʌ v æ ʃ", "source", "cmu", "confidence", "medium"),
	}
	for _, entity := range made {
		for i, holder := range entity.holders {
			value, ok := said[entity.words[i]]
			if !ok {
				value = newPyObject("ipa", "", "source", "not generated", "confidence", "unknown")
			}
			holder.set("pronunciation", value)
		}
	}
	entries := make([]any, len(sorted))
	for i, entity := range sorted {
		entries[i] = entity.object
	}
	var decoded []map[string]any
	if err := json.Unmarshal([]byte(pyDumps(entries)), &decoded); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "guide-entities-sidecar", decoded)
}

// TestTheAliceStoryBibleIsByteIdentical is test_build_golden.py's: the Story Bible a rules-only build writes for tests/fixtures/alice.md
// (each chapter of it, a paragraph per line), with no pronunciations, pinned by the SHA-256 of the file without its time and
// manuscript path, sorted. It has not moved since the sidecar's build wrote it.
func TestTheAliceStoryBibleIsByteIdentical(t *testing.T) {
	var chapters []testChapter
	for _, line := range strings.Split(readText(t, filepath.Join(repoRoot(t), "tests", "fixtures", "alice.md")), "\n") {
		line = strings.TrimRight(line, "\r")
		switch {
		case strings.HasPrefix(line, "# Chapter"):
			chapters = append(chapters, testChapter{id: line[2:]})
		case len(chapters) > 0 && compare.PyStrip(line) != "" && !strings.HasPrefix(line, "#"):
			chapters[len(chapters)-1].paragraphs = append(chapters[len(chapters)-1].paragraphs, compare.PyStrip(line))
		}
	}
	project := t.TempDir()
	s := New(project, "unused", "", settings.New(project, project), nil)
	if err := os.MkdirAll(filepath.Dir(s.manuscript()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(s.manuscript(), []byte(aliceManuscript(chapters)), 0o600); err != nil {
		t.Fatal(err)
	}
	s.buildModel = emptyPronunciations{}
	if _, _, err := s.build(context.Background(), &buildRun{}, RulesOnly, false); err != nil {
		t.Fatal(err)
	}
	written, err := pyLoads(readText(t, s.guidePath()))
	if err != nil {
		t.Fatal(err)
	}
	document := written.(*pyObject)
	document.keys = slices.DeleteFunc(document.keys, func(key string) bool { return key == "generated_at" })
	source := document.values["source"].(*pyObject)
	source.keys = slices.DeleteFunc(source.keys, func(key string) bool { return key == "path" })
	sum := sha256.Sum256([]byte(pyDumps(sortedKeys(document))))
	if got := hex.EncodeToString(sum[:]); got != "d3d875c914434f57201f04559fef776e3113ceac67d1f6028c47364bb5f32731" {
		t.Fatalf("the Alice Story Bible hashes to %s", got)
	}
}

// emptyPronunciations answers every name with {}, as test_build_golden.py's stub did.
type emptyPronunciations struct{}

func (e emptyPronunciations) entities(ctx context.Context, _, _, log string, _ []ruleParagraph, names func([][]entitySpan) []string) ([]*pyObject, error) {
	return e.pronunciations(ctx, names(nil), log)
}

func (emptyPronunciations) pronunciations(_ context.Context, words []string, _ string) ([]*pyObject, error) {
	values := make([]*pyObject, len(words))
	for i := range words {
		values[i] = newPyObject()
	}
	return values, nil
}

// sortedKeys is the value with every object's keys in code point order, as json.dumps(sort_keys=True) writes them.
func sortedKeys(value any) any {
	switch v := value.(type) {
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = sortedKeys(item)
		}
		return out
	case *pyObject:
		out := newPyObject()
		for _, key := range slices.Sorted(slices.Values(v.keys)) {
			out.set(key, sortedKeys(v.values[key]))
		}
		return out
	}
	return value
}

// aliceManuscript is test_build_golden.py's _write_manuscript: json.dumps of the canonical manuscript, with ASCII escapes.
func aliceManuscript(chapters []testChapter) string {
	var rows, paragraphs []string
	index := 0
	for number, chapter := range chapters {
		id := fmt.Sprintf("c-%04d", number+1)
		words := 0
		for _, text := range chapter.paragraphs {
			words += len(compare.PySplit(text))
		}
		rows = append(rows, fmt.Sprintf(`{"id": %s, "title": %s, "subtitle": null, "index": %d, "wordCount": %d, "sections": []}`, asciiJSON(id), asciiJSON(chapter.id), number, words))
		for _, text := range chapter.paragraphs {
			index++
			paragraphs = append(paragraphs, fmt.Sprintf(`{"id": %s, "index": %d, "chapterId": %s, "chapterTitle": %s, "sectionId": null, "text": %s, "sourceIndex": %d}`,
				asciiJSON(fmt.Sprintf("p-%06d", index)), index-1, asciiJSON(id), asciiJSON(chapter.id), asciiJSON(text), index-1))
		}
	}
	return `{"schemaVersion": 1, "documentId": "test-document", "importedAt": "2026-01-01T00:00:00+00:00", "importer": {"format": "markdown", "version": 1}, ` +
		`"source": {"fileName": "fixture.md", "sha256": "` + strings.Repeat("0", 64) + `", "storedPath": ` + asciiJSON(brand.ProjectFolder+"/manuscript/sources/fixture.md") + `}, ` +
		`"chapters": [` + strings.Join(rows, ", ") + `], "paragraphs": [` + strings.Join(paragraphs, ", ") + `]}`
}

// TestEveryRecordedBuildWritesTheFileThatKeepsTheCues replays the builds of tests/fixtures/guide-cues (frozen) as test_build_golden.py
// did: the file each writes, keeping the previous dialogue cues, with no pronunciations, is the one the sidecar wrote (cut), byte for byte,
// and a build that failed there fails here. TestBuildThenRefreshIsTodaysBuild refreshes each of these files.
func TestEveryRecordedBuildWritesTheFileThatKeepsTheCues(t *testing.T) {
	root := repoRoot(t)
	folder := filepath.Join(root, "tests", "fixtures", "guide-cues")
	cases := readJSONLines[buildCase](t, filepath.Join(folder, "builds.jsonl"))
	results := readJSONFile[[]buildResult](t, filepath.Join(folder, "builds.golden.json"))
	written := 0
	for i, c := range cases {
		want := results[i]
		parity := buildParityCase{Name: c.Name, CueBuild: c.Name}
		s, guidePath := writeBuildCase(t, root, parity, nil, map[string]buildCase{c.Name: c})
		s.clock = func() time.Time { return time.Date(2026, 10, 25, 12, 0, 0, 123456000, time.UTC) }
		s.buildModel = emptyPronunciations{}
		_, _, err := s.build(context.Background(), &buildRun{}, RulesOnly, false)
		if want.CutExit != 0 {
			if err == nil {
				t.Errorf("%s: built where the sidecar failed", c.Name)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: %v", c.Name, err)
			continue
		}
		got := strings.ReplaceAll(readText(t, guidePath), pyLineEnd, "\n")
		if untied(t, got) != untied(t, *want.Cut) {
			t.Errorf("%s: the file differs from the sidecar's", c.Name)
		}
		written++
	}
	if written < 140 {
		t.Errorf("%d builds written", written)
	}
}

// untied is test_build_golden.py's _untied: the file with vocabulary_candidates in code point order where two fold to the same case,
// whose order in Python was its set's, which changed with the hash seed.
func untied(t *testing.T, text string) string {
	t.Helper()
	value, err := pyLoads(text)
	if err != nil {
		t.Fatal(err)
	}
	document := value.(*pyObject)
	words, _ := document.values["vocabulary_candidates"].([]any)
	folded := map[string]bool{}
	for _, word := range words {
		folded[foldCase(word.(string))] = true
	}
	if len(folded) == len(words) {
		return text
	}
	sorted := slices.Clone(words)
	slices.SortFunc(sorted, func(a, b any) int { return strings.Compare(a.(string), b.(string)) })
	document.values["vocabulary_candidates"] = sorted
	return pyDumps(document) + "\n"
}
