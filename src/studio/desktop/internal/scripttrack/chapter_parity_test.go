package scripttrack

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/compare"
	"desktop/internal/layout"
)

// The chapter script is held to what chapter_script.py answers (tests/fixtures/booth-parity/chapter-scripts.jsonl and
// its .golden.jsonl, written by the sidecar's test_tracker_parity.py): the recorded calls and the synthetic ones.

type scriptCase struct {
	K                string  `json:"k"`
	Manuscript       *string `json:"manuscript"`
	ManuscriptBase64 *string `json:"manuscriptBase64"`
	ManuscriptPath   string  `json:"manuscriptPath"`
	Chapter          string  `json:"chapter"`
	Text             *string `json:"text"`
	TextBase64       *string `json:"textBase64"`
	ID               string  `json:"id"`
	Title            string  `json:"title"`
}

// written is the file a case reads: its text or bytes written out, or a path that does not exist.
func written(t *testing.T, text, encoded *string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "input")
	var raw []byte
	switch {
	case encoded != nil:
		raw, _ = base64.StdEncoding.DecodeString(*encoded)
	case text != nil:
		raw = []byte(*text)
	default:
		return path
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func strs(words []string) []any {
	out := make([]any, len(words))
	for k, w := range words {
		out[k] = w
	}
	return out
}

func scriptAnswer(t *testing.T, c scriptCase, root string) (compare.PyObject, error) {
	var script ChapterScript
	var err error
	switch c.K {
	case "text":
		script, err = TextScript(*c.Text, c.ID, c.Title)
	case "textfile":
		script, err = LoadTextScript(written(t, c.Text, c.TextBase64), c.ID, c.Title)
	default:
		path := filepath.Join(root, filepath.FromSlash(c.ManuscriptPath))
		if c.ManuscriptPath == "" {
			path = written(t, c.Manuscript, c.ManuscriptBase64)
		}
		script, err = LoadChapterScript(path, c.Chapter)
	}
	if err != nil {
		return nil, err
	}
	answer := compare.PyObject{"tokens": strs(script.Tokens), "heading": script.Heading, "text": script.Text, "event": ScriptEvent(script)}
	if c.ManuscriptPath != "" {
		sum := sha256.Sum256([]byte(compare.DumpPy(answer, true)))
		return compare.PyObject{"tokenCount": len(script.Tokens), "sha256": hex.EncodeToString(sum[:])}, nil
	}
	return answer, nil
}

func TestEveryChapterScriptGivesThePinnedScriptOrError(t *testing.T) {
	working, _ := os.Getwd()
	root := layout.FindRoot(working)
	inputs, golden := fixture(t, "chapter-scripts.jsonl"), fixture(t, "chapter-scripts.golden.jsonl")
	if len(inputs) != len(golden) || len(inputs) < 1000 {
		t.Fatalf("%d cases, %d answers", len(inputs), len(golden))
	}
	kinds := map[string]int{}
	for k, line := range inputs {
		var c scriptCase
		if err := json.Unmarshal([]byte(line), &c); err != nil {
			t.Fatal(err)
		}
		var want struct {
			Crash string `json:"crash"`
			Error string `json:"error"`
		}
		_ = json.Unmarshal([]byte(golden[k]), &want)
		answer, err := scriptAnswer(t, c, root)
		var chapterErr *ChapterError
		switch {
		case want.Crash != "":
			// chapter_script.py raised a TypeError, KeyError, AttributeError or UnicodeDecodeError: the host reports the input
			// as unreadable instead.
			kinds["crash"]++
			if !errors.As(err, &chapterErr) {
				t.Errorf("case %d: Python raised %s, the host answered %v", k, want.Crash, answer)
			}
			continue
		case err != nil && errors.As(err, &chapterErr):
			kinds["error"]++
			message := chapterErr.Message
			if c.K == "textfile" && strings.HasPrefix(message, "Could not read") {
				message, _, _ = strings.Cut(message, ":") // the rest is the operating system's own text
			}
			answer = compare.PyObject{"error": message, "candidates": strs(chapterErr.Candidates)}
		case err != nil:
			t.Fatalf("case %d: %v is not a *ChapterError", k, err)
		default:
			kinds["script"]++
		}
		if got := compare.DumpPy(answer, true); got != golden[k] {
			t.Errorf("case %d (%s %q) differs:\n got %.500s\nwant %.500s", k, c.K, c.Chapter, got, golden[k])
		}
	}
	if kinds["script"] < 400 || kinds["error"] < 100 || kinds["crash"] == 0 {
		t.Errorf("the fixture lost a kind of case: %v", kinds)
	}
}
