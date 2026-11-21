package main

import (
	"context"
	"desktop/internal/contractfile"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"testing"

	"desktop/internal/voicetracks"
)

// What a new chapter folder is made with (#3748): the known voices and Extras, ticked by the remembered choice, created in order in one request.

func assignVoices(t *testing.T, host *Host, names ...string) {
	t.Helper()
	service := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder})
	for _, name := range names {
		if _, err := service.SetTrackCharacters(name, []string{"char-" + name}); err != nil {
			t.Fatal(err)
		}
	}
}

// createTrackWith is createTrack with the narrator's choice as the binding receives it (a JSON string).
func createTrackWith(t *testing.T, host *Host, creator *fakeFolderCreator, chapterID, choice string) map[string]any {
	t.Helper()
	picked, err := parseCreateChoice(choice)
	if err != nil {
		t.Fatal(err)
	}
	answer, err := chapterTrackCreateIn(context.Background(), host.services(), creator, createAvailable(), chapterID, picked)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := encodeBinding(answer, nil)
	if err != nil {
		t.Fatal(err)
	}
	return decodeBinding(t, raw)
}

func optionNames(options chapterCreateOptions) []string {
	var names []string
	for _, voice := range options.Voices {
		names = append(names, voice.Name)
	}
	return names
}

func TestChapterCreateOptionsListTheKnownVoicesAndExtrasTickedByDefault(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "Mara", "Dragon 🐉", "Narrator", "Extras")
	options, err := chapterCreateOptionsIn(host.services(), &fakeFolderCreator{})
	if err != nil {
		t.Fatal(err)
	}
	if !options.Folders || options.Narrator != "Narrator" {
		t.Fatalf("options = %+v", options)
	}
	if got := optionNames(options); !reflect.DeepEqual(got, []string{"Dragon 🐉", "Mara"}) {
		t.Fatalf("voices = %q, want the assigned ones by name, never the Narrator or Extras", got)
	}
	for _, voice := range options.Voices {
		if !voice.Checked {
			t.Fatalf("%q is not ticked by default", voice.Name)
		}
	}
	if options.Extras.Name != "Extras" || !options.Extras.Checked {
		t.Fatalf("extras = %+v, want ticked", options.Extras)
	}
}

func TestChapterCreateOptionsOfAFlatProjectOrAnEngineWithNoFoldersAreEmpty(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	assignVoices(t, host, "Mara")
	flat, err := chapterCreateOptionsIn(host.services(), &fakeFolderCreator{})
	if err != nil || flat.Folders || len(flat.Voices) != 0 {
		t.Fatalf("flat = %+v, %v", flat, err)
	}
	setLayout(t, host, voicetracks.LayoutFolders)
	plain, err := chapterCreateOptionsIn(host.services(), &fakeCreator{})
	if err != nil || plain.Folders || len(plain.Voices) != 0 {
		t.Fatalf("an engine with no folders = %+v, %v", plain, err)
	}
}

func TestChapterTrackCreateDefaultMakesTheFolderWithEveryKnownVoiceAndExtrasInOrder(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "Mara", "Dragon")
	host.boothVoices = newBoothVoiceChoices()
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 3}}
	result := createTrack(t, host, creator, createAvailable(), ids[1])
	want := []string{"Chapter II: The Pool of Tears", "Narrator", "Dragon", "Mara", "Extras"}
	if len(creator.asked) != 1 || !reflect.DeepEqual(creator.asked[0], want) {
		t.Fatalf("asked = %q, want one folder with the children in order %q", creator.asked, want)
	}
	children, _ := result["children"].([]any)
	if len(children) != 4 {
		t.Fatalf("children = %v", children)
	}
	extras, _ := children[3].(map[string]any)
	if extras["name"] != "Extras" || extras["notVoice"] != true {
		t.Fatalf("extras = %v, want the last child marked as not a voice", extras)
	}
	if first, _ := children[0].(map[string]any); first["notVoice"] != false {
		t.Fatalf("the Narrator = %v, want a voice", first)
	}
	// Extras is marked in the project and is not one of the voices the Booth lists; the others are.
	setup, err := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder}).Get()
	if err != nil || len(setup.NotVoiceGUIDs) != 1 {
		t.Fatalf("not-voice marks = %v, %v: want exactly Extras", setup.NotVoiceGUIDs, err)
	}
	var voices []string
	for _, added := range host.services().boothVoices.addedTo(createdTrackGUID) {
		voices = append(voices, added.Name)
	}
	if !reflect.DeepEqual(voices, []string{"Narrator", "Dragon", "Mara"}) {
		t.Fatalf("the Booth's voices of the new folder = %q, want the voices and never Extras", voices)
	}
	if message, _ := result["message"].(string); message != "" {
		t.Fatalf("message = %q, want none for a complete create", message)
	}
}

func TestChapterTrackCreateWithAChoiceMakesOnlyThatAndRemembersIt(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "Mara", "Dragon", "King")
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 3}}
	result := createTrackWith(t, host, creator, ids[1], `{"voices":["King","Mara"],"extras":false}`)
	want := []string{"Chapter II: The Pool of Tears", "Narrator", "King", "Mara"}
	if !reflect.DeepEqual(creator.asked[0], want) {
		t.Fatalf("asked = %q, want the chosen voices in the order given and no Extras", creator.asked[0])
	}
	if result["outcome"] != "created" {
		t.Fatalf("result = %v", result)
	}
	remembered, err := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder}).NewChapter()
	if err != nil || !reflect.DeepEqual(remembered, voicetracks.NewChapter{SkipVoices: []string{"Dragon"}, NoExtras: true}) {
		t.Fatalf("remembered = %+v, %v", remembered, err)
	}
	// The next options start from what was picked, and a voice that appears later starts ticked.
	options, _ := chapterCreateOptionsIn(host.services(), &fakeFolderCreator{})
	ticked := map[string]bool{}
	for _, voice := range options.Voices {
		ticked[voice.Name] = voice.Checked
	}
	if ticked["Dragon"] || !ticked["Mara"] || !ticked["King"] || options.Extras.Checked {
		t.Fatalf("options = %+v, want Dragon and Extras unticked", options)
	}
	assignVoices(t, host, "Alice")
	options, _ = chapterCreateOptionsIn(host.services(), &fakeFolderCreator{})
	for _, voice := range options.Voices {
		if voice.Name == "Alice" && !voice.Checked {
			t.Fatal("a voice that was never offered starts unticked")
		}
	}
}

func TestChapterTrackCreateKeepsHostileChoicesToNamesThatMakeTracks(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	// The names the narrator can tick are the project's own voices (a chosen name the project does not know is left out, below).
	assignVoices(t, host, "Dragon 🐉", "مرحبا", "Line Break")
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 3}}
	many := make([]string, 0, 200)
	for i := 0; i < 200; i++ {
		many = append(many, "Voice "+strings.Repeat("x", i%3)+string(rune('A'+i%26))+string(rune('a'+i/26)))
	}
	raw, _ := json.Marshal(chapterCreateChoice{Voices: append([]string{"", "  ", "narrator", "NARRATOR ", "EXTRAS", "Dragon 🐉", "dragon 🐉", "مرحبا", "Line\r\nBreak", "Line Break"}, many...), Extras: true})
	createTrackWith(t, host, creator, ids[1], string(raw))
	asked := creator.asked[0][1:]
	if asked[0] != "Narrator" || asked[len(asked)-1] != "Extras" {
		t.Fatalf("asked = %q, want the Narrator first and Extras last", asked)
	}
	seen := map[string]bool{}
	for _, name := range asked {
		key := strings.ToLower(name)
		if strings.TrimSpace(name) == "" || strings.ContainsAny(name, "\r\n\t") || seen[key] {
			t.Fatalf("asked %q: a blank, multi-line or repeated name", name)
		}
		seen[key] = true
	}
	if len(asked) > maxCreateVoices+2 {
		t.Fatalf("asked %d children, want at most the Narrator, %d voices and Extras", len(asked), maxCreateVoices)
	}
	for _, want := range []string{"Dragon 🐉", "مرحبا", "Line Break"} {
		if !seen[strings.ToLower(want)] {
			t.Fatalf("asked = %q, want %q kept once", asked, want)
		}
	}
}

func TestChapterTrackCreateOfAProjectWhoseExtrasIsAVoiceDoesNotMarkItNotAVoice(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "Extras")
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 3}}
	result := createTrack(t, host, creator, createAvailable(), ids[1])
	children, _ := result["children"].([]any)
	if last, _ := children[len(children)-1].(map[string]any); last["name"] != "Extras" || last["notVoice"] != false {
		t.Fatalf("last = %v, want Extras kept as a voice", last)
	}
	if setup, _ := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder}).Get(); len(setup.NotVoiceGUIDs) != 0 {
		t.Fatalf("marks = %v, want none", setup.NotVoiceGUIDs)
	}
}

func TestChapterTrackCreateFromAnOlderScriptSaysHowManyTracksWereMade(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "Mara")
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 3}, firstChildOnly: true}
	result := createTrack(t, host, creator, createAvailable(), ids[1])
	if result["outcome"] != "created" {
		t.Fatalf("result = %v", result)
	}
	message, _ := result["message"].(string)
	if !strings.Contains(message, "added 1 of the 3 tracks asked for") {
		t.Fatalf("message = %q, want how many of the asked-for tracks exist", message)
	}
}

func TestChapterTrackCreateOfAFlatProjectIgnoresTheChoice(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFlat)
	creator := &fakeFolderCreator{}
	result := createTrackWith(t, host, creator, ids[0], `{"voices":["Mara"],"extras":true}`)
	if len(creator.names) != 1 || len(creator.folders) != 0 {
		t.Fatalf("plain %q, folders %q: a flat project adds one plain track", creator.names, creator.folders)
	}
	if _, present := result["children"]; present {
		t.Fatalf("a plain track's answer carries children: %v", result)
	}
}

func TestChapterTrackCreateRefusesAChoiceThatIsNotJSON(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	if _, err := host.ChapterTrackCreate(ids[0], "{not json"); err == nil {
		t.Fatal("a choice that is not JSON was accepted")
	}
}

// go-goldens: UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/chapter-create-options.json, what ChapterCreateOptions answers for a Voice
// folders project with two voices, one left out last time.
func TestContractChapterCreateOptions(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "Mara", "Dragon 🐉")
	if _, err := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder}).SetNewChapter([]string{"Mara"}, false); err != nil {
		t.Fatal(err)
	}
	options, err := chapterCreateOptionsIn(host.services(), &fakeFolderCreator{})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := encodeBinding(options, nil)
	if err != nil {
		t.Fatal(err)
	}
	var payload any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "chapter-create-options", payload)
	flat, err := chapterCreateOptionsIn(host.services(), &fakeCreator{})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ = encodeBinding(flat, nil)
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "chapter-create-options-flat", payload)
}

func TestChapterCreateDefaultSetKeepsThePickAndAnswersTheOptionsAsTheyNowRead(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "Mara", "Dragon")
	raw, err := host.ChapterCreateDefaultSet(`{"voices":["Mara"],"extras":false}`)
	if err != nil {
		t.Fatal(err)
	}
	var options chapterCreateOptions
	if err := json.Unmarshal([]byte(raw), &options); err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, voice := range options.Voices {
		got[voice.Name] = voice.Checked
	}
	if !got["Mara"] || got["Dragon"] || options.Extras.Checked {
		t.Fatalf("options = %+v, want Mara ticked, Dragon and Extras not", options)
	}
	if _, err := host.ChapterCreateDefaultSet(""); err == nil {
		t.Fatal("no pick was accepted")
	}
	if _, err := host.ChapterCreateDefaultSet("{not json"); err == nil {
		t.Fatal("a pick that is not JSON was accepted")
	}
}

// qa-breaker B2: a choice is made from a list the narrator saw. A name the project does not know is not made, and a voice the list did not show is
// neither made nor remembered as left out.
func TestChapterTrackCreateLeavesOutAChosenVoiceTheProjectDoesNotKnow(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "Mara")
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 3}}
	createTrackWith(t, host, creator, ids[1], `{"voices":["Ghost","Mara"],"extras":true}`)
	if want := []string{"Chapter II: The Pool of Tears", "Narrator", "Mara", "Extras"}; !reflect.DeepEqual(creator.asked[0], want) {
		t.Fatalf("asked = %q, want %q: a voice the project does not know is never made", creator.asked[0], want)
	}
}

func TestChapterTrackCreateRemembersOnlyTheVoicesTheChoiceWasShown(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "Mara", "Dragon")
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 3}}
	// The list showed only Mara (ticked); Dragon became known after it was read.
	createTrackWith(t, host, creator, ids[1], `{"voices":["Mara"],"skipped":[],"extras":true}`)
	remembered, err := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder}).NewChapter()
	if err != nil || len(remembered.SkipVoices) != 0 || remembered.NoExtras {
		t.Fatalf("remembered = %+v, %v: a voice that was never shown must not be remembered as left out", remembered, err)
	}
	options, _ := chapterCreateOptionsIn(host.services(), &fakeFolderCreator{})
	for _, voice := range options.Voices {
		if !voice.Checked {
			t.Fatalf("%q starts unticked", voice.Name)
		}
	}
}

// qa-breaker B4: a voice left out stays left out while it is unknown for a moment.
func TestAVoiceLeftOutStaysLeftOutWhileItIsNotKnown(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "Mara", "Dragon")
	service := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder})
	if _, err := service.SetNewChapter([]string{"Dragon"}, false); err != nil {
		t.Fatal(err)
	}
	// Dragon is not shown by this list (its assignment is gone for a moment), and Mara is unticked.
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 3}}
	createTrackWith(t, host, creator, ids[1], `{"voices":[],"skipped":["Mara"],"extras":true}`)
	remembered, _ := service.NewChapter()
	if !reflect.DeepEqual(remembered.SkipVoices, []string{"Mara", "Dragon"}) {
		t.Fatalf("skip = %q, want Mara and the earlier Dragon", remembered.SkipVoices)
	}
}

// qa-breaker B6: a known voice with a long name can be left out.
func TestAKnownVoiceLongerThanATrackNameCanBeLeftOut(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	long := strings.Repeat("W", 300)
	service := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder})
	if _, err := service.SetNewChapter([]string{long}, false); err != nil {
		t.Fatalf("a long name was refused: %v", err)
	}
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 3}}
	result := createTrackWith(t, host, creator, ids[1], `{"voices":[],"skipped":["`+long+`"],"extras":true}`)
	if message, _ := result["message"].(string); message != "" {
		t.Fatalf("message = %q, want the pick kept without a complaint", message)
	}
}

// qa-breaker B9: a list cut at the cap says how many voices it left off.
func TestChapterCreateOptionsSayHowManyVoicesAreLeftOffTheList(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	names := make([]string, 0, maxCreateVoices+7)
	for i := 0; i < maxCreateVoices+7; i++ {
		names = append(names, fmt.Sprintf("Voice %03d", i))
	}
	assignVoices(t, host, names...)
	options, err := chapterCreateOptionsIn(host.services(), &fakeFolderCreator{})
	if err != nil || len(options.Voices) != maxCreateVoices || options.Omitted != 7 {
		t.Fatalf("voices %d, omitted %d, %v: want %d listed and 7 said to be left off", len(options.Voices), options.Omitted, err, maxCreateVoices)
	}
}

// qa-breaker B10 and B11: a name with control or invisible characters is cleaned, and one with nothing visible is not a name.
func TestChapterTrackCreateCleansControlAndInvisibleCharactersFromNames(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	assignVoices(t, host, "\u202eevil", "\u200b", "Narrator\u200b", "Mara")
	options, err := chapterCreateOptionsIn(host.services(), &fakeFolderCreator{})
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, voice := range options.Voices {
		names = append(names, voice.Name)
	}
	sort.Strings(names)
	if want := []string{"Mara", "evil"}; !reflect.DeepEqual(names, want) {
		t.Fatalf("listed %q, want %q: control and invisible characters taken out, an empty name and the Narrator in disguise dropped", names, want)
	}
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 3}}
	createTrackWith(t, host, creator, ids[1], `{"voices":["A\u0000B","\u202eevil","Extras\u200b"],"extras":false}`)
	if want := []string{"Chapter II: The Pool of Tears", "Narrator", "evil"}; !reflect.DeepEqual(creator.asked[0], want) {
		t.Fatalf("asked = %q, want %q", creator.asked[0], want)
	}
}

func TestParseCreateChoiceRefusesWhatIsNotAChoice(t *testing.T) {
	for _, bad := range []string{"null", "{}", `{"voices":[]}`, `{"extras":true}`, "[]", `"x"`} {
		if choice, err := parseCreateChoice(bad); err == nil {
			t.Errorf("%s was accepted as %+v", bad, choice)
		}
	}
	if choice, err := parseCreateChoice(`{"voices":[],"extras":false}`); err != nil || len(choice.Voices) != 0 || choice.Extras {
		t.Fatalf("an empty pick is a pick of none: %+v, %v", choice, err)
	}
}
