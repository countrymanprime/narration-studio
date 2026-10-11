package importer

import (
	"math/rand/v2"
	"testing"
)

// Fixed seed: the gate is deterministic (ADR 0044). Exploring is manual: go test -run='^$' -fuzz=FuzzParse -fuzztime=60s.
func newRand() *rand.Rand { return rand.New(rand.NewPCG(44, 1086)) }

// checkParse parses data, plans it, and holds the results to the package's promises.
func checkParse(t *testing.T, data []byte) {
	t.Helper()
	r := Parse(data, "")
	if len(r.Rows) == 0 && len(r.Errors) == 0 {
		t.Fatalf("neither rows nor errors for %q", data)
	}
	if len(r.Rows)+len(r.Errors) > MaxRows+1 {
		t.Fatalf("%d results is past the row cap", len(r.Rows)+len(r.Errors))
	}
	for _, row := range r.Rows {
		if row.Row <= 0 || row.Where == "" || row.Item.Record == "" {
			t.Fatalf("bad row %+v", row)
		}
		if c := row.Item.Confidence; c != nil && (*c < 0 || *c > 1) {
			t.Fatalf("confidence %v out of range", *c)
		}
	}
	for _, e := range r.Errors {
		if e.Reason == "" {
			t.Fatalf("error without a reason: %+v", e)
		}
	}
	p := PlanImport(testBook(), r.Rows, r.Errors)
	if len(p.Lines)+len(p.Errors) < len(r.Errors) {
		t.Fatalf("plan lost %d parse errors", len(r.Errors)-len(p.Errors))
	}
}

var seeds = [][]byte{
	[]byte(ExampleJSON),
	[]byte(ExampleCSV),
	[]byte("record,name\n\"entry\",\"A\nB"),
	[]byte("[[[[[[[[[["),
	[]byte("\xef\xbb\xbf{\"entries\":null,\"speakers\":null}"),
	[]byte("record;name\r\rentry;A\r"),
}

const junk = "\",;\n\r\t{}[]%"

func mutate(r *rand.Rand, in []byte) []byte {
	b := append([]byte(nil), in...)
	for n := 1 + r.IntN(6); n > 0 && len(b) > 0; n-- {
		i := r.IntN(len(b))
		switch r.IntN(4) {
		case 0:
			b[i] = byte(r.IntN(256))
		case 1:
			b = append(b[:i], b[i+1:]...)
		case 2:
			b = append(b[:i], append([]byte{junk[r.IntN(len(junk))]}, b[i:]...)...)
		default:
			b = b[:i]
		}
	}
	return b
}

func TestFuzzSeededMutationsAndRandomBytes(t *testing.T) {
	r := newRand()
	for _, s := range seeds {
		checkParse(t, s)
	}
	for i := 0; i < 3000; i++ {
		checkParse(t, mutate(r, seeds[r.IntN(len(seeds))]))
	}
	for i := 0; i < 1000; i++ {
		b := make([]byte, r.IntN(300))
		for j := range b {
			b[j] = byte(r.IntN(256))
		}
		checkParse(t, b)
	}
}

func FuzzParse(f *testing.F) {
	for _, s := range seeds {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, data []byte) { checkParse(t, data) })
}
