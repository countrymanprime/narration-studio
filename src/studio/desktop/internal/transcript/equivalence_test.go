package transcript

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"desktop/internal/findings"
)

func equivalencesFile(t *testing.T, service *Service) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(service.config.Project, "TranscriptCompare", "equivalences.csv"))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func groupLines(text string) []string {
	var lines []string
	for _, line := range strings.Split(text, "\n") {
		if line != "" && !strings.HasPrefix(line, "#") {
			lines = append(lines, line)
		}
	}
	return lines
}

// #2736: a pair the file already holds, in either order or case, is not written again, so a second press (or a retry after
// no answer) leaves the file as it was.
func TestAddEquivalencePairDoesNotRepeatAGroupTheFileHolds(t *testing.T) {
	service, _ := testService(t)
	if message, err := service.AddEquivalencePair("Alice", "Alyss"); err != nil || message != "Added equivalence: Alice = Alyss" {
		t.Fatalf("first = %q, %v", message, err)
	}
	for _, pair := range [][2]string{{"Alice", "Alyss"}, {"alyss", "ALICE"}} {
		message, err := service.AddEquivalencePair(pair[0], pair[1])
		if err != nil || message != "Already treated as the same: "+pair[0]+" = "+pair[1] {
			t.Fatalf("again %v = %q, %v", pair, message, err)
		}
	}
	if lines := groupLines(equivalencesFile(t, service)); len(lines) != 1 || lines[0] != "Alice, Alyss" {
		t.Fatalf("lines = %#v", lines)
	}
}

// A group the narrator wrote by hand with more words counts too: both words in it means they are already the same.
func TestAddEquivalencePairReadsGroupsWrittenByHand(t *testing.T) {
	service, _ := testService(t)
	path := filepath.Join(service.config.Project, "TranscriptCompare", "equivalences.csv")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("# mine\r\ncolour, color, colur # spellings\r\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if message, err := service.AddEquivalencePair("Color", "colur"); err != nil || !strings.HasPrefix(message, "Already treated as the same") {
		t.Fatalf("hand group = %q, %v", message, err)
	}
	if message, err := service.AddEquivalencePair("colour", "kolor"); err != nil || message != "Added equivalence: colour = kolor" {
		t.Fatalf("new pair = %q, %v", message, err)
	}
}

// Presses at the same moment write one line between them.
func TestAddEquivalencePairWritesOnceUnderConcurrentPresses(t *testing.T) {
	service, _ := testService(t)
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := service.AddEquivalencePair("Dinah", "Dina"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if lines := groupLines(equivalencesFile(t, service)); len(lines) != 1 {
		t.Fatalf("lines = %#v", lines)
	}
}

// A word the file's format would split or cut (a comma starts another word, # a comment) is refused, not written broken.
func TestAddEquivalencePairRefusesWordsTheFileCannotHold(t *testing.T) {
	service, _ := testService(t)
	for _, pair := range [][2]string{{"a,b", "ab"}, {"ab", "a#b"}, {"", "x"}, {"two words", "x"}, {"x", "y\tz"}} {
		if _, err := service.AddEquivalencePair(pair[0], pair[1]); err == nil {
			t.Fatalf("%q was accepted", pair)
		}
	}
	if _, err := os.Stat(filepath.Join(service.config.Project, "TranscriptCompare", "equivalences.csv")); !os.IsNotExist(err) {
		t.Fatalf("a refused pair created the file: %v", err)
	}
}

func misreadFinding(expected, recorded string) findings.Finding {
	return findings.Finding{
		Analyzer: AnalyzerName, Category: findings.CategoryTranscriptDiscrepancy,
		Manuscript: &findings.Manuscript{Expected: expected, Recorded: recorded},
		Evidence:   map[string]any{"kind": "MISREAD"},
	}
}

// AddEquivalence takes a Proof note's finding id as well as a row id of this session's run, and the note's decision is left as it was.
func TestAddEquivalenceByFindingID(t *testing.T) {
	service, _ := testService(t)
	store := findings.NewStore(service.config.Project)
	service.SetFindings(store, nil)
	note := misreadFinding("Dinah", "Dina")
	note.SchemaVersion, note.ID, note.Severity = findings.SchemaVersion, "note-1", findings.SeverityWarning
	note.Review = findings.ReviewState{Status: findings.StatusAccepted}
	several := misreadFinding("pink eyes", "pale eyes")
	several.SchemaVersion, several.ID, several.Severity = findings.SchemaVersion, "note-2", findings.SeverityWarning
	several.Review = findings.ReviewState{Status: findings.StatusUnreviewed}
	if _, err := store.SaveAnalyzerFindings(AnalyzerName, "chapter-1", []findings.Finding{note, several}); err != nil {
		t.Fatal(err)
	}
	if message, err := service.AddEquivalence("note-1"); err != nil || message != "Added equivalence: Dinah = Dina" {
		t.Fatalf("by finding id = %q, %v", message, err)
	}
	if _, err := service.AddEquivalence("note-2"); err == nil || err.Error() != errNotOneWordMisread.Error() {
		t.Fatalf("several words = %v", err)
	}
	if _, err := service.AddEquivalence("gone"); err == nil || err.Error() != errNotOneWordMisread.Error() {
		t.Fatalf("unknown id = %v", err)
	}
	if lines := groupLines(equivalencesFile(t, service)); len(lines) != 1 || lines[0] != "Dinah, Dina" {
		t.Fatalf("lines = %#v", lines)
	}
	if after, _, _ := store.Get("note-1"); after.Review.Status != findings.StatusAccepted {
		t.Fatalf("the note's decision changed: %q", after.Review.Status)
	}
}

// The finding-id form (#2736): Proof's notes outlive this session's compare rows, so the binding reads the words off the note.
func TestOneWordMisread(t *testing.T) {
	doc, audio, ok := OneWordMisread(misreadFinding("Dinah", "Dina"))
	if !ok || doc != "Dinah" || audio != "Dina" {
		t.Fatalf("one-word misread = %q %q %v", doc, audio, ok)
	}
	other := misreadFinding("Dinah", "Dina")
	other.Analyzer = "manuscript-teleprompter"
	skipped := misreadFinding("Dinah", "")
	skipped.Evidence["kind"] = "SKIPPED"
	pickup := misreadFinding("Dinah", "Dina")
	pickup.Category = findings.CategoryPickup
	noManuscript := misreadFinding("Dinah", "Dina")
	noManuscript.Manuscript = nil
	for name, finding := range map[string]findings.Finding{
		"several words":  misreadFinding("pink eyes", "pale eyes"),
		"nothing heard":  misreadFinding("Dinah", ""),
		"another check":  other,
		"a skip":         skipped,
		"a pickup":       pickup,
		"no manuscript":  noManuscript,
		"no kind":        {Analyzer: AnalyzerName, Category: findings.CategoryTranscriptDiscrepancy, Manuscript: &findings.Manuscript{Expected: "a", Recorded: "b"}},
		"newline inside": misreadFinding("a\nb", "ab"),
	} {
		if _, _, ok := OneWordMisread(finding); ok {
			t.Errorf("%s: accepted", name)
		}
	}
}
