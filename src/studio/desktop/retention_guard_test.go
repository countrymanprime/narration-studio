package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// #3816: the ledger retention rule and the orphan sweep are in the tree and nothing calls them, so the app deletes no
// derived file until the owner has answered the trigger and the bounds. The pull request that wires a caller removes the
// matching entry here on purpose, and adds the threat-model row.
func TestNothingCallsTheDeletingRetentionCode(t *testing.T) {
	// Each name with the one file that defines (and, for the coverage service, composes) it.
	definedIn := map[string]string{
		"Retain(":             "internal/evidence/ledger.go",
		"RemoveStoredResult(": "internal/coverage/results.go",
		"SweepOrphanResults(": "internal/coverage/results.go",
		"RemoveRegular(":      "internal/persist/remove.go",
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
		for name, home := range definedIn {
			allowed := slash == home || name == "RemoveRegular(" && (slash == "internal/coverage/results.go" || slash == "internal/evidence/ledger.go")
			if !allowed && strings.Contains(string(text), name) {
				t.Errorf("%s calls %s: the retention code deletes derived files and waits for the owner's answers on #3816 before anything calls it", slash, strings.TrimSuffix(name, "("))
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
