// Package passagetakes finds the alternate takes of a chapter passage for the workspace's Takes panel: the
// other takes on the item the passage was heard on and the other retakes of its line on a fixed-lane track. Everything
// is read from the saved project, the chapter's stored alignment and the Booth's passage map, never from the page: the page names a chapter and a range of tokens, and a candidate is chosen by an
// id this package offered (Resolved.Choice), so a GUID, a file or a time never comes from the UI (threat model 5l).
package passagetakes

import (
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"desktop/internal/coverage"
	"desktop/internal/findings"
	"desktop/internal/measure"
	"desktop/internal/passagemap"
	"desktop/internal/retakelanes"
	"desktop/internal/tracks"
)

// Where a candidate comes from (EP6) and what choosing it does (EP7).
const (
	SourceItemTake   = "item_take"
	SourceLaneRetake = "lane_retake"

	// ActionMakeActive makes the take the item's active one (set_active_take, one undo step).
	ActionMakeActive = "make_active"
	// ActionPickLane makes the retake's lane the only one playing (pick_retake_lane, one undo step).
	ActionPickLane = "pick_lane"
)

// Candidate is one take the narrator can hear against the passage and choose.
type Candidate struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Action string `json:"action"`
	Label  string `json:"label"`
	Detail string `json:"detail"`
	// Active is set for what plays now.
	Active   bool   `json:"active"`
	ItemGUID string `json:"itemGuid"`
	TakeGUID string `json:"takeGuid"`
	// SourceFile, SourceStart and SourceLength are the range of its own file the take plays, for the in-app A/B.
	SourceFile   string  `json:"sourceFile"`
	SourceStart  float64 `json:"sourceStart"`
	SourceLength float64 `json:"sourceLength"`
	// Usable is false when the take cannot be heard or chosen, and Reason says why.
	Usable bool   `json:"usable"`
	Reason string `json:"reason,omitempty"`
}

// Alternates is the Takes panel's read: the passage as the host snapped it and every candidate for it.
type Alternates struct {
	ChapterID  string `json:"chapterId"`
	FirstToken int    `json:"firstToken"`
	LastToken  int    `json:"lastToken"`
	// FirstParagraph and LastParagraph are the passage snapped out to whole paragraphs, in the chapter's order.
	FirstParagraph int `json:"firstParagraph"`
	LastParagraph  int `json:"lastParagraph"`
	// Words is how many words of the chapter's alignment the asked range holds.
	Words int `json:"words"`
	// PassageID names the passage and the item it was heard on; empty when there is none.
	PassageID string `json:"passageId"`
	ItemGUID  string `json:"itemGuid"`
	// Message says why there are no candidates, when there are none.
	Message    string      `json:"message,omitempty"`
	Candidates []Candidate `json:"candidates"`
}

// Choice is everything acting on a candidate needs, all from the saved project.
type Choice struct {
	Candidate      Candidate
	TargetItemGUID string
	// LineID is set for a lane pick.
	LineID string
}

// Input is what Resolve reads.
type Input struct {
	ChapterID  string
	View       coverage.AlignmentView
	FirstToken int
	LastToken  int
	Project    tracks.Project
	// Marks are the chapter's runs in the Booth's passage map (passagemap.Service.List): where each take the Booth recorded
	// began and ended in the text, with the DAW's ids. A passage the Booth recorded is placed from them (TK-1 part 2).
	Marks []passagemap.Resolved
}

// Resolved is Alternates plus what is needed to act on a candidate.
type Resolved struct {
	View    Alternates
	choices map[string]Choice
	// input is what the view was resolved from, for Evidence.
	input Input
}

// Choice is the offered candidate named id, or false: nothing but an offered candidate can be chosen.
func (r Resolved) Choice(id string) (Choice, bool) {
	choice, ok := r.choices[id]
	return choice, ok
}

// Resolve reads the alternates of the passage [FirstToken, LastToken] of the chapter's alignment. It errors only for a
// range outside the alignment (the caller's copy of it is out of date); every other problem is the view's Message.
func Resolve(in Input) (Resolved, error) {
	tokens := in.View.Tokens
	if in.FirstToken < 0 || in.LastToken >= len(tokens) || in.FirstToken > in.LastToken {
		return Resolved{}, fmt.Errorf("tokens %d to %d are not in this chapter's alignment; reload the workspace", in.FirstToken, in.LastToken)
	}
	view := Alternates{ChapterID: in.ChapterID, FirstToken: in.FirstToken, LastToken: in.LastToken, Words: in.LastToken - in.FirstToken + 1, Candidates: []Candidate{}}
	resolved := Resolved{View: view, choices: map[string]Choice{}, input: in}

	view.FirstParagraph, view.LastParagraph = paragraphSpan(in.View, in.FirstToken, in.LastToken)
	itemGUID, found := firstMappedItem(in.Project, mappedSpans(in, view.FirstParagraph, view.LastParagraph))
	if !found {
		itemIndex, heard := majorityItem(tokens[in.FirstToken : in.LastToken+1])
		if !heard {
			view.Message = "This passage wasn't heard in the recording, so there are no takes to set beside it. Run the check again if the chapter has changed."
			resolved.View = view
			return resolved, nil
		}
		alignmentItem, ok := alignmentItemAt(in.View.Items, itemIndex)
		if !ok || !alignmentItem.Live || alignmentItem.ItemGUID == "" {
			view.Message = "The item this passage was heard on is no longer in the saved REAPER project. Save the project in REAPER and run the check again."
			resolved.View = view
			return resolved, nil
		}
		itemGUID = alignmentItem.ItemGUID
	}
	track, item, ok := in.Project.ItemByGUID(itemGUID)
	if !ok {
		view.Message = "The item this passage was heard on is no longer in the saved REAPER project. Save the project in REAPER and run the check again."
		resolved.View = view
		return resolved, nil
	}
	view.ItemGUID = item.GUID
	view.PassageID = "passage-" + findings.StableID("passage", in.ChapterID, strconv.Itoa(view.FirstParagraph), strconv.Itoa(view.LastParagraph), item.GUID)

	b := &builder{in: in, target: item, seen: map[string]bool{}}
	b.itemTakes(item)
	b.laneRetakes(track, item)

	view.Candidates = b.candidates
	for i := range view.Candidates {
		candidate := view.Candidates[i]
		choice := b.choices[candidate.ID]
		choice.Candidate = candidate
		resolved.choices[candidate.ID] = choice
	}
	resolved.View = view
	return resolved, nil
}

type builder struct {
	in         Input
	target     tracks.Item
	seen       map[string]bool
	candidates []Candidate
	choices    map[string]Choice
}

func (b *builder) add(candidate Candidate, choice Choice) {
	key := candidate.ItemGUID + "|" + candidate.TakeGUID
	if b.seen[key] {
		return
	}
	b.seen[key] = true
	if b.choices == nil {
		b.choices = map[string]Choice{}
	}
	choice.TargetItemGUID = b.target.GUID
	b.choices[candidate.ID] = choice
	b.candidates = append(b.candidates, candidate)
}

// takeRange is a take's played range of its own file, or why it cannot be derived or heard.
func takeRange(item tracks.Item, index int) (file string, start, length float64, reason string) {
	take := item.Takes[index]
	if !take.SourceAvailable {
		return take.SourceFile, 0, 0, "This take's audio file is missing, so it cannot be heard or measured."
	}
	source, err := measure.TakeSourceRange(item, index)
	if err != nil {
		return take.SourceFile, 0, 0, "This take's range cannot be told exactly (" + err.Error() + ")."
	}
	return take.SourceFile, source.Range.StartSeconds, source.Range.LengthSeconds, ""
}

func (b *builder) itemTakes(item tracks.Item) {
	if len(item.Takes) < 2 {
		return
	}
	for index, take := range item.Takes {
		file, start, length, reason := takeRange(item, index)
		detail := fmt.Sprintf("Take %d of %d on this item · %s", index+1, len(item.Takes), fileName(file))
		b.add(Candidate{
			ID: "take:" + item.GUID + ":" + take.GUID, Source: SourceItemTake, Action: ActionMakeActive,
			Label: fmt.Sprintf("Take %d", index+1), Detail: detail, Active: index == item.ActiveTake,
			ItemGUID: item.GUID, TakeGUID: take.GUID, SourceFile: file, SourceStart: start, SourceLength: length,
			Usable: reason == "", Reason: reason,
		}, Choice{})
	}
}

func (b *builder) laneRetakes(track tracks.Track, target tracks.Item) {
	if !track.FixedLanes {
		return
	}
	line, _, ok := findLine(b.in.Project, target)
	if !ok {
		return
	}
	for _, retake := range line.Retakes {
		if retake.ItemGUID == target.GUID {
			continue
		}
		_, item, found := b.in.Project.ItemByGUID(retake.ItemGUID)
		if !found || len(item.Takes) == 0 || item.ActiveTake < 0 || item.ActiveTake >= len(item.Takes) {
			continue
		}
		file, start, length, reason := takeRange(item, item.ActiveTake)
		b.add(Candidate{
			ID: "lane:" + line.LineID + ":" + item.GUID, Source: SourceLaneRetake, Action: ActionPickLane,
			Label: fmt.Sprintf("Retake on lane %d", retake.Lane+1), Detail: fmt.Sprintf("%s · lane %d of %s · %s", item.Name, retake.Lane+1, line.TrackName, fileName(file)),
			Active: retake.Plays, ItemGUID: item.GUID, TakeGUID: item.Takes[item.ActiveTake].GUID,
			SourceFile: file, SourceStart: start, SourceLength: length, Usable: reason == "", Reason: reason,
		}, Choice{LineID: line.LineID})
	}
}

// findLine is the fixed-lane line item belongs to (retakelanes.Lines lists only lines on two or more lanes).
func findLine(project tracks.Project, item tracks.Item) (retakelanes.Line, retakelanes.Retake, bool) {
	lineID := item.Ext[retakelanes.LineIDKey]
	if lineID == "" {
		return retakelanes.Line{}, retakelanes.Retake{}, false
	}
	return retakelanes.Lines(project).Find(lineID, item.GUID)
}

// paragraphSpan is the range of the chapter's paragraphs the tokens [first, last] touch, in the paragraphs' order.
func paragraphSpan(view coverage.AlignmentView, first, last int) (int, int) {
	index := map[string]int{}
	for i, paragraph := range view.Paragraphs {
		index[paragraph.ID] = i
	}
	low, high := -1, -1
	for _, token := range view.Tokens[first : last+1] {
		if token.ParagraphID == nil {
			continue
		}
		i, ok := index[*token.ParagraphID]
		if !ok {
			continue
		}
		if low == -1 || i < low {
			low = i
		}
		if i > high {
			high = i
		}
	}
	return max(low, 0), max(high, 0)
}

// majorityItem is the item index most of the heard tokens sit on (the lowest when they tie), or false when none were heard.
func majorityItem(tokens []coverage.TokenLine) (int, bool) {
	counts := map[int]int{}
	for _, token := range tokens {
		if token.Item != nil {
			counts[*token.Item]++
		}
	}
	best, bestCount := -1, 0
	for item, count := range counts {
		if count > bestCount || (count == bestCount && item < best) {
			best, bestCount = item, count
		}
	}
	return best, bestCount > 0
}

func alignmentItemAt(items []coverage.AlignmentItem, index int) (coverage.AlignmentItem, bool) {
	for _, item := range items {
		if item.Index == index {
			return item, true
		}
	}
	return coverage.AlignmentItem{}, false
}

func fileName(path string) string {
	name := filepath.Base(strings.ReplaceAll(path, "\\", "/"))
	if name == "." || name == "/" {
		return path
	}
	return name
}

// mapSpan is one take of the Booth's passage map: it began at a mark and ended where the next mark of its run says the
// reading had got to.
type mapSpan struct {
	from, to           passagemap.Place
	itemGUID, takeGUID string
}

// mapSpans are the takes the marks record, runs in the order they were recorded and each run's takes in time order
// (passagemap.Service.List keeps both orders). A take with a stale mark at either end is left out: where it sits in the
// current text is not known.
func mapSpans(marks []passagemap.Resolved) []mapSpan {
	var spans []mapSpan
	for i := 0; i+1 < len(marks); i++ {
		begin, end := marks[i], marks[i+1]
		if begin.Run != end.Run || begin.Stale || end.Stale || end.Prev == nil {
			continue
		}
		spans = append(spans, mapSpan{from: passagemap.Place{PID: begin.PID, Word: begin.Word}, to: *end.Prev, itemGUID: begin.ItemGUID, takeGUID: begin.TakeGUID})
	}
	return spans
}

// mappedSpans are the map's takes that read at least one word of the paragraphs [first, last] of the chapter's order.
// A take that began in one paragraph and ended in a later one read the end of the first, every paragraph between and the
// start of the last; a roll back to an earlier place starts the next take there.
func mappedSpans(in Input, first, last int) []mapSpan {
	paragraphs := in.View.Paragraphs
	if len(in.Marks) == 0 || last >= len(paragraphs) {
		return nil
	}
	index := make(map[string]int, len(paragraphs))
	for i, paragraph := range paragraphs {
		index[paragraph.ID] = i
	}
	var out []mapSpan
	for _, span := range mapSpans(in.Marks) {
		from, fromOK := index[span.from.PID]
		to, toOK := index[span.to.PID]
		if !fromOK || !toOK {
			continue
		}
		for p := max(from, first); p <= min(to, last); p++ {
			words := len(strings.Fields(paragraphs[p].Text))
			begin, end := 0, words
			if p == from {
				begin = span.from.Word
			}
			if p == to {
				end = min(words, span.to.Word)
			}
			if end > begin {
				out = append(out, span)
				break
			}
		}
	}
	return out
}

// firstMappedItem is the item of the earliest of spans still in the saved project: the passage's first read. A later
// Booth recording of the same text keeps the passage there, so its id, and what Editing keyed by it, stay the same.
func firstMappedItem(project tracks.Project, spans []mapSpan) (string, bool) {
	for _, span := range spans {
		if span.itemGUID == "" {
			continue
		}
		if _, _, found := project.ItemByGUID(span.itemGUID); found {
			return span.itemGUID, true
		}
	}
	return "", false
}
