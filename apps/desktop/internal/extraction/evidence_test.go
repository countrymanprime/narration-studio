package extraction

import (
	"strings"
	"testing"
	"unicode/utf16"
)

var paras = []Paragraph{
	{ID: "a", ChapterID: "1", Text: "It was \u201ca dark and stormy\u201d night, she\u2019s sure."},
	{ID: "b", ChapterID: "2", Text: "The storm came. It was a dark and stormy night."},
	{ID: "c", ChapterID: "2", Text: "Another dark and stormy line."},
}

func sliceUnits(s string, start, end int) string {
	return string(utf16.Decode(utf16.Encode([]rune(s))[start:end]))
}

func TestVerifyFindsAQuoteAndComputesOffsets(t *testing.T) {
	ev, ok := VerifyEvidence(paras, "dark and stormy", QuoteHint{ParagraphID: "b"})
	if !ok || ev.ParagraphID != "b" || ev.Text != "dark and stormy" {
		t.Fatalf("got %+v ok=%v", ev, ok)
	}
	if got := sliceUnits(paras[1].Text, ev.Start, ev.End); got != ev.Text {
		t.Fatalf("offsets slice to %q, want %q", got, ev.Text)
	}
}

func TestOffsetsAreUTF16CodeUnits(t *testing.T) {
	// The emoji is two UTF-16 units and four bytes; the quote starts after it and the space.
	ps := []Paragraph{{ID: "p", Text: "\U0001F600 say hello"}}
	ev, ok := VerifyEvidence(ps, "hello", QuoteHint{})
	if !ok || ev.Start != 7 || ev.End != 12 {
		t.Fatalf("got %+v ok=%v, want 7..12", ev, ok)
	}
	ev, ok = VerifyEvidence(ps, "\U0001F600 say", QuoteHint{})
	if !ok || ev.Start != 0 || ev.End != 6 || ev.Text != "\U0001F600 say" {
		t.Fatalf("got %+v ok=%v, want 0..6", ev, ok)
	}
}

func TestQuotesFoldTypography(t *testing.T) {
	ev, ok := VerifyEvidence(paras, "she's sure", QuoteHint{ParagraphID: "a"})
	if !ok || ev.Text != "she\u2019s sure" {
		t.Fatalf("apostrophe: %+v ok=%v", ev, ok)
	}
	ev, ok = VerifyEvidence(paras, `"a dark and stormy"`, QuoteHint{})
	if !ok || ev.Text != "\u201ca dark and stormy\u201d" {
		t.Fatalf("double quotes: %+v ok=%v", ev, ok)
	}
	// Curly quote in the query matches a straight one in the text, and spaces fold both ways.
	ps := []Paragraph{{ID: "p", Text: "say \"hi\" to\u00a0her\u202fnow"}}
	ev, ok = VerifyEvidence(ps, "\u201chi\u201d to her now", QuoteHint{})
	if !ok || ev.Text != "\"hi\" to\u00a0her\u202fnow" {
		t.Fatalf("spaces: %+v ok=%v", ev, ok)
	}
	if got := sliceUnits(ps[0].Text, ev.Start, ev.End); got != ev.Text {
		t.Fatalf("offsets slice to %q", got)
	}
}

func TestSearchOrder(t *testing.T) {
	cases := []struct {
		name string
		hint QuoteHint
		want string
	}{
		{"named paragraph first", QuoteHint{ParagraphID: "c"}, "c"},
		{"then the rest of its chapter", QuoteHint{ChapterID: "2"}, "b"},
		{"named paragraph beats its chapter", QuoteHint{ParagraphID: "c", ChapterID: "2"}, "c"},
		{"then the whole book", QuoteHint{}, "a"},
		{"a hint that matches nothing falls through to the book", QuoteHint{ParagraphID: "zz", ChapterID: "9"}, "a"},
		{"a named paragraph without the quote falls through to its chapter", QuoteHint{ParagraphID: "a", ChapterID: "2"}, "a"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ev, ok := VerifyEvidence(paras, "dark and stormy", tc.hint)
			if !ok || ev.ParagraphID != tc.want {
				t.Fatalf("got %+v ok=%v, want paragraph %s", ev, ok, tc.want)
			}
		})
	}
	ev, ok := VerifyEvidence(paras, "storm came", QuoteHint{ParagraphID: "a", ChapterID: "2"})
	if !ok || ev.ParagraphID != "b" {
		t.Fatalf("chapter before book: %+v", ev)
	}
	if ev, ok := VerifyEvidence(paras, "bright and sunny", QuoteHint{ParagraphID: "a"}); ok {
		t.Fatalf("a missing quote must not be guessed: %+v", ev)
	}
}

func TestEmptyQuoteIsNotFound(t *testing.T) {
	for _, q := range []string{"", " ", "   ", "\t\n", "\u00a0", "\u2009\u202f"} {
		if ev, ok := VerifyEvidence(paras, q, QuoteHint{ParagraphID: "a"}); ok {
			t.Fatalf("%q found %+v", q, ev)
		}
	}
	if _, ok := VerifyEvidence(nil, "x", QuoteHint{}); ok {
		t.Fatal("no paragraphs found a quote")
	}
	if _, ok := VerifyEvidence([]Paragraph{{ID: "p", Text: strings.Repeat("x", 3)}}, "xxxx", QuoteHint{}); ok {
		t.Fatal("a quote longer than the text was found")
	}
}
