package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// #3816: the code that deletes derived files is called only from the retention steps the host composes (retention_ledger.go and the
// steps wired after it), so every automatic delete has one place to review and the threat-model row (7c) to match. A new caller is
// added here on purpose, with its guard tests.
func TestOnlyTheRetentionStepsCallTheDeletingRetentionCode(t *testing.T) {
	// The deleting code is reached by a selector (a call or a method value), never by name alone, so a reference taken as a value is seen too.
	reference := regexp.MustCompile(`\.(Retain|RemoveStoredResult|SweepOrphanResults)\b|\bRemoveRegular\b`)
	// The files that define it, and the retention step files allowed to name it.
	defining := map[string]bool{
		"internal/evidence/ledger.go": true, "internal/coverage/results.go": true, "internal/persist/remove.go": true,
	}
	steps := map[string]bool{"retention_ledger.go": true, "retention_host.go": true}
	err := filepath.WalkDir(".", func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		slash := filepath.ToSlash(path) // Windows walks with backslashes
		if entry.IsDir() {
			if path != "." && (strings.HasPrefix(entry.Name(), ".") || entry.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(slash, ".go") || strings.HasSuffix(slash, "_test.go") {
			return nil
		}
		text, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, found := range reference.FindAllString(withoutCommentLines(string(text)), -1) {
			// RemoveRegular is also how the two stores delete their own files; those are the defining files.
			if !defining[slash] && !steps[slash] {
				t.Errorf("%s names %s: the code that deletes derived files is called only from the retention steps (see the test's comment)", slash, strings.TrimPrefix(found, "."))
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// The guard sees a method value taken from an unlisted file, which a call-text match did not.
func TestTheRetentionGuardSeesAMethodValue(t *testing.T) {
	reference := regexp.MustCompile(`\.(Retain|RemoveStoredResult|SweepOrphanResults)\b|\bRemoveRegular\b`)
	for _, source := range []string{"sweep := s.SweepOrphanResults; sweep()", "l.ledger.Retain(keys, nil, nil)", "persist.RemoveRegular(root, name)", "run(checks.RemoveStoredResult)"} {
		if !reference.MatchString(source) {
			t.Errorf("the guard does not see %q", source)
		}
	}
	if reference.MatchString("ledgerRetentionKeys and retentionOff") {
		t.Error("the guard flags a name that only contains the word")
	}
}

// withoutCommentLines is source without the lines that are only a comment, which may name the code without calling it.
func withoutCommentLines(source string) string {
	var kept []string
	for _, line := range strings.Split(source, "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "//") {
			kept = append(kept, line)
		}
	}
	return strings.Join(kept, "\n")
}
