package extraction

import (
	"math/rand/v2"
	"strings"
	"testing"
	"unicode/utf16"
)

// Fixed seed: the gate is deterministic (ADR 0044).
func newRand() *rand.Rand { return rand.New(rand.NewPCG(44, 1080)) }

var pieces = []string{
	"a", "b", "Z", " ", "  ", "\n", "\t", "'", "\"", "\u2018", "\u2019", "\u201c", "\u201d", "\u00a0", "\u2009", "\u202f",
	"\u00e9", "\u4e16", "\U0001F600", "\U0001D11E", "\ufffd", "\xff", "\xc3", "\xed\xa0\x80", "\xf0\x9f", "the", "Dark",
}

func randString(r *rand.Rand, n int) string {
	var b strings.Builder
	for i := r.IntN(n + 1); i > 0; i-- {
		b.WriteString(pieces[r.IntN(len(pieces))])
	}
	return b.String()
}

func TestPropertyOffsetsSliceBackToTheFoldedQuote(t *testing.T) {
	r := newRand()
	found, tried := 0, 0
	for i := 0; i < 3000; i++ {
		var ps []Paragraph
		for j := 0; j < 1+r.IntN(4); j++ {
			ps = append(ps, Paragraph{ID: string(rune('a' + j)), ChapterID: string(rune('x' + r.IntN(2))), Text: randString(r, 12)})
		}
		// Half the quotes are cut from a paragraph so they can be found, half are random.
		quote := randString(r, 3)
		if r.IntN(2) == 0 {
			u := units(ps[r.IntN(len(ps))].Text)
			if len(u) > 0 {
				a := r.IntN(len(u))
				b := a + r.IntN(len(u)-a+1)
				quote = string(utf16.Decode(u[a:b]))
			}
		}
		hint := QuoteHint{ParagraphID: ps[r.IntN(len(ps))].ID, ChapterID: string(rune('x' + r.IntN(2)))}
		tried++
		ev, ok := VerifyEvidence(ps, quote, hint)
		if !ok {
			continue
		}
		found++
		var p Paragraph
		for _, c := range ps {
			if c.ID == ev.ParagraphID {
				p = c
			}
		}
		pu := units(fold(p.Text))
		if ev.Start < 0 || ev.End > len(pu) || ev.Start >= ev.End {
			t.Fatalf("offsets %d..%d outside %d units: %q", ev.Start, ev.End, len(pu), p.Text)
		}
		want := units(fold(strings.TrimSpace(quote)))
		if got := pu[ev.Start:ev.End]; string(utf16.Decode(got)) != string(utf16.Decode(want)) {
			t.Fatalf("offsets slice to %q, want folded quote %q", utf16.Decode(got), utf16.Decode(want))
		}
		if ev.Text != string(utf16.Decode(units(p.Text)[ev.Start:ev.End])) {
			t.Fatalf("Text %q is not the manuscript's slice", ev.Text)
		}
	}
	// The generator must reach the interesting case, or the property is vacuous.
	if found < tried/10 {
		t.Fatalf("only %d of %d quotes were found; the generator no longer reaches evidence", found, tried)
	}
}

func TestPropertyFingerprintIsIdempotentOverItsOwnFold(t *testing.T) {
	r := newRand()
	for i := 0; i < 3000; i++ {
		s := randString(r, 12)
		once := norm(s)
		if twice := norm(once); twice != once {
			t.Fatalf("norm(%q) = %q, norm again = %q", s, once, twice)
		}
		p := Payload{Kind: KindProperty, Entry: s, Key: randString(r, 4), Value: randString(r, 6)}
		q := Payload{Kind: KindProperty, Entry: norm(p.Entry), Key: norm(p.Key), Value: norm(p.Value)}
		if Fingerprint(p) != Fingerprint(q) {
			t.Fatalf("fingerprint changes when its input is already folded: %+v", p)
		}
	}
}

func TestPropertyNoPanicOnInvalidText(t *testing.T) {
	r := newRand()
	for i := 0; i < 3000; i++ {
		raw := make([]byte, r.IntN(24))
		for j := range raw {
			raw[j] = byte(r.IntN(256))
		}
		s := string(raw)
		VerifyEvidence([]Paragraph{{ID: "p", Text: s}, {ID: "q", Text: randString(r, 8)}}, randString(r, 3)+s[:len(s)/2], QuoteHint{ParagraphID: "p"})
		VerifyEvidence([]Paragraph{{ID: "p", Text: randString(r, 8)}}, s, QuoteHint{})
		for _, k := range []Kind{KindEntry, KindAlias, KindProperty, KindRelationship, KindClaim, KindSpeaker} {
			Fingerprint(Payload{Kind: k, Name: s, Entry: s, Alias: s, Key: s, Value: s, To: s, Relation: s, Text: s, Quote: s, Speaker: s})
		}
	}
}

func TestPropertyFoldKeepsEveryOffset(t *testing.T) {
	r := newRand()
	for i := 0; i < 3000; i++ {
		s := randString(r, 16)
		if got, want := len(units(fold(s))), len(units(s)); got != want {
			t.Fatalf("fold(%q) has %d units, want %d", s, got, want)
		}
	}
	// Two bad bytes in a row are two units, so a quote after them keeps its offset.
	ev, ok := VerifyEvidence([]Paragraph{{ID: "p", Text: "\xff\xfeend"}}, "end", QuoteHint{})
	if !ok || ev.Start != 2 || ev.End != 5 {
		t.Fatalf("got %+v ok=%v, want 2..5", ev, ok)
	}
}
