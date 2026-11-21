package guide

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// The stand-in sidecar reads the host's words once, as the real one does, and reports a file it cannot read: it used to treat a failed
// read as an empty list, so the host saw "an answer that could not be read" and the cause was lost.
func TestReadWordsFileReportsWhatItCannotRead(t *testing.T) {
	dir := t.TempDir()
	whole := filepath.Join(dir, "whole.json")
	if err := os.WriteFile(whole, []byte(`["Ada","Dawnspire"]`), 0o600); err != nil {
		t.Fatal(err)
	}
	if got, err := readWordsFile(whole); err != nil || !reflect.DeepEqual(got, []string{"Ada", "Dawnspire"}) {
		t.Fatalf("a whole list: got %v, %v", got, err)
	}
	cut := filepath.Join(dir, "cut.json")
	if err := os.WriteFile(cut, []byte(`["Ada"`), 0o600); err != nil {
		t.Fatal(err)
	}
	for name, path := range map[string]string{"missing": filepath.Join(dir, "none.json"), "cut short": cut} {
		if got, err := readWordsFile(path); err == nil {
			t.Errorf("%s: got %v with no error; want one", name, got)
		}
	}
}
