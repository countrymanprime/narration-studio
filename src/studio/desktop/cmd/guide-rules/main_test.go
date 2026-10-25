package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestItPrintsOneLinePerSuggestionAndExitsOneOnARefusal(t *testing.T) {
	dir := t.TempDir()
	manuscript := filepath.Join(dir, "manuscript.json")
	_ = os.WriteFile(manuscript, []byte(`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c"}],
		"paragraphs": [{"id": "p-1", "chapterId": "c", "chapterTitle": "One", "text": "“We ride,” Ada said. The Council of Ash met."}]}`), 0o600)
	bible := filepath.Join(dir, "manuscript_guide.json")
	_ = os.WriteFile(bible, []byte(`{"entities": [{"id": "e-ada", "canonical_name": "Ada", "category": "Character"}]}`), 0o600)

	var out, errs strings.Builder
	if code := run([]string{"--manuscript", manuscript, "--guide", bible}, &out, &errs); code != 0 {
		t.Fatalf("exit %d: %s", code, errs.String())
	}
	want := `{"source": "rules", "rule": "new-name", "payload": {"kind": "entry", "name": "Council of Ash", "type": "Organization", "aliases": [], "description": "", "appearsIn": []}, "confidence": null, "quotes": [{"paragraphId": "p-1", "text": "The Council of Ash met."}], "chapterId": "c", "note": "The rules give no score for this."}` + "\n" +
		`{"source": "rules", "rule": "speech-tag", "payload": {"kind": "speaker", "quote": "“We ride,”", "speaker": "Ada"}, "confidence": 0.96, "quotes": [{"paragraphId": "p-1", "text": "“We ride,” Ada said"}], "chapterId": "c"}` + "\n"
	if out.String() != want {
		t.Fatalf("stdout =\n%s\nwant\n%s", out.String(), want)
	}

	out.Reset()
	errs.Reset()
	if code := run([]string{"--manuscript", filepath.Join(dir, "missing.json"), "--guide", bible}, &out, &errs); code != 1 || out.Len() != 0 ||
		errs.String() != "Import a manuscript first.\n" {
		t.Fatalf("a missing manuscript: exit %d, stdout %q, stderr %q", code, out.String(), errs.String())
	}
	if code := run([]string{"--manuscript", manuscript}, &out, &errs); code != 2 {
		t.Fatalf("no --guide: exit %d", code)
	}
	if code := run([]string{"--nope"}, &out, &errs); code != 2 {
		t.Fatalf("an unknown flag: exit %d", code)
	}
}
