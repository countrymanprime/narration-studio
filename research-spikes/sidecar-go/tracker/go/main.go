package main

// Driver: go-tracker [-native] replay SESSIONS.jsonl OUT.jsonl | fuzz IN.jsonl OUT.jsonl
// Output matches json.dumps(..., sort_keys=True) byte for byte.

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type rawOp struct {
	Op    string                     `json:"op"`
	Event map[string]json.RawMessage `json:"event"`
	Now   json.Number                `json:"now"`
	Word  json.Number                `json:"word"`
}

type rawSession struct {
	Kind   string   `json:"kind"`
	Tokens []string `json:"tokens"`
	Ops    []rawOp  `json:"ops"`
}

type op struct {
	kind  string
	ev    *Event
	now   float64
	word  int
	timed bool
}

func parsePyNum(raw json.RawMessage) (PyNum, bool) {
	s := strings.TrimSpace(string(raw))
	switch {
	case s == "true":
		return PyNum{Kind: 'b', I: 1}, true
	case s == "false":
		return PyNum{Kind: 'b', I: 0}, true
	case s == "" || s == "null" || s[0] == '"' || s[0] == '[' || s[0] == '{':
		return PyNum{}, false
	case strings.ContainsAny(s, ".eE"):
		f, err := strconv.ParseFloat(s, 64)
		must(err)
		return PyNum{Kind: 'f', F: f}, true
	default:
		i, err := strconv.ParseInt(s, 10, 64)
		must(err)
		return PyNum{Kind: 'i', I: i}, true
	}
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func toEvent(m map[string]json.RawMessage) *Event {
	ev := &Event{}
	if raw, ok := m["type"]; ok {
		_ = json.Unmarshal(raw, &ev.Type)
	}
	if raw, ok := m["segment"]; ok {
		n, ok := parsePyNum(raw)
		if ok {
			ev.Segment = n.Float()
		}
	}
	if raw, ok := m["words"]; ok {
		var ws []map[string]json.RawMessage
		must(json.Unmarshal(raw, &ws))
		for _, w := range ws {
			var s string
			must(json.Unmarshal(w["word"], &s))
			ev.Words = append(ev.Words, s)
		}
	}
	if raw, ok := m["word"]; ok {
		must(json.Unmarshal(raw, &ev.Word))
	}
	s, okS := parsePyNum(m["start"])
	e, okE := parsePyNum(m["end"])
	if okS && okE {
		ev.Times = &TimePair{s, e}
	}
	return ev
}

func numF(n json.Number) float64 {
	if n == "" {
		return 0
	}
	f, err := n.Float64()
	must(err)
	return f
}

// ---- Python json.dumps compatible writer ----

func pyStr(b *bytes.Buffer, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch {
		case r == '"':
			b.WriteString(`\"`)
		case r == '\\':
			b.WriteString(`\\`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r == '\b':
			b.WriteString(`\b`)
		case r == '\f':
			b.WriteString(`\f`)
		case r >= 0x20 && r <= 0x7e:
			b.WriteRune(r)
		case r > 0xFFFF:
			v := r - 0x10000
			fmt.Fprintf(b, `\u%04x\u%04x`, 0xD800+(v>>10), 0xDC00+(v&0x3FF))
		default:
			fmt.Fprintf(b, `\u%04x`, r)
		}
	}
	b.WriteByte('"')
}

// pyFloat is float.__repr__ (repr style 'r').
func pyFloat(f float64) string {
	e := strconv.FormatFloat(f, 'e', -1, 64)
	mant, expS, _ := strings.Cut(e, "e")
	exp, _ := strconv.Atoi(expS)
	decpt := exp + 1
	if decpt <= -4 || decpt > 16 {
		return e
	}
	_ = mant
	s := strconv.FormatFloat(f, 'f', -1, 64)
	if !strings.Contains(s, ".") {
		s += ".0"
	}
	return s
}

func pyNumStr(n PyNum) string {
	switch n.Kind {
	case 'f':
		return pyFloat(n.F)
	case 'b':
		if n.I == 1 {
			return "true"
		}
		return "false"
	}
	return strconv.FormatInt(n.I, 10)
}

func optInt(b *bytes.Buffer, v int) {
	if v == -1 {
		b.WriteString("null")
	} else {
		b.WriteString(strconv.Itoa(v))
	}
}

func optStr(b *bytes.Buffer, s string) {
	if s == "" {
		b.WriteString("null")
	} else {
		pyStr(b, s)
	}
}

func span(b *bytes.Buffer, s *Span) {
	if s == nil {
		b.WriteString("null")
	} else {
		fmt.Fprintf(b, "[%d, %d]", s.A, s.B)
	}
}

func strList(b *bytes.Buffer, xs []string) {
	b.WriteByte('[')
	for i, x := range xs {
		if i > 0 {
			b.WriteString(", ")
		}
		pyStr(b, x)
	}
	b.WriteByte(']')
}

func writeOut(b *bytes.Buffer, o Out) {
	if p := o.Pos; p != nil {
		fmt.Fprintf(b, `{"committed": %d, "jump": `, p.Committed)
		optStr(b, p.Jump)
		fmt.Fprintf(b, `, "read": %d, "skipped": `, p.Read)
		span(b, p.Skipped)
		b.WriteString(`, "status": `)
		pyStr(b, p.Status)
		b.WriteString(`, "type": "position"}`)
		return
	}
	f := o.Flag
	fmt.Fprintf(b, `{"end": %d, "heard": `, f.End)
	pyStr(b, f.Heard)
	fmt.Fprintf(b, `, "id": %d, "kind": `, f.ID)
	pyStr(b, f.Kind)
	fmt.Fprintf(b, `, "start": %d, "type": "flag"}`, f.Start)
}

func writeClosed(b *bytes.Buffer, r *SegmentReading) {
	fmt.Fprintf(b, `{"anchor": %d, "heard": `, r.Anchor)
	strList(b, r.Heard)
	b.WriteString(`, "heard_raw": `)
	strList(b, r.HeardRaw)
	b.WriteString(`, "heard_times": [`)
	for i, t := range r.HeardTimes {
		if i > 0 {
			b.WriteString(", ")
		}
		if t == nil {
			b.WriteString("null")
		} else {
			fmt.Fprintf(b, "[%s, %s]", pyNumStr(t.Start), pyNumStr(t.End))
		}
	}
	l := r.Location
	fmt.Fprintf(b, `], "location": {"first": `)
	optInt(b, l.First)
	b.WriteString(`, "jump": `)
	optStr(b, l.Jump)
	fmt.Fprintf(b, `, "matched": %d, "read": %d, "skipped": `, l.Matched, l.Read)
	span(b, l.Skipped)
	fmt.Fprintf(b, `, "start": %d}}`, l.Start)
}

// ---- modes ----

func readLines(path string) [][]byte {
	data, err := os.ReadFile(path)
	must(err)
	var out [][]byte
	for _, l := range bytes.Split(data, []byte("\n")) {
		if len(bytes.TrimSpace(l)) > 0 {
			out = append(out, l)
		}
	}
	return out
}

func replay(src, dst string) {
	type sess struct {
		flagging bool
		tokens   []string
		ops      []op
	}
	var sessions []sess
	for _, line := range readLines(src) {
		var rs rawSession
		dec := json.NewDecoder(bytes.NewReader(line))
		dec.UseNumber()
		must(dec.Decode(&rs))
		s := sess{flagging: rs.Kind == "flagging", tokens: rs.Tokens}
		for _, ro := range rs.Ops {
			o := op{kind: ro.Op, now: numF(ro.Now)}
			switch ro.Op {
			case "feed":
				o.ev = toEvent(ro.Event)
				o.timed = o.ev.Type == "partial" || o.ev.Type == "word"
			case "reset":
				w, err := ro.Word.Int64()
				must(err)
				o.word = int(w)
			}
			s.ops = append(s.ops, o)
		}
		sessions = append(sessions, s)
	}

	var buf bytes.Buffer
	timings := make([]int64, 0, 1<<16)
	tAll := time.Now()
	for si, s := range sessions {
		var ft *FlaggingTracker
		var st *ScriptTracker
		if s.flagging {
			ft = NewFlaggingTracker(s.tokens)
		} else {
			st = NewScriptTracker(s.tokens)
		}
		for oi, o := range s.ops {
			var out []Out
			switch o.kind {
			case "feed":
				t0 := time.Now()
				if ft != nil {
					out = ft.Feed(o.ev, o.now)
				} else {
					out = positionsOut(st.Feed(o.ev, o.now))
				}
				dt := time.Since(t0).Nanoseconds()
				if o.timed {
					timings = append(timings, dt)
				}
			case "tick":
				if ft != nil {
					out = ft.Tick(o.now)
				} else {
					out = positionsOut(st.Tick(o.now))
				}
			default:
				if ft != nil {
					out = ft.ResetTo(o.word, o.now)
				} else {
					out = positionsOut(st.ResetTo(o.word, o.now))
				}
			}
			for _, e := range out {
				buf.WriteString(`{"e": `)
				writeOut(&buf, e)
				fmt.Fprintf(&buf, `, "o": %d, "s": %d}`+"\n", oi, si)
			}
			if st != nil {
				if c := st.TakeClosedSegment(); c != nil {
					buf.WriteString(`{"closed": `)
					writeClosed(&buf, c)
					fmt.Fprintf(&buf, `, "o": %d, "s": %d}`+"\n", oi, si)
				}
			}
		}
	}
	total := time.Since(tAll).Nanoseconds()
	must(os.WriteFile(dst, buf.Bytes(), 0o644))
	tj, _ := json.Marshal(map[string]any{"feeds": timings, "total_ns": total})
	must(os.WriteFile(dst+".timing", tj, 0o644))
}

type fuzzCase struct {
	K      string   `json:"k"`
	W      string   `json:"w"`
	A      string   `json:"a"`
	B      string   `json:"b"`
	Heard  []string `json:"heard"`
	Script []string `json:"script"`
	Anchor int      `json:"anchor"`
}

func fuzz(src, dst string) {
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)
	_ = w
	for _, line := range readLines(src) {
		var c fuzzCase
		must(json.Unmarshal(line, &c))
		var b bytes.Buffer
		switch c.K {
		case "norm":
			pyStr(&b, normalizeWord(c.W))
		case "match":
			if wordsMatch(c.A, c.B) {
				b.WriteString("true")
			} else {
				b.WriteString("false")
			}
		case "ratio":
			pyStr(&b, pyFloat(seqRatio([]rune(c.A), []rune(c.B))))
		case "split":
			strList(&b, scriptWords(c.W))
		case "key":
			pyStr(&b, spokenKey(c.W))
		case "locate":
			l := locate(c.Heard, c.Script, c.Anchor)
			fmt.Fprintf(&b, "[%d, %d, ", l.Read, l.Matched)
			optStr(&b, l.Jump)
			b.WriteString(", ")
			span(&b, l.Skipped)
			fmt.Fprintf(&b, ", %d, ", l.Start)
			optInt(&b, l.First)
			b.WriteString("]")
		case "align":
			b.WriteByte('[')
			for i, m := range align(c.Heard, c.Script, c.Anchor) {
				if i > 0 {
					b.WriteString(", ")
				}
				optInt(&b, m)
			}
			b.WriteByte(']')
		default:
			panic(c.K)
		}
		buf.WriteString(`{"r": `)
		buf.Write(b.Bytes())
		buf.WriteString("}\n")
	}
	must(os.WriteFile(dst, buf.Bytes(), 0o644))
}

func main() {
	args := os.Args[1:]
	if len(args) > 0 && args[0] == "-native" {
		useNative = true
		args = args[1:]
	}
	switch args[0] {
	case "replay":
		replay(args[1], args[2])
	case "fuzz":
		fuzz(args[1], args[2])
	default:
		fmt.Fprintln(os.Stderr, "usage: go-tracker [-native] replay|fuzz IN OUT")
		os.Exit(2)
	}
}
