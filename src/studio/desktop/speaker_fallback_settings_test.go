package main

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"desktop/internal/extractionport/localmodel"
	"desktop/internal/extractionport/localmodeltest"
	"desktop/internal/guide"
	"desktop/internal/settings"
)

// countingAsker is the fake model, counting how often it is asked.
type countingAsker struct{ asked int }

func (a *countingAsker) Ask(ctx context.Context, q localmodel.Question) (localmodel.Answer, error) {
	a.asked++
	return localmodeltest.Asker{}.Ask(ctx, q)
}

func saveGuideSetting(t *testing.T, store *settings.Store, scope, key, value string) {
	t.Helper()
	if err := store.Save("ManuscriptGuide", scope, map[string]*string{key: &value}); err != nil {
		t.Fatal(err)
	}
}

func runAttribution(t *testing.T, svc *guide.Service) guide.SpeakerAttribution {
	t.Helper()
	result, err := svc.AttributeSpeakers(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return result
}

// Off is the default: with a model there to ask, a run asks it nothing and says nothing about it.
func TestWithTheSettingOffTheLocalModelIsNeverAsked(t *testing.T) {
	svc, store := speakerFallbackProjectWithSettings(t)
	model := &countingAsker{}
	svc.SetSpeakerFallbackProvider(speakerFallbackProvider(store, model))
	result := runAttribution(t, svc)
	if model.asked != 0 || result.ModelFilled != 0 || result.ModelNote != "" || result.Filled != 1 {
		t.Fatalf("asked %d times; result %+v", model.asked, result)
	}
	saveGuideSetting(t, store, "global", "speaker_fallback", "false")
	if runAttribution(t, svc); model.asked != 0 {
		t.Fatalf("asked %d times with the setting saved as off", model.asked)
	}
}

// The setting is read at each run, so turning it on, and off again, after the project opened counts.
func TestTheSettingDecidesAtEachRunWhetherTheLocalModelIsAsked(t *testing.T) {
	svc, store := speakerFallbackProjectWithSettings(t)
	model := &countingAsker{}
	svc.SetSpeakerFallbackProvider(speakerFallbackProvider(store, model))
	saveGuideSetting(t, store, "global", "speaker_fallback", "true")
	on := runAttribution(t, svc)
	cues := cuesOf(t, svc)
	if model.asked != 3 || on.ModelFilled != 2 || speakerOf(cues["p3"]) != "bo" || cues["p3"].SpeakerSource != "local-model" || cues["p3"].Evidence.Reason == "" {
		t.Fatalf("asked %d; result %+v; cue %+v", model.asked, on, cues["p3"])
	}
	saveGuideSetting(t, store, "global", "speaker_fallback", "false")
	if _, err := svc.RestoreSpeakers(on.Previous); err != nil {
		t.Fatal(err)
	}
	off := runAttribution(t, svc)
	if model.asked != 3 || off.ModelFilled != 0 || speakerOf(cuesOf(t, svc)["p3"]) != "" {
		t.Fatalf("asked %d after it was turned off; result %+v", model.asked, off)
	}
}

func TestTheLinesPerRunSettingCapsWhatTheLocalModelIsAsked(t *testing.T) {
	for value, want := range map[string]int{"1": 1, "2": 2, "200": 3, "0": 3, "201": 3, "many": 3, "1.5": 3} {
		t.Run(value, func(t *testing.T) {
			svc, store := speakerFallbackProjectWithSettings(t)
			model := &countingAsker{}
			svc.SetSpeakerFallbackProvider(speakerFallbackProvider(store, model))
			saveGuideSetting(t, store, "global", "speaker_fallback", "true")
			saveGuideSetting(t, store, "global", "speaker_fallback_max_quotes", value)
			result := runAttribution(t, svc)
			// Three lines are unknown; a value outside 1 to 200 reads as the default of 20, which covers all three.
			if model.asked != want || (want < 3) != strings.Contains(result.ModelNote, "asked about") {
				t.Fatalf("asked %d, want %d; note %q", model.asked, want, result.ModelNote)
			}
		})
	}
	if defaultSpeakerFallbackQuotes != 20 {
		t.Fatalf("the default cap is %d; config/defaults.json and the Settings row say 20", defaultSpeakerFallbackQuotes)
	}
}

// No model ships on this build: with the setting on and nothing to ask, a run is the rules' run.
func TestWithTheSettingOnAndNoModelARunIsTheRulesRun(t *testing.T) {
	svc, store := speakerFallbackProjectWithSettings(t)
	svc.SetSpeakerFallbackProvider(speakerFallbackProvider(store, nil))
	saveGuideSetting(t, store, "global", "speaker_fallback", "true")
	if result := runAttribution(t, svc); result.ModelFilled != 0 || result.ModelNote != "" || result.Filled != 1 {
		t.Fatalf("result %+v", result)
	}
}

func TestTheSpeakerFallbackSettingsAreSavedOnlyWithValuesTheyTake(t *testing.T) {
	f := newSpacyFixture(t)
	save := func(key, value string) error {
		return f.host.saveSettings("ManuscriptGuide", "global", map[string]*string{key: &value})
	}
	for key, value := range map[string]string{"speaker_fallback": "true", "speaker_fallback_model": "qwen3-4b", "speaker_fallback_max_quotes": "50"} {
		if err := save(key, value); err != nil {
			t.Fatalf("%s=%s: %v", key, value, err)
		}
	}
	for _, bad := range [][2]string{
		{"speaker_fallback", "yes"}, {"speaker_fallback_model", "gpt"}, {"speaker_fallback_model", ""},
		{"speaker_fallback_max_quotes", "0"}, {"speaker_fallback_max_quotes", "201"}, {"speaker_fallback_max_quotes", "2.5"}, {"speaker_fallback_max_quotes", "ten"},
	} {
		if err := save(bad[0], bad[1]); err == nil {
			t.Fatalf("%s=%q was saved", bad[0], bad[1])
		}
	}
	// The model is installed on this computer, so the three are this computer's settings, never a project's.
	for _, key := range []string{"speaker_fallback", "speaker_fallback_model", "speaker_fallback_max_quotes"} {
		value := map[string]string{"speaker_fallback": "true", "speaker_fallback_model": "qwen3-4b", "speaker_fallback_max_quotes": "5"}[key]
		if err := f.host.saveSettings("ManuscriptGuide", "project", map[string]*string{key: &value}); err == nil || !strings.Contains(err.Error(), "global") {
			t.Fatalf("%s was saved for a project: %v", key, err)
		}
	}
	schemas, err := f.host.settingsForScope("global")
	if err != nil {
		t.Fatal(err)
	}
	fields, _ := schemas["ManuscriptGuide"].([]map[string]any)
	values := map[string]any{}
	for _, field := range fields {
		values[field["key"].(string)] = field["effectiveValue"]
	}
	if values["speaker_fallback"] != "true" || values["speaker_fallback_model"] != "qwen3-4b" || values["speaker_fallback_max_quotes"] != "50" {
		t.Fatalf("values %v", values)
	}
}

// A project opened in the app is given the provider, and with no model on this build a run stays the rules' run.
func TestAnOpenedProjectReadsTheSpeakerFallbackSettingAndHasNoModelToAsk(t *testing.T) {
	f := newSpacyFixture(t)
	if f.host.speakerModel != nil {
		t.Fatal("a local model is wired on this build; the Settings switch and its docs say none is")
	}
	source, err := os.ReadFile("app.go")
	if err != nil {
		t.Fatal(err)
	}
	// The one line that ties the setting to the run; nothing else calls the provider, so losing it turns the feature off silently.
	if !strings.Contains(string(source), "h.guide.SetSpeakerFallbackProvider(speakerFallbackProvider(h.settings, h.speakerModel))") {
		t.Fatal("configureLocked does not give the Story Bible the speaker fallback provider")
	}
}

// A project folder can come from someone else. Its own settings file cannot turn the model on or raise its cap: the three are
// this computer's settings, and the app refuses to save them for a project.
func TestAProjectsSettingsFileCannotTurnTheLocalModelOnOrRaiseItsCap(t *testing.T) {
	svc, store := speakerFallbackProjectWithSettings(t)
	model := &countingAsker{}
	svc.SetSpeakerFallbackProvider(speakerFallbackProvider(store, model))
	saveGuideSetting(t, store, "project", "speaker_fallback", "true")
	saveGuideSetting(t, store, "project", "speaker_fallback_max_quotes", "200")
	if result := runAttribution(t, svc); model.asked != 0 || result.ModelFilled != 0 {
		t.Fatalf("the project's file turned the model on: asked %d, result %+v", model.asked, result)
	}
	saveGuideSetting(t, store, "global", "speaker_fallback", "true")
	saveGuideSetting(t, store, "global", "speaker_fallback_max_quotes", "1")
	if result := runAttribution(t, svc); model.asked != 1 || result.ModelFilled != 1 {
		t.Fatalf("the project's file raised the cap: asked %d, result %+v", model.asked, result)
	}
}

// failsOn fails on the question of one paragraph and answers the rest like the fake.
type failsOn struct {
	paragraph string
	asked     []string
}

func (f *failsOn) Ask(ctx context.Context, q localmodel.Question) (localmodel.Answer, error) {
	f.asked = append(f.asked, q.ParagraphID)
	if q.ParagraphID == f.paragraph {
		return localmodel.Answer{}, errors.New("the model could not read this one")
	}
	return localmodeltest.Asker{}.Ask(ctx, q)
}

// A line the model fails on ends that run, but not every run after it: the next run starts with the lines after it.
func TestALineTheLocalModelFailsOnDoesNotBlockTheLinesAfterItForGood(t *testing.T) {
	svc := speakerFallbackProject(t)
	model := &failsOn{paragraph: "p3"}
	source := fakeLocalModel(50)
	source.Ask = model
	svc.SetSpeakerFallback(localModelSpeakerFallback(source))
	first := runAttribution(t, svc)
	second := runAttribution(t, svc)
	if got := strings.Join(model.asked, " "); got != "p3 p5 q1" || first.ModelFilled != 0 || first.ModelNote == "" || second.ModelFilled != 1 || speakerOf(cuesOf(t, svc)["p5"]) != "ada" {
		t.Fatalf("asked %q; first %+v; second %+v", got, first, second)
	}
}
