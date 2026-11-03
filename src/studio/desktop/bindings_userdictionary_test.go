package main

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"desktop/internal/pronunciationonline/pronunciationonlinetest"
	"desktop/internal/userdictionary"
)

// candidatesHost is a host over a project whose Story Bible sidecar answers every candidate ("say <word> (<source>)"), with the keyed
// online source's key stored and no Wiktextract index installed. calls reads back every sidecar call.
func candidatesHost(t *testing.T) (*Host, func() [][]string, string) {
	host, _, calls, project := candidatesHostWithOnline(t)
	return host, calls, project
}

// candidatesHostWithOnline is candidatesHost with the keyed online source's fake.
func candidatesHostWithOnline(t *testing.T) (*Host, *pronunciationonlinetest.Fake, func() [][]string, string) {
	t.Helper()
	host, fake, _ := onlineHost(t)
	withoutWiktextract(host)
	if _, err := host.PronunciationOnlineKeySet(onlineTestKey); err != nil {
		t.Fatal(err)
	}
	t.Setenv(fakeGuideCandidatesEnv, "1")
	service, calls, project := countingGuideIn(t)
	host.guide = service
	host.config.projectFolder = project
	return host, fake, calls, project
}

// decodeAs decodes a binding's payload, failing the test on an error.
func decodeAs[T any](t *testing.T) func(string, error) T {
	return func(raw string, err error) T {
		t.Helper()
		return decodeOnline[T](t, raw, err)
	}
}

func TestUserDictionaryBindingsSaveListAndRemove(t *testing.T) {
	host, _, project := candidatesHost(t)
	mustImport(t, project)
	saved := decodeAs[userdictionary.Entry](t)(host.UserDictionarySave(" tulgey ", "TOOL-gay"))
	if saved.Word != "Tulgey" || len(saved.Records) != 2 || saved.Records[1] != (userdictionary.Record{Say: "TOOL-gay", Source: "user_dictionary", AddedAt: saved.Records[1].AddedAt}) {
		t.Fatalf("saved = %+v", saved)
	}
	list := decodeAs[userdictionary.Words](t)(host.UserDictionaryList())
	if len(list.Words) != 1 || !reflect.DeepEqual(list.Words[0], saved) {
		t.Fatalf("list = %+v", list)
	}
	removed := decodeAs[userdictionary.Entry](t)(host.UserDictionaryRemove("TULGEY", "script_imported", "TUL-gee"))
	if len(removed.Records) != 1 || removed.Records[0].Source != "user_dictionary" {
		t.Fatalf("removed = %+v", removed)
	}
	removed = decodeAs[userdictionary.Entry](t)(host.UserDictionaryRemove("Tulgey", "user_dictionary", "TOOL-gay"))
	if removed.Word != "Tulgey" || removed.Records == nil || len(removed.Records) != 0 {
		t.Fatalf("removed = %+v", removed)
	}
	if _, err := host.UserDictionaryRemove("Tulgey", "user_dictionary", "TOOL-gay"); err == nil {
		t.Fatal("a word that is gone was removed")
	}
	if _, err := host.UserDictionarySave("one\ntwo", "x"); err == nil {
		t.Fatal("a two-line word was saved")
	}
}

// mustImport puts a Script value in the project's dictionary as the migration does.
func mustImport(t *testing.T, project string) {
	t.Helper()
	if _, err := userdictionary.New(userdictionary.Config{Project: project}).Import("Tulgey", "TUL-gee"); err != nil {
		t.Fatal(err)
	}
}

func TestUserDictionaryBindingsNeedAProject(t *testing.T) {
	host := newTestHost(t)
	if _, err := host.UserDictionarySave("Tulgey", "x"); err == nil {
		t.Fatal("saved without a project")
	}
	list := decodeAs[userdictionary.Words](t)(host.UserDictionaryList())
	if list.Words == nil || len(list.Words) != 0 {
		t.Fatalf("list = %+v", list)
	}
}

// PronunciationCandidates asks every available source that needs no network, in list order, then gives each user dictionary record
// of the word. The keyed online source is never asked: only the narrator's own single pick sends a word (principle 4, D72).
func TestPronunciationCandidatesAskEveryLocalSourceThenTheDictionary(t *testing.T) {
	host, online, calls, project := candidatesHostWithOnline(t)
	mustImport(t, project)
	if _, err := host.UserDictionarySave("Tulgey", "TOOL-gay"); err != nil {
		t.Fatal(err)
	}
	set := decodeAs[PronunciationCandidateSet](t)(host.PronunciationCandidates(" Tulgey "))
	want := PronunciationCandidateSet{
		Candidates: []PronunciationCandidateRow{
			{SourceID: "cmu", Label: "CMU dictionary", Say: "say Tulgey (cmu)"},
			{SourceID: "espeak", Label: "eSpeak NG", Say: "say Tulgey (espeak)"},
			{SourceID: "script_imported", Label: "Script (imported)", Say: "TUL-gee"},
			{SourceID: "user_dictionary", Label: "My dictionary", Say: "TOOL-gay"},
		},
		Misses: []PronunciationMissRow{},
	}
	if !reflect.DeepEqual(set, want) {
		t.Fatalf("set = %+v\nwant %+v", set, want)
	}
	asked := []string{}
	for _, call := range calls() {
		asked = append(asked, call[0]+" "+call[len(call)-1])
	}
	if !slices.Equal(asked, []string{"candidate cmu", "candidate espeak"}) {
		t.Fatalf("sidecar calls = %v", asked)
	}
	if sent := online.Calls(); len(sent) != 0 {
		t.Fatalf("the online source was asked: %+v", sent)
	}
}

// A source that has nothing, and a word that cannot be asked, are misses with a reason, never an error.
func TestPronunciationCandidatesReportMisses(t *testing.T) {
	host, _, _ := candidatesHost(t)
	t.Setenv(fakeGuideCandidatesEnv, "")
	set := decodeAs[PronunciationCandidateSet](t)(host.PronunciationCandidates("Tulgey"))
	if len(set.Candidates) != 0 || len(set.Misses) != 2 || set.Misses[0].SourceID != "cmu" || set.Misses[1].SourceID != "espeak" {
		t.Fatalf("set = %+v", set)
	}
	for _, miss := range set.Misses {
		if miss.Label == "" || !strings.HasSuffix(miss.Reason, ".") {
			t.Errorf("miss = %+v", miss)
		}
	}
	for _, word := range []string{"", strings.Repeat("a", 81)} {
		set := decodeAs[PronunciationCandidateSet](t)(host.PronunciationCandidates(word))
		if len(set.Candidates) != 0 || len(set.Misses) == 0 || set.Misses[0].Reason == "" {
			t.Fatalf("%q = %+v", word, set)
		}
	}
}

// The two user dictionary sources are listed after the online one and before manual, answer a single pick from the dictionary, and are
// never the default.
func TestTheUserDictionaryIsAPronunciationSource(t *testing.T) {
	host, calls, project := candidatesHost(t)
	list := sourcesOf(t, host)
	if got, want := sourceIDs(list), []string{"cmu", "wiktextract", "espeak", "merriam_webster", "user_dictionary", "script_imported", "manual"}; !slices.Equal(got, want) {
		t.Fatalf("sources = %v, want %v", got, want)
	}
	for _, source := range list.Sources[4:6] {
		if source.Kind != "lookup" || !source.Available || source.Needs != "" || source.Label != userdictionary.Label(source.ID) {
			t.Fatalf("source = %+v", source)
		}
	}
	for _, id := range []string{"user_dictionary", "script_imported"} {
		if err := host.settings.Save("ManuscriptGuide", "global", map[string]*string{"default_pronunciation_source": &id}); err != nil {
			t.Fatal(err)
		}
		if got := sourcesOf(t, host).Default; got != "cmu" {
			t.Fatalf("default with %s set = %q, want cmu", id, got)
		}
	}
	if got := candidateOf(t, host, "Tulgey", "user_dictionary"); got.OK || got.Reason == "" {
		t.Fatalf("an empty dictionary = %+v", got)
	}
	mustImport(t, project)
	if got := candidateOf(t, host, "tulgey", "script_imported"); !got.OK || got.Say != "TUL-gee" {
		t.Fatalf("script_imported = %+v", got)
	}
	if got := candidateOf(t, host, "tulgey", "user_dictionary"); got.OK {
		t.Fatalf("user_dictionary without a save = %+v", got)
	}
	if _, err := host.UserDictionarySave("Tulgey", "TOOL-gay"); err != nil {
		t.Fatal(err)
	}
	if got := candidateOf(t, host, "tulgey", "user_dictionary"); !got.OK || got.Say != "TOOL-gay" {
		t.Fatalf("user_dictionary = %+v", got)
	}
	if recorded := calls(); len(recorded) != 0 {
		t.Fatalf("a dictionary pick started the sidecar: %v", recorded)
	}
}

// A user dictionary value the narrator picks for a Story Bible name is written through GuidePronunciationRestore with its own source.
func TestGuidePronunciationRestoreTakesTheUserDictionarySources(t *testing.T) {
	host, _, project := candidatesHost(t)
	writeNested(t, filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"), `{"schema_version": 2, "entities": [
  {"id": "e1", "canonical_name": "Tulgey", "category": "Character", "pronunciation": {"ipa": "", "source": "not generated"}, "aliases": []}]}`)
	for _, source := range []string{"user_dictionary", "script_imported"} {
		value := GuidePronunciationValue{IPA: "TUL-gee", Source: source, Confidence: "narrator", Chosen: true}
		if _, err := host.GuidePronunciationRestore("e1", nil, value); err != nil {
			t.Fatalf("%s: %v", source, err)
		}
		entries := storyBibleEntries(t, project)
		if got := entries["Tulgey"]["pronunciation"].(map[string]any)["source"]; got != source {
			t.Fatalf("source = %v, want %s", got, source)
		}
	}
}

// PronunciationPreview speaks one text with one IPA through a one-name Story Bible of its own, the render the Story Bible's previews
// make, and asks for the preview voice first.
func TestPronunciationPreviewRendersOneTextAndIPA(t *testing.T) {
	rig := newPreviewHost(t, "wav")
	required := decodePreview(t, mustValue(t)(rig.host.PronunciationPreview("Tulgey", "ˈtʌlɡi")))
	if required["status"] != "asset_required" {
		t.Fatalf("before the voice = %#v", required)
	}
	rig.install(t)
	args := filepath.Join(t.TempDir(), "args.txt")
	t.Setenv("SHELL_FAKE_GUIDE_ARGS", args)
	ready := decodePreview(t, mustValue(t)(rig.host.PronunciationPreview(" Tulgey ", "ˈtʌlɡi")))
	if ready["status"] != "ready" || ready["mimeType"] != "audio/wav" {
		t.Fatalf("ready = %#v", ready)
	}
	if audio, err := base64.StdEncoding.DecodeString(ready["audioBase64"].(string)); err != nil || len(audio) == 0 {
		t.Fatalf("audio = %d bytes, %v", len(audio), err)
	}
	started, _ := os.ReadFile(args)
	lines := strings.Split(strings.TrimSpace(string(started)), "\n")
	if lines[0] != "render-audio" || !slices.Contains(lines, "preview") || !strings.HasPrefix(lines[slices.Index(lines, "--audio-dir")+1], filepath.Join(rig.project, "ManuscriptGuide", "audio", "tts")) {
		t.Fatalf("sidecar arguments = %q", lines)
	}
	guidePath := lines[slices.Index(lines, "--guide")+1]
	if _, err := os.Stat(guidePath); !os.IsNotExist(err) {
		t.Fatalf("the one-name Story Bible was left behind: %v", err)
	}
	var document map[string]any
	raw, _ := os.ReadFile(args + ".guide")
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"entities": []any{map[string]any{"id": "preview", "canonical_name": "Tulgey", "aliases": []any{},
		"pronunciation": map[string]any{"ipa": "ˈtʌlɡi", "source": "manual", "confidence": "narrator", "chosen": true}}}}
	if !reflect.DeepEqual(document, want) {
		t.Fatalf("guide = %s", raw)
	}
	// The render is cached: the second preview starts no sidecar.
	_ = os.Remove(args)
	if again := decodePreview(t, mustValue(t)(rig.host.PronunciationPreview("Tulgey", "ˈtʌlɡi"))); again["status"] != "ready" {
		t.Fatalf("again = %#v", again)
	}
	if _, err := os.Stat(args); !os.IsNotExist(err) {
		t.Fatal("a cached preview started the sidecar")
	}
	for name, text := range map[string][2]string{
		"empty text":    {" ", "x"},
		"empty ipa":     {"Tulgey", " "},
		"two-line text": {"a\nb", "x"},
		"two-line ipa":  {"Tulgey", "a\nb"},
		"long text":     {strings.Repeat("a", 81), "x"},
		"long ipa":      {"Tulgey", strings.Repeat("a", 201)},
	} {
		if _, err := rig.host.PronunciationPreview(text[0], text[1]); err == nil {
			t.Errorf("%s was rendered", name)
		}
	}
}

func mustValue(t *testing.T) func(string, error) string {
	return func(raw string, err error) string {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}
}
