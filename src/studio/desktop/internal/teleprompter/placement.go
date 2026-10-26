package teleprompter

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"desktop/internal/compare"
	"desktop/internal/scripttrack"
)

// The host places the words a `--locate` or `--align-word` run decoded in the chapter itself (internal/scripttrack, held
// byte for byte to what the sidecar's locate.py and align_word.py placed); the sidecar only decodes.

// hostPlacement is the chapter's script: its tokens and the first token of each span.
type hostPlacement struct {
	tokens []string
	breaks map[int]bool
}

// placed is the chapter's script and the words a run printed. The sidecar checked the chapter before decoding, so a
// chapter the host cannot read here is one it read differently: that is an error, never a guess.
func placed(manuscript, chapter, out string) (hostPlacement, []scripttrack.TimedWord, error) {
	script, err := scripttrack.LoadChapterScript(manuscript, chapter)
	if err != nil {
		return hostPlacement{}, nil, fmt.Errorf("could not read the chapter to place what was heard: %w", err)
	}
	heard, err := parseHeard(out)
	if err != nil {
		return hostPlacement{}, nil, err
	}
	breaks := map[int]bool{}
	for _, span := range script.Spans {
		breaks[span.Start] = true
	}
	return hostPlacement{tokens: script.Tokens, breaks: breaks}, heard, nil
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
