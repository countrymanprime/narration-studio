package recordingcoverage

import (
	"os"
	"path/filepath"
	"testing"

	"desktop/internal/persist"
)

// Run removes the results file of an earlier run before anything else, and reports it as a change: a read the host
// shares between callers must not answer from the file after it is gone (docs/architecture/host-binding-concurrency.md).
func TestRunReportsTheRemovalOfTheOldResultsFile(t *testing.T) {
	out := filepath.Join(t.TempDir(), "results.json")
	if err := os.WriteFile(out, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	before := persist.Generation()
	if err := Run(Request{Out: out, Params: AlignmentParams{MaxMisreadRun: -1}}); err == nil {
		t.Fatal("Run accepted parameters that are not valid")
	}
	if _, err := os.Stat(out); !os.IsNotExist(err) {
		t.Fatalf("the old results file is still there: %v", err)
	}
	if persist.Generation() == before {
		t.Fatal("the removal did not advance the host's write generation")
	}
}
