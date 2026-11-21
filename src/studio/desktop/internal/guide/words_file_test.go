package guide

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

// The stand-in sidecar reads the host's words with a retry, and says so when it cannot: it used to treat a failed read as an empty list.
func TestReadWordsFileWaitsForAReadableList(t *testing.T) {
	path := filepath.Join(t.TempDir(), "words.json")
	if err := os.WriteFile(path, []byte("[\"Ada\""), 0o600); err != nil { // a list cut short
		t.Fatal(err)
	}
	go func() {
		time.Sleep(50 * time.Millisecond)
		_ = os.WriteFile(path, []byte(`["Ada","Dawnspire"]`), 0o600)
	}()
	got, err := readWordsFile(path, 10*time.Second)
	if err != nil || !reflect.DeepEqual(got, []string{"Ada", "Dawnspire"}) {
		t.Fatalf("got %v, %v; want the two words once the file is whole", got, err)
	}
}

func TestReadWordsFileSaysWhenTheListNeverComes(t *testing.T) {
	for name, content := range map[string]string{"missing": "", "not a list": "{"} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "words.json")
			if content != "" {
				if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if got, err := readWordsFile(path, 30*time.Millisecond); err == nil {
				t.Fatalf("got %v with no error; want one", got)
			}
		})
	}
}
