package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"desktop/internal/brand"
	"desktop/internal/extractionport/localmodel"
	"desktop/internal/extractionport/localmodeltest"
	"desktop/internal/guide"
	"desktop/internal/settings"
)

// speakerFallbackProject is a project whose rules attribute one line and leave three unknown, two of which read the same.
func speakerFallbackProject(t *testing.T) *guide.Service {
	t.Helper()
	svc, _ := speakerFallbackProjectWithSettings(t)
	return svc
}

// speakerFallbackProjectWithSettings is speakerFallbackProject with the settings store the service reads.
func speakerFallbackProjectWithSettings(t *testing.T) (*guide.Service, *settings.Store) {
	t.Helper()
	project := t.TempDir()
	store := settings.New(t.TempDir(), project)
	svc := guide.New(project, "", "", store, nil)
	write := func(path string, value any) {
		t.Helper()
		bytes, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, bytes, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	paragraphs := []any{}
	for i, text := range []string{
		`"Hello," Ada said.`,
		`Bo came into the kitchen and sat down.`,
		`"Well?"`,
		`Ada stood at the window for a while.`,
		`"Well?"`,
		`The kettle boiled over.`,
	} {
		paragraphs = append(paragraphs, map[string]any{"id": "p" + string(rune('1'+i)), "index": i, "chapterId": "c1", "chapterTitle": "One", "text": text})
	}
	paragraphs = append(paragraphs, map[string]any{"id": "q1", "index": 6, "chapterId": "c2", "chapterTitle": "Two", "text": `"Is anyone here?"`})
	write(filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json"), map[string]any{
		"schemaVersion": 1, "documentId": "d",
		"chapters":   []any{map[string]any{"id": "c1", "title": "One"}, map[string]any{"id": "c2", "title": "Two"}},
		"paragraphs": paragraphs,
	})
	write(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"), map[string]any{
		"schema_version": 2,
		"entities": []any{
			map[string]any{"id": "ada", "canonical_name": "Ada", "category": "Character", "aliases": []any{}},
			map[string]any{"id": "bo", "canonical_name": "Bo", "category": "Character", "aliases": []any{}},
		},
	})
	return svc, store
}

func fakeLocalModel(maxQuotes int) localmodel.Source {
	return localmodel.Source{Ask: localmodeltest.Asker{}, MaxQuotes: func() int { return maxQuotes }, Log: func(string) {}}
}

func cuesOf(t *testing.T, svc *guide.Service) map[string]guide.DialogueCue {
	t.Helper()
	cues, err := svc.DialogueCues()
	if err != nil {
		t.Fatal(err)
	}
	byParagraph := map[string]guide.DialogueCue{}
	for _, cue := range cues {
		byParagraph[cue.ParagraphID] = cue
	}
	return byParagraph
}

func speakerOf(cue guide.DialogueCue) string {
	if cue.SpeakerEntityID == nil {
		return ""
	}
	return *cue.SpeakerEntityID
}

// Two lines that read the same get their own answers, each with its reason, and a line nobody is named before stays unknown.
func TestTheLocalModelFallbackTiesEachAnswerToItsOwnLine(t *testing.T) {
	svc := speakerFallbackProject(t)
	svc.SetSpeakerFallback(localModelSpeakerFallback(fakeLocalModel(10)))
	result, err := svc.AttributeSpeakers(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if result.Cues != 4 || result.Attributed != 3 || result.Filled != 3 || result.ModelFilled != 2 || result.ModelNote != "" {
		t.Fatalf("result %+v", result)
	}
	cues := cuesOf(t, svc)
	if cue := cues["p1"]; speakerOf(cue) != "ada" || cue.SpeakerSource != "tag" || cue.Evidence.Reason != "" {
		t.Fatalf("the rules' line: %+v", cue)
	}
	if cue := cues["p3"]; speakerOf(cue) != "bo" || cue.SpeakerSource != "local-model" || cue.Evidence.Reason != "Bo is the last character named before this line." || cue.Corrected {
		t.Fatalf("the first Well: %+v", cue)
	}
	if cue := cues["p5"]; speakerOf(cue) != "ada" || cue.SpeakerSource != "local-model" || cue.Evidence.Reason != "Ada is the last character named before this line." || cue.Corrected {
		t.Fatalf("the second Well: %+v", cue)
	}
	if cue := cues["q1"]; speakerOf(cue) != "" || cue.SpeakerSource != "unknown" {
		t.Fatalf("nobody is named in chapter two: %+v", cue)
	}
}

func TestTheLocalModelFallbackAsksNoMoreLinesThanTheCap(t *testing.T) {
	for limit, want := range map[int][2]string{0: {"", ""}, 1: {"bo", ""}} {
		svc := speakerFallbackProject(t)
		svc.SetSpeakerFallback(localModelSpeakerFallback(fakeLocalModel(limit)))
		result, err := svc.AttributeSpeakers(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		cues := cuesOf(t, svc)
		if got := [2]string{speakerOf(cues["p3"]), speakerOf(cues["p5"])}; got != want || result.ModelFilled != limit {
			t.Fatalf("cap %d: speakers %v, result %+v", limit, got, result)
		}
	}
}

// failsAfter answers like the fake, then fails.
type failsAfter struct{ answers int }

func (f *failsAfter) Ask(ctx context.Context, q localmodel.Question) (localmodel.Answer, error) {
	if f.answers == 0 {
		return localmodel.Answer{}, errors.New("the model process ended")
	}
	f.answers--
	return localmodeltest.Asker{}.Ask(ctx, q)
}

func TestALocalModelThatStopsKeepsWhatItAnsweredAndTellsTheNarrator(t *testing.T) {
	svc := speakerFallbackProject(t)
	source := fakeLocalModel(10)
	source.Ask = &failsAfter{answers: 1}
	svc.SetSpeakerFallback(localModelSpeakerFallback(source))
	result, err := svc.AttributeSpeakers(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	cues := cuesOf(t, svc)
	if result.ModelFilled != 1 || result.ModelNote == "" || speakerOf(cues["p3"]) != "bo" || speakerOf(cues["p5"]) != "" || speakerOf(cues["p1"]) != "ada" {
		t.Fatalf("result %+v, cues %+v", result, cues)
	}
}

func TestAnUnwiredLocalModelLeavesTheRulesResultAndSaysSo(t *testing.T) {
	svc := speakerFallbackProject(t)
	svc.SetSpeakerFallback(localModelSpeakerFallback(localmodel.Source{}))
	result, err := svc.AttributeSpeakers(context.Background())
	if err != nil || result.ModelFilled != 0 || result.ModelNote == "" || result.Filled != 1 {
		t.Fatalf("result %+v, %v", result, err)
	}
}

// Two entries with one name: the source answers neither, so the fallback is never asked to pick between them.
func TestTheLocalModelFallbackNeverPicksBetweenTwoEntriesWithOneName(t *testing.T) {
	fallback := localModelSpeakerFallback(fakeLocalModel(10))
	twins := []guide.FallbackCharacter{{EntityID: "bo-1", Name: "Bo"}, {EntityID: "bo-2", Name: "Bo"}}
	if result, err := fallback(context.Background(), []guide.UnknownCue{kitchenCue("cue-1")}, twins); err != nil || len(result.Suggestions) != 0 || result.Asked != 1 {
		t.Fatalf("result %+v, %v", result, err)
	}
	one, err := fallback(context.Background(), []guide.UnknownCue{kitchenCue("cue-1")}, twins[:1])
	if err != nil || len(one.Suggestions) != 1 || one.Suggestions[0] != (guide.CueSuggestion{CueID: "cue-1", EntityID: "bo-1", Reason: "Bo is the last character named before this line."}) {
		t.Fatalf("result %+v, %v", one, err)
	}
}

// kitchenCue is a line the fake answers "Bo" for.
func kitchenCue(id string) guide.UnknownCue {
	return guide.UnknownCue{CueID: id, ChapterID: "c1", ParagraphID: "p2", Quote: "Well?", Passage: []guide.FallbackParagraph{
		{ID: "p1", ChapterID: "c1", Text: "Bo came into the kitchen and sat down."}, {ID: "p2", ChapterID: "c1", Text: `"Well?"`},
	}}
}

// Two presses of the button overlap: each run of one fallback gets the answers to its own questions. Run with -race.
func TestOverlappingRunsOfOneLocalModelFallbackKeepTheirOwnAnswers(t *testing.T) {
	fallback := localModelSpeakerFallback(fakeLocalModel(10))
	bo := []guide.FallbackCharacter{{EntityID: "bo", Name: "Bo"}}
	var wg sync.WaitGroup
	failures := make(chan string, 64)
	for worker := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cues := make([]guide.UnknownCue, 1+worker%5)
			for i := range cues {
				cues[i] = kitchenCue(fmt.Sprintf("w%d-c%d", worker, i))
			}
			for range 100 {
				result, err := fallback(context.Background(), cues, bo)
				if err != nil || len(result.Suggestions) != len(cues) || result.Asked != len(cues) {
					failures <- fmt.Sprintf("handed %d lines, got %+v, %v", len(cues), result, err)
					return
				}
				for i, suggestion := range result.Suggestions {
					if suggestion.CueID != cues[i].CueID {
						failures <- fmt.Sprintf("an answer for %s came back for %s", cues[i].CueID, suggestion.CueID)
						return
					}
				}
			}
		}()
	}
	wg.Wait()
	close(failures)
	for failure := range failures {
		t.Fatal(failure)
	}
}

// slowAsker answers like the fake after a wait, or with the context's error when the run's time ends first.
type slowAsker struct{ wait time.Duration }

func (a slowAsker) Ask(ctx context.Context, q localmodel.Question) (localmodel.Answer, error) {
	select {
	case <-ctx.Done():
		return localmodel.Answer{}, ctx.Err()
	case <-time.After(a.wait):
		return localmodeltest.Asker{}.Ask(ctx, q)
	}
}

// The run's time ends while the model reads: what it had answered is kept and the narrator is told it ran out of time.
func TestALocalModelThatRunsOutOfTimeKeepsTheAnswersAlreadyGiven(t *testing.T) {
	svc := speakerFallbackProject(t)
	source := fakeLocalModel(10)
	source.Ask = slowAsker{wait: 200 * time.Millisecond}
	svc.SetSpeakerFallback(localModelSpeakerFallback(source))
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	result, err := svc.AttributeSpeakers(ctx)
	if err != nil {
		t.Fatal(err)
	}
	cues := cuesOf(t, svc)
	if result.ModelFilled != 1 || result.ModelNote != localModelOutOfTime || speakerOf(cues["p3"]) != "bo" || speakerOf(cues["p5"]) != "" {
		t.Fatalf("result %+v, cues %+v", result, cues)
	}
}

// Under a cap, a second run reaches the lines the first did not ask about, and the first says it did not ask about all.
func TestARerunUnderTheCapReachesLinesTheModelHasNotBeenAskedYet(t *testing.T) {
	svc := speakerFallbackProject(t)
	svc.SetSpeakerFallback(localModelSpeakerFallback(fakeLocalModel(1)))
	first, err := svc.AttributeSpeakers(context.Background())
	if err != nil || first.ModelFilled != 1 || first.ModelNote != "The local model was asked about 1 of the 3 lines the rules left unknown; run it again for the rest." {
		t.Fatalf("first %+v, %v", first, err)
	}
	second, err := svc.AttributeSpeakers(context.Background())
	if err != nil || second.ModelFilled != 1 || speakerOf(cuesOf(t, svc)["p5"]) != "ada" {
		t.Fatalf("second %+v, %v", second, err)
	}
	// The third run asks about chapter two's line, which nobody is named before; the fourth has nothing left to ask.
	third, _ := svc.AttributeSpeakers(context.Background())
	fourth, _ := svc.AttributeSpeakers(context.Background())
	if third.ModelFilled != 0 || third.ModelNote != "" || fourth.ModelFilled != 0 || fourth.ModelNote != "" {
		t.Fatalf("third %+v fourth %+v", third, fourth)
	}
}
