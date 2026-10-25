package comparerun

import (
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"desktop/internal/compare"
)

// Read is one line of a --find-repeats manifest (item_index|source_file|start_offset|length|item_guid|take_guid): an
// item, or one take of an item, transcribed and aligned on its own. The GUIDs are REAPER's and only passed through.
type Read struct {
	ItemIndex           int
	SourceFile          string
	StartOffset, Length float64
	ItemGUID, TakeGUID  string
}

// ReadRepeatManifest is compare.py's read_repeat_segments: the manifest's reads in manifest order.
func ReadRepeatManifest(path string) ([]Read, error) {
	raw, err := compare.ReadBounded(path)
	if err != nil {
		return nil, fmt.Errorf("could not read the repeated-span manifest: %w", err)
	}
	reads := []Read{}
	for number, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Split(line, "|")
		if len(fields) != 6 {
			return nil, fmt.Errorf("the repeated-span manifest's line %d has %d fields, not 6", number+1, len(fields))
		}
		item, err1 := strconv.Atoi(fields[0])
		start, err2 := strconv.ParseFloat(fields[2], 64)
		length, err3 := strconv.ParseFloat(fields[3], 64)
		if err := errors.Join(err1, err2, err3); err != nil {
			return nil, fmt.Errorf("the repeated-span manifest's line %d: %w", number+1, err)
		}
		reads = append(reads, Read{item, fields[1], start, length, fields[4], fields[5]})
	}
	return reads, nil
}

// ReadRepeatWords reads the words the sidecar's --find-repeats heard: one REPEAT_WORDS line per read, in manifest order.
// Another tag, a malformed line or a count other than reads is an error.
func ReadRepeatWords(path string, reads int) ([][]compare.Word, error) {
	raw, err := compare.ReadBounded(path)
	if err != nil {
		return nil, fmt.Errorf("could not read the repeated-span detector's words: %w", err)
	}
	heard := [][]compare.Word{}
	for number, line := range strings.Split(strings.TrimRight(string(raw), "\n"), "\n") {
		if line == "" {
			continue
		}
		tag, payload, _ := strings.Cut(line, "|")
		if tag != "REPEAT_WORDS" {
			return nil, fmt.Errorf("the repeated-span detector's words have an unknown line %q", tag)
		}
		var entry struct {
			Words [][3]any `json:"words"`
		}
		if json.Unmarshal([]byte(payload), &entry) != nil || entry.Words == nil {
			return nil, fmt.Errorf("the repeated-span detector's words have a malformed line %d", number+1)
		}
		words, ok := parseWords(entry.Words)
		if !ok {
			return nil, fmt.Errorf("the repeated-span detector's words have a malformed line %d", number+1)
		}
		heard = append(heard, words)
	}
	if len(heard) != reads {
		return nil, fmt.Errorf("the repeated-span detector heard %d read(s) of %d", len(heard), reads)
	}
	return heard, nil
}

// sourceIdentity is the exact-copy key detect_exact_copies builds: os.path.normcase(os.path.abspath(source)), which
// folds case and slashes on Windows only.
func sourceIdentity(source string) string {
	if abs, err := filepath.Abs(source); err == nil {
		source = abs
	}
	if runtime.GOOS == "windows" {
		source = strings.ToLower(strings.ReplaceAll(source, "/", `\`))
	}
	return source
}

// exactCopies is detect_exact_copies: reads whose source file and range (to the millisecond) are the same decode to
// the same audio. Each read with a peer gets its group's label, EC0, EC1, ... in the order the groups first appear.
func exactCopies(reads []Read) map[int]string {
	type identity struct {
		source        string
		start, length float64
	}
	byIdentity := map[identity][]int{}
	order := []identity{}
	for k, read := range reads {
		key := identity{sourceIdentity(read.SourceFile), compare.PyRound(read.StartOffset, 3), compare.PyRound(read.Length, 3)}
		if _, seen := byIdentity[key]; !seen {
			order = append(order, key)
		}
		byIdentity[key] = append(byIdentity[key], k)
	}
	labels := map[int]string{}
	group := 0
	for _, key := range order {
		if len(byIdentity[key]) < 2 {
			continue
		}
		for _, k := range byIdentity[key] {
			labels[k] = fmt.Sprintf("EC%d", group)
		}
		group++
	}
	return labels
}

// alignmentQuality is _alignment_quality: the share of the alignment's opcodes, by their longer side, that are equal.
func alignmentQuality(a compare.Alignment) float64 {
	equal, total := 0, 0
	for _, op := range a.Opcodes {
		size := max(op.I2-op.I1, op.J2-op.J1)
		total += size
		if op.Tag == "equal" {
			equal += size
		}
	}
	if total == 0 {
		return 0.0
	}
	return float64(equal) / float64(total)
}

type spanGroup struct {
	first, last int
	members     []int
}

// groupRepeatedSpans is group_repeated_spans: in order of their first sentence unit, each read with an aligned span
// joins the first group whose span overlaps its own by at least minOverlap of the shorter of the two, widening it, or
// starts one. Only groups of two or more reads are kept.
func groupRepeatedSpans(covered []*[2]int, minOverlap float64) []spanGroup {
	indexed := []int{}
	for k, span := range covered {
		if span != nil {
			indexed = append(indexed, k)
		}
	}
	sort.SliceStable(indexed, func(a, b int) bool {
		x, y := covered[indexed[a]], covered[indexed[b]]
		return x[0] < y[0] || (x[0] == y[0] && x[1] < y[1])
	})
	groups := []*spanGroup{}
	for _, k := range indexed {
		first, last := covered[k][0], covered[k][1]
		placed := false
		for _, g := range groups {
			overlap := min(g.last, last) - max(g.first, first) + 1
			if overlap <= 0 {
				continue
			}
			shorter := min(g.last-g.first+1, last-first+1)
			if shorter > 0 && float64(overlap)/float64(shorter) >= minOverlap {
				g.first, g.last = min(g.first, first), max(g.last, last)
				g.members = append(g.members, k)
				placed = true
				break
			}
		}
		if !placed {
			groups = append(groups, &spanGroup{first, last, []int{k}})
		}
	}
	kept := []spanGroup{}
	for _, g := range groups {
		if len(g.members) >= 2 {
			kept = append(kept, *g)
		}
	}
	return kept
}

// FindRepeats is the tail of compare.py's find_repeated_spans for the chosen chapter: each read aligned on its own,
// the reads that cover the same span grouped, and exact copies flagged. It returns the tagged text repeats.ParseOutput
// reads: a SUMMARY line, then per group a SPAN_GROUP line and a SPAN_MEMBER line per read.
func FindRepeats(t compare.Tokenizer, c compare.Chapter, reads []Read, heard [][]compare.Word, minWords int, minOverlap float64) string {
	units := t.BuildChapterUnits(spokenHeading(c), c.Paragraphs)
	covered := make([]*[2]int, len(reads))
	quality := make([]float64, len(reads))
	for k := range reads {
		alignment := t.Align(units, heard[k])
		_, covered[k] = Markers(alignment, units, heard[k], minWords)
		quality[k] = alignmentQuality(alignment)
	}
	groups := groupRepeatedSpans(covered, minOverlap)
	copies := exactCopies(reads)

	var out strings.Builder
	members := 0
	for _, g := range groups {
		members += len(g.members)
	}
	fmt.Fprintf(&out, "SUMMARY|Found %d repeated-span group(s) across %d segment(s)\n", len(groups), members)
	f3 := func(x float64) string { return strconv.FormatFloat(x, 'f', 3, 64) }
	for n, g := range groups {
		fmt.Fprintf(&out, "SPAN_GROUP|%d|%d|%d|%d\n", n, g.first, g.last, len(g.members))
		union := g.last - g.first + 1
		for _, k := range g.members {
			read, span := reads[k], covered[k]
			overlap := min(g.last, span[1]) - max(g.first, span[0]) + 1
			coverage := 0.0
			if union > 0 {
				coverage = float64(max(0, overlap)) / float64(union)
			}
			fmt.Fprintf(&out, "SPAN_MEMBER|%d|%d|%s|%s|%s|%s|%s|%d|%d|%s|%s|%s\n", n, read.ItemIndex, read.ItemGUID, read.TakeGUID, read.SourceFile,
				f3(read.StartOffset), f3(read.Length), span[0], span[1], f3(coverage), f3(quality[k]), copies[k])
		}
	}
	return out.String()
}

// NeedChapterLine is the line a scan whose chapter needs choosing reads as, as the sidecar wrote it: NEED_CHAPTER and
// the candidates. repeats.ParseOutput finds no groups in it.
func NeedChapterLine(need NeedChapter) string {
	return "NEED_CHAPTER|" + strings.Join(need.Candidates, "|") + "\n"
}
