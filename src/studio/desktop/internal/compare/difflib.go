package compare

import "sort"

// Opcode is one of difflib's get_opcodes() tuples: Tag is "equal",
// "replace", "delete" or "insert", over a[I1:I2] and b[J1:J2].
type Opcode struct {
	Tag            string
	I1, I2, J1, J2 int
}

// Match is one of difflib's get_matching_blocks() triples.
type Match struct{ A, B, Size int }

// SequenceMatcher is CPython 3.12's difflib.SequenceMatcher with isjunk None,
// over any comparable element. Its tie order, its matching-block merge and,
// with autojunk, its "popular element" rule (an element of b, when b has 200
// or more items, that appears in more than 1% of it plus one) are Python's,
// so its opcodes are the ones Python computes.
type SequenceMatcher[T comparable] struct {
	a, b []T
	b2j  map[T][]int
	// j2len and newj2len are find_longest_match's dicts as dense arrays (index
	// j+1 holds the entry for j), with the indexes each one has set.
	j2len, newj2len     []int
	touched, newTouched []int
	blocks              []Match
}

// NewSequenceMatcher is SequenceMatcher(None, a, b, autojunk).
func NewSequenceMatcher[T comparable](a, b []T, autojunk bool) *SequenceMatcher[T] {
	s := &SequenceMatcher[T]{a: a, b: b, b2j: map[T][]int{}}
	for i, element := range b {
		s.b2j[element] = append(s.b2j[element], i)
	}
	if n := len(b); autojunk && n >= 200 {
		limit := n/100 + 1
		for element, indexes := range s.b2j {
			if len(indexes) > limit {
				delete(s.b2j, element)
			}
		}
	}
	s.j2len = make([]int, len(b)+1)
	s.newj2len = make([]int, len(b)+1)
	return s
}

// findLongestMatch is find_longest_match(alo, ahi, blo, bhi).
func (s *SequenceMatcher[T]) findLongestMatch(alo, ahi, blo, bhi int) Match {
	a, b := s.a, s.b
	bestI, bestJ, bestSize := alo, blo, 0
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
			k := s.j2len[j] + 1 // j2len.get(j-1, 0) + 1
			s.newj2len[j+1] = k
			s.newTouched = append(s.newTouched, j+1)
			if k > bestSize {
				bestI, bestJ, bestSize = i-k+1, j-k+1, k
			}
		}
		for _, t := range s.touched {
			s.j2len[t] = 0
		}
		s.j2len, s.newj2len = s.newj2len, s.j2len
		s.touched, s.newTouched = s.newTouched, s.touched
	}
	// With isjunk None no element is junk, so only the extensions over
	// elements autojunk removed from b2j can fire.
	for bestI > alo && bestJ > blo && a[bestI-1] == b[bestJ-1] {
		bestI, bestJ, bestSize = bestI-1, bestJ-1, bestSize+1
	}
	for bestI+bestSize < ahi && bestJ+bestSize < bhi && a[bestI+bestSize] == b[bestJ+bestSize] {
		bestSize++
	}
	return Match{bestI, bestJ, bestSize}
}

// MatchingBlocks is get_matching_blocks(), ending with the (len(a), len(b),
// 0) sentinel.
// FindLongestMatch is find_longest_match(alo, ahi, blo, bhi): the longest
// matching block in a[alo:ahi] and b[blo:bhi], the earliest in a and then in b
// on a tie.
func (s *SequenceMatcher[T]) FindLongestMatch(alo, ahi, blo, bhi int) Match {
	return s.findLongestMatch(alo, ahi, blo, bhi)
}

func (s *SequenceMatcher[T]) MatchingBlocks() []Match {
	if s.blocks != nil {
		return s.blocks
	}
	la, lb := len(s.a), len(s.b)
	queue := [][4]int{{0, la, 0, lb}}
	found := []Match{}
	for len(queue) > 0 {
		q := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		alo, ahi, blo, bhi := q[0], q[1], q[2], q[3]
		m := s.findLongestMatch(alo, ahi, blo, bhi)
		if m.Size == 0 {
			continue
		}
		found = append(found, m)
		if alo < m.A && blo < m.B {
			queue = append(queue, [4]int{alo, m.A, blo, m.B})
		}
		if m.A+m.Size < ahi && m.B+m.Size < bhi {
			queue = append(queue, [4]int{m.A + m.Size, ahi, m.B + m.Size, bhi})
		}
	}
	sort.Slice(found, func(x, y int) bool {
		p, q := found[x], found[y]
		if p.A != q.A {
			return p.A < q.A
		}
		if p.B != q.B {
			return p.B < q.B
		}
		return p.Size < q.Size
	})
	blocks := []Match{}
	i1, j1, k1 := 0, 0, 0
	for _, m := range found {
		if i1+k1 == m.A && j1+k1 == m.B {
			k1 += m.Size
			continue
		}
		if k1 > 0 {
			blocks = append(blocks, Match{i1, j1, k1})
		}
		i1, j1, k1 = m.A, m.B, m.Size
	}
	if k1 > 0 {
		blocks = append(blocks, Match{i1, j1, k1})
	}
	s.blocks = append(blocks, Match{la, lb, 0})
	return s.blocks
}

// Opcodes is get_opcodes().
func (s *SequenceMatcher[T]) Opcodes() []Opcode {
	i, j := 0, 0
	out := []Opcode{}
	for _, m := range s.MatchingBlocks() {
		tag := ""
		switch {
		case i < m.A && j < m.B:
			tag = "replace"
		case i < m.A:
			tag = "delete"
		case j < m.B:
			tag = "insert"
		}
		if tag != "" {
			out = append(out, Opcode{tag, i, m.A, j, m.B})
		}
		i, j = m.A+m.Size, m.B+m.Size
		if m.Size > 0 {
			out = append(out, Opcode{"equal", m.A, i, m.B, j})
		}
	}
	return out
}

// Ratio is ratio(): 2*M/T, with M the matched elements and T both lengths,
// and 1.0 for two empty sequences.
func (s *SequenceMatcher[T]) Ratio() float64 {
	matched := 0
	for _, m := range s.MatchingBlocks() {
		matched += m.Size
	}
	total := len(s.a) + len(s.b)
	if total == 0 {
		return 1.0
	}
	return 2.0 * float64(matched) / float64(total)
}
