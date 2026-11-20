package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"desktop/internal/dawport"
	"desktop/internal/voicetracks"
)

// What a new chapter folder is made with (#3748): the Narrator always, then the project's known voices and an Extras track the narrator can leave
// out, in a fixed order. ChapterCreateOptions answers the list for the dialog and the Settings row; ChapterTrackCreate takes the choice.

// extrasName is the track for sound that is not a voice (a crowd, a door, music): a child of the chapter folder marked as not a voice, so the Booth
// cannot arm it and the chapter's record progress does not ask for a take on it. A project that already assigns characters to a track of this
// name keeps it a voice (extrasIsVoice).
const extrasName = "Extras"

// maxCreateVoices bounds the voices one chapter folder is made with: the dialog caps its list and the Booth reaches ten voices by key.
const maxCreateVoices = 60

// chapterCreateVoice is one row of the list: a track's name and whether the chapter folder is made with it.
type chapterCreateVoice struct {
	Name    string `json:"name"`
	Checked bool   `json:"checked"`
}

// chapterCreateOptions is what a new chapter folder can be made with. Folders is false for a project that records one track a chapter (the flat
// layout, or an engine with no folder tracks): the press adds one track and there is nothing to choose. Voices are in the order the folder gets
// them (after the Narrator), Extras last.
type chapterCreateOptions struct {
	Folders  bool                 `json:"folders"`
	Narrator string               `json:"narrator"`
	Voices   []chapterCreateVoice `json:"voices"`
	Extras   chapterCreateVoice   `json:"extras"`
	// Omitted is how many known voices the list leaves off at the cap (maxCreateVoices); 0 when it holds them all.
	Omitted int `json:"omitted,omitempty"`
}

// chapterCreateChoice is the narrator's pick: the voices to add after the Narrator (in the order given) and whether to add Extras. A nil choice at
// the press means the remembered one.
type chapterCreateChoice struct {
	Voices []string `json:"voices"`
	// Skipped are the voices the narrator was shown and left unticked: what is remembered as left out. A voice in neither list was not shown (it
	// became known after the list was read) and is neither made nor remembered as left out. Absent from a caller that does not send it.
	Skipped []string `json:"skipped,omitempty"`
	Extras  bool     `json:"extras"`
}

// parseCreateChoice reads the binding's argument: "" is the remembered choice (nil), anything else is a chapterCreateChoice that names its voices
// (an empty list is a choice of none; "null" or "{}" is not a choice and is refused).
func parseCreateChoice(raw string) (*chapterCreateChoice, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var wire struct {
		Voices  *[]string `json:"voices"`
		Skipped []string  `json:"skipped"`
		Extras  *bool     `json:"extras"`
	}
	if err := json.Unmarshal([]byte(raw), &wire); err != nil {
		return nil, fmt.Errorf("the chosen tracks are not readable: %w", err)
	}
	if wire.Voices == nil || wire.Extras == nil {
		return nil, fmt.Errorf("the chosen tracks are not readable: they name no voices or no Extras")
	}
	return &chapterCreateChoice{Voices: *wire.Voices, Skipped: wire.Skipped, Extras: *wire.Extras}, nil
}

// maxVoiceNameRunes bounds a voice name the list offers: a child of a folder can have any name in the engine, and one longer than this is not a name
// a narrator ticks.
const maxVoiceNameRunes = 1000

// cleanVoiceName is a track name as the create sends and the list shows it: one line (oneLineName), with the control and invisible format characters
// (a NUL, a zero-width space, a right-to-left override) taken out, so a name cannot reverse its neighbours or be a box with no label.
func cleanVoiceName(name string) string {
	kept := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return -1
		}
		return r
	}, oneLineName(name))
	return strings.TrimSpace(kept)
}

// extrasIsVoice reports whether the project assigns characters to a track named Extras: that track is a voice, not the non-voice track this adds.
func extrasIsVoice(setup voicetracks.State) bool {
	for _, assignment := range setup.Tracks {
		if strings.EqualFold(oneLineName(assignment.Track), extrasName) {
			return true
		}
	}
	return false
}

// knownVoiceNames is the voices of the project in the order a new chapter folder gets them: the children of the folders the chapters are linked
// to, first seen first, then the tracks the voice setup assigns characters to that none of those has, by name. The Narrator and Extras are not
// voices of this list, and a track marked as not a voice is not one either (chapterVoicesIn leaves it out). Compared without case, once each.
func knownVoiceNames(svc hostServices, setup voicetracks.State) ([]string, int) {
	var names []string
	omitted := 0
	seen := map[string]bool{strings.ToLower(narratorVoice): true, strings.ToLower(extrasName): true}
	add := func(name string) {
		name = cleanVoiceName(name)
		key := strings.ToLower(name)
		if name == "" || seen[key] || utf8.RuneCountInString(name) > maxVoiceNameRunes {
			return
		}
		seen[key] = true
		if len(names) >= maxCreateVoices {
			omitted++
			return
		}
		names = append(names, name)
	}
	if documentID, store, err := mappingContext(svc); err == nil {
		if mappings, err := store.List(documentID); err == nil {
			if project, err := liveSelectedProject(svc); err == nil {
				for _, mapping := range mappings {
					voices, _, err := chapterVoicesIn(svc, mapping.TrackGUID, &project)
					if err != nil {
						continue
					}
					for _, voice := range voices {
						add(voice.Name)
					}
				}
			}
		}
	}
	for _, assignment := range setup.Tracks {
		add(assignment.Track)
	}
	return names, omitted
}

// chapterCreateOptionsIn lists what a new chapter folder is made with: the known voices and Extras, each ticked unless the remembered choice left
// it out. For a project that makes no folder (flat, or an engine with none) Folders is false and the lists are empty.
func chapterCreateOptionsIn(svc hostServices, creator dawport.TrackCreator) (chapterCreateOptions, error) {
	out := chapterCreateOptions{Narrator: narratorVoice, Voices: []chapterCreateVoice{}}
	folders, err := voiceFoldersLayout(svc)
	if err != nil {
		return out, err
	}
	if !folders || !canMakeFolders(svc, creator) {
		return out, nil
	}
	out.Folders = true
	voices := voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder})
	setup, err := voices.Get()
	if err != nil {
		return out, err
	}
	remembered, err := voices.NewChapter()
	if err != nil {
		return out, err
	}
	names, omitted := knownVoiceNames(svc, setup)
	out.Omitted = omitted
	for _, name := range names {
		out.Voices = append(out.Voices, chapterCreateVoice{Name: name, Checked: !containsFold(remembered.SkipVoices, name)})
	}
	out.Extras = chapterCreateVoice{Name: extrasName, Checked: !remembered.NoExtras}
	return out, nil
}

// createChildren is the children a new chapter folder is made with, in order: the Narrator, the chosen voices and then Extras when asked. A nil
// choice is the remembered one. A name is cleaned like a track's name and kept once without case; the Narrator and Extras are never added twice, and
// a chosen name the project does not know (the list the narrator ticked is older than the project) is left out, never made.
func createChildren(svc hostServices, choice *chapterCreateChoice) ([]string, error) {
	voices := voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder})
	setup, err := voices.Get()
	if err != nil {
		return nil, err
	}
	known, _ := knownVoiceNames(svc, setup)
	var picked []string
	var extras bool
	if choice == nil {
		remembered, err := voices.NewChapter()
		if err != nil {
			return nil, err
		}
		for _, name := range known {
			if !containsFold(remembered.SkipVoices, name) {
				picked = append(picked, name)
			}
		}
		extras = !remembered.NoExtras
	} else {
		for _, name := range choice.Voices {
			if containsFold(known, name) {
				picked = append(picked, name)
			}
		}
		extras = choice.Extras
	}
	children := []string{narratorVoice}
	seen := map[string]bool{strings.ToLower(narratorVoice): true, strings.ToLower(extrasName): true}
	for _, name := range picked {
		name = cleanVoiceName(name)
		if name == "" || seen[strings.ToLower(name)] {
			continue
		}
		seen[strings.ToLower(name)] = true
		children = append(children, name)
	}
	if extras {
		children = append(children, extrasName)
	}
	return children, nil
}

// rememberCreateChoice keeps what the narrator picked for the next new chapter: the voices left out and whether Extras was. The voices left out are
// the ones the narrator was shown and unticked (choice.Skipped; from a caller that sends none, the known voices not chosen), plus what was left out
// before for a voice this list did not show, so a voice that is unknown for a moment keeps its tick. It reports the reason as a sentence when the
// file could not be written, so the create can say so without failing.
func rememberCreateChoice(svc hostServices, choice *chapterCreateChoice) string {
	if choice == nil {
		return ""
	}
	voices := voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder})
	setup, err := voices.Get()
	if err == nil {
		var remembered voicetracks.NewChapter
		if remembered, err = voices.NewChapter(); err == nil {
			skipped := choice.Skipped
			if skipped == nil {
				known, _ := knownVoiceNames(svc, setup)
				for _, name := range known {
					if !containsFold(choice.Voices, name) {
						skipped = append(skipped, name)
					}
				}
			}
			var skip []string
			for _, name := range skipped {
				if name = cleanVoiceName(name); name != "" && !containsFold(skip, name) {
					skip = append(skip, name)
				}
			}
			// Left out before, for a voice this choice did not show: still left out.
			for _, before := range remembered.SkipVoices {
				if !containsFold(choice.Voices, before) && !containsFold(skipped, before) && !containsFold(skip, before) {
					skip = append(skip, before)
				}
			}
			_, err = voices.SetNewChapter(skip, !choice.Extras)
		}
	}
	if err != nil {
		return "The chosen tracks could not be remembered for the next chapter: " + strings.TrimRight(strings.TrimSpace(err.Error()), ".") + "."
	}
	return ""
}

// containsFold reports whether names has name, compared as a track name (cleaned, without case).
func containsFold(names []string, name string) bool {
	want := cleanVoiceName(name)
	for _, have := range names {
		if strings.EqualFold(cleanVoiceName(have), want) {
			return true
		}
	}
	return false
}
