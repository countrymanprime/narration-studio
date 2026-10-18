package manuscript

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeDropFile(t *testing.T, name, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestDroppedFileAcceptsOneSupportedManuscript(t *testing.T) {
	for _, name := range []string{"book.docx", "book.MD", "book.markdown", "book.txt", "book.epub", "Ünï cödé 📖 book.txt"} {
		path := writeDropFile(t, name, "Chapter 1\n\nText.")
		got, err := DroppedFile([]string{path})
		if err != nil || got != path {
			t.Errorf("%s: got %q, %v; want %q", name, got, err, path)
		}
	}
}

func TestDroppedFileRefusesWhatItCannotImportInPlainWords(t *testing.T) {
	dir := t.TempDir()
	good := writeDropFile(t, "a.txt", "x")
	cases := map[string][]string{
		"nothing dropped":     nil,
		"two files":           {good, good},
		"unsupported type":    {writeDropFile(t, "a.pdf", "x")},
		"no extension":        {writeDropFile(t, "manuscript", "x")},
		"empty file":          {writeDropFile(t, "empty.txt", "")},
		"missing file":        {filepath.Join(dir, "gone.txt")},
		"a folder":            {dir},
		"a relative path":     {"book.txt"},
		"an empty path":       {""},
		"a folder named .txt": {func() string { p := filepath.Join(dir, "x.txt"); _ = os.Mkdir(p, 0o700); return p }()},
	}
	for name, paths := range cases {
		got, err := DroppedFile(paths)
		if err == nil || got != "" {
			t.Errorf("%s: got %q, %v; want a refusal", name, got, err)
			continue
		}
		if msg := err.Error(); !strings.HasSuffix(msg, ".") || strings.Contains(msg, dir) {
			t.Errorf("%s: refusal %q should be a sentence that names no path", name, msg)
		}
	}
}
