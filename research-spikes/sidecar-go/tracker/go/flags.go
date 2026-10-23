package main

import (
	"math/big"
	"sort"
	"strings"
)

// Port of core/flags.py and the parts of libs/python/narration_common/spoken_forms.py it uses.

var numberWords = map[string]int64{
	"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
	"ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
	"seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
	"sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100, "thousand": 1000,
	"million": 1000000, "billion": 1000000000,
}

var fillerWords = map[string]bool{"uh": true, "um": true, "umm": true, "uhh": true, "erm": true, "hmm": true, "mhm": true, "huh": true}

var homophoneGroups = [][]string{
	{"your", "you're"}, {"their", "there", "they're"}, {"its", "it's"}, {"whose", "who's"}, {"weather", "whether"},
	{"write", "right"}, {"here", "hear"}, {"new", "knew"}, {"know", "no"}, {"break", "brake"}, {"threw", "through"},
	{"passed", "past"}, {"peace", "piece"}, {"plain", "plane"}, {"sea", "see"}, {"way", "weigh"}, {"weak", "week"},
	{"which", "witch"}, {"would", "wood"}, {"allowed", "aloud"}, {"bare", "bear"}, {"board", "bored"},
	{"buy", "by", "bye"}, {"cell", "sell"}, {"flower", "flour"}, {"hole", "whole"}, {"hour", "our"}, {"made", "maid"},
	{"mail", "male"}, {"meat", "meet"}, {"night", "knight"}, {"pair", "pear"}, {"principal", "principle"},
	{"sale", "sail"}, {"sight", "site", "cite"}, {"sole", "soul"}, {"son", "sun"}, {"stair", "stare"},
	{"steal", "steel"}, {"tail", "tale"}, {"waist", "waste"}, {"wait", "weight"}, {"miner", "minor"},
	{"miners", "minors"}, {"vane", "vein"}, {"vanes", "veins"},
}

var homophoneCanon = func() map[string]string {
	m := map[string]string{}
	for _, g := range homophoneGroups {
		for _, w := range g {
			m[w] = g[0]
		}
	}
	return m
}()

var quoteFold = strings.NewReplacer("‘", "'", "’", "'", "‛", "'", "ʼ", "'", "`", "'", "´", "'",
	"“", `"`, "”", `"`, "„", `"`, "‟", `"`)

func isTokenByte(c byte) bool {
	return c == '\'' || ('0' <= c && c <= '9') || ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z')
}

func canonicalTokens(text string) []string {
	s := quoteFold.Replace(text)
	var out []string
	for i := 0; i < len(s); {
		if !isTokenByte(s[i]) {
			i++
			continue
		}
		j := i
		for j < len(s) && isTokenByte(s[j]) {
			j++
		}
		tok := asciiLower(s[i:j])
		if c, ok := homophoneCanon[tok]; ok {
			tok = c
		}
		if strings.HasSuffix(tok, "'s") && len(tok) > 2 {
			tok = tok[:len(tok)-2] + "s"
		}
		out = append(out, tok)
		i = j
	}
	return out
}

// mergeNumberWords uses big.Int: Python ints do not overflow ("hundred hundred ..." grows without bound).
func mergeNumberWords(tokens []string) []string {
	var out []string
	n := len(tokens)
	for i := 0; i < n; {
		if _, ok := numberWords[tokens[i]]; !ok {
			out = append(out, tokens[i])
			i++
			continue
		}
		total, chunk := new(big.Int), new(big.Int)
		j := i
		for j < n {
			if val, ok := numberWords[tokens[j]]; ok {
				switch {
				case val == 100:
					if chunk.Sign() == 0 {
						chunk.SetInt64(1)
					}
					chunk.Mul(chunk, big.NewInt(100))
				case val >= 1000:
					c := new(big.Int).Set(chunk)
					if c.Sign() == 0 {
						c.SetInt64(1)
					}
					total.Add(total, c.Mul(c, big.NewInt(val)))
					chunk.SetInt64(0)
				default:
					chunk.Add(chunk, big.NewInt(val))
				}
				j++
			} else if tokens[j] == "and" && j+1 < n {
				if _, ok := numberWords[tokens[j+1]]; ok {
					j++
				} else {
					break
				}
			} else {
				break
			}
		}
		total.Add(total, chunk)
		out = append(out, total.String())
		i = j
	}
	return out
}

func spokenKey(text string) string {
	return strings.ReplaceAll(strings.Join(mergeNumberWords(canonicalTokens(text)), ""), "'", "")
}

const (
	segmentHeadWords     = 2
	maxMisreadHeardWords = 3
	minRestartWords      = 3
)

var engineDroppedWords = map[string]bool{"a": true, "an": true, "the": true, "and": true, "of": true}

type Flag struct {
	Kind       string
	Start, End int
	Heard      []string
}

type gap struct {
	s1, s2          int
	heard, heardRaw []string
	beforeRaw       string
	afterRaw        string
	echo            bool
}

func soundsLike(heard, written string) bool {
	hk, wk := spokenKey(heard), spokenKey(written)
	return hk != "" && wordsMatch(hk, wk)
}

func sameKey(heard, written string) bool {
	k := spokenKey(heard)
	return k != "" && k == spokenKey(written)
}

func saidRight(g *gap, written []string) bool {
	run := strings.Join(g.heardRaw, " ")
	between := strings.Join(written[g.s1+1:g.s2], " ")
	return soundsLike(run, between) ||
		sameKey(g.beforeRaw+" "+run, written[g.s1]+" "+between) ||
		sameKey(run+" "+g.afterRaw, between+" "+written[g.s2])
}

func jumpFlag(r *SegmentReading, matches []int) *Flag {
	loc := r.Location
	if loc.Jump == "skip" && loc.Skipped != nil {
		if len(matches) > 0 && matches[0] == -1 {
			return nil
		}
		return &Flag{"skipped", loc.Skipped.A, loc.Skipped.B, nil}
	}
	if loc.Jump == "restart" && loc.First != -1 && loc.First < r.Anchor {
		end := min(r.Anchor, loc.Read)
		var heard []string
		for i, raw := range r.HeardRaw {
			if i < len(matches) && matches[i] != -1 && matches[i] < end {
				heard = append(heard, raw)
			}
		}
		return &Flag{"restart", loc.First, end, heard}
	}
	return nil
}

func misread(g *gap, written []string) *Flag {
	if len(g.heard) > maxMisreadHeardWords || saidRight(g, written) {
		return nil
	}
	return &Flag{"misread", g.s1 + 1, g.s2, g.heardRaw}
}

func skippedFlag(g *gap, script []string) *Flag {
	if g.s2-g.s1 == 2 && engineDroppedWords[script[g.s1+1]] {
		return nil
	}
	return &Flag{"skipped", g.s1 + 1, g.s2, nil}
}

func repeatLength(spoken, script []string, s1 int) int {
	count := len(spoken)
	if count > s1+1 {
		return 0
	}
	for offset, w := range spoken {
		if !wordsMatch(w, script[s1-count+1+offset]) {
			return 0
		}
	}
	return count
}

func extraOrRestart(g *gap, script, written []string) *Flag {
	var spoken []string
	for _, w := range g.heard {
		if !fillerWords[w] {
			spoken = append(spoken, w)
		}
	}
	if len(spoken) == 0 || g.echo {
		return nil
	}
	if repeated := repeatLength(spoken, script, g.s1); repeated > 0 {
		if repeated >= minRestartWords {
			return &Flag{"restart", g.s1 - repeated + 1, g.s1 + 1, g.heardRaw}
		}
		return nil
	}
	if saidRight(g, written) {
		return nil
	}
	return &Flag{"extra", g.s2, g.s2, g.heardRaw}
}

func gapFlag(g *gap, script, written []string) *Flag {
	if g.s2 > g.s1+1 {
		if len(g.heard) > 0 {
			return misread(g, written)
		}
		return skippedFlag(g, script)
	}
	if len(g.heard) > 0 {
		return extraOrRestart(g, script, written)
	}
	return nil
}

func echoes(times []*TimePair, matched int) bool {
	if matched+1 >= len(times) || times[matched] == nil || times[matched+1] == nil {
		return false
	}
	return pyLess(times[matched+1].Start, times[matched].End)
}

// pyLess compares two Python numbers (int/float/bool) exactly enough for JSON-sized values.
func pyLess(a, b PyNum) bool {
	if a.Kind != 'f' && b.Kind != 'f' {
		return a.I < b.I
	}
	return a.Float() < b.Float()
}

func segmentFlags(r *SegmentReading, script, written []string) []Flag {
	matches := align(r.Heard, script, r.Location.Start)
	var found []Flag
	if f := jumpFlag(r, matches); f != nil {
		found = append(found, *f)
	}
	type hp struct{ h, s int }
	var pairs []hp
	for h, m := range matches {
		if m != -1 {
			pairs = append(pairs, hp{h, m})
		}
	}
	for i := 0; i+1 < len(pairs); i++ {
		h1, s1, h2, s2 := pairs[i].h, pairs[i].s, pairs[i+1].h, pairs[i+1].s
		if h1+1 < segmentHeadWords {
			continue
		}
		g := gap{s1, s2, r.Heard[h1+1 : h2], r.HeardRaw[h1+1 : h2], r.HeardRaw[h1], r.HeardRaw[h2], echoes(r.HeardTimes, h1)}
		if f := gapFlag(&g, script, written); f != nil {
			found = append(found, *f)
		}
	}
	sort.SliceStable(found, func(i, j int) bool {
		if found[i].Start != found[j].Start {
			return found[i].Start < found[j].Start
		}
		return found[i].End < found[j].End
	})
	return found
}

type FlagEvent struct {
	ID         int
	Kind       string
	Start, End int
	Heard      string
}

type FlaggingTracker struct {
	tracker *ScriptTracker
	script  []string
	written []string
	nextID  int
}

func NewFlaggingTracker(tokens []string) *FlaggingTracker {
	t := NewScriptTracker(tokens)
	f := &FlaggingTracker{tracker: t, script: t.Words(), nextID: 1}
	for p := range f.script {
		f.written = append(f.written, tokens[t.OriginalIndex(p)])
	}
	return f
}

// Out is one emitted event: a position or a flag.
type Out struct {
	Pos  *Position
	Flag *FlagEvent
}

func positionsOut(ps []Position) []Out {
	out := make([]Out, len(ps))
	for i := range ps {
		out[i] = Out{Pos: &ps[i]}
	}
	return out
}

func (f *FlaggingTracker) Feed(ev *Event, now float64) []Out {
	events := positionsOut(f.tracker.Feed(ev, now))
	reading := f.tracker.TakeClosedSegment()
	if reading == nil {
		return events
	}
	for _, fl := range segmentFlags(reading, f.script, f.written) {
		start := f.tracker.OriginalIndex(fl.Start)
		end := start
		if fl.Start != fl.End {
			end = f.tracker.OriginalIndex(fl.End-1) + 1
		}
		events = append(events, Out{Flag: &FlagEvent{f.nextID, fl.Kind, start, end, strings.Join(fl.Heard, " ")}})
		f.nextID++
	}
	return events
}

func (f *FlaggingTracker) Tick(now float64) []Out { return positionsOut(f.tracker.Tick(now)) }

func (f *FlaggingTracker) ResetTo(word int, now float64) []Out {
	return positionsOut(f.tracker.ResetTo(word, now))
}
