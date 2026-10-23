package main

import (
	"bufio"
	"encoding/json"
	"os"
	"strconv"
	"strings"
)

// selfcheck: "floats" reads one float per line (Python repr) and writes pyFloatRepr;
// "spaces" writes every code point pyIsSpace accepts; "text" reads JSON strings and writes
// tokenize_with_raw, split_sentences and merge_number_words of each.
func selfcheck(kind string) {
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 1<<20), 1<<26)
	w := bufio.NewWriter(os.Stdout)
	defer w.Flush()
	switch kind {
	case "floats":
		for in.Scan() {
			f, err := strconv.ParseFloat(strings.TrimSpace(in.Text()), 64)
			if err != nil {
				panic(err)
			}
			w.WriteString(pyFloatRepr(f) + "\n")
		}
	case "spaces":
		for r := rune(0); r <= 0x10ffff; r++ {
			if pyIsSpace(r) {
				w.WriteString(strconv.Itoa(int(r)) + "\n")
			}
		}
	case "opcodes":
		for in.Scan() {
			var c struct {
				A, B     []string
				Autojunk bool
			}
			if err := json.Unmarshal(in.Bytes(), &c); err != nil {
				panic(err)
			}
			var sb strings.Builder
			pyDump(&sb, opcodesJSON(NewSequenceMatcher(c.A, c.B, c.Autojunk).GetOpcodes()))
			w.WriteString(sb.String() + "\n")
		}
	case "text":
		for in.Scan() {
			var s string
			if err := json.Unmarshal(in.Bytes(), &s); err != nil {
				panic(err)
			}
			toks, raws := tokenizeWithRaw(s)
			ident := make([]int, len(toks))
			for k := range ident {
				ident[k] = k
			}
			merged, mi := mergeNumberWords(toks, ident)
			var sb strings.Builder
			pyDump(&sb, obj{"tokens": strs(toks), "raws": strs(raws), "sentences": strs(splitSentences(s)), "merged": strs(merged), "merged_idx": ints(mi)})
			w.WriteString(sb.String() + "\n")
		}
	}
}
