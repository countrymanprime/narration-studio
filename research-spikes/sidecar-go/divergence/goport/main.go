package main

// Driver: same modes and output as ../py_driver.py.
//   divergence cases CASES_JSON OUT [REPEAT]
//   divergence work  WORK_JSON  OUT [REPEAT]
//   divergence fuzz  PAIRS_JSON OUT

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

var t0 = time.Now()

var offsets = []float64{0.0, 1234.567}

func runCases(path string, repeat int) []string {
	paragraphs, cases := loadCases(path)
	var lines []string
	for r := 0; r < repeat; r++ {
		lines = lines[:0]
		for _, c := range cases {
			plan := planCase(paragraphs, c)
			var takes []any
			for _, timing := range []string{"exact", "jitter"} {
				var t Times
				if timing == "exact" {
					t = exactTimes(plan)
				} else {
					t = jitteredTimes(plan)
				}
				tr := transcriptOf(plan, t)
				for _, off := range offsets {
					a := alignTake(plan.Span, tr)
					o := toJSON(a, off)
					o["timing"] = timing
					o["offset"] = PyFloat(off)
					takes = append(takes, o)
				}
			}
			lines = append(lines, Dumps(Obj{"id": c.ID, "span": spanJSON(plan.Span), "takes": takes}))
		}
	}
	return lines
}

type workFile struct {
	Paragraphs []string `json:"paragraphs"`
	Jobs       []struct {
		ID    string `json:"id"`
		First int    `json:"first"`
		Last  int    `json:"last"`
		Takes []struct {
			Offset float64              `json:"offset"`
			Words  [][3]json.RawMessage `json:"words"`
		} `json:"takes"`
	} `json:"jobs"`
}

func runWork(path string, repeat int) []string {
	raw, err := os.ReadFile(path)
	must(err)
	var wf workFile
	must(json.Unmarshal(raw, &wf))
	var lines []string
	for r := 0; r < repeat; r++ {
		lines = lines[:0]
		for _, job := range wf.Jobs {
			span, err := buildSpan(wf.Paragraphs, job.First, job.Last)
			must(err)
			var takes []any
			for _, take := range job.Takes {
				tr := make([]Word, len(take.Words))
				for i, w := range take.Words {
					var text string
					var s, e float64
					must(json.Unmarshal(w[0], &text))
					must(json.Unmarshal(w[1], &s))
					must(json.Unmarshal(w[2], &e))
					tr[i] = Word{text, s, e}
				}
				o := toJSON(alignTake(span, tr), take.Offset)
				o["offset"] = PyFloat(take.Offset)
				takes = append(takes, o)
			}
			lines = append(lines, Dumps(Obj{"id": job.ID, "span": spanJSON(span), "takes": takes}))
		}
	}
	return lines
}

// fuzz: [[a, b, autojunk], ...] -> one line per pair: opcodes and ratio (Python repr).
func runFuzz(path string) []string {
	raw, err := os.ReadFile(path)
	must(err)
	var pairs [][3]json.RawMessage
	must(json.Unmarshal(raw, &pairs))
	var lines []string
	for _, p := range pairs {
		var a, b []string
		var aj bool
		must(json.Unmarshal(p[0], &a))
		must(json.Unmarshal(p[1], &b))
		must(json.Unmarshal(p[2], &aj))
		in := Interner{}
		sm := NewSequenceMatcher(nil, in.IDs(a), in.IDs(b), aj)
		ops := make([]any, 0)
		for _, o := range sm.GetOpcodes() {
			ops = append(ops, []any{o.Tag, o.I1, o.I2, o.J1, o.J2})
		}
		lines = append(lines, Dumps([]any{ops, PyFloat(sm.Ratio())}))
	}
	return lines
}

func main() {
	mode, src, out := os.Args[1], os.Args[2], os.Args[3]
	repeat := 1
	if len(os.Args) > 4 {
		repeat, _ = strconv.Atoi(os.Args[4])
	}
	t1 := time.Now()
	var lines []string
	switch mode {
	case "cases":
		lines = runCases(src, repeat)
	case "work":
		lines = runWork(src, repeat)
	case "fuzz":
		lines = runFuzz(src)
	}
	t2 := time.Now()
	var b strings.Builder
	for _, l := range lines {
		b.WriteString(l)
		b.WriteByte('\n')
	}
	must(os.WriteFile(out, []byte(b.String()), 0o644))
	t3 := time.Now()
	fmt.Fprintf(os.Stderr, "startup_s=%.4f compute_s=%.4f write_s=%.4f\n", t1.Sub(t0).Seconds(), t2.Sub(t1).Seconds(), t3.Sub(t2).Seconds())
}
