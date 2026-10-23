package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestADroppedManuscriptBeginsAnImportAndTheEventNamesNoPath(t *testing.T) {
	host := NewHost()
	path := filepath.Join(t.TempDir(), "My Book.md")
	if err := os.WriteFile(path, []byte("# One\n\nText."), 0o600); err != nil {
		t.Fatal(err)
	}
	payload := host.beginDropped([]string{path})
	jobID, _ := payload["jobId"].(string)
	if jobID == "" || payload["name"] != "My Book.md" {
		t.Fatalf("payload = %v, want a job id and the file's name", payload)
	}
	if _, has := payload["message"]; has {
		t.Errorf("a begun import carries no message: %v", payload)
	}
	for key, value := range payload {
		if text, ok := value.(string); ok && strings.Contains(text, filepath.Dir(path)) {
			t.Errorf("%s = %q leaks the path to the page", key, text)
		}
	}
	job, err := host.manuscript.State(jobID)
	if err != nil || job.Source != path {
		t.Fatalf("job = %+v, %v; want the import begun on the dropped file", job, err)
	}
}

func TestARefusedDropBeginsNothingAndSaysWhy(t *testing.T) {
	host := NewHost()
	pdf := filepath.Join(t.TempDir(), "book.pdf")
	if err := os.WriteFile(pdf, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	for name, paths := range map[string][]string{"unsupported": {pdf}, "none": nil, "two": {pdf, pdf}} {
		payload := host.beginDropped(paths)
		message, _ := payload["message"].(string)
		if message == "" || payload["jobId"] != nil {
			t.Errorf("%s: payload = %v, want only a message", name, payload)
		}
	}
}
