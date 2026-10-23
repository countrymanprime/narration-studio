package main

// Port of the parts of tests/divergence_harness.py that build a case's transcript: plan_case,
// exact_times, jittered_times (with CPython's Mersenne Twister) and transcript_of.

import (
	"encoding/json"
	"fmt"
	"hash/crc32"
	"os"
	"strings"
)

const (
	wordSeconds          = 0.4
	spokenFraction       = 0.8
	sentencePauseSeconds = 0.3
	restartPauseSeconds  = 0.35
	jitterSeconds        = 0.15
	minWordSeconds       = 0.05
)

type Case struct {
	ID          string
	Description string
	Span        [2]int
	Script      []map[string]string
}

type CasesFile struct {
	SchemaVersion int      `json:"schemaVersion"`
	Paragraphs    []string `json:"paragraphs"`
	Cases         []struct {
		ID          string              `json:"id"`
		Description string              `json:"description"`
		Span        [2]int              `json:"span"`
		Script      []map[string]string `json:"script"`
	} `json:"cases"`
}

type Said struct {
	Text    string
	Segment int
}

type Plan struct {
	Case Case
	Span Span
	Said []Said
}

func loadCases(path string) ([]string, []Case) {
	raw, err := os.ReadFile(path)
	must(err)
	var f CasesFile
	must(json.Unmarshal(raw, &f))
	if f.SchemaVersion != 1 {
		panic("schema")
	}
	var cases []Case
	for _, c := range f.Cases {
		cases = append(cases, Case{c.ID, c.Description, c.Span, c.Script})
	}
	return f.Paragraphs, cases
}

var saying = []string{"read", "misread", "extra", "restart"}
var silent = []string{"skip", "unread"}

func segmentKind(seg map[string]string) string {
	var kinds []string
	for _, k := range append(append([]string{}, saying...), silent...) {
		if _, ok := seg[k]; ok {
			kinds = append(kinds, k)
		}
	}
	if len(kinds) != 1 {
		panic("bad segment")
	}
	return kinds[0]
}

func spoken(text string) []string {
	var out []string
	for _, raw := range pySplit(text) {
		if len(tokenize(raw)) > 0 {
			out = append(out, raw)
		}
	}
	return out
}

func planCase(paragraphs []string, c Case) Plan {
	span, err := buildSpan(paragraphs, c.Span[0], c.Span[1])
	must(err)
	var said []Said
	position := 0
	for index, seg := range c.Script {
		kind := segmentKind(seg)
		text := seg[kind]
		if kind == "extra" || kind == "restart" {
			for _, w := range spoken(text) {
				said = append(said, Said{w, index})
			}
			continue
		}
		consumed := spoken(text)
		for k, w := range consumed {
			if position+k >= len(span.Words) || !eqStrings(tokenize(w), span.Words[position+k].Tokens) {
				panic(fmt.Sprintf("case %s segment %d: not the span's next words", c.ID, index))
			}
		}
		if kind == "read" || kind == "misread" {
			as, ok := seg["as"]
			if !ok {
				as = text
			}
			for _, w := range spoken(as) {
				said = append(said, Said{w, index})
			}
		}
		position += len(consumed)
	}
	return Plan{c, span, said}
}

type Times [][2]float64

func exactTimes(p Plan) Times {
	var times Times
	clock := 0.0
	for i, w := range p.Said {
		times = append(times, [2]float64{pyRound(clock, 3), pyRound(clock+wordSeconds*spokenFraction, 3)})
		clock += wordSeconds
		t := strings.TrimRight(w.Text, "”\"'")
		if strings.HasSuffix(t, ".") || strings.HasSuffix(t, "!") || strings.HasSuffix(t, "?") {
			clock += sentencePauseSeconds
		}
		next := -1
		if i+1 < len(p.Said) {
			next = p.Said[i+1].Segment
		}
		if p.Case.Script[w.Segment]["restart"] != "" && next != w.Segment {
			clock += restartPauseSeconds
		}
	}
	return times
}

func jitteredTimes(p Plan) Times {
	rng := newPyRandom(crc32.ChecksumIEEE([]byte(p.Case.ID)))
	var times Times
	floor := 0.0
	for _, se := range exactTimes(p) {
		start := max(floor, se[0]+rng.uniform(-jitterSeconds, jitterSeconds))
		end := max(start+minWordSeconds, se[1]+rng.uniform(-jitterSeconds, jitterSeconds))
		times = append(times, [2]float64{pyRound(start, 3), pyRound(end, 3)})
		floor = start
	}
	return times
}

func transcriptOf(p Plan, t Times) []Word {
	out := make([]Word, len(p.Said))
	for i, w := range p.Said {
		out[i] = Word{w.Text, t[i][0], t[i][1]}
	}
	return out
}

// ---- CPython random.Random(int) : MT19937 init_by_array, random(), uniform()

type pyRandom struct {
	mt  [624]uint32
	idx int
}

func newPyRandom(seed uint32) *pyRandom {
	r := &pyRandom{}
	key := []uint32{seed} // abs(seed) as 32-bit words; a 0 seed is key [0]
	r.initGenrand(19650218)
	i, j := 1, 0
	n := 624
	k := max(n, len(key))
	for ; k > 0; k-- {
		r.mt[i] = (r.mt[i] ^ ((r.mt[i-1] ^ (r.mt[i-1] >> 30)) * 1664525)) + key[j] + uint32(j)
		i++
		j++
		if i >= n {
			r.mt[0] = r.mt[n-1]
			i = 1
		}
		if j >= len(key) {
			j = 0
		}
	}
	for k = n - 1; k > 0; k-- {
		r.mt[i] = (r.mt[i] ^ ((r.mt[i-1] ^ (r.mt[i-1] >> 30)) * 1566083941)) - uint32(i)
		i++
		if i >= n {
			r.mt[0] = r.mt[n-1]
			i = 1
		}
	}
	r.mt[0] = 0x80000000
	return r
}

func (r *pyRandom) initGenrand(s uint32) {
	r.mt[0] = s
	for i := 1; i < 624; i++ {
		r.mt[i] = 1812433253*(r.mt[i-1]^(r.mt[i-1]>>30)) + uint32(i)
	}
	r.idx = 624
}

func (r *pyRandom) genrand() uint32 {
	const n, m = 624, 397
	mag := [2]uint32{0, 0x9908b0df}
	if r.idx >= n {
		var kk int
		for kk = 0; kk < n-m; kk++ {
			y := (r.mt[kk] & 0x80000000) | (r.mt[kk+1] & 0x7fffffff)
			r.mt[kk] = r.mt[kk+m] ^ (y >> 1) ^ mag[y&1]
		}
		for ; kk < n-1; kk++ {
			y := (r.mt[kk] & 0x80000000) | (r.mt[kk+1] & 0x7fffffff)
			r.mt[kk] = r.mt[kk+(m-n)] ^ (y >> 1) ^ mag[y&1]
		}
		y := (r.mt[n-1] & 0x80000000) | (r.mt[0] & 0x7fffffff)
		r.mt[n-1] = r.mt[m-1] ^ (y >> 1) ^ mag[y&1]
		r.idx = 0
	}
	y := r.mt[r.idx]
	r.idx++
	y ^= y >> 11
	y ^= (y << 7) & 0x9d2c5680
	y ^= (y << 15) & 0xefc60000
	y ^= y >> 18
	return y
}

func (r *pyRandom) random() float64 {
	a, b := r.genrand()>>5, r.genrand()>>6
	return (float64(a)*67108864.0 + float64(b)) * (1.0 / 9007199254740992.0)
}

func (r *pyRandom) uniform(a, b float64) float64 { return a + (b-a)*r.random() }

func must(err error) {
	if err != nil {
		panic(err)
	}
}
