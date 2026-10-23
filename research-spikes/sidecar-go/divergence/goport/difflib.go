package main

import "sort"

// SequenceMatcher is a faithful port of CPython 3.12 difflib.SequenceMatcher over int
// sequences (strings are interned to ints first; equality is all difflib uses).
type SequenceMatcher struct {
	a, b     []int
	isJunk   func(int) bool
	autoJunk bool
	b2j      map[int][]int
	bjunk    map[int]bool
	bpopular map[int]bool
	// scratch for find_longest_match: j2len/newj2len as dense arrays, reset via touched lists
	j2len, newj2len     []int
	touched, newTouched []int
	matching            []Match
	opcodes             []Opcode
}

type Match struct{ A, B, Size int }

type Opcode struct {
	Tag            string
	I1, I2, J1, J2 int
}

func NewSequenceMatcher(isJunk func(int) bool, a, b []int, autoJunk bool) *SequenceMatcher {
	m := &SequenceMatcher{isJunk: isJunk, autoJunk: autoJunk}
	m.a = a
	m.b = b
	m.chainB()
	return m
}

func (m *SequenceMatcher) chainB() {
	b := m.b
	m.b2j = make(map[int][]int)
	for i, elt := range b {
		m.b2j[elt] = append(m.b2j[elt], i)
	}
	m.bjunk = map[int]bool{}
	if m.isJunk != nil {
		for elt := range m.b2j {
			if m.isJunk(elt) {
				m.bjunk[elt] = true
			}
		}
		for elt := range m.bjunk {
			delete(m.b2j, elt)
		}
	}
	m.bpopular = map[int]bool{}
	n := len(b)
	if m.autoJunk && n >= 200 {
		ntest := n/100 + 1
		for elt, idxs := range m.b2j {
			if len(idxs) > ntest {
				m.bpopular[elt] = true
			}
		}
		for elt := range m.bpopular {
			delete(m.b2j, elt)
		}
	}
	m.j2len = make([]int, n+1)
	m.newj2len = make([]int, n+1)
}

func (m *SequenceMatcher) FindLongestMatch(alo, ahi, blo, bhi int) Match {
	a, b, b2j, bjunk := m.a, m.b, m.b2j, m.bjunk
	besti, bestj, bestsize := alo, blo, 0
	// j2len[j+1] holds Python's j2len[j]; index 0 stands for j == -1 (always 0).
	for _, j := range m.touched {
		m.j2len[j+1] = 0
	}
	m.touched = m.touched[:0]
	for i := alo; i < ahi; i++ {
		m.newTouched = m.newTouched[:0]
		for _, j := range b2j[a[i]] {
			if j < blo {
				continue
			}
			if j >= bhi {
				break
			}
			k := m.j2len[j] + 1 // j2len.get(j-1, 0) + 1
			m.newj2len[j+1] = k
			m.newTouched = append(m.newTouched, j)
			if k > bestsize {
				besti, bestj, bestsize = i-k+1, j-k+1, k
			}
		}
		// j2len = newj2len
		for _, j := range m.touched {
			m.j2len[j+1] = 0
		}
		for _, j := range m.newTouched {
			m.j2len[j+1] = m.newj2len[j+1]
			m.newj2len[j+1] = 0
		}
		m.touched, m.newTouched = m.newTouched, m.touched
	}
	for besti > alo && bestj > blo && !bjunk[b[bestj-1]] && a[besti-1] == b[bestj-1] {
		besti, bestj, bestsize = besti-1, bestj-1, bestsize+1
	}
	for besti+bestsize < ahi && bestj+bestsize < bhi && !bjunk[b[bestj+bestsize]] && a[besti+bestsize] == b[bestj+bestsize] {
		bestsize++
	}
	for besti > alo && bestj > blo && bjunk[b[bestj-1]] && a[besti-1] == b[bestj-1] {
		besti, bestj, bestsize = besti-1, bestj-1, bestsize+1
	}
	for besti+bestsize < ahi && bestj+bestsize < bhi && bjunk[b[bestj+bestsize]] && a[besti+bestsize] == b[bestj+bestsize] {
		bestsize++
	}
	return Match{besti, bestj, bestsize}
}

func (m *SequenceMatcher) GetMatchingBlocks() []Match {
	if m.matching != nil {
		return m.matching
	}
	la, lb := len(m.a), len(m.b)
	type q struct{ alo, ahi, blo, bhi int }
	queue := []q{{0, la, 0, lb}}
	var blocks []Match
	for len(queue) > 0 {
		x := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		mt := m.FindLongestMatch(x.alo, x.ahi, x.blo, x.bhi)
		i, j, k := mt.A, mt.B, mt.Size
		if k != 0 {
			blocks = append(blocks, mt)
			if x.alo < i && x.blo < j {
				queue = append(queue, q{x.alo, i, x.blo, j})
			}
			if i+k < x.ahi && j+k < x.bhi {
				queue = append(queue, q{i + k, x.ahi, j + k, x.bhi})
			}
		}
	}
	sort.Slice(blocks, func(p, r int) bool { // tuple order (i, j, k)
		if blocks[p].A != blocks[r].A {
			return blocks[p].A < blocks[r].A
		}
		if blocks[p].B != blocks[r].B {
			return blocks[p].B < blocks[r].B
		}
		return blocks[p].Size < blocks[r].Size
	})
	i1, j1, k1 := 0, 0, 0
	out := []Match{}
	for _, bl := range blocks {
		if i1+k1 == bl.A && j1+k1 == bl.B {
			k1 += bl.Size
		} else {
			if k1 != 0 {
				out = append(out, Match{i1, j1, k1})
			}
			i1, j1, k1 = bl.A, bl.B, bl.Size
		}
	}
	if k1 != 0 {
		out = append(out, Match{i1, j1, k1})
	}
	out = append(out, Match{la, lb, 0})
	m.matching = out
	return out
}

func (m *SequenceMatcher) GetOpcodes() []Opcode {
	if m.opcodes != nil {
		return m.opcodes
	}
	i, j := 0, 0
	answer := []Opcode{}
	for _, mb := range m.GetMatchingBlocks() {
		ai, bj, size := mb.A, mb.B, mb.Size
		tag := ""
		if i < ai && j < bj {
			tag = "replace"
		} else if i < ai {
			tag = "delete"
		} else if j < bj {
			tag = "insert"
		}
		if tag != "" {
			answer = append(answer, Opcode{tag, i, ai, j, bj})
		}
		i, j = ai+size, bj+size
		if size != 0 {
			answer = append(answer, Opcode{"equal", ai, i, bj, j})
		}
	}
	m.opcodes = answer
	return answer
}

func (m *SequenceMatcher) Ratio() float64 {
	matches := 0
	for _, mb := range m.GetMatchingBlocks() {
		matches += mb.Size
	}
	length := len(m.a) + len(m.b)
	if length == 0 {
		return 1.0
	}
	return 2.0 * float64(matches) / float64(length)
}

// Interner maps strings to ints so the matcher compares ints.
type Interner map[string]int

func (in Interner) IDs(tokens []string) []int {
	out := make([]int, len(tokens))
	for i, t := range tokens {
		id, ok := in[t]
		if !ok {
			id = len(in)
			in[t] = id
		}
		out[i] = id
	}
	return out
}
