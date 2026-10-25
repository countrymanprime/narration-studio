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
		"paragraphs": [{"id": "p-1", "chapterId": "c", "text": "alpha bravo charlie delta", "index": 0}]}`), 0o600)
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

// The take comparison's ops (tests/go_divergence.py): the span's words with their tokens, and one take aligned to it.
func TestTheSpanAndATakeAlignedToIt(t *testing.T) {
	paragraphs := `["Alpha bravo. Charlie delta echo."]`
	requests := strings.Join([]string{
		`{"op":"span","paragraphs":` + paragraphs + `,"firstUnit":1,"lastUnit":1}`,
		`{"op":"alignTake","paragraphs":` + paragraphs + `,"firstUnit":1,"lastUnit":1,"words":[["Charlie",0,0.3],["data",0.4,0.7],["echo",0.8,1.1]]}`,
		`{"op":"span","paragraphs":` + paragraphs + `,"firstUnit":0,"lastUnit":4}`,
		`{"op":"alignTake","paragraphs":` + paragraphs + `,"firstUnit":3,"lastUnit":3}`,
		`{"op":"alignTake","paragraphs":` + paragraphs + `,"firstUnit":0,"lastUnit":0,"words":[["a"]]}`,
	}, "\n") + "\n"
	var out strings.Builder
	if err := serve(strings.NewReader(requests), &out); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")
	want := []string{
		`{"firstParagraph":0,"firstUnit":1,"lastParagraph":0,"lastUnit":1,"words":[{"index":0,"paragraph":0,"text":"Charlie","tokens":["charlie"],"unit":1},` +
			`{"index":1,"paragraph":0,"text":"delta","tokens":["delta"],"unit":1},{"index":2,"paragraph":0,"text":"echo.","tokens":["echo"],"unit":1}]}`,
		`{"divergences":[{"audioText":"data","end":0.7,"firstWord":1,"kind":"misread","lastWord":1,"manuscriptText":"delta","position":"within","start":0.4}],` +
			`"extraWords":0,"words":[{"end":0.3,"index":0,"start":0,"status":"matched"},{"end":0.7,"index":1,"start":0.4,"status":"misread"},` +
			`{"end":1.1,"index":2,"start":0.8,"status":"matched"}]}`,
		`{"error":"The span 0..4 is not within the chapter's 2 sentence(s)"}`,
		`{"error":"The span 3..3 is not within the chapter's 2 sentence(s)"}`,
		`{"error":"word 0 is not [text, start, end]"}`,
	}
	if len(lines) != len(want) {
		t.Fatalf("want %d replies, got %s", len(want), out.String())
	}
	for k := range want {
		if lines[k] != want[k] {
			t.Errorf("reply %d:\n got %s\nwant %s", k, lines[k], want[k])
		}
	}
}

// The Transcript Compare run's op (the parity tooling): the results and diff files, as the host writes them.
func TestTheCompareRunWritesTheResultsAndTheDiff(t *testing.T) {
	dir := t.TempDir()
	manuscript := filepath.Join(dir, "m.json")
	_ = os.WriteFile(manuscript, []byte(`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "One"}],
		"paragraphs": [{"id": "p-1", "chapterId": "c", "text": "alpha bravo", "index": 0}]}`), 0o600)
	words := filepath.Join(dir, "words.txt")
	_ = os.WriteFile(words, []byte(`COMPARE_WORDS|{"words":[["alpha",0,0.3],["delta",0.4,0.7]]}`+"\n"), 0o600)
	request := func(wordsReport string) string {
		return `{"op":"compareRun","manuscript":` + quote(manuscript) + `,"chapterId":"c","score":1,"wordsReport":` + quote(wordsReport) + `,"out":` + quote(filepath.Join(dir, "r.txt")) + `,"diffOut":` + quote(filepath.Join(dir, "d.diff")) + `}`
	}
	var out strings.Builder
	if err := serve(strings.NewReader(request(words)+"\n"+request(filepath.Join(dir, "none.txt"))+"\n"), &out); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")
	if len(lines) != 2 || lines[0] != `{"markers":1}` || !strings.HasPrefix(lines[1], `{"error":"The comparison's words report could not be read`) {
		t.Fatalf("replies = %q", lines)
	}
	if diff, err := os.ReadFile(filepath.Join(dir, "d.diff")); err != nil || !strings.Contains(string(diff), "+alpha delta") {
		t.Fatalf("diff = %q, %v", diff, err)
	}
}

// The pickup and duplicate scan's op (the parity tooling): the scan's output for a manifest and the words each read was
// heard to say, a NEED_CHAPTER line when the track matches no chapter, and an error for a count of reads that differs.
func TestTheRepeatScanGroupsTheReadsOrAsksForAChapter(t *testing.T) {
	dir := t.TempDir()
	manuscript := filepath.Join(dir, "m.json")
	_ = os.WriteFile(manuscript, []byte(`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "One"}],
		"paragraphs": [{"id": "p-1", "chapterId": "c", "text": "Alpha bravo. Charlie delta.", "index": 0}]}`), 0o600)
	manifest := filepath.Join(dir, "manifest.txt")
	_ = os.WriteFile(manifest, []byte("0|a.wav|0|2|{I}|{T-1}\n1|a.wav|0|2|{I}|{T-2}\n"), 0o600)
	heard := `[[["alpha",0,0.3],["bravo",0.4,0.7]],[["alpha",0,0.3],["bravo",0.4,0.7]]]`
	request := func(track, heard string) string {
		return `{"op":"findRepeats","manuscript":` + quote(manuscript) + `,"manifest":` + quote(manifest) + `,"track":` + quote(track) + `,"heard":` + heard + `,"minWords":1,"minSpanOverlap":0.5}`
	}
	var out strings.Builder
	if err := serve(strings.NewReader(request("One", heard)+"\n"+request("Appendix", heard)+"\n"+request("One", "[]")+"\n"), &out); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")
	want := `{"output":"SUMMARY|Found 1 repeated-span group(s) across 2 segment(s)\nSPAN_GROUP|0|0|0|2\n` +
		`SPAN_MEMBER|0|0|{I}|{T-1}|a.wav|0.000|2.000|0|0|1.000|0.400|EC0\nSPAN_MEMBER|0|1|{I}|{T-2}|a.wav|0.000|2.000|0|0|1.000|0.400|EC0\n"}`
	if len(lines) != 3 || lines[0] != want || lines[1] != `{"output":"NEED_CHAPTER|One\n"}` || lines[2] != `{"error":"0 reads heard of 2"}` {
		t.Fatalf("replies = %q", lines)
	}
}

// The research spike's ops (tests/coverage_spike.py): a text's tokens, and another aligner's opcodes fused as Align
// fuses SequenceMatcher's.
func TestTheTokensOfATextAndAnotherAlignersOpcodesFused(t *testing.T) {
	requests := `{"op":"tokenize","text":"They're Alyce, twenty-three","equivalences":[["alice","alyce"]]}` + "\n" +
		`{"op":"fuseHyphenSplits","doc":["superpowered"],"audio":["super","powered"],"opcodes":[["replace",0,1,0,2]]}` + "\n" +
		`{"op":"fuseHyphenSplits","opcodes":[["replace",0,"x",0,2]]}` + "\n"
	var out strings.Builder
	if err := serve(strings.NewReader(requests), &out); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")
	want := []string{`{"tokens":["their","alice","twenty","three"]}`, `{"opcodes":[["equal",0,1,0,2]]}`, `{"error":"opcode 0: not [tag, i1, i2, j1, j2]"}`}
	if len(lines) != 3 || lines[0] != want[0] || lines[1] != want[1] || lines[2] != want[2] {
		t.Fatalf("replies = %q, want %q", lines, want)
	}
}
