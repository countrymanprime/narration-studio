package editlog

import (
	"errors"
	"strings"
	"testing"
)

func TestSpanTextReadsWordsWithinOneLineAndAcrossLines(t *testing.T) {
	book := aliceBook()
	cases := []struct {
		name, start, end, want string
	}{
		{"one word", "p-000001:1", "p-000001:1", "with"},
		{"inside a line", "p-000001:1", "p-000001:3", "with her head!”"},
		{"whole line", "p-000002:0", "p-000002:3", "The soldiers were silent."},
		{"across lines", "p-000001:6", "p-000002:1", "shouted. The soldiers"},
	}
	for _, c := range cases {
		got, err := SpanText(book, "c-0001", c.start, c.end)
		if err != nil || got != c.want {
			t.Errorf("%s: got %q, %v; want %q", c.name, got, err, c.want)
		}
	}
}

func TestSpanTextSaysWhyASpanDoesNotHold(t *testing.T) {
	book := aliceBook()
	cases := []struct {
		name, chapter, start, end string
		want                      error
	}{
		{"chapter gone", "c-0099", "p-000001:0", "p-000001:1", ErrSpanChapterMissing},
		{"line gone", "c-0001", "p-000009:0", "p-000009:1", ErrSpanMoved},
		{"line of another chapter", "c-0001", "p-000003:0", "p-000003:1", ErrSpanMoved},
		{"word gone", "c-0001", "p-000001:0", "p-000001:40", ErrSpanMoved},
		{"end before start", "c-0001", "p-000001:3", "p-000001:1", ErrSpanOrder},
		{"end line before start line", "c-0001", "p-000002:0", "p-000001:1", ErrSpanOrder},
		{"not a key", "c-0001", "p-000001", "p-000001:1", ErrSpanKey},
		{"signed ordinal", "c-0001", "p-000001:+1", "p-000001:2", ErrSpanKey},
		{"leading zero", "c-0001", "p-000001:01", "p-000001:2", ErrSpanKey},
		{"empty", "c-0001", "", "", ErrSpanKey},
	}
	for _, c := range cases {
		if _, err := SpanText(book, c.chapter, c.start, c.end); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.want)
		}
	}
}

func TestSpanTextRefusesAPassageLongerThanASampleCouldHold(t *testing.T) {
	book := Book{Chapters: []string{"c"}, Lines: []Line{{ChapterID: "c", ID: "p-1", Text: strings.Repeat("word ", MaxSpanWords+1)}}}
	if _, err := SpanText(book, "c", "p-1:0", "p-1:"+itoa(MaxSpanWords)); !errors.Is(err, ErrSpanTooLong) {
		t.Fatalf("err = %v", err)
	}
	if _, err := SpanText(book, "c", "p-1:0", "p-1:"+itoa(MaxSpanWords-1)); err != nil {
		t.Fatalf("the longest allowed span failed: %v", err)
	}
}

func itoa(n int) string { return keyOf("", n)[1:] }
