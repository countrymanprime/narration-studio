package main

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// #3816: the code that deletes derived files is called only from the retention steps the host composes (retention_ledger.go and the
// steps wired after it), so every automatic delete has one place to review and the threat-model row (7c) to match. A new caller is
// added here on purpose, with its guard tests.
func TestOnlyTheRetentionStepsCallTheDeletingRetentionCode(t *testing.T) {
	// Each name with the files that define it and the retention step files allowed to call it.
	definedIn := map[string][]string{
		"Retain(":             {"internal/evidence/ledger.go", "retention_ledger.go"},
		"RemoveStoredResult(": {"internal/coverage/results.go"},
		"SweepOrphanResults(": {"internal/coverage/results.go"},
		"RemoveRegular(":      {"internal/persist/remove.go"},
	}
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
		for name, homes := range definedIn {
			allowed := slices.Contains(homes, slash) || name == "RemoveRegular(" && (slash == "internal/coverage/results.go" || slash == "internal/evidence/ledger.go")
			if !allowed && strings.Contains(string(text), name) {
				t.Errorf("%s calls %s: the code that deletes derived files is called only from the retention steps (see the test's comment)", slash, strings.TrimSuffix(name, "("))
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
