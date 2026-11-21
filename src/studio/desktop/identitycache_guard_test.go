package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// #3814: only the recording check holds an evidence.IdentityCache.
func TestOnlyTheRecordingCheckHoldsAnIdentityCache(t *testing.T) {
	err := filepath.WalkDir(".", func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		// Windows walks with backslashes: every comparison below is on the slash form.
		slash := filepath.ToSlash(path)
		if entry.IsDir() {
			if slash == "internal/coverage" || slash == "internal/evidence" || path != "." && (strings.HasPrefix(entry.Name(), ".") || entry.Name() == "node_modules") {
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
		if strings.Contains(string(text), "IdentityCache") {
			t.Errorf("%s mentions IdentityCache: only the recording check holds one. Other readers sample the file on every read (evidence.Identify), because an unchanged size and modification time is not accepted as proof of unchanged content outside that sweep, and an entry another reader stored would be trusted by it", slash)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
