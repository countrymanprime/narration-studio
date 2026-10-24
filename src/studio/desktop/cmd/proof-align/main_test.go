package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The line protocol the sidecar's test tooling speaks (tests/go_coverage.py):
// one request per line in, one reply per line out, an error as a reply.
func TestEachRequestGetsOneReplyLine(t *testing.T) {
	dir := t.TempDir()
	manuscript := filepath.Join(dir, "m.json")
	_ = os.WriteFile(manuscript, []byte(`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "One"}],
		"paragraphs": [{"id": "p-1", "chapterId": "c", "text": "alpha bravo charlie delta"}]}`), 0o600)
	words := `[["one",0,0.3],["alpha",0.4,0.7],["bravo",0.8,1.1],["charlie",1.2,1.5]]`
	aligned := `{"docTokens":["a","b"],"docWords":["A","B"],"tokenParagraph":[0,0],"paragraphIds":["p"],"audioTokens":["a","b","z"],` +
		`"opcodes":[["equal",0,2,0,2],["insert",2,2,2,3]]}`
	requests := strings.Join([]string{
		`{"op":"align","heading":"One","paragraphs":["alpha bravo charlie delta"],"paragraphIds":["p-1"],"words":` + words + `}`,
		`{"op":"coverage","aligned":` + aligned + `}`,
		`{"op":"measure","manuscript":` + quote(manuscript) + `,"chapterId":"c","items":[{"index":0,"itemGuid":"{A}","startOffset":0,"length":2,"words":` + words + `}]}`,
		`{"op":"results","manifest":"absent.json"}`,
		`{"op":"coverage"}`,
		`{"op":"coverage","aligned":{"docTokens":["a"],"docWords":["a"],"tokenParagraph":[0],"paragraphIds":["p"],"audioTokens":[],"opcodes":[["equal",0,1,0,0]]}}`,
		`{"op":"coverage","aligned":` + aligned + `,"minAnchorRun":0}`,
		`{"op":"align","paragraphs":["x"],"paragraphIds":[]}`,
		`{"op":"align","words":[[1,2,3]]}`,
		`{"op":"teleport"}`,
		`not json`,
	}, "\n") + "\n"
	var out strings.Builder
	if err := serve(strings.NewReader(requests), &out); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")
	if len(lines) != 11 {
		t.Fatalf("want 11 replies, got %d: %s", len(lines), out.String())
	}
	replies := make([]map[string]any, len(lines))
	for k, line := range lines {
		if err := json.Unmarshal([]byte(line), &replies[k]); err != nil {
			t.Fatalf("reply %d: %v", k, err)
		}
	}
	if opcodes := replies[0]["aligned"].(map[string]any)["opcodes"].([]any); len(opcodes) != 2 { // the heading and three words heard, "delta" not
		t.Fatalf("align: %v", replies[0])
	}
	if coverage := replies[1]["coverage"].(map[string]any); coverage["extraTokens"] != 1.0 || coverage["presentTokens"] != 2.0 {
		t.Fatalf("coverage: %v", replies[1])
	}
	measured := replies[2]["coverage"].(map[string]any)["regions"].([]any)
	if len(measured) != 1 || measured[0].(map[string]any)["kind"] != "tail" || measured[0].(map[string]any)["position"] == nil {
		t.Fatalf("measure: %v", replies[2])
	}
	for k := 3; k < 11; k++ {
		if _, failed := replies[k]["error"]; !failed {
			t.Errorf("reply %d must be an error: %v", k, replies[k])
		}
	}
}

func quote(s string) string {
	encoded, _ := json.Marshal(s)
	return string(encoded)
}
