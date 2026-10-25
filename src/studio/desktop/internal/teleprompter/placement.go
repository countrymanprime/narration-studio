package teleprompter

import (
	"bufio"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"desktop/internal/compare"
	"desktop/internal/scripttrack"
)

// The host places the words a `--words-only` run decoded (`--locate`, `--align-word`) in the chapter itself
// (internal/scripttrack, a port held byte for byte to locate.py and align_word.py); the sidecar only decodes.

// hostPlacement is the chapter's script as the sidecar's locate.load_script reads it: its tokens and the first token of
// each span. ok is false when the host cannot build it as the sidecar would; the sidecar then places the words itself.
type hostPlacement struct {
	tokens []string
	breaks map[int]bool
}

func placementFor(manuscript, chapter string) (hostPlacement, bool) {
	script, err := scripttrack.LoadChapterScript(manuscript, chapter)
	if err != nil {
		return hostPlacement{}, false
	}
	breaks := map[int]bool{}
	for _, span := range script.Spans {
		breaks[span.Start] = true
	}
	return hostPlacement{tokens: script.Tokens, breaks: breaks}, true
}

// parseHeard finds the one `heard` line among the sidecar's stdout lines: each decoded word's text, start and end.
func parseHeard(out string) ([]scripttrack.TimedWord, error) {
	scanner := bufio.NewScanner(strings.NewReader(out))
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := []byte(strings.TrimSpace(scanner.Text()))
		if kind, ok := isEvent(line); !ok || kind != "heard" {
			continue
		}
		var heard struct {
			Words [][]json.RawMessage `json:"words"`
		}
		if err := json.Unmarshal(line, &heard); err != nil {
			return nil, errors.New("the teleprompter sidecar returned unreadable words")
		}
		words := make([]scripttrack.TimedWord, 0, len(heard.Words))
		for _, entry := range heard.Words {
			var word scripttrack.TimedWord
			if len(entry) != 3 || json.Unmarshal(entry[0], &word.Text) != nil {
				return nil, errors.New("the teleprompter sidecar returned unreadable words")
			}
			start, okStart := scripttrack.ParseNum(entry[1])
			end, okEnd := scripttrack.ParseNum(entry[2])
			if !okStart || !okEnd {
				return nil, errors.New("the teleprompter sidecar returned unreadable words")
			}
			word.Start, word.End = start.Value(), end.Value()
			words = append(words, word)
		}
		return words, nil
	}
	return nil, errors.New("the teleprompter sidecar did not report what it heard")
}

// placedLine is a placement's event as the line the sidecar would have printed.
func placedLine(event compare.PyObject) string { return compare.DumpPy(event, false) }

// sidecarSeconds is the value the sidecar's argparse reads from a seconds argument the host formatted.
func sidecarSeconds(value float64) float64 {
	parsed, _ := strconv.ParseFloat(seconds(value), 64)
	return parsed
}
