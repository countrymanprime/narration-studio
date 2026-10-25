package guide

import (
	"context"
	"strings"

	"desktop/internal/compare"
)

// The text half of the dialogue cues (cues.go): manuscript_guide.py extract_dialogue_cues and what it calls. Quotes and speech tags
// are matched by rules_text.go (quoteAt, tagAfter, tagBefore), which the rules' speaker suggestions share.

const (
	proximityWindow = 70 // PROXIMITY_WINDOW: how far either side of a quote a name counts as near it
	sceneBreakMarks = "*#-–—•·"
)

// isSceneBreak is SCENE_BREAK.match(text.strip()): a paragraph made only of *, #, dashes, bullets and spaces, which starts a new scene.
func isSceneBreak(text []rune) bool {
	stripped := []rune(compare.PyStrip(string(text)))
	if len(stripped) == 0 {
		return false
	}
	for _, r := range stripped {
		if !strings.ContainsRune(sceneBreakMarks, r) && !compare.IsPySpace(r) {
			return false
		}
	}
	return true
}

// sceneKey is a scene: its chapter and its index there.
type sceneKey struct {
	chapter string
	scene   int
}

// dialogueCues is manuscript_guide.py extract_dialogue_cues (with nearby, guide_dialogue_cues): a cue per quote, its speaker from a
// speech tag naming a speaking entry; else, when exactly two speakers have spoken by tag or continuation in the scene so far, the one
// who did not speak last (continuation); else, with nearby, a speaking entry's name near the quote (proximity), which never starts a
// continuation. A scene-break paragraph has no cues and starts the next scene; a scene restarts at 0 wherever the chapter changes from
// the paragraph before. It returns ctx.Err() once ctx is cancelled.
func dialogueCues(ctx context.Context, paragraphs []ruleParagraph, index map[string]any, nearby bool) ([]*pyObject, error) {
	cues := []*pyObject{}
	speakers := map[sceneKey][]any{}
	last := map[sceneKey]any{}
	scene, current, started := 0, "", false
	for _, paragraph := range paragraphs {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if !started || paragraph.chapterID != current {
			started, current, scene = true, paragraph.chapterID, 0
		}
		if isSceneBreak(paragraph.text) {
			scene++
			continue
		}
		key := sceneKey{paragraph.chapterID, scene}
		text := paragraph.text
		own := cuesFromText(text, index, paragraph.chapterID, paragraph.paragraphID)
		for i, cue := range own {
			if cue.values["speaker_entity_id"] == nil {
				lastSpeaker, spoke := last[key]
				if active := speakers[key]; len(active) == 2 && spoke {
					for _, other := range active {
						if !pyEqual(other, lastSpeaker) {
							if pyTruthy(other) {
								cue.set("speaker_entity_id", other)
								cue.set("speaker_source", "continuation")
							}
							break
						}
					}
				}
			}
			if cue.values["speaker_entity_id"] == nil && nearby {
				afterEnd := len(text)
				if i+1 < len(own) {
					afterEnd = own[i+1].values["quote_start"].(int)
				}
				beforeStart := 0
				if i > 0 {
					beforeStart = own[i-1].values["quote_end"].(int)
				}
				start, end := cue.values["quote_start"].(int), cue.values["quote_end"].(int)
				if near := nearbySpeaker(text, end, afterEnd, beforeStart, start, index); near != nil {
					cue.set("speaker_entity_id", near)
					cue.set("speaker_source", "proximity")
				}
			}
			if speaker := cue.values["speaker_entity_id"]; pyTruthy(speaker) && cue.values["speaker_source"] != "proximity" {
				if !containsPy(speakers[key], speaker) {
					speakers[key] = append(speakers[key], speaker)
				}
				last[key] = speaker
			}
			cues = append(cues, cue)
		}
	}
	return cues, nil
}

// containsPy is Python's `value in list`.
func containsPy(list []any, value any) bool {
	for _, item := range list {
		if pyEqual(item, value) {
			return true
		}
	}
	return false
}

// cuesFromText is manuscript_guide.py extract_cues_from_text: a cue per quote of text, in order, each with its own speech tag.
func cuesFromText(text []rune, index map[string]any, chapterID, paragraphID string) []*pyObject {
	cues := []*pyObject{}
	for _, quote := range finditer(text, quoteAt) {
		start, end := quote[0], quote[1]
		quoteText := string(text[start+1 : end-1])
		speaker, evidence := findSpeechTag(text, start, end, index)
		source := "unknown"
		if speaker != nil {
			source = "tag"
		}
		cues = append(cues, newPyObject(
			"id", cueID(paragraphID, start, quoteText),
			"chapterId", chapterID,
			"paragraphId", paragraphID,
			"quote_start", start,
			"quote_end", end,
			"quote_text", quoteText,
			"speaker_entity_id", speaker,
			"speaker_source", source,
			"evidence", newPyObject("chapterId", chapterID, "paragraphId", paragraphID, "excerpt", excerpt(text, start, end), "tag", evidence),
			"corrected", false,
		))
	}
	return cues
}

// findSpeechTag is manuscript_guide.py find_speech_tag: the id a speech tag right after the quote, else right before it, names, when its
// verb is a speech verb and its name a speaking entry's, with the quote and the tag as its evidence; nil and "" otherwise.
func findSpeechTag(text []rune, start, end int, index map[string]any) (any, string) {
	after := pySlice(text, end, end+tagWindow)
	if tag, ok := tagAfter(after); ok && speechVerbs[strings.ToLower(tag.verb)] {
		if id := index[normalizeName(tag.name)]; pyTruthy(id) {
			return id, compare.PyStrip(string(text[start:end]) + " " + string(after[:tag.end]))
		}
	}
	before := pySlice(text, start-tagWindow, start)
	if tag, ok := tagBefore(before); ok && speechVerbs[strings.ToLower(tag.verb)] {
		if id := index[normalizeName(tag.name)]; pyTruthy(id) {
			return id, compare.PyStrip(string(before[tag.start:]) + " " + string(text[start:end]))
		}
	}
	return nil, ""
}

// capitalizedWords is CAPITALIZED_WORD.finditer, [A-Z][A-Za-z'’\-]*: each run of name characters that starts with a capital.
func capitalizedWords(text []rune) [][2]int {
	words := [][2]int{}
	for i := 0; i < len(text); {
		if !isUpper(text[i]) {
			i++
			continue
		}
		end := nameCharsFrom(text, i+1)
		words = append(words, [2]int{i, end})
		i = end
	}
	return words
}

// namesIn is manuscript_guide.py _names_in: the id of each name of index in text, as one to three capitalized words with only spaces
// between them, the longest first at each word.
func namesIn(text []rune, index map[string]any) []any {
	words := capitalizedWords(text)
	found := []any{}
	for i, word := range words {
		for n := 3; n >= 1; n-- {
			if i+n > len(words) {
				continue
			}
			span := words[i : i+n]
			joined := true
			for j := 1; j < len(span); j++ {
				if compare.PyStrip(string(text[span[j-1][1]:span[j][0]])) != "" {
					joined = false
					break
				}
			}
			if !joined {
				continue
			}
			if id := index[normalizeName(string(text[word[0]:span[n-1][1]]))]; pyTruthy(id) {
				found = append(found, id)
				break
			}
		}
	}
	return found
}

// nearbySpeaker is manuscript_guide.py nearby_speaker: the first speaking name within proximityWindow characters after the quote (from
// afterStart, up to afterEnd, the next quote), else the last one before it (back to beforeStart, the previous quote), else nil.
func nearbySpeaker(text []rune, afterStart, afterEnd, beforeStart, beforeEnd int, index map[string]any) any {
	if following := namesIn(pySlice(text, afterStart, min(afterEnd, afterStart+proximityWindow)), index); len(following) > 0 {
		return following[0]
	}
	if preceding := namesIn(pySlice(text, max(beforeStart, beforeEnd-proximityWindow), beforeEnd), index); len(preceding) > 0 {
		return preceding[len(preceding)-1]
	}
	return nil
}
