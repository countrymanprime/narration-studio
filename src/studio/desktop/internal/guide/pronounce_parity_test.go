package guide

import (
	"bytes"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// pronounceParityCase is one line of tests/fixtures/guide-pronounce/cases.jsonl: one run of the sidecar's pronounce command. The Story
// Bible it started from is a line of bibles.jsonl (bible), a guide-cues case's (cuesCase), or none; answer is what the source was to
// give (the real one, a recorded value or an exception), which the result's answers hold as the source gave it.
type pronounceParityCase struct {
	Name       string `json:"name"`
	Bible      string `json:"bible"`
	CuesCase   string `json:"cuesCase"`
	EntityID   string `json:"entityId"`
	AliasIndex *int   `json:"aliasIndex"`
	Source     string `json:"source"`
}

// pronounceParityBible is a Story Bible a case starts from: its text, or its bytes in hex when they are not UTF-8.
type pronounceParityBible struct {
	Name  string  `json:"name"`
	Text  *string `json:"text"`
	Bytes string  `json:"bytes"`
}

// pronounceParityResult is what the command did: its exit status, the reason it logged and its exception's type, the names it asked
// the source for and each answer (a line as `pronunciation --source` prints it, or the exception's text), and the file it left (its
// SHA-256 as Python wrote it on Linux, and its text when short).
type pronounceParityResult struct {
	Name      string   `json:"name"`
	Exit      int      `json:"exit"`
	Error     *string  `json:"error"`
	ErrorType *string  `json:"errorType"`
	Stdout    string   `json:"stdout"`
	Asked     []any    `json:"asked"`
	Answers   []answer `json:"answers"`
	Unchanged bool     `json:"unchanged"`
	Written   *string  `json:"written"`
	Sum       *string  `json:"writtenSha256"`
	Leftovers []string `json:"leftovers"`
}

type answer struct {
	Line *string `json:"line"`
	Miss *string `json:"miss"`
}

// TestPronounceMatchesTheSidecar replays every run of the sidecar's pronounce recorded before it was deleted (#2251; the files are
// frozen) through Pronounce: the same Story Bible file byte for byte, the same name asked of the source, and the same refusal in the
// same words, with the file left as it was. Where the sidecar crashed on a value of the wrong type the host refuses in its own words
// (errPronounceShape); where it handed a name that is not text to the source the host refuses before asking.
func TestPronounceMatchesTheSidecar(t *testing.T) {
	replayPronounce(t)
}

// TestPronounceWritesWindowsLineEnds replays the cases as on Windows, where Python's text mode wrote every line end as CRLF.
func TestPronounceWritesWindowsLineEnds(t *testing.T) {
	saved := pyLineEnd
	pyLineEnd = "\r\n"
	t.Cleanup(func() { pyLineEnd = saved })
	replayPronounce(t)
}

func replayPronounce(t *testing.T) {
	root := repoRoot(t)
	folder := filepath.Join(root, "tests", "fixtures", "guide-pronounce")
	cases := readJSONLines[pronounceParityCase](t, filepath.Join(folder, "cases.jsonl"))
	results := readJSONLines[pronounceParityResult](t, filepath.Join(folder, "cases.golden.jsonl"))
	if len(cases) != len(results) {
		t.Fatalf("%d cases and %d results", len(cases), len(results))
	}
	bibles := map[string][]byte{}
	for _, bible := range readJSONLines[pronounceParityBible](t, filepath.Join(folder, "bibles.jsonl")) {
		if bible.Text != nil {
			bibles[bible.Name] = []byte(*bible.Text)
			continue
		}
		raw, err := hex.DecodeString(bible.Bytes)
		if err != nil {
			t.Fatal(err)
		}
		bibles[bible.Name] = raw
	}
	cueBibles := map[string][]byte{}
	for _, c := range readJSONLines[cueCase](t, filepath.Join(root, "tests", "fixtures", "guide-cues", "cases.jsonl")) {
		switch {
		case c.GuidePath != "":
			cueBibles[c.Name] = []byte(readText(t, filepath.Join(root, filepath.FromSlash(c.GuidePath))))
		case c.Guide != nil:
			cueBibles[c.Name] = []byte(*c.Guide)
		}
	}
	s := hostEditService(t)
	written, refused, inWords, shapes, crlf := 0, 0, 0, 0, 0
	for i, c := range cases {
		want := results[i]
		if want.Name != c.Name {
			t.Fatalf("case %d is %q, its result %q", i, c.Name, want.Name)
		}
		start, ok := bibles[c.Bible], c.Bible != ""
		if c.CuesCase != "" {
			start, ok = cueBibles[c.CuesCase], true
		}
		if err := os.Remove(s.guidePath()); err != nil && !os.IsNotExist(err) {
			t.Fatal(err)
		}
		if ok {
			if err := os.WriteFile(s.guidePath(), start, 0o600); err != nil {
				t.Fatal(err)
			}
		}
		if bytes.Contains(start, []byte("\r")) {
			crlf++
		}
		var asked []any
		s.sourceLookup = func(name, source string) (*pyObject, error) {
			asked = append(asked, name)
			if source != c.Source {
				t.Errorf("%s: asked %s, want %s", c.Name, source, c.Source)
			}
			if len(want.Answers) < len(asked) {
				return nil, errors.New("asked more than the sidecar did")
			}
			got := want.Answers[len(asked)-1]
			if got.Miss != nil {
				return parseSourceAnswer(`{"miss": ` + pythonJSON(*got.Miss) + `}`)
			}
			return parseSourceAnswer(*got.Line)
		}
		err := s.Pronounce(c.EntityID, c.AliasIndex, c.Source)
		_, textName := firstAsked(want.Asked)
		switch {
		case len(want.Asked) > 0 && !textName:
			// The sidecar asked the source for a name that is not text; the host refuses before it asks.
			shapes++
			if !errors.Is(err, errPronounceShape) || len(asked) != 0 {
				t.Errorf("%s: error %v after asking %q, want the shape refusal before asking", c.Name, err, asked)
			}
		case !sameAsked(asked, want.Asked):
			t.Errorf("%s: asked %q, want %q", c.Name, asked, want.Asked)
		case want.Exit == 0:
			written++
			if err != nil {
				t.Errorf("%s: %v, want the file the sidecar wrote", c.Name, err)
			}
		case len(want.Answers) > 0 && want.Answers[0].Miss != nil, want.ErrorType != nil && *want.ErrorType == "ValueError":
			refused++
			inWords++
			if err == nil || err.Error() != *want.Error {
				t.Errorf("%s: error %v, want %q", c.Name, err, *want.Error)
			}
		default:
			refused++
			shapes++
			if !errors.Is(err, errPronounceShape) {
				t.Errorf("%s: error %v, want the shape refusal for the sidecar's %s %q", c.Name, err, *want.ErrorType, *want.Error)
			}
		}
		raw := readOrNone(t, s.guidePath())
		if want.Exit != 0 || (len(want.Asked) > 0 && !textName) {
			if !bytes.Equal(raw, start) {
				t.Errorf("%s: a refused pronunciation changed the file", c.Name)
			}
		} else {
			checkWritten(t, c.Name, s.guidePath(), want.Written, want.Sum)
			if lines := bytes.Count(raw, []byte("\n")); bytes.Count(raw, []byte(pyLineEnd)) != lines {
				t.Errorf("%s: %d of the %d line ends are not %q", c.Name, lines-bytes.Count(raw, []byte(pyLineEnd)), lines, pyLineEnd)
			}
		}
		if leftovers := filesBeside(t, s.guidePath()); len(leftovers) != 0 {
			t.Errorf("%s: left %q beside the Story Bible", c.Name, leftovers)
		}
	}
	t.Logf("%d runs: %d written, %d refused (%d in the sidecar's words), %d refused as a value of the wrong type, %d from CRLF files",
		len(cases), written, refused, inWords, shapes, crlf)
	if len(cases) < 4000 || written < 1500 || inWords < 1500 || shapes < 300 {
		t.Errorf("%d runs: %d written, %d refused in words, %d shapes", len(cases), written, inWords, shapes)
	}
}

// firstAsked is the first name the sidecar asked the source for, and whether it was text.
func firstAsked(asked []any) (string, bool) {
	if len(asked) == 0 {
		return "", true
	}
	text, ok := asked[0].(string)
	return text, ok
}

func sameAsked(got, want []any) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

// filesBeside is every file in the Story Bible's folder but the Story Bible: a temporary file a write left behind.
func filesBeside(t *testing.T, path string) []string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, entry := range entries {
		if entry.Name() != filepath.Base(path) && !strings.HasPrefix(entry.Name(), ".") {
			out = append(out, entry.Name())
		}
	}
	return out
}
