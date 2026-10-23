// Port of difflib.SequenceMatcher (CPython 3.12) over token lists, isjunk=None.
package main

import "sort"

type match struct{ a, b, size int }

type SequenceMatcher struct {
	a, b     []string
	b2j      map[string][]int
	bpopular map[string]bool
	// j2len / newj2len as dense arrays (index j+1) with touched lists, standing in for Python's dicts.
	j2len, newj2len     []int
	touched, newTouched []int
}

func NewSequenceMatcher(a, b []string, autojunk bool) *SequenceMatcher {
	s := &SequenceMatcher{a: a, b: b, b2j: map[string][]int{}, bpopular: map[string]bool{}}
	for i, elt := range b {
		s.b2j[elt] = append(s.b2j[elt], i)
	}
	n := len(b)
	if autojunk && n >= 200 {
		ntest := n/100 + 1
		for elt, idxs := range s.b2j {
			if len(idxs) > ntest {
				s.bpopular[elt] = true
			}
		}
		for elt := range s.bpopular {
			delete(s.b2j, elt)
		}
	}
	s.j2len = make([]int, n+1)
	s.newj2len = make([]int, n+1)
	return s
}

func (s *SequenceMatcher) findLongestMatch(alo, ahi, blo, bhi int) match {
	a, b := s.a, s.b
	besti, bestj, bestsize := alo, blo, 0
	for _, t := range s.touched {
		s.j2len[t] = 0
	}
	s.touched = s.touched[:0]
	for i := alo; i < ahi; i++ {
		s.newTouched = s.newTouched[:0]
		for _, j := range s.b2j[a[i]] {
			if j < blo {
				continue
			}
			if j >= bhi {
				break
			}
			k := s.j2len[j] + 1 // j2len[(j-1)+1]
			s.newj2len[j+1] = k
			s.newTouched = append(s.newTouched, j+1)
			if k > bestsize {
				besti, bestj, bestsize = i-k+1, j-k+1, k
			}
		}
		for _, t := range s.touched {
			s.j2len[t] = 0
		}
		s.j2len, s.newj2len = s.newj2len, s.j2len
		s.touched, s.newTouched = s.newTouched, s.touched
	}
	// bjunk is always empty (isjunk=None), so only the non-junk extension loops can fire,
	// and only around popular elements removed by autojunk.
	for besti > alo && bestj > blo && a[besti-1] == b[bestj-1] {
		besti, bestj, bestsize = besti-1, bestj-1, bestsize+1
	}
	for besti+bestsize < ahi && bestj+bestsize < bhi && a[besti+bestsize] == b[bestj+bestsize] {
		bestsize++
	}
	return match{besti, bestj, bestsize}
}

func (s *SequenceMatcher) GetMatchingBlocks() []match {
	la, lb := len(s.a), len(s.b)
	queue := [][4]int{{0, la, 0, lb}}
	blocks := []match{}
	for len(queue) > 0 {
		q := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		alo, ahi, blo, bhi := q[0], q[1], q[2], q[3]
		x := s.findLongestMatch(alo, ahi, blo, bhi)
		i, j, k := x.a, x.b, x.size
		if k > 0 {
			blocks = append(blocks, x)
			if alo < i && blo < j {
				queue = append(queue, [4]int{alo, i, blo, j})
			}
			if i+k < ahi && j+k < bhi {
				queue = append(queue, [4]int{i + k, ahi, j + k, bhi})
			}
		}
	}
	sort.Slice(blocks, func(x, y int) bool {
		p, q := blocks[x], blocks[y]
		if p.a != q.a {
			return p.a < q.a
		}
		if p.b != q.b {
			return p.b < q.b
		}
		return p.size < q.size
	})
	i1, j1, k1 := 0, 0, 0
	out := []match{}
	for _, m := range blocks {
		if i1+k1 == m.a && j1+k1 == m.b {
			k1 += m.size
		} else {
			if k1 > 0 {
				out = append(out, match{i1, j1, k1})
			}
			i1, j1, k1 = m.a, m.b, m.size
		}
	}
	if k1 > 0 {
		out = append(out, match{i1, j1, k1})
	}
	return append(out, match{la, lb, 0})
}

func (s *SequenceMatcher) GetOpcodes() []Opcode {
	i, j := 0, 0
	out := []Opcode{}
	for _, m := range s.GetMatchingBlocks() {
		tag := ""
		switch {
		case i < m.a && j < m.b:
			tag = "replace"
		case i < m.a:
			tag = "delete"
		case j < m.b:
			tag = "insert"
		}
		if tag != "" {
			out = append(out, Opcode{tag, i, m.a, j, m.b})
		}
		i, j = m.a+m.size, m.b+m.size
		if m.size > 0 {
			out = append(out, Opcode{"equal", m.a, i, m.b, j})
		}
	}
	return out
}
