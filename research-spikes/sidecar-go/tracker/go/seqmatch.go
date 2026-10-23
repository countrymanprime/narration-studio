package main

// seqRatio is difflib.SequenceMatcher(None, a, b).ratio() (CPython 3.12): isjunk None, autojunk on.
func seqRatio(a, b []rune) float64 {
	la, lb := len(a), len(b)
	if la+lb == 0 {
		return 1.0
	}
	// __chain_b
	b2j := make(map[rune][]int, lb)
	for j, r := range b {
		b2j[r] = append(b2j[r], j)
	}
	if lb >= 200 {
		ntest := lb/100 + 1
		var popular []rune
		for r, idx := range b2j {
			if len(idx) > ntest {
				popular = append(popular, r)
			}
		}
		for _, r := range popular {
			delete(b2j, r)
		}
	}
	m := &matcher{a: a, b: b, b2j: b2j, prev: make([]int, lb+1), cur: make([]int, lb+1)}
	type span struct{ alo, ahi, blo, bhi int }
	queue := []span{{0, la, 0, lb}}
	matches := 0
	for len(queue) > 0 {
		q := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		i, j, k := m.longest(q.alo, q.ahi, q.blo, q.bhi)
		if k > 0 {
			matches += k
			if q.alo < i && q.blo < j {
				queue = append(queue, span{q.alo, i, q.blo, j})
			}
			if i+k < q.ahi && j+k < q.bhi {
				queue = append(queue, span{i + k, q.ahi, j + k, q.bhi})
			}
		}
	}
	return 2.0 * float64(matches) / float64(la+lb)
}

type matcher struct {
	a, b      []rune
	b2j       map[rune][]int
	prev, cur []int // j2len / newj2len as dense rows indexed j+1; touched lists reset them
	pt, ct    []int
}

// longest is find_longest_match with an empty bjunk set (so its junk-extension loops never run).
func (m *matcher) longest(alo, ahi, blo, bhi int) (int, int, int) {
	a, b := m.a, m.b
	besti, bestj, bestsize := alo, blo, 0
	for _, t := range m.pt {
		m.prev[t] = 0
	}
	m.pt = m.pt[:0]
	for i := alo; i < ahi; i++ {
		m.ct = m.ct[:0]
		for _, j := range m.b2j[a[i]] {
			if j < blo {
				continue
			}
			if j >= bhi {
				break
			}
			k := m.prev[j] + 1 // prev indexed j means j2len[j-1]
			m.cur[j+1] = k
			m.ct = append(m.ct, j+1)
			if k > bestsize {
				besti, bestj, bestsize = i-k+1, j-k+1, k
			}
		}
		for _, t := range m.pt {
			m.prev[t] = 0
		}
		m.prev, m.cur = m.cur, m.prev
		m.pt, m.ct = m.ct, m.pt
	}
	for besti > alo && bestj > blo && a[besti-1] == b[bestj-1] {
		besti, bestj, bestsize = besti-1, bestj-1, bestsize+1
	}
	for besti+bestsize < ahi && bestj+bestsize < bhi && a[besti+bestsize] == b[bestj+bestsize] {
		bestsize++
	}
	return besti, bestj, bestsize
}
