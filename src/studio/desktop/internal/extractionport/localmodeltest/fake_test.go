package localmodeltest_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/extraction"
	"desktop/internal/extractionport/localmodel"
	"desktop/internal/extractionport/localmodeltest"
)

func ask(t *testing.T, q localmodel.Question) localmodel.Answer {
	t.Helper()
	a, err := localmodeltest.Asker{}.Ask(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func scene(before string, quote string, after string, people ...string) localmodel.Question {
	q := localmodel.Question{ChapterID: "c", ParagraphID: "p2", Quote: quote}
	for _, p := range people {
		q.Characters = append(q.Characters, localmodel.Character{Name: p})
	}
	q.Passage = []extraction.Paragraph{{ID: "p1", ChapterID: "c", Text: before}, {ID: "p2", ChapterID: "c", Text: quote}, {ID: "p3", ChapterID: "c", Text: after}}
	return q
}

func TestTheFakeNamesTheCharacterNamedLastBeforeTheQuote(t *testing.T) {
	got := ask(t, scene("Toby left. Then Mira came in.", "\"Hi.\"", "", "Mira", "Toby"))
	if got.Speaker != "Mira" || got.Evidence != "Then Mira came in." {
		t.Fatalf("got %+v", got)
	}
	// Listing order must not matter: the last one named wins either way.
	got = ask(t, scene("Mira left. Then Toby came in.", "\"Hi.\"", "", "Mira", "Toby"))
	if got.Speaker != "Toby" {
		t.Fatalf("got %+v, want Toby: the fake must take the last name before the quote, not the first", got)
	}
}

func TestTheFakeIgnoresNamesAfterTheQuoteAndInsideIt(t *testing.T) {
	if got := ask(t, scene("The room was quiet.", "\"Hi.\"", "Mira smiled.", "Mira")); got.Speaker != "" {
		t.Fatalf("a name only after the quote gave %+v", got)
	}
	if got := ask(t, scene("The room was quiet.", "\"Where is Mira?\"", "", "Mira")); got.Speaker != "" {
		t.Fatalf("a name only inside the quote gave %+v", got)
	}
}

func TestTheFakeGivesTheFixedConfidenceAndAReasonThatNamesTheSpeaker(t *testing.T) {
	got := ask(t, scene("Mira sat.", "\"Hi.\"", "", "Mira"))
	if got.Confidence == nil || *got.Confidence != 0.6 || localmodeltest.Confidence != 0.6 {
		t.Fatalf("confidence = %v, want exactly 0.6", got.Confidence)
	}
	if got.Reason != "Mira is the last character named before this line." {
		t.Fatalf("reason = %q", got.Reason)
	}
}

func TestTheFakeDoesNotPanicOrSliceWrongOnTextWhoseCaseChangesItsWidth(t *testing.T) {
	for name, before := range map[string]string{
		"a rune that grows when lowercased":   "ȺȺȺȺȺȺ Mira sat down.",
		"a rune that shrinks when lowercased": "İstanbul'da İpek İİİİ güldü. Mira sat down. Then left.",
		"capital sharp s":                     "STRAẞE ẞẞẞ. Mira sat down.",
		"invalid utf-8":                       "\xff\xff\xff\xff Mira sat.",
		"emoji and right to left":             "ليلى 🐉 Mira نظرت.",
	} {
		t.Run(name, func(t *testing.T) {
			got := ask(t, scene(before, "\"Hi.\"", "", "Mira"))
			if got.Speaker != "Mira" || !strings.Contains(got.Evidence, "Mira") || !strings.Contains(before, got.Evidence) {
				t.Fatalf("got %+v from %q", got, before)
			}
		})
	}
}

func TestTheFakeNeverNamesAPartOfAWord(t *testing.T) {
	if got := ask(t, scene("The atom split.", "\"Hi.\"", "", "Tom")); got.Speaker != "" {
		t.Fatalf("got %+v", got)
	}
}

func TestTheFakeAnswersTheSameEveryTimeInAnyOrder(t *testing.T) {
	q := scene("Mira and Toby sat.", "\"Hi.\"", "", "Mira", "Toby")
	first := ask(t, q)
	for i := 0; i < 20; i++ {
		if again := ask(t, q); !reflect.DeepEqual(first, again) {
			t.Fatalf("answer %d is %+v, the first was %+v", i, again, first)
		}
	}
	if first.Speaker != "Toby" {
		t.Fatalf("got %+v, want the character named last", first)
	}
}

func TestTheFakeReturnsTheContextErrorOnceCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (localmodeltest.Asker{}).Ask(ctx, scene("Mira sat.", "\"Hi.\"", "", "Mira")); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v", err)
	}
}
