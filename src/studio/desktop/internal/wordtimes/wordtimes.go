// Package wordtimes turns the recording check's word times, which are seconds of a source file, into where each word plays in the DAW project, from
// the items the DAW has on the chapter's track now. It is the one place that maps the audio's clock to the project's clock: the Editing page's
// follow-along, play-from-a-word and play-a-range all read the table it makes (docs/design/word-project-times.md).
//
// A word's project time is never guessed. A word whose audio no item plays (a section cut out, a trim, a muted take, a source the track no longer
// holds) is marked not in the project; it never takes a neighbour's time.
package wordtimes

import (
	"math"
	"sort"
	"strconv"
	"strings"
)

// State says what a word's row holds.
type State string

const (
	// Placed: Start and End are the word's seconds in the project.
	Placed State = "placed"
	// NotInProject: the word was heard, and no item on the track plays that stretch of its source now (cut out, trimmed off, muted, or its
	// source is not on the track). Start and End are zero.
	NotInProject State = "not_in_project"
	// NotHeard: the check heard nothing for the word (a missing word), so it has no audio to place.
	NotHeard State = "not_heard"
)

// Word is one alignment token as the check heard it: where in which item's source file.
type Word struct {
	Index int
	// ItemIndex is the alignment's item (the manifest order); negative when nothing was heard for the word.
	ItemIndex  int
	Start, End float64
	// Misread marks a word the recogniser heard as another word.
	Misread bool
}

// Item is one item the alignment was made over: the file its words' times are seconds of.
type Item struct {
	Index      int
	GUID       string
	SourceFile string
}

// Live is one media item on the chapter's track as the DAW has it now.
type Live struct {
	GUID        string
	SourceFile  string
	Position    float64
	Length      float64
	SourceStart float64
	PlayRate    float64
	Muted       bool
}

// Input is what Compute needs.
type Input struct {
	Words []Word
	Items []Item
	Live  []Live
	// ChangeCount is the DAW's project change counter when Live was read, and RecordID the check the words came from. Together they are the version.
	ChangeCount int
	RecordID    string
}

// Row is one word's place in the project.
type Row struct {
	Index int
	State State
	// Start and End are project seconds, set only for a Placed word.
	Start, End float64
	// ItemGUID is the live item that plays the word ("" unless Placed).
	ItemGUID string
	// Clipped is true when the word runs past the end of the item that plays its start (a split or a trim cuts through it): End is the item's end.
	Clipped bool
	Misread bool
}

// Table is the chapter's words in the project, in the alignment's order.
type Table struct {
	Version     string
	ChangeCount int
	Rows        []Row
}

const eps = 1e-6

func norm(path string) string { return strings.ToLower(strings.ReplaceAll(path, `\`, "/")) }

func base(path string) string {
	n := norm(path)
	return n[strings.LastIndex(n, "/")+1:]
}

func (l Live) rate() float64 {
	if l.PlayRate > 0 {
		return l.PlayRate
	}
	return 1
}

func (l Live) sourceEnd() float64 { return l.SourceStart + l.Length*l.rate() }

// Compute places every word. A word is placed on the live item that plays its start second of its source file; when items overlap, the one that
// starts latest in the project plays (REAPER's rule). An item is the word's by its file (the whole path, else the file name when no item on the
// track has the path) and its source range, never by GUID: a split gives the right half a GUID the alignment never saw.
func Compute(in Input) Table {
	files := make(map[int]string, len(in.Items))
	guids := make(map[int]string, len(in.Items))
	for _, it := range in.Items {
		files[it.Index] = it.SourceFile
		guids[it.Index] = it.GUID
	}
	byGUID := make(map[string]string, len(in.Live))
	distinct := map[string]bool{}
	for _, l := range in.Live {
		byGUID[strings.ToUpper(strings.Trim(l.GUID, "{}"))] = l.SourceFile
		if l.SourceFile != "" {
			distinct[norm(l.SourceFile)] = true
		}
	}
	// A file the alignment's item no longer names (its GUID is gone from the saved project) is found by the item's GUID among the live items, else
	// is the track's only file.
	fileOf := func(index int) string {
		if f := files[index]; f != "" {
			return f
		}
		if f := byGUID[strings.ToUpper(strings.Trim(guids[index], "{}"))]; f != "" {
			return f
		}
		if len(distinct) == 1 {
			for _, l := range in.Live {
				if l.SourceFile != "" {
					return l.SourceFile
				}
			}
		}
		return ""
	}
	played := make([]Live, 0, len(in.Live))
	for _, l := range in.Live {
		if !l.Muted && l.SourceFile != "" && l.Length > 0 {
			played = append(played, l)
		}
	}
	rows := make([]Row, 0, len(in.Words))
	for _, w := range in.Words {
		row := Row{Index: w.Index, Misread: w.Misread}
		if w.ItemIndex < 0 || !(w.End >= w.Start) {
			row.State = NotHeard
			rows = append(rows, row)
			continue
		}
		piece, ok := playing(played, fileOf(w.ItemIndex), w.Start)
		if !ok {
			row.State = NotInProject
			rows = append(rows, row)
			continue
		}
		rate := piece.rate()
		row.State = Placed
		row.ItemGUID = piece.GUID
		row.Start = piece.Position + (w.Start-piece.SourceStart)/rate
		end := math.Min(w.End, piece.sourceEnd())
		row.Clipped = w.End > piece.sourceEnd()+eps
		row.End = piece.Position + (end-piece.SourceStart)/rate
		rows = append(rows, row)
	}
	return Table{Version: version(in), ChangeCount: in.ChangeCount, Rows: rows}
}

func version(in Input) string {
	return in.RecordID + "@" + strconv.Itoa(in.ChangeCount)
}

// playing finds the live item that plays second `at` of `file`'s source.
func playing(live []Live, file string, at float64) (Live, bool) {
	if file == "" {
		return Live{}, false
	}
	named := make([]Live, 0, len(live))
	for _, l := range live {
		if norm(l.SourceFile) == norm(file) {
			named = append(named, l)
		}
	}
	if len(named) == 0 {
		for _, l := range live {
			if base(l.SourceFile) == base(file) {
				named = append(named, l)
			}
		}
	}
	covering := named[:0:0]
	for _, l := range named {
		if at >= l.SourceStart-eps && at < l.sourceEnd()-eps {
			covering = append(covering, l)
		}
	}
	if len(covering) == 0 {
		return Live{}, false
	}
	sort.SliceStable(covering, func(i, j int) bool { return covering[i].Position < covering[j].Position })
	return covering[len(covering)-1], true
}
