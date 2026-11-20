// Package localmodeltest is the fake model every test of the local-model source uses, so none needs a download. Its answers
// are a pure function of the question: no clock, no randomness, no file, no network.
package localmodeltest

import (
	"context"
	"strings"

	"desktop/internal/extractionport/localmodel"
)

// Confidence is the fixed confidence the fake gives: under extraction.VerifyBelow, like a real model's guess.
const Confidence = 0.6

// Asker answers with the character named last before the quote in the passage, by name or alias as a whole word, and says why.
// A name inside the quote itself does not count. It answers with no speaker when none is named before the quote, and when two
// characters are named at the same place it takes the one listed first. It returns ctx.Err() once ctx is cancelled.
type Asker struct{}

var _ localmodel.Asker = Asker{}

// Ask is the fake's answer to q.
func (Asker) Ask(ctx context.Context, q localmodel.Question) (localmodel.Answer, error) {
	if err := ctx.Err(); err != nil {
		return localmodel.Answer{}, err
	}
	var before strings.Builder
	for _, p := range q.Passage {
		if p.ID == q.ParagraphID {
			if at := strings.Index(p.Text, q.Quote); at >= 0 {
				before.WriteString(p.Text[:at])
			}
			break
		}
		before.WriteString(p.Text)
		before.WriteString("\n")
	}
	text := before.String()
	best, from, to := "", -1, 0
	for _, c := range q.Characters {
		for _, name := range append([]string{c.Name}, c.Aliases...) {
			for _, span := range localmodel.NameSpans(text, name) {
				if span[0] > from {
					best, from, to = c.Name, span[0], span[1]
				}
			}
		}
	}
	if from < 0 {
		return localmodel.Answer{}, nil
	}
	confidence := Confidence
	return localmodel.Answer{
		Speaker:    best,
		Confidence: &confidence,
		Reason:     best + " is the last character named before this line.",
		Evidence:   sentenceAround(text, from, to),
	}, nil
}

// sentenceAround is the stretch of text holding [from, to) between the sentence ends before and after it. Both bounds are spans of
// text itself (localmodel.NameSpans), so the slices are always valid.
func sentenceAround(text string, from, to int) string {
	start := strings.LastIndexAny(text[:from], ".!?\n") + 1
	end := len(text)
	if at := strings.IndexAny(text[to:], ".!?\n"); at >= 0 {
		end = to + at + 1
	}
	return strings.TrimSpace(text[start:end])
}
