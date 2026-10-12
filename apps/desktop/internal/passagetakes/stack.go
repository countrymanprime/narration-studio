package passagetakes

import (
	"cmp"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/passagemap"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// Stacking retries (SND-7b, ADR 0860 point 4; the Studio Next mock's selectors/stacking.ts): the later reads of a passage
// move onto the first read's spot as takes of its item, and back. The page names passages by id only; StackPlan and
// UnstackPlan rebuild the groups, the moves and the shift from the Booth's passage map, the chapter's track as REAPER reports
// it now and, to move takes back, the offsets the saved project's stacked takes recorded (threat model row 5f). The plan the
// page showed is never read here.

// StackedFromKey is the take P_EXT stack_takes writes on each stacked take (narration_takes.lua's STACK_KEY):
// `read item|read take|track|start|offset from the first read`, GUIDs and seconds.
const StackedFromKey = "narration_utils_stacked_from"

// stackTolerance is how far apart two reads may start and still be on one spot (narration_takes.lua's POSITION_TOLERANCE,
// the mock's EPS).
const stackTolerance = 0.05

// What StackPlan and UnstackPlan refuse, in the narrator's words.
const (
	stackNotAPassageSentence = "That passage is not one of this chapter's passages any more, so nothing was changed. Read the chapter again."
	stackKeptSentence        = "A take of this passage has been kept, so its reads cannot be stacked or moved back."
	stackSharedSentence      = "Two of these passages share a read, so nothing was changed. Stack them one at a time."
	stackGoneSentence        = "A read of this passage is no longer in the REAPER project, so nothing was changed. Read the chapter again."
	stackNothingSentence     = "There are no retries to move in %s."
	unstackNothingSentence   = "No take of these passages is stacked in the saved %s project, so nothing was moved back. Save the project in %s if you stacked them since, then try again."
)

// StackPassage is a passage a stack can name: a paragraph two or more recorded items read, by the passage map. Items are
// the GUIDs the host stamped on the runs that read it, in the order they were first recorded.
type StackPassage struct {
	ID    string
	Items []string
}

// StackPassageID is the id the page names a passage by (the mock's passagesFromMap: `pm-<chapter>-<paragraph>`).
func StackPassageID(chapterID, paragraphID string) string {
	return "pm-" + chapterID + "-" + paragraphID
}

// StackPassages lists chapterID's passages a stack can name, in paragraph order: each paragraph of lines (the manuscript's,
// in reading order) that the reads of two or more items cover, as the mock's passagesFromMap finds them. A read runs from
// one mark of a run to the next, which says where the reading had got to; stale marks, unstamped runs and reads that cover
// no word of the paragraph count for nothing. Reads of one item (a roll's takes) are one read: they share a spot already.
func StackPassages(chapterID string, lines []passagemap.Line, marks []passagemap.Resolved) []StackPassage {
	var paragraphs []passagemap.Line
	index := map[string]int{}
	for _, line := range lines {
		if line.ChapterID == chapterID {
			index[line.ID] = len(paragraphs)
			paragraphs = append(paragraphs, line)
		}
	}
	runs := map[string][]passagemap.Resolved{}
	var order []string
	for _, mark := range marks {
		if mark.ChapterID != chapterID || mark.Stale {
			continue
		}
		if _, seen := runs[mark.Run]; !seen {
			order = append(order, mark.Run)
		}
		runs[mark.Run] = append(runs[mark.Run], mark)
	}
	covering := make([][]string, len(paragraphs))
	for _, run := range order {
		sorted := slices.Clone(runs[run])
		slices.SortStableFunc(sorted, func(a, b passagemap.Resolved) int {
			if c := cmp.Compare(a.Sec, b.Sec); c != 0 {
				return c
			}
			return cmp.Compare(kindOrder(a.Kind), kindOrder(b.Kind))
		})
		for i := 0; i+1 < len(sorted); i++ {
			from, to := sorted[i], sorted[i+1]
			if to.Prev == nil || from.ItemGUID == "" {
				continue
			}
			first, okFirst := index[from.PID]
			last, okLast := index[to.Prev.PID]
			if !okFirst || !okLast || last < first {
				continue
			}
			for p := first; p <= last; p++ {
				start, end := 0, paragraphs[p].Words
				if p == first {
					start = from.Word
				}
				if p == last {
					end = min(end, to.Prev.Word)
				}
				if end > start && !slices.ContainsFunc(covering[p], func(item string) bool { return sameGUID(item, from.ItemGUID) }) {
					covering[p] = append(covering[p], from.ItemGUID)
				}
			}
		}
	}
	var out []StackPassage
	for p, items := range covering {
		if len(items) >= 2 {
			out = append(out, StackPassage{ID: StackPassageID(chapterID, paragraphs[p].ID), Items: items})
		}
	}
	return out
}

func kindOrder(kind string) int {
	if kind == passagemap.KindStart {
		return 0
	}
	return 1
}

// StackInput is what StackPlan and UnstackPlan read: the passages the page named, the chapter's passages, the chapter's
// track as REAPER reports it now and the saved project (for UnstackPlan), and the DAW's name for the sentences.
type StackInput struct {
	ChapterID  string
	PassageIDs []string
	Passages   []StackPassage
	Live       []dawport.TrackItem
	Saved      tracks.Project
	DAW        string
}

// StackPlan is the stack_takes request for the passages in.PassageIDs, built here: for each passage, the read that starts
// first on the chapter's track stays where it is, and every other read on the track that does not start on its spot moves
// there, from where REAPER reports it now. The shift is what narration_takes.lua will check: per group, the first read's end
// less the latest end among it and the moved reads. Passages that share a first read are one group. An id that is not one
// of the chapter's passages is refused stale; a passage whose read is muted on the track (a take was kept) is refused, and
// so are passages that share a read with different first reads; a request with nothing to move is refused. A read the
// track no longer holds is left out (stacked already, or gone): REAPER checks what is sent.
func StackPlan(in StackInput) (dawport.StackRequest, *dawport.Result) {
	passages, refused := namedPassages(in)
	if refused != nil {
		return dawport.StackRequest{}, refused
	}
	live := liveItems(in.Live)
	plan := newStackGroups()
	for _, passage := range passages {
		var reads []dawport.TrackItem
		for _, guid := range passage.Items {
			item, ok := live[strings.ToUpper(guid)]
			if !ok || item.TakeGUID == "" {
				continue
			}
			if item.Muted != nil && *item.Muted {
				return dawport.StackRequest{}, refusal(stackKeptSentence)
			}
			reads = append(reads, item)
		}
		if len(reads) < 2 {
			continue
		}
		base := slices.MinFunc(reads, func(a, b dawport.TrackItem) int { return cmp.Compare(a.Position, b.Position) })
		var moves []dawport.StackMove
		for _, read := range reads {
			if read.ItemGUID == base.ItemGUID || math.Abs(read.Position-base.Position) <= stackTolerance {
				continue
			}
			moves = append(moves, dawport.StackMove{TakeID: read.TakeGUID, From: read.Position, To: base.Position, Len: read.Length})
		}
		if !plan.add(passage.ID, base, base.TakeGUID, moves, itemGUIDs(reads)) {
			return dawport.StackRequest{}, refusal(stackSharedSentence)
		}
	}
	request := plan.request(in.ChapterID, func(group dawport.StackGroup, first, length float64) float64 {
		after := first + length
		for _, move := range group.Moves {
			after = max(after, move.From+move.Len)
		}
		return first + length - after
	})
	if len(request.Groups) == 0 {
		return dawport.StackRequest{}, refusal(fmt.Sprintf(stackNothingSentence, in.DAW))
	}
	return request, nil
}

// UnstackPlan is the unstack_takes request for the passages in.PassageIDs: for each passage, the read on the chapter's track
// whose item in the saved project carries stacked takes of the passage's other reads is the first read, and every stacked
// take on it moves from its start back to its start plus the offset the take recorded, as long as its own item in the
// saved project. The shift is per group the latest end among the moved-back reads less the first read's end. The same refusals as
// StackPlan; a read the saved project no longer has is refused stale, and nothing stacked (the project not saved since the
// stack, say) is refused with a sentence that says to save it.
func UnstackPlan(in StackInput) (dawport.StackRequest, *dawport.Result) {
	passages, refused := namedPassages(in)
	if refused != nil {
		return dawport.StackRequest{}, refused
	}
	live := liveItems(in.Live)
	plan := newStackGroups()
	for _, passage := range passages {
		for _, guid := range passage.Items {
			base, ok := live[strings.ToUpper(guid)]
			if !ok {
				continue
			}
			_, saved, found := in.Saved.ItemByGUID(base.ItemGUID)
			if !found {
				continue
			}
			moves, baseTake, reads, gone := stackedMoves(in.Saved, saved, passage, base)
			if gone {
				return dawport.StackRequest{}, staleRefusal(stackGoneSentence)
			}
			if len(moves) == 0 {
				continue
			}
			if base.Muted != nil && *base.Muted {
				return dawport.StackRequest{}, refusal(stackKeptSentence)
			}
			if baseTake == "" {
				return dawport.StackRequest{}, staleRefusal(stackGoneSentence)
			}
			if !plan.add(passage.ID, base, baseTake, moves, reads) {
				return dawport.StackRequest{}, refusal(stackSharedSentence)
			}
		}
	}
	request := plan.request(in.ChapterID, func(group dawport.StackGroup, first, length float64) float64 {
		after := first + length
		for _, move := range group.Moves {
			after = max(after, move.To+move.Len)
		}
		return after - (first + length)
	})
	if len(request.Groups) == 0 {
		return dawport.StackRequest{}, refusal(fmt.Sprintf(unstackNothingSentence, in.DAW, in.DAW))
	}
	return request, nil
}

// stackedMoves reads the takes of saved (the first read's item in the saved project) that stack_takes recorded, when one
// of them is one of the passage's other reads: each moves from base's start to base's start plus its offset, for its own
// item's length. A stack goes back whole (narration_takes.lua refuses an un-stack that leaves a stacked take on the item),
// so every stacked take of the item moves, the passage's or not. baseTake is the item's first take that is not a stacked
// one. gone is true when a recorded read's item is not in the saved project.
func stackedMoves(project tracks.Project, saved tracks.Item, passage StackPassage, base dawport.TrackItem) (moves []dawport.StackMove, baseTake string, reads []string, gone bool) {
	ours := false
	for _, take := range saved.Takes {
		raw, ok := take.Ext[StackedFromKey]
		if !ok {
			if baseTake == "" {
				baseTake = take.GUID
			}
			continue
		}
		readItem, readTake, offset, ok := stackRecord(raw)
		if !ok {
			continue
		}
		ours = ours || slices.ContainsFunc(passage.Items, func(item string) bool { return sameGUID(item, readItem) })
		_, read, found := project.ItemByGUID(readItem)
		if !found {
			return nil, "", nil, true
		}
		moves = append(moves, dawport.StackMove{TakeID: readTake, From: base.Position, To: base.Position + offset, Len: read.Length})
		reads = append(reads, readItem)
	}
	if !ours {
		return nil, baseTake, nil, false
	}
	return moves, baseTake, reads, false
}

// stackRecord reads a StackedFromKey value: the read's item and take GUIDs and its offset from the first read.
func stackRecord(raw string) (item, take string, offset float64, ok bool) {
	fields := strings.Split(raw, "|")
	if len(fields) != 5 {
		return "", "", 0, false
	}
	offset, err := strconv.ParseFloat(fields[4], 64)
	if err != nil || math.IsNaN(offset) || math.IsInf(offset, 0) || offset < 0 {
		return "", "", 0, false
	}
	return fields[0], fields[1], offset, fields[0] != "" && fields[1] != ""
}

// CheckNamed is StackPlan's refusal of in.PassageIDs alone, read before the DAW is asked anything: an id the chapter does
// not list (code stale), or none at all.
func CheckNamed(in StackInput) *dawport.Result {
	_, refused := namedPassages(in)
	return refused
}

// namedPassages are the passages in.PassageIDs names, each once and in the order named. An id the chapter does not list
// is refused stale, and so is a request that names none.
func namedPassages(in StackInput) ([]StackPassage, *dawport.Result) {
	byID := map[string]StackPassage{}
	for _, passage := range in.Passages {
		byID[passage.ID] = passage
	}
	var out []StackPassage
	seen := map[string]bool{}
	for _, id := range in.PassageIDs {
		passage, ok := byID[id]
		if !ok {
			return nil, staleRefusal(stackNotAPassageSentence)
		}
		if !seen[id] {
			seen[id] = true
			out = append(out, passage)
		}
	}
	if len(out) == 0 {
		return nil, refusal(fmt.Sprintf(stackNothingSentence, in.DAW))
	}
	return out, nil
}

func liveItems(items []dawport.TrackItem) map[string]dawport.TrackItem {
	out := make(map[string]dawport.TrackItem, len(items))
	for _, item := range items {
		out[strings.ToUpper(item.ItemGUID)] = item
	}
	return out
}

func itemGUIDs(reads []dawport.TrackItem) []string {
	out := make([]string, len(reads))
	for i, read := range reads {
		out[i] = read.ItemGUID
	}
	return out
}

func sameGUID(a, b string) bool { return strings.EqualFold(a, b) }

func refusal(sentence string) *dawport.Result {
	refused := dawport.Refused(sentence)
	return &refused
}

func staleRefusal(sentence string) *dawport.Result {
	refused := dawport.RefusedStale(sentence)
	return &refused
}

// stackGroups gathers the groups of one request, one per first read: passages that share a first read are one group.
type stackGroups struct {
	groups []dawport.StackGroup
	bases  []dawport.TrackItem
	// owner is which group's first read each read item belongs to.
	owner map[string]string
}

func newStackGroups() *stackGroups { return &stackGroups{owner: map[string]string{}} }

// add puts a passage's moves in the group of its first read, or starts it. It is false when one of reads already belongs
// to another first read's group.
func (s *stackGroups) add(passageID string, base dawport.TrackItem, baseTake string, moves []dawport.StackMove, reads []string) bool {
	key := strings.ToUpper(base.ItemGUID)
	for _, read := range append([]string{base.ItemGUID}, reads...) {
		if owner, ok := s.owner[strings.ToUpper(read)]; ok && owner != key {
			return false
		}
	}
	if len(moves) == 0 {
		return true
	}
	for _, read := range append([]string{base.ItemGUID}, reads...) {
		s.owner[strings.ToUpper(read)] = key
	}
	for i := range s.groups {
		if strings.ToUpper(s.groups[i].ItemGUID) != key {
			continue
		}
		for _, move := range moves {
			if !slices.ContainsFunc(s.groups[i].Moves, func(m dawport.StackMove) bool { return sameGUID(m.TakeID, move.TakeID) }) {
				s.groups[i].Moves = append(s.groups[i].Moves, move)
			}
		}
		return true
	}
	s.groups = append(s.groups, dawport.StackGroup{PassageID: passageID, ItemGUID: base.ItemGUID, Base: baseTake, Moves: moves})
	s.bases = append(s.bases, base)
	return true
}

// request is the groups in time order with the shift summed, each group's from shift(group, first read's start, its length).
func (s *stackGroups) request(chapterID string, shift func(group dawport.StackGroup, first, length float64) float64) dawport.StackRequest {
	order := make([]int, len(s.groups))
	for i := range order {
		order[i] = i
	}
	slices.SortStableFunc(order, func(a, b int) int { return cmp.Compare(s.bases[a].Position, s.bases[b].Position) })
	request := dawport.StackRequest{ChapterID: chapterID}
	for _, i := range order {
		group := s.groups[i]
		request.Groups = append(request.Groups, group)
		request.Shift += shift(group, s.bases[i].Position, s.bases[i].Length)
	}
	return request
}
