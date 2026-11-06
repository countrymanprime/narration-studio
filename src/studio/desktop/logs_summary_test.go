package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLogsSummaryPrintsEventCountsAndNoFieldValues(t *testing.T) {
	path := filepath.Join(t.TempDir(), "trace.jsonl")
	lines := `{"ts":"2026-11-03T10:00:00.000Z","seq":1,"level":"warn","sess":"ab12","area":"daw","event":"dispatch_error","err":"timeout"}` + "\n" +
		`{"ts":"2026-11-03T10:00:01.000Z","seq":2,"level":"info","sess":"ab12","area":"daw","event":"link_facts","chapter":"zelda-canary"}` + "\n"
	if err := os.WriteFile(path, []byte(lines), 0o600); err != nil {
		t.Fatal(err)
	}
	var out, errOut bytes.Buffer
	code, handled := runEarlyModes([]string{"--logs-summary", path}, nil, &out, &errOut)
	if !handled || code != 0 {
		t.Fatalf("handled=%v code=%d stderr=%q", handled, code, errOut.String())
	}
	text := out.String()
	for _, want := range []string{"2 records", "daw.dispatch_error", "daw.dispatch_error timeout", "warn 1"} {
		if !strings.Contains(text, want) {
			t.Errorf("summary lacks %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "zelda-canary") {
		t.Errorf("summary printed a field value:\n%s", text)
	}
}

func TestLogsSummaryWithNoTraceYetSaysZeroRecords(t *testing.T) {
	var out, errOut bytes.Buffer
	code, _ := runEarlyModes([]string{"--logs-summary", filepath.Join(t.TempDir(), "absent.jsonl")}, nil, &out, &errOut)
	if code != 0 || !strings.Contains(out.String(), "0 records") {
		t.Errorf("code=%d out=%q err=%q", code, out.String(), errOut.String())
	}
}
